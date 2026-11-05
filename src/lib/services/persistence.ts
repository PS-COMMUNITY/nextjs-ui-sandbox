/**
 * persistence.ts — حفظ/تحميل/مسح حالة الجلسة في التخزين المحلي (localStorage).
 *
 * قواعد مهمة:
 * - فشل الحفظ أو التحميل لا يُسقط التطبيق أبدًا — كل الدوال ترجع نتائج آمنة
 *   برسائل عربية تشرح ما حدث والخطوة التالية.
 * - loadAll يتحقق من رقم الإصدار (version) ويترفض أي بيانات لا تطابقه.
 * - كل الاستدعاءات محمية بـ try/catch وتتعامل مع غياب التخزين (متصفح/وضع خاص/SSR).
 */

import { APP_VERSION } from '../types';
import type { SessionEvent, SimulationState } from '../types';
import type { TechSession } from '../simulation/technicianEngine';

/** شكل البيانات المحفوظة في التخزين المحلي. */
export interface PersistShape {
  version: string;
  simulation: SimulationState;
  tech: TechSession | null;
  logs: SessionEvent[];
  quizScores: Record<string, { score: number; at: number }>;
  missionsDone: string[];
  lessonsRead: string[];
  // (إصلاح U10) حقول إضافية بإصدار 6.0.0 — تحميل النسخ الأقدم يعوّضها بقيم آمنة
  notepad: string;
  activeMissionId: string | null;
  missionStepIndex: number;
  settings: { quality: 'low' | 'medium' | 'high' };
  savedAt: number;
}

/** مدخلات بناء النسخة الاحتياطية — كل ما يُصرَّف من لقطة حالة المتجر. */
export type BackupInput = Omit<PersistShape, 'version' | 'savedAt'>;

/**
 * (إصلاح U1) يبني كائن النسخة الاحتياطية الموحد (PersistShape) من لقطة حالة المتجر —
 * مصدر واحد يستخدمه تصدير «الإعدادات» و«سجل الجلسات» معًا حتى لا يختلف شكلا التصدير
 * (كان تصدير الإعدادات يُغفل جلسة الفني فيمحوها عند الاستيراد).
 */
export function buildBackupShape(input: BackupInput): PersistShape {
  return {
    version: APP_VERSION,
    simulation: input.simulation,
    tech: input.tech ?? null,
    logs: input.logs,
    quizScores: input.quizScores,
    missionsDone: input.missionsDone,
    lessonsRead: input.lessonsRead,
    notepad: input.notepad ?? '',
    activeMissionId: input.activeMissionId ?? null,
    missionStepIndex: input.missionStepIndex ?? 0,
    settings: input.settings,
    savedAt: Date.now(),
  };
}

/** يبني نص JSON للنسخة الاحتياطية منسقًا بأسطر مقروءة (نفس تنسيق downloadJson). */
export function buildBackupJson(input: BackupInput): string {
  return JSON.stringify(buildBackupShape(input), null, 2);
}

/** مفتاح التخزين الموحد للتطبيق. */
export const STORAGE_KEY = 'pcrs_v1_state';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'خطأ غير معروف';
}

/** هل التخزين المحلي متاح ويقبل الكتابة؟ (تجربة كتابة/حذف فعلية داخل try) */
export function storageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false;
    }
    const probeKey = `${STORAGE_KEY}__probe`;
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * (إصلاح U4) فحص خام لوجود حفظ سابق في التخزين وإصداره — دون تحقق هيكلي كامل.
 * يستخدمه المتجر ليميّز «لا يوجد حفظ» عن «يوجد حفظ لكنه تالف/من إصدار غير مدعوم»
 * ليُعلم المستخدم بدل تجاهل صامت. لا يرمي أبدًا ويعيد نتائج آمنة.
 */
export function loadRawMeta(): { exists: boolean; version: string | null } {
  try {
    if (!storageAvailable()) return { exists: false, version: null };
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { exists: false, version: null };
    let version: string | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
        const v = (parsed as { version?: unknown }).version;
        if (typeof v === 'string') version = v;
      }
    } catch {
      // بيانات غير قابلة للتحليل — تبقى version صفراء لكن exists صحيح
    }
    return { exists: true, version };
  } catch {
    return { exists: false, version: null };
  }
}

/** يحفظ كل بيانات الجلسة — الفشل لا يُسقط التطبيق، فقط رسالة عربية واضحة. */
export function saveAll(data: PersistShape): { ok: boolean; messageAr: string } {
  try {
    if (!storageAvailable()) {
      return {
        ok: false,
        messageAr: 'التخزين المحلي غير متاح في هذا المتصفح (قد يكون الوضع الخاص مفعّلًا) — ستبقى بيانات الجلسة في الذاكرة فقط.',
      };
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true, messageAr: 'تم حفظ التقدم بنجاح — يمكنك متابعة الجلسة بأمان.' };
  } catch (e) {
    return {
      ok: false,
      messageAr: `فشل الحفظ (${errorMessage(e)}) — قد تكون مساحة التخزين ممتلئة أو الوضع الخاص مفعّلًا؛ التطبيق سيستمر دون حفظ ولن يتوقف.`,
    };
  }
}

/** يحمّل البيانات المحفوظة — يعيد null إن غابت أو كان إصدارها مختلفًا أو تالفة. */
export function loadAll(): PersistShape | null {
  try {
    if (!storageAvailable()) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const data = parsed as Partial<PersistShape>;

    // التحقق من الإصدار: نقبل إصدار V6 الحالي وإصدار V5 السابق (ترقية شفافة —
    // normalizeSimulationState في المتجر يملأ الحقول الجديدة بقيمها الافتراضية).
    const ACCEPTED_VERSIONS = new Set([APP_VERSION, '6.0.0', '5.0.0', '4.0.0']);
    if (typeof data.version !== 'string' || !ACCEPTED_VERSIONS.has(data.version)) return null;

    // تحقق هيكلي أساسي يحمي الواجهة من بيانات تالفة.
    if (typeof data.simulation !== 'object' || data.simulation === null) return null;
    if (typeof data.simulation.flags !== 'object' || data.simulation.flags === null) return null;
    if (typeof data.simulation.parts !== 'object' || data.simulation.parts === null) return null;
    if (!Array.isArray(data.logs)) return null;
    if (typeof data.quizScores !== 'object' || data.quizScores === null) return null;
    if (!Array.isArray(data.missionsDone)) return null;
    if (!Array.isArray(data.lessonsRead)) return null;
    if (typeof data.settings !== 'object' || data.settings === null) return null;
    if (data.settings.quality !== 'low' && data.settings.quality !== 'medium' && data.settings.quality !== 'high') return null;
    if (typeof data.savedAt !== 'number' || !Number.isFinite(data.savedAt)) return null;

    // tech اختياري (توافقًا مع نسخ قديمة من نفس الإصدار) — يُدمج في المتجر كـ null.
    // (إصلاح U10) الحقول الجديدة اختيارية بقيم افتراضية آمنة حتى تُحمّل النسخ الأقدم دون مشاكل.
    const merged: PersistShape = {
      version: data.version,
      simulation: data.simulation,
      tech: (data as { tech?: TechSession | null }).tech ?? null,
      logs: data.logs,
      quizScores: data.quizScores,
      missionsDone: data.missionsDone,
      lessonsRead: data.lessonsRead,
      notepad: data.notepad ?? '',
      activeMissionId: data.activeMissionId ?? null,
      missionStepIndex: data.missionStepIndex ?? 0,
      settings: data.settings,
      savedAt: data.savedAt,
    };
    return merged;
  } catch {
    return null;
  }
}

/** يمسح كل البيانات المحفوظة — مع رسالة عربية عن النتيجة. */
export function clearAll(): { ok: boolean; messageAr: string } {
  try {
    if (!storageAvailable()) {
      return { ok: false, messageAr: 'التخزين المحلي غير متاح — لا يوجد ما يمكن مسحه.' };
    }
    window.localStorage.removeItem(STORAGE_KEY);
    return { ok: true, messageAr: 'تم مسح كل بيانات الجلسة المحفوظة — ستبدأ الجلسة القادمة من جديد.' };
  } catch (e) {
    return { ok: false, messageAr: `تعذّر مسح البيانات (${errorMessage(e)}) — التطبيق سيستمر ولن يتوقف.` };
  }
}
