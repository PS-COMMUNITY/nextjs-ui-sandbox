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
  MachineFlag,
  PartStatus,
  SessionEvent,
  SimulationState,
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
  saveAll,
  clearAll,
  storageAvailable,
  type PersistShape,
} from '@/lib/services/persistence';

export type ScreenId =
  | 'home'
  | 'lab'
  | 'tech'
  | 'catalog'
  | 'training'
  | 'builder'
  | 'diagnostics'
  | 'power'
  | 'lessons'
  | 'reports'
  | 'settings';

export type GraphicsQuality = 'low' | 'medium' | 'high';

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
  // === واجهة ===
  screen: ScreenId;
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
  select: (id: ComponentId | null) => void;
  toggleXray: () => void;
  toggleExploded: () => void;
  setIsolated: (id: ComponentId | null) => void;
  setQuality: (q: GraphicsQuality) => void;
  setSidePanelsHidden: (v: boolean) => void;
  toggleFlag: (f: MachineFlag) => void;
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
  typeKey: (ch: string) => void;       // مدخل برمجي (لوحات مفاتيح على الشاشة إن أُضيفت مستقبلًا)
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
  finishMissionStep: () => void;
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

function schedulePersist(get: () => LabStore) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
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
      settings: { quality: s.quality },
      savedAt: Date.now(),
    };
    const res = saveAll(shape);
    if (res.ok) {
      useLabStore.setState({ saveStatus: { available: true, lastSavedAt: Date.now(), lastErrorAr: null } });
    } else {
      useLabStore.setState({ saveStatus: { available: true, lastSavedAt: null, lastErrorAr: res.messageAr } });
    }
  }, 400);
}

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
  screen: 'home',
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
        quality: data.settings?.quality ?? 'medium',
        hydrated: true,
        saveStatus: { available: true, lastSavedAt: data.savedAt, lastErrorAr: null },
      });
    } else {
      set({ hydrated: true });
    }
  },

  setScreen: (screen) => set({ screen, selected: screen === 'lab' ? get().selected : null }),
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

  setNotepad: (text) => set({ notepad: text.slice(-400) }),

  typeKey: (ch) => {
    const s = get();
    if (!s.notepad.length && ch.length === 1) {
      // أول حرف — لا شيء خاص
    }
    let next = s.notepad;
    if (ch === 'BACK') next = next.slice(0, -1);
    else if (ch === 'SPACE') next = `${next} `;
    else if (ch === 'ENTER') next = `${next}\n`;
    else if (ch === 'CLR') next = '';
    else next = next + ch;
    set({ notepad: next.slice(-400) });
  },

  clearNotepad: () => set({ notepad: '' }),

  setHintsVisible: (v) => set({ hintsVisible: v }),

  setAirflow: (v) => set({ airflowVisible: v }),

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
    const sim = applyScenario(s.sim, scenarioId);
    // إطفاء الجهاز عند تطبيق أي سيناريو — العمل على جهاز بارد، ويمنع شعار بدء متجمدًا
    sim.flags.powerOn = false;
    set({ sim, lastDiagnosis: null, selected: null, bootStartedAt: null });
    s.logEvent('scenario', `سيناريو: ${sc.titleAr}`, true, sc.faultAr);
    toast.success(`طُبّق سيناريو «${sc.titleAr}» — ${sc.faultAr}`);
    schedulePersist(get);
  },

  runFault: (faultId) => {
    const s = get();
    const fault = FAULTS.find((f) => f.id === faultId);
    if (!fault) return;
    const sim = applyFault(s.sim, faultId);
    // إطفاء الجهاز عند تطبيق أي عطل — العمل على جهاز بارد، ويمنع شعار بدء متجمدًا
    sim.flags.powerOn = false;
    set({ sim, lastDiagnosis: null, selected: null, bootStartedAt: null });
    s.logEvent('scenario', `عطل تعليمي ${fault.id}: ${fault.titleAr}`, true, fault.faultAr);
    toast.success(`طُبّق العطل ${fault.id} — ${fault.titleAr}`);
    schedulePersist(get);
  },

  resetSimulation: () => {
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
    set({ activeMissionId: id, missionStepIndex: 0, screen: 'training' });
    get().logEvent('lesson', `بدء مهمة: ${id}`, true);
    schedulePersist(get);
  },

  finishMissionStep: () => set({ missionStepIndex: get().missionStepIndex + 1 }),

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
      screen: 'home',
      selected: null,
      xray: false,
      exploded: false,
      isolated: null,
      bootStartedAt: null,
      notepad: '',
    });
    if (res.ok) toast.success('حُذفت كل البيانات المحلية وأُعيد التطبيق لحالته الأولى');
    else toast.error(res.messageAr);
  },

  importBackupFromJson: (json) => {
    try {
      const parsed = JSON.parse(json) as PersistShape;
      if (!parsed || typeof parsed !== 'object' || !parsed.simulation || !parsed.simulation.flags || !parsed.simulation.parts) {
        throw new Error('bad-shape');
      }
      set({
        sim: normalizeSimulationState(parsed.simulation),
        tech: parsed.tech ?? null,
        logs: parsed.logs ?? [],
        quizScores: parsed.quizScores ?? {},
        missionsDone: parsed.missionsDone ?? [],
        lessonsRead: parsed.lessonsRead ?? [],
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
