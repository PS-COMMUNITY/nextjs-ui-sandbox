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
  settings: { quality: 'low' | 'medium' | 'high' };
  savedAt: number;
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

    // التحقق من الإصدار: أي بيانات من إصدار آخر تُتجاهل.
    if (data.version !== APP_VERSION) return null;

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

    // tech اختياري (توافقًا مع نسخ قديمة من نفس الإصدار) — يُدمج في المتجر كـ null
    const merged: PersistShape = {
      version: data.version,
      simulation: data.simulation,
      tech: (data as { tech?: TechSession | null }).tech ?? null,
      logs: data.logs,
      quizScores: data.quizScores,
      missionsDone: data.missionsDone,
      lessonsRead: data.lessonsRead,
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
