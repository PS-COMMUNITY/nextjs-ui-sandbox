/**
 * diagnosticsEngine.ts — طبقة التشخيص العليا للمختبر.
 *
 * تربط بين محرك التوافق (للتجميعة المختارة) ومحرك POST (لحالة الجهاز
 * داخل المحاكاة)، وتضيف تلميحًا ذكيًا قصيرًا لكل نتيجة.
 */

import type {
  BuildOption,
  BuildSelection,
  DiagnosisCode,
  DiagnosisFinding,
  SimulationState,
} from '../types';
import { checkCompatibility } from './compatibilityEngine';
import { runPost } from './postEngine';

/**
 * يفحص التجميعة المختارة: إن وُجدت قاعدة توافق مخالفة (incompatible) أعاد
 * نتيجة INCOMPATIBLE_BUILD بأسبابها، وإلا null.
 */
export function diagnoseBuild(sel: BuildSelection, options: BuildOption[]): DiagnosisFinding | null {
  const results = checkCompatibility(sel, options);
  const incompatible = results.filter((r) => r.status === 'incompatible');
  if (incompatible.length === 0) return null;
  return {
    code: 'INCOMPATIBLE_BUILD',
    titleAr: 'التجميعة غير متوافقة منطقيًا',
    detailsAr: incompatible.map((r) => `${r.titleAr}: ${r.reasonAr}`),
    nextStepsAr: [
      'عدّل الخيارات المخالفة أعلاه واحدًا تلو الآخر — غالبًا يكفي تغيير قطعة واحدة لحل أكثر من قاعدة.',
      'ابدأ بمطابقة مقبس المعالج ونوع الذاكرة، ثم القدرة والتوصيلات.',
      'أعد الفحص بعد كل تعديل حتى تختفي القواعد الحمراء.',
    ],
    isSimulated: true,
  };
}

/** تلميح ذكي قصير مرتبط بكل رمز تشخيص — يرشد للخطوة التالية بلا إطالة. */
const SMART_HINTS: Record<DiagnosisCode, string> = {
  POWER_OFF:
    'لا طاقة بعد — تحقق من الحائط والكابل وزر الطاقة قبل فتح الهيكل؛ معظم حالات «الموت الظاهري» سببها الكهرباء لا القطع.',
  POST_FAIL:
    'فشل POST — راجع الثلاثي بالترتيب: المعالج، ثم تغذية اللوحة (ATX ثم EPS)، ثم الذاكرة؛ غيّر قطعة واحدة وأعد الفحص في كل مرة.',
  POST_PASS_BOOT_WARNING:
    'POST نجح مع تحذير — أكمل القطعة الناقصة (المبرد/البطاقة/طاقتها/القرص) ثم أعد الفحص لبلوغ إقلاع سليم.',
  POST_PASS_BOOT_OK:
    'التجميعة سليمة في المحاكاة — جهّز نفسك لسيناريوهات الأعطال: جرّب SMART والمهام المتقدمة.',
  INCOMPATIBLE_BUILD:
    'المشكلة هنا منطقية لا ميكانيكية — راجع قواعد التوافق قبل أن تكمل تجميع أي قطعة، فالتوافق يُقرر قبل الشراء.',
};

/**
 * تشخيص مختبر كامل: نتيجة POST للحالة الحالية + تلميح ذكي مصاحب.
 * (فحص التوافق منفصل عنه — استخدم diagnoseBuild للتجميعة المختارة.)
 */
export function fullLabDiagnosis(s: SimulationState): { post: DiagnosisFinding; smartHintAr: string } {
  const post = runPost(s);
  return { post, smartHintAr: SMART_HINTS[post.code] };
}
