'use client';

/**
 * المتجر المركزي للتطبيق (Zustand) — يربط المحركات المنطقية بالمشهد والواجهة.
 * كل تعديل على حالة المحاكاة يمر من هنا: تحقق → تسجيل حدث → إشعار → حفظ مؤجل.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import type {
  ComponentId,
  DiagnosisCode,
  MachineFlag,
  SessionEvent,
  SimulationState,
} from '@/lib/types';
import { APP_VERSION } from '@/lib/types';
import { initialSimulationState } from '@/lib/types';
import { COMPONENT_MAP } from '@/lib/data/catalog';
import { SCENARIOS, applyScenario } from '@/lib/data/scenarios';
import { canToggleFlag, applyToggleFlag, FLAG_INFO } from '@/lib/simulation/machineFlags';
import { canRemove, canInstall, applyRemove, applyInstall } from '@/lib/simulation/assemblyEngine';
import { runPost } from '@/lib/simulation/postEngine';
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
  // === واجهة ===
  screen: ScreenId;
  selected: ComponentId | null;
  xray: boolean;
  exploded: boolean;
  isolated: ComponentId | null;
  quality: GraphicsQuality;
  sidePanelsHidden: boolean; // إخفاء ألواح الواجهة لتوسيع المشهد
  hydrated: boolean;
  saveStatus: SaveStatus;
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
  removePart: (id: ComponentId) => void;
  installPart: (id: ComponentId) => void;
  runDiagnosis: () => void;
  runScenario: (scenarioId: string) => void;
  resetSimulation: () => void;
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

export const useLabStore = create<LabStore>((set, get) => ({
  sim: initialSimulationState(),
  screen: 'home',
  selected: null,
  xray: false,
  exploded: false,
  isolated: null,
  quality: 'medium',
  sidePanelsHidden: false,
  hydrated: false,
  saveStatus: { available: true, lastSavedAt: null, lastErrorAr: null },
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
      set({
        sim: data.simulation,
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
    set({ sim });
    s.logEvent('flag', check.messageAr || info.labelAr, true, info.hintAr);
    toast.success(check.messageAr || info.labelAr);
    schedulePersist(get);
  },

  removePart: (id) => {
    const s = get();
    const name = COMPONENT_MAP[id].nameAr;
    const check = canRemove(s.sim, id);
    if (!check.ok) {
      s.logEvent('remove', `${name}: فك مرفوض`, false, check.messageAr);
      toast.error(check.messageAr);
      return;
    }
    const sim = applyRemove(s.sim, id);
    set({ sim });
    s.logEvent('remove', `فك ${name}`, true, 'نُقلت القطعة إلى صينية القطع');
    toast.success(`${name}: أُزيلت إلى صينية القطع`);
    schedulePersist(get);
  },

  installPart: (id) => {
    const s = get();
    const name = COMPONENT_MAP[id].nameAr;
    const check = canInstall(s.sim, id);
    if (!check.ok) {
      s.logEvent('install', `${name}: تركيب مرفوض`, false, check.messageAr);
      toast.error(check.messageAr);
      return;
    }
    const sim = applyInstall(s.sim, id);
    set({ sim });
    s.logEvent('install', `تركيب ${name}`, true, 'أُعيدت القطعة إلى موضع تثبيتها');
    toast.success(`${name}: أُعيدت إلى موضعها`);
    schedulePersist(get);
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
    const sim = applyScenario(s.sim, scenarioId);
    set({ sim, lastDiagnosis: null, selected: null });
    s.logEvent('scenario', `سيناريو: ${sc.titleAr}`, true, sc.faultAr);
    toast.success(`طُبّق سيناريو «${sc.titleAr}» — ${sc.faultAr}`);
    schedulePersist(get);
  },

  resetSimulation: () => {
    set({ sim: initialSimulationState(), lastDiagnosis: null, selected: null, isolated: null, exploded: false, xray: false });
    get().logEvent('other', 'إعادة تهيئة الجهاز الافتراضي', true);
    toast.success('أُعيد الجهاز إلى حالته الافتراضية');
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
    set({ logs: [], quizScores: {}, missionsDone: [], lessonsRead: [], activeMissionId: null, missionStepIndex: 0, lastDiagnosis: null });
    toast.success('مُسح سجل التدريب والاختبارات');
    schedulePersist(get);
  },

  resetEverything: () => {
    const res = clearAll();
    set({
      sim: initialSimulationState(),
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
        sim: parsed.simulation,
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
