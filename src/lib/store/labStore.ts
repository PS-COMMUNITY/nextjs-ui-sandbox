'use client';

/**
 * المتجر المركزي للتطبيق (Zustand) — يربط المحركات المنطقية بالمشهد والواجهة.
 * كل تعديل على حالة المحاكاة يمر من هنا: تحقق → تسجيل حدث → إشعار → حفظ مؤجل.
 * هذا هو «المصدر الوحيد للحقيقة»: المشهد 3D والتشخيص ولوحة المهام تقرأه كلها.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import type {
  ComponentId,
  DiagnosisCode,
  FirmwareState,
  MachineFlag,
  PartStatus,
  SessionEvent,
  SimulationState,
  WinFamilyId,
} from '@/lib/types';
import { APP_VERSION, isInstalled, normalizeSimulationState } from '@/lib/types';
import { initialSimulationState } from '@/lib/types';
import { COMPONENT_MAP } from '@/lib/data/catalog';
import { SCENARIOS, applyScenario } from '@/lib/data/scenarios';
import { applyFault, FAULTS } from '@/lib/data/faults';
import { canToggleFlag, applyToggleFlag, FLAG_INFO } from '@/lib/simulation/machineFlags';
import {
  canRemove,
  canInstall,
  applyRemove,
  applyInstall,
  applyDetach,
  applyExtract,
  applyPrepare,
  applyDamage,
  applyRepair,
  isCable,
} from '@/lib/simulation/assemblyEngine';
import { runPost } from '@/lib/simulation/postEngine';
import {
  newTechSession,
  stageGate,
  getHypothesis,
  getFault,
  type TechSession,
} from '@/lib/simulation/technicianEngine';
import {
  loadAll,
  loadRawMeta,
  saveAll,
  clearAll,
  storageAvailable,
  type PersistShape,
} from '@/lib/services/persistence';

/**
 * أنماط ورشة العمل الواحدة — التطبيق كله مشهد 3D حيّ (v7):
 *  - lab:      المختبر الحر (فك/تركيب/تشغيل/تثبيت نظام)
 *  - tech:     جلسة الفني ذو المراحل التسع (بنفس المشهد الحيّ)
 *  - missions: المهام الموجهة العملية (بنفس المشهد الحيّ)
 * الأدوات المرجعية (الكتالوج/التشخيص/الطاقة/التوافق/التقارير/الإعدادات)
 * صارت نوافذ فوق المشهد عبر openTool — لا صفحات منفصلة تجمد المشهد.
 */
export type ScreenId = 'lab' | 'tech' | 'missions';

export type ToolId = 'catalog' | 'diagnostics' | 'power' | 'builder' | 'reports' | 'settings';

export type GraphicsQuality = 'low' | 'medium' | 'high';

/** وضع الإدخال: مختبر (كاميرا/قطع) أو التحكم بالشاشة المجسمة (توجيه V6 §4.3) */
export type InputMode = 'lab' | 'monitor';

interface SaveStatus {
  available: boolean;
  lastSavedAt: number | null;
  lastErrorAr: string | null;
}

interface LabStore {
  // === حالة المحاكاة ===
  sim: SimulationState;
  // === الطرفيات والمشهد ===
  bootStartedAt: number | null;   // لحظة ضغط زر التشغيل (ساعة تمهيد الشاشة)
  notepad: string;                // دفتر النظام الافتراضي — يُكتب من حقل إدخال حقيقي (توجيه v3 أ.2)
  hintsVisible: boolean;          // تلميحات التحكم بالماوس/الكيبورد الحقيقيين (زر H)
  airflowVisible: boolean;        // أسهم تدفق الهواء
  inputMode: InputMode;           // V6-B: وضع المختبر أو وضع التحكم بالشاشة
  // === واجهة ===
  screen: ScreenId;
  tool: ToolId | null;            // النافذة المرجعية المفتوحة فوق المشهد (إن وجدت)
  selected: ComponentId | null;
  xray: boolean;
  exploded: boolean;
  isolated: ComponentId | null;
  quality: GraphicsQuality;
  sidePanelsHidden: boolean;
  hydrated: boolean;
  saveStatus: SaveStatus;
  // === جلسة الفني ذي المراحل التسع ===
  tech: TechSession | null;
  // === بيانات التعلم ===
  logs: SessionEvent[];
  quizScores: Record<string, { score: number; at: number }>;
  missionsDone: string[];
  lessonsRead: string[];
  activeMissionId: string | null;
  missionStepIndex: number;
  lastDiagnosis: DiagnosisCode | null;

  // === أفعال ===
  hydrate: () => void;
  setScreen: (s: ScreenId) => void;
  openTool: (t: ToolId) => void;
  closeTool: () => void;
  select: (id: ComponentId | null) => void;
  toggleXray: () => void;
  toggleExploded: () => void;
  setIsolated: (id: ComponentId | null) => void;
  setQuality: (q: GraphicsQuality) => void;
  setSidePanelsHidden: (v: boolean) => void;
  toggleFlag: (f: MachineFlag) => void;
  setInputMode: (m: InputMode) => void;
  // V6-C/D: النظام والأقراص والبرنامج الثابت
  insertUsb: (family: WinFamilyId | null) => void;
  exitSetup: () => void;
  completeInstall: (family: WinFamilyId, editionAr: string, diskId: string, plan: Array<{ label: string; kind: 'efi' | 'msr' | 'recovery' | 'primary'; fs: string; sizeGB: number }> | null) => void;
  clearDisk: (diskId: string) => void;
  initDisk: (diskId: string, style: 'gpt' | 'mbr') => void;
  createPartition: (diskId: string, sizeGB: number, fs: 'ntfs' | 'fat32') => void;
  deletePartition: (diskId: string, partId: string) => void;
  formatPartition: (diskId: string, partId: string) => void;
  fixDriver: (componentId: ComponentId) => void;
  repairBcd: () => void;
  runStartupRepair: () => void;
  patchFirmware: (patch: Partial<FirmwareState>) => void;
  requestSetup: () => void;
  bootFromDevice: (deviceId: string) => void;
  warmRestart: () => void;             // V6-D: إعادة تشغيل دافئة (إطفاء ثم إقلاع تلقائي)
  setThermal: (cpuTempC: number, gpuTempC: number) => void;
  // فك/تركيب بآلة الحالات الكاملة
  detachPart: (id: ComponentId) => void;   // installed → separated (فصل جزئي)
  extractPart: (id: ComponentId) => void;  // separated → removed (استخراج للصينية)
  preparePart: (id: ComponentId) => void;  // removed → awaiting (التقاط للتركيب)
  installPart: (id: ComponentId) => void;  // awaiting/removed → installed
  removePart: (id: ComponentId) => void;   // مسار قديم موحد (كابلات + أزرار القوائم)
  damagePart: (id: ComponentId) => void;   // أي حالة → damaged (تلف تدريبي)
  repairPart: (id: ComponentId) => void;   // damaged → removed (استبدال من المخزن)
  // الطرفيات
  toggleMonitor: () => void;
  setNotepad: (text: string) => void;  // إدخال حقيقي من حقل نصي في الواجهة
  clearNotepad: () => void;
  setHintsVisible: (v: boolean) => void;
  setAirflow: (v: boolean) => void;
  // تشخيص وسيناريوهات وأعطال
  runDiagnosis: () => void;
  runScenario: (scenarioId: string) => void;
  runFault: (faultId: string) => void;
  resetSimulation: () => void;
  // جلسة الفني
  startTechSession: (scenarioId: string) => void;
  patchTech: (patch: Partial<TechSession>) => void;
  toggleTechTool: (toolId: string) => void;
  advanceTechStage: () => void;
  abandonTechSession: () => void;
  finishTechReport: () => void;
  // تعلم وحفظ
  startMission: (id: string) => void;
  abandonMission: () => void;
  completeMission: (id: string) => void;
  markLessonRead: (id: string) => void;
  recordQuiz: (quizId: string, score: number) => void;
  resetTrainingData: () => void;
  resetEverything: () => void;
  importBackupFromJson: (json: string) => void;
  logEvent: (kind: string, labelAr: string, ok: boolean, detailAr?: string) => void;
}

// ============ الحفظ المؤجل ============
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistPending: (() => void) | null = null;

function runPersist(get: () => LabStore) {
  const s = get();
  if (!s.hydrated) return;
  const shape: PersistShape = {
    version: APP_VERSION,
    simulation: s.sim,
    tech: s.tech,
    logs: s.logs,
    quizScores: s.quizScores,
    missionsDone: s.missionsDone,
    lessonsRead: s.lessonsRead,
    // (إصلاح U10) المهمة النشطة وخطوتها ودفتر النظام تُحفظ أيضًا
    notepad: s.notepad,
    activeMissionId: s.activeMissionId,
    missionStepIndex: s.missionStepIndex,
    settings: { quality: s.quality },
    savedAt: Date.now(),
  };
  const res = saveAll(shape);
  if (res.ok) {
    useLabStore.setState({ saveStatus: { available: true, lastSavedAt: Date.now(), lastErrorAr: null } });
  } else {
    useLabStore.setState({ saveStatus: { available: true, lastSavedAt: null, lastErrorAr: res.messageAr } });
  }
}

function schedulePersist(get: () => LabStore) {
  if (persistTimer) clearTimeout(persistTimer);
  persistPending = () => runPersist(get);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const fn = persistPending;
    persistPending = null;
    fn?.();
  }, 400);
}

/**
 * (إصلاح U7) تنفيذ الحفظ المعلق فورًا إن وُجد — يُستدعى عند pagehide وعند إخفاء
 * التبويب (visibilitychange) حتى لا يضيع آخر 400ms من التقدم عند إغلاق الصفحة.
 * السلوك المؤجل الافتراضي (400ms) يبقى كما هو في بقية الأحوال.
 */
export function flushPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const fn = persistPending;
  persistPending = null;
  fn?.();
}

// تسجيل مستمعي التفريغ مرة واحدة فقط (حماية SSR وHMR بعلم على مستوى الوحدة)
let persistFlushBound = false;
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !persistFlushBound) {
  persistFlushBound = true;
  window.addEventListener('pagehide', () => flushPersist());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPersist();
  });
}

// (إصلاح U6) مؤقت إعادة التشغيل الدافئة — يُلغى إن حصل أي إطفاء/إعادة تهيئة أثناء الانتظار
let warmRestartTimer: ReturnType<typeof setTimeout> | null = null;
function cancelWarmRestart(): void {
  if (warmRestartTimer) {
    clearTimeout(warmRestartTimer);
    warmRestartTimer = null;
  }
}

// (إصلاح U4) تُعرض رسالة تجاهل الحفظ التالف مرة واحدة كحد أقصى لكل جلسة تطبيق
let discardedSaveNotified = false;

/** اسم عربي قصير للقطعة (للرسائل) */
function nameOf(id: ComponentId): string {
  return COMPONENT_MAP[id]?.nameAr ?? id;
}

export const useLabStore = create<LabStore>((set, get) => ({
  sim: initialSimulationState(),
  bootStartedAt: null,
  notepad: '',
  hintsVisible: true,
  airflowVisible: false,
  inputMode: 'lab',
  screen: 'lab',
  tool: null,
  selected: null,
  xray: false,
  exploded: false,
  isolated: null,
  quality: 'medium',
  sidePanelsHidden: false,
  hydrated: false,
  saveStatus: { available: true, lastSavedAt: null, lastErrorAr: null },
  tech: null,
  logs: [],
  quizScores: {},
  missionsDone: [],
  lessonsRead: [],
  activeMissionId: null,
  missionStepIndex: 0,
  lastDiagnosis: null,

  hydrate: () => {
    if (!storageAvailable()) {
      set({ hydrated: true, saveStatus: { available: false, lastSavedAt: null, lastErrorAr: 'تخزين المتصفح غير متاح — لن يُحفظ التقدم' } });
      return;
    }
    const data = loadAll();
    if (data) {
      const sim = normalizeSimulationState(data.simulation);
      // استئناف جلسة محفوظة والجهاز يعمل فيها: نُرجع ساعة التمهيد إلى الماضي
      // حتى تظهر نتيجتها المحسومة مباشرة بدل الت stuck على شعار البدء
      const bootStartedAt =
        sim.flags.powerOn && sim.flags.acConnected && !sim.peripherals.psuDead
          ? Date.now() - 9999
          : null;
      set({
        sim,
        bootStartedAt,
        tech: data.tech ?? null,
        logs: data.logs ?? [],
        quizScores: data.quizScores ?? {},
        missionsDone: data.missionsDone ?? [],
        lessonsRead: data.lessonsRead ?? [],
        // (إصلاح U10) استعادة المهمة النشطة وخطوتها ودفتر النظام من الحفظ
        notepad: data.notepad ?? '',
        activeMissionId: data.activeMissionId ?? null,
        missionStepIndex: data.missionStepIndex ?? 0,
        quality: data.settings?.quality ?? 'medium',
        hydrated: true,
        saveStatus: { available: true, lastSavedAt: data.savedAt, lastErrorAr: null },
      });
    } else {
      // (إصلاح U4) كان فشل التحميل صامتًا: إن وُجد حفظ سابق فعلًا لكنه تالف أو من
      // إصدار غير مدعوم، نُعلم المستخدم مرة واحدة بدل التجاهل. لا استيراد تلقائي.
      const meta = loadRawMeta();
      if (meta.exists && !discardedSaveNotified) {
        discardedSaveNotified = true;
        toast.error('تم تجاهل حفظ سابق بسبب تعارض إصدار أو بيانات غير صالحة — بدأنا جلسة جديدة');
      }
      set({ hydrated: true });
    }
  },

  setScreen: (screen) => set({ screen, selected: screen === 'lab' ? get().selected : null }),
  openTool: (tool) => set({ tool }),
  closeTool: () => set({ tool: null }),
  select: (selected) => set({ selected }),
  toggleXray: () => set({ xray: !get().xray }),
  toggleExploded: () => set({ exploded: !get().exploded }),
  setIsolated: (isolated) => set({ isolated }),
  setQuality: (quality) => {
    set({ quality });
    schedulePersist(get);
  },
  setSidePanelsHidden: (sidePanelsHidden) => set({ sidePanelsHidden }),

  toggleFlag: (f) => {
    const s = get();
    const check = canToggleFlag(s.sim, f);
    const info = FLAG_INFO[f];
    if (!check.ok) {
      s.logEvent('flag', `${info.labelAr}: مرفوض`, false, check.messageAr);
      toast.error(check.messageAr);
      return;
    }
    const sim = applyToggleFlag(s.sim, f);
    // ساعة تمهيد الشاشة: تضبط لحظة التشغيل وتُصفّر عند الإطفاء
    const bootStartedAt = f === 'powerOn' ? (sim.flags.powerOn ? Date.now() : null) : s.bootStartedAt;
    set({ sim, bootStartedAt });
    s.logEvent('flag', check.messageAr || info.labelAr, true, info.hintAr);
    toast.success(check.messageAr || info.labelAr);
    schedulePersist(get);
  },

  // ============ آلة الحالات: فصل جزئي → استخراج → التقاط → تركيب ============
  detachPart: (id) => {
    const s = get();
    if (id === 'case') return;
    if (isCable(id)) {
      // الكابلات تفصل بحركة واحدة — التوجيه للمسار الموحد
      s.removePart(id);
      return;
    }
    if (s.sim.parts[id] !== 'installed') {
      toast.error(`${nameOf(id)}: ليست في حالة تسمح بالفصل الجزئي`);
      return;
    }
    const check = canRemove(s.sim, id);
    if (!check.ok) {
      s.logEvent('remove', `${nameOf(id)}: فصل مرفوض`, false, check.messageAr);
      toast.error(check.messageAr);
      return;
    }
    const sim = applyDetach(s.sim, id);
    set({ sim });
    s.logEvent('remove', `فصل جزئي: ${nameOf(id)}`, true, 'القطعة ما زالت في مكانها — استخرجها إلى الصينية عند الجاهزية');
    toast.success(`${nameOf(id)}: فُصلت جزئيًا — استخرجها إلى الصينية`);
    schedulePersist(get);
  },

  extractPart: (id) => {
    const s = get();
    if (s.sim.parts[id] !== 'separated') {
      toast.error(`${nameOf(id)}: يجب فصلها جزئيًا أولًا قبل استخراجها`);
      return;
    }
    const sim = applyExtract(s.sim, id);
    set({ sim });
    s.logEvent('remove', `استخراج ${nameOf(id)} إلى صينية القطع`, true);
    toast.success(`${nameOf(id)}: نُقلت إلى صينية القطع`);
    schedulePersist(get);
  },

  preparePart: (id) => {
    const s = get();
    if (s.sim.parts[id] !== 'removed') {
      toast.error(`${nameOf(id)}: القطعة ليست في الصينية`);
      return;
    }
    const sim = applyPrepare(s.sim, id);
    set({ sim, selected: id });
    s.logEvent('install', `التقاط ${nameOf(id)} للتركيب`, true, 'راجع شروط التركيب ثم اضغط «ركّب»');
    toast.success(`${nameOf(id)}: ملتقطة — راجع شروط التركيب ثم ركّبها`);
    schedulePersist(get);
  },

  installPart: (id) => {
    const s = get();
    const status = s.sim.parts[id];
    if (status === 'installed') {
      toast.error(`${nameOf(id)}: مثبتة أصلًا`);
      return;
    }
    const check = canInstall(s.sim, id);
    if (!check.ok) {
      // INSTALL_REJECTED: حدث رفض تعليمي — القطعة تبقى بانتظار التركيب
      s.logEvent('install', `${nameOf(id)}: تركيب مرفوض`, false, check.messageAr);
      toast.error(check.messageAr);
      return;
    }
    const sim = applyInstall(s.sim, id);
    set({ sim });
    s.logEvent('install', `تركيب ${nameOf(id)}`, true, 'أُعيدت القطعة إلى موضع تثبيتها — أغلق المزالج والبراغي إن وجدت');
    toast.success(`${nameOf(id)}: رُكّبت في موضعها`);
    schedulePersist(get);
  },

  removePart: (id) => {
    const s = get();
    const name = nameOf(id);
    if (id === 'case') {
      toast.error('الهيكل هو جسم الجهاز؛ استخدم زر فتح/إغلاق الغطاء الجانبي.');
      return;
    }
    const check = canRemove(s.sim, id);
    if (!check.ok) {
      s.logEvent('remove', `${name}: فك مرفوض`, false, check.messageAr);
      toast.error(check.messageAr);
      return;
    }
    // الكابلات: فصل مباشر إلى الصينية — القطع الكبيرة: فصل جزئي ثم استخراج
    const sim = isCable(id) ? applyRemove(s.sim, id) : applyDetach(s.sim, id);
    set({ sim });
    if (isCable(id)) {
      s.logEvent('remove', `فصل ${name}`, true, 'نُقل إلى صينية القطع');
      toast.success(`${name}: فُصل إلى صينية القطع`);
    } else {
      s.logEvent('remove', `فصل جزئي: ${name}`, true, 'أكمل الاستخراج إلى الصينية');
      toast.success(`${name}: فُصل جزئيًا — أكمل الاستخراج`);
    }
    schedulePersist(get);
  },

  damagePart: (id) => {
    const s = get();
    if (id === 'case') return;
    const sim = applyDamage(s.sim, id);
    set({ sim, lastDiagnosis: null });
    s.logEvent('other', `تلف تدريبي مقصود: ${nameOf(id)}`, false, 'وضع الاستكشاف: القطعة تالفة — استبدلها من المخزن التعليمي');
    toast.warning(`${nameOf(id)}: تلف تدريبي — استبدلها من المخزن`);
    schedulePersist(get);
  },

  repairPart: (id) => {
    const s = get();
    if (s.sim.parts[id] !== 'damaged') {
      toast.error(`${nameOf(id)}: ليست تالفة`);
      return;
    }
    const sim = applyRepair(s.sim, id);
    set({ sim });
    s.logEvent('install', `استبدال ${nameOf(id)} بقطعة سليمة`, true, 'من المخزن التعليمي');
    toast.success(`${nameOf(id)}: استُبدلت بقطعة سليمة (في الصينية)`);
    schedulePersist(get);
  },

  // ============ الطرفيات ============
  toggleMonitor: () => {
    const s = get();
    const sim = { ...s.sim, peripherals: { ...s.sim.peripherals, monitorOn: !s.sim.peripherals.monitorOn } };
    set({ sim });
    s.logEvent('flag', sim.peripherals.monitorOn ? 'تشغيل الشاشة' : 'إطفاء الشاشة', true);
    schedulePersist(get);
  },

  setNotepad: (text) => {
    set({ notepad: text.slice(-400) });
    // (إصلاح U10) دفتر النظام الآن جزء من الحفظ — يُجدول حفظًا مؤجلًا مع كل كتابة
    schedulePersist(get);
  },

  clearNotepad: () => set({ notepad: '' }),

  setHintsVisible: (v) => set({ hintsVisible: v }),

  setAirflow: (v) => set({ airflowVisible: v }),

  setInputMode: (inputMode) => set({ inputMode }),

  // ============ V6-C/D: النظام الافتراضي والأقراص والبرنامج الثابت ============

  insertUsb: (family) => {
    const s = get();
    set({ sim: { ...s.sim, usbMedia: family } });
    s.logEvent('other', family ? `أُدخل وسيط تثبيت: ${family}` : 'أُخرج وسيط التثبيت', true);
    toast.success(family ? `وُصل وسيط تثبيت ${family} — سيلي الترتيب أولوية الإقلاع` : 'أُخرج وسيط التثبيت');
    schedulePersist(get);
  },

  exitSetup: () => {
    const s = get();
    cancelWarmRestart(); // (إصلاح U6) إعادة تشغيل دافئة معلّقة لا معنى لها بعد الخروج من المعالج
    // الخروج من المعالج: إخراج الوسيط وإعادة تشغيل باردة (بدون تغيير النظام)
    // (إصلاح U2) تحديث غير مُطبِع: كان يطفئ علم powerOn على كائن الأعلام المشترك
    const sim: SimulationState = { ...s.sim, usbMedia: null, flags: { ...s.sim.flags, powerOn: false } };
    set({ sim, bootStartedAt: null });
    s.logEvent('other', 'الخروج من معالج التثبيت — إعادة تشغيل باردة', true);
    schedulePersist(get);
  },

  completeInstall: (family, editionAr, diskId, plan) => {
    const s = get();
    const disks = s.sim.disks.map((d) => {
      if (d.id !== diskId) {
        // إزالة علامة hasOs من الأقراص الأخرى (نظام واحد نشط)
        return { ...d, parts: d.parts.map((p) => ({ ...p, hasOs: false })) };
      }
      const parts = plan && plan.length > 0
        ? plan.map((p, i) => ({
            id: `${d.id}-n${i}-${Date.now() % 100000}`,
            label: p.kind === 'primary' ? 'OS' : p.label,
            letter: p.kind === 'primary' ? 'C' : null,
            kind: p.kind,
            fs: p.fs as 'ntfs' | 'fat32' | 'none',
            sizeGB: p.sizeGB,
            usedGB: p.kind === 'primary' ? 24 : 0.02,
            hasOs: p.kind === 'primary',
          }))
        : d.parts.map((p) => ({ ...p, hasOs: p.kind === 'primary', usedGB: p.kind === 'primary' ? 24 : p.usedGB }));
      return { ...d, style: (d.style ?? 'gpt') as 'gpt' | 'mbr', parts };
    });
    const sim: SimulationState = {
      ...s.sim,
      disks,
      os: { installed: family, edition: editionAr, driversMissing: [], bcdCorrupt: false, repairAttempts: 0, installedAt: Date.now() },
      usbMedia: null,
      firmware: { ...s.sim.firmware, bootOrder: s.sim.firmware.bootOrder.filter((x) => x !== 'usb').concat(s.sim.firmware.bootOrder.includes('usb') ? ['usb'] : []) },
    };
    set({ sim });
    s.logEvent('other', `اكتمل تثبيت النظام التعليمي: ${family} ${editionAr} على ${diskId}`, true, 'محاكاة تعليمية — لا ملفات حقيقية');
    toast.success(`اكتمل التثبيت: ${family} ${editionAr} — أُعيد التشغيل إلى سطح المكتب`);
    schedulePersist(get);
  },

  clearDisk: (diskId) => {
    const s = get();
    const hadOs = s.sim.disks.find((d) => d.id === diskId)?.parts.some((p) => p.hasOs) ?? false;
    const disks = s.sim.disks.map((d) => (d.id === diskId ? { ...d, parts: [] } : d));
    const os = hadOs ? { ...s.sim.os, installed: null, edition: null, installedAt: null } : s.sim.os;
    set({ sim: { ...s.sim, disks, os } });
    s.logEvent('other', `حذف كل أقسام القرص ${diskId} (محاكاة)`, true, 'تحذير تعليمي: في العمل الحقيقي هذا يفقد البيانات نهائيًا');
    schedulePersist(get);
  },

  initDisk: (diskId, style) => {
    const s = get();
    const disks = s.sim.disks.map((d) => (d.id === diskId ? { ...d, style, parts: [] } : d));
    set({ sim: { ...s.sim, disks } });
    s.logEvent('other', `تهيئة القرص ${diskId} بنمط ${style.toUpperCase()} (محاكاة)`, true);
    schedulePersist(get);
  },

  createPartition: (diskId, sizeGB, fs) => {
    const s = get();
    const disks = s.sim.disks.map((d) => {
      if (d.id !== diskId) return d;
      const total = d.parts.reduce((a, p) => a + p.sizeGB, 0);
      const unalloc = Math.max(0, d.sizeGB - total);
      const take = Math.min(unalloc, Math.max(0.1, sizeGB));
      if (take < 0.1) return d;
      const part = {
        id: `${d.id}-p${d.parts.length + 1}-${Date.now() % 100000}`,
        label: 'Data',
        letter: (() => { const used = new Set(d.parts.map((p) => p.letter).filter(Boolean)); for (const l of 'DEFGHIJ') { if (!used.has(l)) return l; } return null; })(),
        kind: 'primary' as const,
        fs,
        sizeGB: take,
        usedGB: 0,
        hasOs: false,
      };
      return { ...d, parts: [...d.parts, part] };
    });
    set({ sim: { ...s.sim, disks } });
    s.logEvent('other', `قسم جديد ${sizeGB.toFixed(1)}GB على ${diskId} بملفات ${fs.toUpperCase()} (محاكاة)`, true);
    schedulePersist(get);
  },

  deletePartition: (diskId, partId) => {
    const s = get();
    const target = s.sim.disks.find((d) => d.id === diskId)?.parts.find((p) => p.id === partId);
    const disks = s.sim.disks.map((d) => (d.id === diskId ? { ...d, parts: d.parts.filter((p) => p.id !== partId) } : d));
    const os = target?.hasOs ? { ...s.sim.os, installed: null, edition: null } : s.sim.os;
    set({ sim: { ...s.sim, disks, os } });
    s.logEvent('other', `حذف قسم ${partId} من ${diskId} (محاكاة)`, true, 'تأكيد تعليمي مطلوب — لا عمليات على أقراص حقيقية');
    schedulePersist(get);
  },

  formatPartition: (diskId, partId) => {
    const s = get();
    const target = s.sim.disks.find((d) => d.id === diskId)?.parts.find((p) => p.id === partId);
    const disks = s.sim.disks.map((d) => (d.id === diskId ? { ...d, parts: d.parts.map((p) => (p.id === partId ? { ...p, usedGB: 0, hasOs: false } : p)) } : d));
    // (إصلاح U3) التهيئة تمسح النظام إن كان مثبتًا على القسم — نفس دلالات deletePartition
    const os = target?.hasOs ? { ...s.sim.os, installed: null, edition: null } : s.sim.os;
    set({ sim: { ...s.sim, disks, os } });
    s.logEvent(
      'other',
      `تهيئة قسم ${partId} (محاكاة)`,
      true,
      target?.hasOs ? 'تهيئة القسم تمسح نظام التشغيل' : 'تأكيد تعليمي مطلوب — لا عمليات على أقراص حقيقية',
    );
    if (target?.hasOs) toast.warning('تهيئة القسم تمسح نظام التشغيل');
    schedulePersist(get);
  },

  fixDriver: (componentId) => {
    const s = get();
    const os = { ...s.sim.os, driversMissing: s.sim.os.driversMissing.filter((d) => d !== componentId) };
    set({ sim: { ...s.sim, os } });
    s.logEvent('install', `تثبيت تعريف: ${componentId} (محاكاة تعليمية)`, true);
    toast.success('تم تحديث التعريف — أعد الفحص في Device Manager');
    schedulePersist(get);
  },

  repairBcd: () => {
    const s = get();
    const os = { ...s.sim.os, bcdCorrupt: false, repairAttempts: 0 };
    set({ sim: { ...s.sim, os } });
    s.logEvent('install', 'إصلاح بيانات الإقلاع (bootrec) — محاكاة تعليمية', true);
    schedulePersist(get);
  },

  runStartupRepair: () => {
    const s = get();
    // تعليميًا: الإصلاح التلقائي لا يصلح تلف BCD العميق هنا — يشرح ويعد المحاولات
    const os = { ...s.sim.os, repairAttempts: s.sim.os.repairAttempts + 1 };
    set({ sim: { ...s.sim, os } });
    s.logEvent('other', `Startup Repair فشل (محاولة ${os.repairAttempts}) — يُشرح استخدام bootrec`, false, 'الإصلاح الصحيح: Command Prompt ← bootrec /fixmbr /fixboot /rebuildbcd');
    toast.error('فشل Startup Repair — استخدم موجه الأوامر ثم bootrec /rebuildbcd');
    schedulePersist(get);
  },

  patchFirmware: (patch) => {
    const s = get();
    const firmware = { ...s.sim.firmware, ...patch };
    set({ sim: { ...s.sim, firmware } });
    s.logEvent('flag', `إعدادات UEFI: ${Object.keys(patch).join(', ')} (محاكاة)`, true);
    schedulePersist(get);
  },

  requestSetup: () => {
    const s = get();
    if (!s.sim.flags.powerOn) {
      toast.error('شغّل الجهاز أولًا — الدخول إلى UEFI يتم أثناء بدء التشغيل');
      return;
    }
    set({ sim: { ...s.sim, firmware: { ...s.sim.firmware, setupRequested: true } } });
    s.logEvent('flag', 'طلب الدخول إلى إعدادات UEFI (DEL)', true);
    schedulePersist(get);
  },

  bootFromDevice: (deviceId) => {
    const s = get();
    const order = [deviceId, ...s.sim.firmware.bootOrder.filter((x) => x !== deviceId)];
    set({ sim: { ...s.sim, firmware: { ...s.sim.firmware, bootOrder: order, setupRequested: false } } });
    s.logEvent('flag', `قائمة إقلاع: بدء التشغيل من ${deviceId}`, true);
    toast.success(`الإقلاع الآن من ${deviceId}`);
    schedulePersist(get);
  },

  // (V6-D) إعادة تشغيل دافئة: إطفاء ثم تشغيل تلقائي بعد لحظة — سلوك زر Reset الحقيقي
  warmRestart: () => {
    const s = get();
    if (!s.sim.flags.powerOn) {
      toast.error('الجهاز مطفأ — شغّله أولًا من زر الطاقة.');
      return;
    }
    cancelWarmRestart(); // (إصلاح U6) مؤقت سابق معلّق يُلغى — لا تداخل بين إعادتي تشغيل
    // (إصلاح U2) تحديث غير مُطبِع: كان يطفئ علم powerOn على كائن الأعلام المشترك
    const sim: SimulationState = { ...s.sim, flags: { ...s.sim.flags, powerOn: false } };
    set({ sim, bootStartedAt: null });
    s.logEvent('flag', 'إعادة تشغيل دافئة — إيقاف مؤقت ثم إقلاع تلقائي', true);
    schedulePersist(get);
    warmRestartTimer = setTimeout(() => {
      warmRestartTimer = null;
      const st = get();
      // (إصلاح U6) حارس: لا نُقلع إلا إذا كان المتجر ما زال ينتظر مرحلة إعادة التشغيل
      // (لم يشغّل المستخدم الجهاز يدويًا في الأثناء)
      if (st.sim.flags.powerOn) return;
      const sim2: SimulationState = { ...st.sim, flags: { ...st.sim.flags, powerOn: true } };
      set({ sim: sim2, bootStartedAt: Date.now() });
      st.logEvent('flag', 'اكتملت إعادة التشغيل — بدء الإقلاع من جديد', true);
      schedulePersist(get);
    }, 900);
  },

  setThermal: (cpuTempC, gpuTempC) => {
    const s = get();
    if (Math.abs(s.sim.thermal.cpuTempC - cpuTempC) < 1 && Math.abs(s.sim.thermal.gpuTempC - gpuTempC) < 1) return;
    set({ sim: { ...s.sim, thermal: { ...s.sim.thermal, cpuTempC, gpuTempC, simulatedNotice: true } } });
  },

  runDiagnosis: () => {
    const s = get();
    const finding = runPost(s.sim);
    set({ lastDiagnosis: finding.code });
    s.logEvent('post', `فحص POST: ${finding.titleAr}`, finding.code !== 'POST_FAIL', finding.detailsAr.join(' • '));
    schedulePersist(get);
  },

  runScenario: (scenarioId) => {
    const s = get();
    const sc = SCENARIOS.find((x) => x.id === scenarioId);
    if (!sc) return;
    const faultSim = applyScenario(s.sim, scenarioId);
    // إطفاء الجهاز عند تطبيق أي سيناريو — العمل على جهاز بارد، ويمنع شعار بدء متجمدًا
    // (إصلاح U2) تحديث غير مُطبِع للأعلام بدل التعديل على الكائن المعاد من المحرك
    const sim: SimulationState = { ...faultSim, flags: { ...faultSim.flags, powerOn: false } };
    set({ sim, lastDiagnosis: null, selected: null, bootStartedAt: null });
    s.logEvent('scenario', `سيناريو: ${sc.titleAr}`, true, sc.faultAr);
    toast.success(`طُبّق سيناريو «${sc.titleAr}» — ${sc.faultAr}`);
    schedulePersist(get);
  },

  runFault: (faultId) => {
    const s = get();
    const fault = FAULTS.find((f) => f.id === faultId);
    if (!fault) return;
    const faultSim = applyFault(s.sim, faultId);
    // إطفاء الجهاز عند تطبيق أي عطل — العمل على جهاز بارد، ويمنع شعار بدء متجمدًا
    // (إصلاح U2) تحديث غير مُطبِع للأعلام بدل التعديل على الكائن المعاد من المحرك
    const sim: SimulationState = { ...faultSim, flags: { ...faultSim.flags, powerOn: false } };
    set({ sim, lastDiagnosis: null, selected: null, bootStartedAt: null });
    s.logEvent('scenario', `عطل تعليمي ${fault.id}: ${fault.titleAr}`, true, fault.faultAr);
    toast.success(`طُبّق العطل ${fault.id} — ${fault.titleAr}`);
    schedulePersist(get);
  },

  resetSimulation: () => {
    cancelWarmRestart(); // (إصلاح U6) إعادة تشغيل معلّقة لا معنى لها بعد إعادة التهيئة
    set({
      sim: initialSimulationState(),
      lastDiagnosis: null,
      selected: null,
      isolated: null,
      exploded: false,
      xray: false,
      bootStartedAt: null,
      notepad: '',
    });
    get().logEvent('other', 'إعادة تهيئة الجهاز الافتراضي', true);
    toast.success('أُعيد الجهاز إلى حالته الافتراضية');
    schedulePersist(get);
  },

  // ============ جلسة الفني ذي المراحل التسع ============
  startTechSession: (scenarioId) => {
    const s = get();
    const fault = FAULTS.find((f) => f.id === scenarioId);
    if (!fault) return;
    const sim = applyFault(s.sim, scenarioId);
    set({ sim, tech: newTechSession(scenarioId), screen: 'tech', lastDiagnosis: null, bootStartedAt: null });
    s.logEvent('scenario', `جلسة فني جديدة — ${fault.id}: ${fault.titleAr}`, true, fault.complaintAr);
    toast.success('بدأت جلسة الفني — اقرأ بطاقة الطلب');
    schedulePersist(get);
  },

  patchTech: (patch) => {
    const s = get();
    if (!s.tech) return;
    set({ tech: { ...s.tech, ...patch } });
    schedulePersist(get);
  },

  toggleTechTool: (toolId) => {
    const s = get();
    if (!s.tech) return;
    const has = s.tech.toolsChosen.includes(toolId);
    const toolsChosen = has
      ? s.tech.toolsChosen.filter((t) => t !== toolId)
      : [...s.tech.toolsChosen, toolId];
    set({ tech: { ...s.tech, toolsChosen } });
    schedulePersist(get);
  },

  advanceTechStage: () => {
    const s = get();
    if (!s.tech) return;
    const gate = stageGate(s.tech.stage, s.tech, s.sim);
    if (!gate.done) {
      toast.error(`لا يمكن الانتقال: ${gate.blockersAr.join(' • ')}`);
      s.logEvent('other', `محاولة انتقال من المرحلة ${s.tech.stage}`, false, gate.blockersAr.join(' • '));
      return;
    }
    if (s.tech.stage >= 9) return;
    const stage = (s.tech.stage + 1) as TechSession['stage'];
    set({ tech: { ...s.tech, stage } });
    s.logEvent('lesson', `المرحلة ${stage}: انتقال مكتمل`, true, gate.hintAr);
    schedulePersist(get);
  },

  abandonTechSession: () => {
    set({ tech: null });
    toast.info('أُلغيت جلسة الفني — يمكنك بدء جلسة جديدة في أي وقت');
    schedulePersist(get);
  },

  finishTechReport: () => {
    const s = get();
    if (!s.tech) return;
    const hyp = getHypothesis(s.tech.hypothesisId);
    const fault = getFault(s.tech.scenarioId);
    const correct = hyp?.faultId === s.tech.scenarioId;
    const tech: TechSession = { ...s.tech, reportAt: Date.now(), hypothesisCorrect: correct };
    set({ tech });
    s.logEvent(
      'delivery',
      `تقرير تسليم — ${fault?.titleAr ?? s.tech.scenarioId}`,
      true,
      `الفرضية: ${correct ? 'صحيحة' : 'غير صحيحة'} • المراحل التسع مكتملة`,
    );
    toast.success('وُلّد تقرير التسليم — راجعه ثم اطبع أو صدّره');
    schedulePersist(get);
  },

  startMission: (id) => {
    set({ activeMissionId: id, missionStepIndex: 0, screen: 'missions' });
    get().logEvent('lesson', `بدء مهمة: ${id}`, true);
    schedulePersist(get);
  },

  abandonMission: () => {
    set({ activeMissionId: null, missionStepIndex: 0 });
    schedulePersist(get);
  },

  completeMission: (id) => {
    const s = get();
    if (s.missionsDone.includes(id)) return;
    set({ missionsDone: [...s.missionsDone, id], activeMissionId: null, missionStepIndex: 0 });
    s.logEvent('lesson', `إتمام مهمة: ${id}`, true);
    schedulePersist(get);
  },

  markLessonRead: (id) => {
    const s = get();
    if (s.lessonsRead.includes(id)) return;
    set({ lessonsRead: [...s.lessonsRead, id] });
    s.logEvent('lesson', `إكمال درس: ${id}`, true);
    schedulePersist(get);
  },

  recordQuiz: (quizId, score) => {
    const s = get();
    set({ quizScores: { ...s.quizScores, [quizId]: { score, at: Date.now() } } });
    s.logEvent('quiz', `اختبار: ${quizId}`, score >= 60, `الدرجة ${score}%`);
    schedulePersist(get);
  },

  resetTrainingData: () => {
    set({ logs: [], quizScores: {}, missionsDone: [], lessonsRead: [], activeMissionId: null, missionStepIndex: 0, lastDiagnosis: null, tech: null });
    toast.success('مُسح سجل التدريب والاختبارات');
    schedulePersist(get);
  },

  resetEverything: () => {
    cancelWarmRestart(); // (إصلاح U6) إعادة تشغيل معلّقة لا معنى لها بعد مسح كل شيء
    const res = clearAll();
    set({
      sim: initialSimulationState(),
      tech: null,
      logs: [],
      quizScores: {},
      missionsDone: [],
      lessonsRead: [],
      activeMissionId: null,
      missionStepIndex: 0,
      lastDiagnosis: null,
      screen: 'lab',
      selected: null,
      xray: false,
      exploded: false,
      isolated: null,
      quality: 'medium',
      sidePanelsHidden: false,
      hintsVisible: true,
      airflowVisible: false,
      inputMode: 'lab',
      bootStartedAt: null,
      notepad: '',
    });
    if (res.ok) toast.success('حُذفت كل البيانات المحلية وأُعيد التطبيق لحالته الأولى');
    else toast.error(res.messageAr);
  },

  importBackupFromJson: (json) => {
    try {
      // Partial: ملف خارجي قد يغيب منه أي حقل (خصوصًا نسخ قديمة) — كل الاستخدامات محمية بـ ??
      const parsed = JSON.parse(json) as Partial<PersistShape>;
      if (!parsed || typeof parsed !== 'object' || !parsed.simulation || !parsed.simulation.flags || !parsed.simulation.parts) {
        throw new Error('bad-shape');
      }
      // (إصلاح تدقيق V6) فحص إصدار الملف — كان يستقبل أي شكل صالح حتى من إصدارات أحدث غير متوافقة
      const ACCEPTED = new Set([APP_VERSION, '5.0.0', '4.0.0']);
      if (typeof parsed.version !== 'string' || !ACCEPTED.has(parsed.version)) {
        toast.error(`إصدار ملف النسخة الاحتياطية غير مدعوم (${String(parsed.version ?? 'غير معروف')}) — النسخ المدعومة: 4.0.0 حتى ${APP_VERSION}`);
        return;
      }
      set({
        sim: normalizeSimulationState(parsed.simulation),
        tech: parsed.tech ?? null,
        logs: parsed.logs ?? [],
        quizScores: parsed.quizScores ?? {},
        missionsDone: parsed.missionsDone ?? [],
        lessonsRead: parsed.lessonsRead ?? [],
        // (إصلاح U10) حقول جديدة بقيم افتراضية آمنة — النسخ الأقدم تُحمّل دون مشاكل
        notepad: parsed.notepad ?? '',
        activeMissionId: parsed.activeMissionId ?? null,
        missionStepIndex: parsed.missionStepIndex ?? 0,
        lastDiagnosis: null,
      });
      toast.success('استُوردت النسخة الاحتياطية بنجاح');
      schedulePersist(get);
    } catch {
      toast.error('ملف النسخة الاحتياطية غير صالح');
    }
  },

  logEvent: (kind, labelAr, ok, detailAr) => {
    const event: SessionEvent = { ts: Date.now(), kind, labelAr, ok, detailAr };
    set({ logs: [...get().logs, event].slice(-500) });
    schedulePersist(get);
  },
}));

/** عدّاد القطع المثبتة (للشارات) — الهيكل مستثنى */
export function installedCount(sim: SimulationState): number {
  let n = 0;
  for (const id of Object.keys(sim.parts) as ComponentId[]) {
    if (id === 'case') continue;
    if (isInstalled(sim.parts[id] as PartStatus)) n++;
  }
  return n;
}
