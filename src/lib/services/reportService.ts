/**
 * reportService.ts — بناء تقارير الجلسة التعليمية (خلاصة + صفوف CSV + توصيات).
 *
 * - summarizeSession: خلاصة أرقام الجلسة (أحداث/أخطاء/اختبارات/مهام).
 * - eventsToCsvRows / reportToCsvRows: صفوف جاهزة للتصدير عبر exportService.
 * - buildRecommendationsAr: توصيات ذكية دائمًا توصية واحدة على الأقل.
 * كل القيم من محاكاة تعليمية — التقرير يصرّح بذلك في simulatedValuesNoticeAr.
 */

import type { DiagnosisCode, ReportSummary, SessionEvent } from '../types';

/** يحوّل طابع زمني إلى نص ISO مقروء — مع حماية من القيم غير السليمة. */
function toIso(ts: number): string {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toISOString();
  } catch {
    return String(ts);
  }
}

/** يلخّص الجلسة في كائن تقرير جاهز للعرض أو التصدير. */
export function summarizeSession(
  events: SessionEvent[],
  quizScores: Record<string, { score: number; at: number }>,
  missionsDone: string[],
  lastDiagnosis: DiagnosisCode | null,
): ReportSummary {
  const correctActions = events.filter((e) => e.ok).length;
  const failedActions = events.length - correctActions;

  const scores = Object.values(quizScores);
  const quizTaken = scores.length;
  const quizAverageScore =
    quizTaken === 0 ? 0 : Math.round(scores.reduce((sum, s) => sum + s.score, 0) / quizTaken);

  return {
    // معرّف حتمي مشتق من أول حدث في الجلسة (لا يوجد معرف جلسة في العقد).
    sessionId: events.length > 0 ? `sess-${events[0].ts}` : 'sess-empty',
    startedAt: events.length > 0 ? events[0].ts : Date.now(),
    eventsCount: events.length,
    correctActions,
    failedActions,
    quizTaken,
    quizAverageScore,
    missionsCompleted: [...missionsDone],
    lastDiagnosis,
    simulatedValuesNoticeAr:
      'كل القيم في هذا التقرير من محاكاة تعليمية داخل التطبيق — وليست تقييمًا لمهارات صيانة حقيقية ولا قياسات من أجهزة فعلية.',
  };
}

/** صفوف CSV لسجل الأحداث: عنوان + صف لكل حدث (وقت ISO، النوع، التسمية، النتيجة، التفصيل). */
export function eventsToCsvRows(events: SessionEvent[]): (string | number)[][] {
  const header: (string | number)[] = ['الوقت (ISO)', 'النوع', 'التسمية', 'النتيجة', 'التفصيل'];
  const rows: (string | number)[][] = events.map((e) => [
    toIso(e.ts),
    e.kind,
    e.labelAr,
    e.ok ? 'ناجح' : 'خطأ',
    e.detailAr ?? '',
  ]);
  return [header, ...rows];
}

/**
 * توصيات ذكية بالعربية: تبدأ بأكثر نوع أخطاء تكرارًا ثم بآخر تشخيص POST،
 * وتنتهي بتوصية افتراضية — الدالة تعيد توصية واحدة على الأقل دائمًا.
 */
export function buildRecommendationsAr(events: SessionEvent[], lastDiagnosis: DiagnosisCode | null): string[] {
  const recs: string[] = [];

  // 1) أكثر نوع أفعال خاطئة تكرارًا → توصية مراجعة الدرس المرتبط به.
  const failsByKind = new Map<string, number>();
  for (const e of events) {
    if (e.ok) continue;
    failsByKind.set(e.kind, (failsByKind.get(e.kind) ?? 0) + 1);
  }
  let worstKind: string | null = null;
  let worstCount = 0;
  for (const [kind, count] of failsByKind) {
    if (count > worstCount) {
      worstCount = count;
      worstKind = kind;
    }
  }

  if (worstKind === 'safety') {
    recs.push(
      'تكررت أخطاء السلامة — راجع درس «سلسلة السلامة»: إطفاء الجهاز ثم فصل الكهرباء قبل أي لمس داخلي، ولا استثناء مهما كان التعديل صغيرًا.',
    );
  } else if (worstKind === 'remove') {
    recs.push(
      'أكثر أخطائك حدثت أثناء فك القطع — راجع درس «الفك الآمن»: البراغي أولًا ثم الموصلات ثم المزالج ثم السحب؛ لا تسحب قطعة عليها برغٍ أو مزلاج مغلق.',
    );
  } else if (worstKind === 'install') {
    recs.push(
      'أكثر أخطائك حدثت أثناء التركيب — راجع درس «ترتيب التركيب»: اللوحة ثم المعالج والمبرد والذاكرة، ثم التغذية والكابلات، وأخيرًا بطاقة الرسوميات والتخزين.',
    );
  } else if (worstKind === 'flag') {
    recs.push(
      'أخطاء الأعلام متكررة — راجع درس «أعلام حالة الجهاز»: لكل مزلاج وبرغي علم مستقل، وأغلق ما فتحته بعد الانتهاء من كل قطعة.',
    );
  } else if (worstKind === 'quiz') {
    recs.push(
      'أعد قراءة الدروس المرتبطة بالأسئلة التي أخطأت فيها — الهدف فهم السبب لا حفظ الإجابة.',
    );
  } else if (worstKind !== null) {
    recs.push(`تكررت أخطاء من نوع «${worstKind}» — أعد قراءة الدرس المرتبط بهذه الخطوة قبل المتابعة.`);
  }

  // 2) توصية مبنية على آخر نتيجة تشخيص POST/توافق.
  switch (lastDiagnosis) {
    case 'POWER_OFF':
      recs.push(
        'آخر تشخيص: لا طاقة — تحقق من كابل الحائط وزر الطاقة، وتأكد أن التجميعة مكتملة والغطاء مغلق قبل التشغيل.',
      );
      break;
    case 'POST_FAIL':
      recs.push(
        'آخر تشخيص: فشل POST — راجع درس «POST وإشاراته» وابدأ بالمعالج ثم ATX/EPS ثم الذاكرة، وغيّر قطعة واحدة كل محاولة.',
      );
      break;
    case 'POST_PASS_BOOT_WARNING':
      recs.push(
        'آخر تشخيص: POST ناجح مع تحذير — راجع درس «POST مقابل الإقلاع» وأكمل القطعة الناقصة (مبرد/بطاقة/طاقتها/قرص) لإنهاء المشهد بنجاح.',
      );
      break;
    case 'POST_PASS_BOOT_OK':
      recs.push(
        'آخر تشخيص: إقلاع سليم — انتقل إلى مهام أعلى صعوبة أو اختبر سيناريوهات SMART لتوسيع فهمك.',
      );
      break;
    case 'INCOMPATIBLE_BUILD':
      recs.push(
        'آخر تشخيص: تجميعة غير متوافقة — راجع درس «قواعد التوافق»: المقبس ثم نوع الذاكرة ثم القدرة، والقرار قبل الشراء لا بعده.',
      );
      break;
    case null:
      break;
  }

  // 3) لا تُعاد قائمة فارغة أبدًا.
  if (recs.length === 0) {
    recs.push(
      events.length === 0
        ? 'ابدأ بقراءة درس السلامة ثم مهمة «التجميعة الأولى» — تعلّم سلسلة الإطفاء والفصل قبل أي عمل داخلي.'
        : 'استمر بالتدريب المنتظم — أعد المحاولات الناقصة وجرّب سيناريوًا جديدًا في كل جلسة.',
    );
  }

  return recs;
}

/** صفوف CSV لخلاصة التقرير: عمودا «البند/القيمة» بصفوف عربية مقروءة. */
export function reportToCsvRows(r: ReportSummary): (string | number)[][] {
  return [
    ['البند', 'القيمة'],
    ['معرّف الجلسة', r.sessionId],
    ['بداية الجلسة (ISO)', toIso(r.startedAt)],
    ['عدد الأحداث', r.eventsCount],
    ['أفعال ناجحة', r.correctActions],
    ['أفعال خاطئة', r.failedActions],
    ['اختبارات مأخوذة', r.quizTaken],
    ['متوسط درجات الاختبارات', r.quizAverageScore],
    ['المهام المكتملة', r.missionsCompleted.length > 0 ? r.missionsCompleted.join(' | ') : 'لا شيء بعد'],
    ['آخر تشخيص', r.lastDiagnosis ?? '—'],
    ['ملاحظة', r.simulatedValuesNoticeAr],
  ];
}
