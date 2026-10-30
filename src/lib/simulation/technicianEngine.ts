/**
 * technicianEngine.ts — محرك جلسة الفني ذي المراحل التسع (المواصفة §7).
 *
 * المراحل: بطاقة الطلب ← السلامة ← الفحص الخارجي ← الفحص الداخلي ← خطة التشخيص
 *          ← الإصلاح الافتراضي ← التجميع والتحقق ← التشغيل وPOST ← تقرير التسليم.
 *
 * كل بوابة انتقال بين المراحل دالة نقية تقرأ جلسة الفني + حالة المحاكاة،
 * وتعيد ما يمنع الانتقال إن وُجد — بلا أي تعديل جانبي.
 */

import { COMPONENT_IDS, isInstalled } from '../types';
import type { SimulationState } from '../types';
import { FAULTS } from '../data/faults';
import { runPost } from './postEngine';

export { getFault } from '../data/faults';

export type TechStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface TechSession {
  scenarioId: string;          // معرّف العطل F01..F14 المختار في بطاقة الطلب
  stage: TechStage;
  orderRead: boolean;          // مرحلة 1: قُرئت بطاقة الطلب
  // مرحلة 2: السلامة
  esdStrap: boolean;           // سوار التأريض
  tidyDesk: boolean;           // ترتيب سطح العمل
  toolsChosen: string[];       // الأدوات المختارة (معرّفات TECH_TOOLS)
  // مرحلة 3: الفحص الخارجي
  extAcCable: boolean;         // فحص كابل الكهرباء والمقبس
  extMonitorCable: boolean;    // فحص كابل الشاشة
  extPeripherals: boolean;     // فحص لوحة المفاتيح والفأرة
  extPowerPressed: boolean;    // تجربة ضغطة تشغيل مرة واحدة وملاحظة الاستجابة
  // مرحلة 4: الفحص الداخلي
  intDust: boolean;            // الغبار والمسار الهوائي
  intCables: boolean;          // حالة الكابلات والموصلات
  intScrews: boolean;          // البراغي والتثبيت
  // مرحلة 5: خطة التشخيص
  hypothesisId: string | null; // الفرضية المختارة (H01..H16)
  hypothesisCorrect: boolean | null; // يُحسم في تقرير التسليم فقط
  // مرحلة 6
  repairNotes: string;         // ملاحظات الفني الحرة
  // مرحلة 9
  reportAt: number | null;
  startedAt: number;
}

export function newTechSession(scenarioId: string): TechSession {
  return {
    scenarioId,
    stage: 1,
    orderRead: false,
    esdStrap: false,
    tidyDesk: false,
    toolsChosen: [],
    extAcCable: false,
    extMonitorCable: false,
    extPeripherals: false,
    extPowerPressed: false,
    intDust: false,
    intCables: false,
    intScrews: false,
    hypothesisId: null,
    hypothesisCorrect: null,
    repairNotes: '',
    reportAt: null,
    startedAt: Date.now(),
  };
}

// ============ أدوات العمل (مرحلة السلامة) ============
export const TECH_TOOLS: { id: string; nameAr: string; correct: boolean; whyAr: string }[] = [
  { id: 'screwdriver', nameAr: 'مفك رأس مغناطيسي (#2 فيليبس)', correct: true, whyAr: 'الأساس لفك براغي الغطاء والقطع دون تلف الرؤوس.' },
  { id: 'esd-strap', nameAr: 'سوار تأريض مضاد للكهرباء الساكنة', correct: true, whyAr: 'يفرغ الشحنة الساكنة قبل لمس الإلكترونيات الحساسة.' },
  { id: 'flashlight', nameAr: 'مصباح فحص صغير', correct: true, whyAr: 'لاستكشاف الزوايا الداكنة ومواضع الكابلات والمزالج.' },
  { id: 'tray', nameAr: 'صينية براغٍ صغيرة', correct: true, whyAr: 'البراغي الضائعة أكثر أسباب نصف التركيبات.' },
  { id: 'water', nameAr: 'كوب ماء مفتوح', correct: false, whyAr: 'أي سائل قرب اللوحات خطر قصر قاتل — ابعد السوائل تمامًا عن سطح العمل.' },
  { id: 'magnet', nameAr: 'مغناطيس قوي كبير', correct: false, whyAr: 'المغناطيسات القوية قرب الأقراص/اللوحات خطير على الأدوات والمكونات المغناطيسية.' },
  { id: 'hammer', nameAr: 'مطرقة صغيرة', correct: false, whyAr: 'لا مكان للمطرقة في صيانة الحاسوب إطلاقًا — القوة أعداء المكونات.' },
  { id: 'vacuum', nameAr: 'مكنسة كهربائية منزلية', correct: false, whyAr: 'تولّد كهرباء ساكنة عالية وتسحب القطع الصغيرة — استخدم هواء مضغوطًا بلا رطوبة.' },
];

// ============ الفرضيات (مرحلة خطة التشخيص — وضع تقييم بلا إفصاح) ============
/** 14 فرضية حقيقية (من الأعطال) + 3 مشتتات تعليمية */
export const TECH_HYPOTHESES: { id: string; textAr: string; faultId: string | null }[] = [
  ...FAULTS.map((f, i): { id: string; textAr: string; faultId: string | null } => ({
    id: `H${String(i + 1).padStart(2, '0')}`,
    textAr: f.hypothesisAr,
    faultId: f.id,
  })),
  { id: 'H15', textAr: 'بطارية CMOS فارغة ففقدت إعدادات BIOS — يظهر التاريخ القديم في كل تشغيل.', faultId: null },
  { id: 'H16', textAr: 'تعريف كرت الشاشة تالف بعد تحديث — يفشل النظام بعد دخوله وليس قبله.', faultId: null },
  { id: 'H17', textAr: 'قطاعات تالفة متعددة على القرص تكشفها قراءة SMART — بطء قبل الانهيار.', faultId: null },
];

export function getHypothesis(id: string | null) {
  return TECH_HYPOTHESES.find((h) => h.id === id) ?? null;
}

// ============ عناوين المراحل ============
export const TECH_STAGES: { id: TechStage; titleAr: string; briefAr: string }[] = [
  { id: 1, titleAr: 'بطاقة الطلب', briefAr: 'اقرأ شكوى العميل وحدّد العطل التدريبي الذي ستحلّه.' },
  { id: 2, titleAr: 'السلامة', briefAr: 'إطفاء وفصل الكهرباء وسوار التأريض وترتيب سطح العمل واختيار الأدوات.' },
  { id: 3, titleAr: 'الفحص الخارجي', briefAr: 'افحص الكابلات والطرفيات وجرّب ضغطة تشغيل واحدة ودوّن الاستجابة.' },
  { id: 4, titleAr: 'الفحص الداخلي', briefAr: 'افتح الغطاء (بعد الفصل) وافحص الغبار والكابلات والتثبيت.' },
  { id: 5, titleAr: 'خطة التشخيص', briefAr: 'اختر فرضيتك من القائمة — وضع تقييم: لن تُكشف الإجابة الآن.' },
  { id: 6, titleAr: 'الإصلاح الافتراضي', briefAr: 'نفّذ الإصلاح في المختبر ثلاثي الأبعاد وفق قوائم الفك/التركيب.' },
  { id: 7, titleAr: 'التجميع والتحقق', briefAr: 'كل القطع مثبتة ومؤمّنة والكابلات موصولة والغطاء مغلق.' },
  { id: 8, titleAr: 'التشغيل وPOST', briefAr: 'شغّل الجهاز واقرأ المصير الثلاثي: فشل POST / بلا إقلاع / نظام يعمل.' },
  { id: 9, titleAr: 'تقرير التسليم', briefAr: 'ولّد تقرير الجلسة: الفرضية والدليل والنتيجة والتوصيات.' },
];

// ============ بوابات الانتقال ============
export interface StageGate {
  done: boolean;
  blockersAr: string[];
  hintAr: string;
}

export function stageGate(stage: TechStage, session: TechSession, sim: SimulationState): StageGate {
  const fault = FAULTS.find((f) => f.id === session.scenarioId);
  const blocked = (blockersAr: string[], hintAr: string): StageGate => ({ done: false, blockersAr, hintAr });
  const pass = (hintAr: string): StageGate => ({ done: true, blockersAr: [], hintAr });

  switch (stage) {
    case 1:
      return session.orderRead
        ? pass('بطاقة الطلب قُرئت — انتقل إلى السلامة.')
        : blocked(['لم تقرأ بطاقة الطلب بعد'], 'اقرأ الشكوى ثم اضغط «استلمت الطلب».');

    case 2: {
      const blockers: string[] = [];
      if (sim.flags.powerOn) blockers.push('الجهاز ما زال يعمل — أطفئه');
      if (sim.flags.acConnected) blockers.push('كابل الكهرباء موصول — افصله');
      if (!session.esdStrap) blockers.push('لم تلبس سوار التأريض');
      if (!session.tidyDesk) blockers.push('لم ترتب سطح العمل');
      if (session.toolsChosen.length === 0) blockers.push('لم تختر أدوات العمل');
      const wrongTool = session.toolsChosen.find((id) => TECH_TOOLS.find((t) => t.id === id && !t.correct));
      if (wrongTool) blockers.push('أحد الأدوات المختارة غير مناسب للعمل على الحاسوب');
      return blockers.length === 0
        ? pass('بيئة عمل آمنة — يمكنك فتح الغطاء في الفحص الداخلي.')
        : blocked(blockers, 'أطفئ، افصل الكهرباء، البس السوار، رتب السطح، واختر الأدوات الصحيحة فقط.');
    }

    case 3: {
      const blockers: string[] = [];
      if (!session.extAcCable) blockers.push('لم تفحص كابل الكهرباء والمقبس');
      if (!session.extMonitorCable) blockers.push('لم تفحص كابل الشاشة');
      if (!session.extPeripherals) blockers.push('لم تفحص لوحة المفاتيح والفأرة');
      if (!session.extPowerPressed) blockers.push('لم تجرب ضغطة التشغيل المراقبة');
      return blockers.length === 0
        ? pass('فحص خارجي مكتمل — سجّل ملاحظاتك ثم افتح الغطاء.')
        : blocked(blockers, 'أكمل عناصر الفحص الخارجي الأربعة قبل فتح الهيكل.');
    }

    case 4: {
      const blockers: string[] = [];
      if (!sim.flags.panelOpen) blockers.push('الغطاء الجانبي مغلق — افتحه (الجهاز مفصول بالفعل)');
      if (!session.intDust) blockers.push('لم تفحص الغبار ومسار الهواء');
      if (!session.intCables) blockers.push('لم تفحص الكابلات والموصلات');
      if (!session.intScrews) blockers.push('لم تفحص البراغي والتثبيت');
      return blockers.length === 0
        ? pass('فحص داخلي مكتمل — صغ فرضيتك الآن.')
        : blocked(blockers, 'افتح الغطاء وأكمل عناصر الفحص الداخلي الثلاثة.');
    }

    case 5:
      return session.hypothesisId
        ? pass('الفرضية مسجّلة — نفّذ الإصلاح الافتراضي في المختبر.')
        : blocked(['لم تختر فرضية تشخيص'], 'اختر فرضية واحدة من القائمة — لا تعتمد التخمين المتكرر.');

    case 6: {
      if (!fault) return blocked(['بطاقة الطلب غير معروفة'], 'أعد اختيار العطل التدريبي.');
      return fault.isFixed(sim)
        ? pass('الإصلاح نُفّذ — تحقق من التجميع الكامل.')
        : blocked(['العطل الأساسي لم يُصلح بعد'], `أكمل الإصلاح في المختبر: ${fault.hypothesisAr}`);
    }

    case 7: {
      const blockers: string[] = [];
      const loose = COMPONENT_IDS.find((id) => id !== 'case' && sim.parts[id] === 'separated');
      if (loose) blockers.push('قطعة نصف مفكوكة داخل الهيكل — أكمل فكها أو ركّبها');
      const waiting = COMPONENT_IDS.find((id) => id !== 'case' && sim.parts[id] === 'awaiting');
      if (waiting) blockers.push('قطعة ملتقطة من الصينية لم تُركّب بعد');
      const missing = COMPONENT_IDS.find((id) => id !== 'case' && !isInstalled(sim.parts[id]));
      if (missing) blockers.push('قطعة ما زالت في صينية القطع — أعد تركيبها');
      if (sim.flags.panelOpen) blockers.push('الغطاء الجانبي مفتوح — أغلقه');
      if (blockers.length === 0) {
        const unfinished = COMPONENT_IDS.find((id) => id === 'gpu' && (sim.flags.pcieLatchOpen || sim.flags.gpuScrewsOut));
        if (unfinished) blockers.push('مزلاج/براغي بطاقة الرسوميات مفتوحة — أغلقها');
        const ramOpen = sim.flags.ramClipsOpen;
        if (ramOpen) blockers.push('مزالج الذاكرة مفتوحة — اضغطها لتثبيت الوحدة');
        const lever = sim.flags.cpuLeverOpen;
        if (lever) blockers.push('رافعة مقبس المعالج مفتوحة — اخفضها');
      }
      return blockers.length === 0
        ? pass('التجميعة مكتملة ومؤمّنة — جرّب التشغيل الآن.')
        : blocked(blockers, 'أعد كل قطعة إلى مكانها، أغلق المزالج والبراغي، ثم أغلق الغطاء.');
    }

    case 8: {
      const blockers: string[] = [];
      if (!sim.flags.powerOn || !sim.flags.acConnected) blockers.push('الجهاز غير مشغّل — شغّله من المختبر');
      else {
        const code = runPost(sim).code;
        if (code !== 'POST_PASS_BOOT_OK') blockers.push(`نتيجة POST الحالية: ${code} — أكمل الإصلاح حتى يعمل النظام`);
      }
      return blockers.length === 0
        ? pass('POST ناجح والنظام الافتراضي يعمل — ولّد تقرير التسليم.')
        : blocked(blockers, 'شغّل الجهاز من المختبر وواصل حتى تظهر نتيجة POST ناجحة وإقلاع سليم.');
    }

    case 9:
      return pass('اكتملت جلسة الفني بالكامل.');
  }
}

/** هل الجلسة اكتملت حتى تقرير التسليم؟ */
export function isSessionComplete(session: TechSession): boolean {
  return session.stage === 9 && session.reportAt !== null;
}
