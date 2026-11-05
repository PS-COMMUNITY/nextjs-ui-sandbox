/**
 * powerEstimator.ts — مقدّر الطاقة التعليمي للتجميعة (صيغة الموسوعة المرجعية).
 *
 * safetyBudgetW = psuRatedW * 0.80          ← ميزانية الأمان التعليمية (80٪)
 * selectedLoadW = مجموع استهلاك القطع المختارة + مراوح الهيكل
 * usagePercent  = selectedLoadW / safetyBudgetW * 100
 * remainingW    = safetyBudgetW - selectedLoadW
 *
 * مرجع الموسوعة: PSU 750W → ميزانية 600 واط، الحمل 414 واط، نحو 69٪، هامش 186 واط.
 * كل الأرقام تقدير تعليمي وليست قياسًا كهربائيًا حقيقيًا.
 */

import type { BuildOption, BuildSelection, BuildSlot, PowerEstimateResult } from '../types';

/** استهلاك تقديري ثابت لمراوح الهيكل (ليست فتحة اختيار في المبني). */
export const CASE_FANS_W = 15;

/** يقرأ رقمًا من قيمة نصية في specs — يتسامح مع لواحق مثل «125W». */
export function readSpecNumber(specs: Record<string, string>, key: string): number | null {
  const raw = specs[key];
  if (raw === undefined || raw === null) return null;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function bySlot(options: BuildOption[], slot: BuildSlot, id: string | undefined): BuildOption | undefined {
  if (id === undefined || id === '') return undefined;
  return options.find((o) => o.slot === slot && o.id === id);
}

/** استهلاك تقديري لخيار: مفتاح specs أولًا ثم حقل powerW. */
function optionWatts(opt: BuildOption, specKey: string): number {
  const fromSpec = readSpecNumber(opt.specs, specKey);
  if (fromSpec !== null) return fromSpec;
  return typeof opt.powerW === 'number' && Number.isFinite(opt.powerW) ? opt.powerW : 0;
}

/** قدرة PSU: مفتاح 'psuW' في specs أولًا ثم حقل powerW؛ إن غابا → null. */
function psuWatts(psu: BuildOption): number | null {
  const fromSpec = readSpecNumber(psu.specs, 'psuW');
  if (fromSpec !== null) return fromSpec;
  return typeof psu.powerW === 'number' && Number.isFinite(psu.powerW) ? psu.powerW : null;
}

/** يحسب الحمل والميزانية الآمنة (80٪) والنسبة المتبقية وفق صيغة الموسوعة. */
export function estimatePower(sel: BuildSelection, options: BuildOption[]): PowerEstimateResult {
  const cpu = bySlot(options, 'cpu', sel.cpu);
  const gpu = bySlot(options, 'gpu', sel.gpu);
  const psu = bySlot(options, 'psu', sel.psu);
  const cooler = bySlot(options, 'cooler', sel.cooler);
  const motherboard = bySlot(options, 'motherboard', sel.motherboard);
  const ram = bySlot(options, 'ram', sel.ram);
  const ssd = bySlot(options, 'ssd', sel.ssd);

  const cpuW = cpu !== undefined ? optionWatts(cpu, 'tdpW') : 0;
  const gpuW = gpu !== undefined ? optionWatts(gpu, 'tdpW') : 0;
  const coolerW = cooler !== undefined ? cooler.powerW ?? 0 : 0;
  const moboW = motherboard !== undefined ? motherboard.powerW ?? 0 : 0;
  const ramW = ram !== undefined ? ram.powerW ?? 0 : 0;
  const ssdW = ssd !== undefined ? ssd.powerW ?? 0 : 0;

  const totalW = cpuW + gpuW + coolerW + moboW + ramW + ssdW + CASE_FANS_W;

  // ميزانية الأمان التعليمية: 80٪ من القدرة الاسمية للمزود.
  const psuW = psu !== undefined ? psuWatts(psu) : null;
  const budgetW = psuW !== null ? Math.round(psuW * 0.8) : null;
  const usagePercent = budgetW !== null && budgetW > 0 ? Math.round((totalW / budgetW) * 100) : null;
  const remainingW = budgetW !== null ? budgetW - totalW : null;
  // قدرة موصى بها إرشادية: الحلف ÷ 0.8 مقرّبًا لأقرب 50 واط (لتحقيق هامش 80٪ نفسه).
  const recommendedPsuW = Math.ceil(totalW / 0.8 / 50) * 50;

  // تنبيهات إلزامية دائمًا + تنبيهات سياقية.
  const notesAr: string[] = [
    'الأرقام تقدير تعليمي من الكتالوج المرجعي وليست قياسًا كهربائيًا حقيقيًا',
    'ذروات الحمل وجودة PSU وتوصيات الشركة مهمة — لا تعوّضها هذه المعادلة',
    'ميزانية الأمان 80٪ قاعدة تعليمية محافظة قابلة للتعديل',
  ];
  if (cpu === undefined) notesAr.push('لم تختر معالجًا بعد — سهم استهلاكه غير محسوب في المجموع.');
  if (gpu === undefined) notesAr.push('لم تختر بطاقة رسوميات — حُسب سهمها صفرًا وفق القاعدة.');

  if (psuW === null || budgetW === null) {
    return {
      totalW,
      budgetW: null,
      usagePercent: null,
      remainingW: null,
      recommendedPsuW,
      psuW,
      verdict: 'unknown',
      messageAr: psu !== undefined
        ? 'قدرة مزود الطاقة المختار غير معلنة في بياناته — راجع الملصق على وحدته قبل الحكم على الكفاية.'
        : 'لم تختر مزود طاقة بعد — اختر PSU لمعرفة كفاية القدرة.',
      notesAr,
    };
  }

  // تجاوز القدرة الاسمية نفسها — خطر مباشر.
  if (totalW > psuW) {
    return {
      totalW,
      budgetW,
      usagePercent,
      remainingW,
      recommendedPsuW,
      psuW,
      verdict: 'low',
      messageAr: `خطر: الاستهلاك التقديري (${totalW} واط) يتجاوز قدرة مزود الطاقة نفسها (${psuW} واط) — الجهاز قد لا يقلع أصلًا أو ينطفئ تحت الحمل. اختر PSU أعلى قدرة.`,
      notesAr,
    };
  }

  // تجاوز ميزانية الأمان 80٪ — تحذير تعليمي.
  if (totalW > budgetW) {
    return {
      totalW,
      budgetW,
      usagePercent,
      remainingW,
      recommendedPsuW,
      psuW,
      verdict: 'low',
      messageAr: `تحذير: الاستهلاك التقديري (${totalW} واط) تجاوز ميزانية الأمان (${budgetW} واط = 80٪ من ${psuW} واط) بنسبة ${usagePercent}٪ — الموصى به مزود ${recommendedPsuW} واط لامتصاص ذروات الحمل.`,
      notesAr,
    };
  }

  return {
    totalW,
    budgetW,
    usagePercent,
    remainingW,
    recommendedPsuW,
    psuW,
    verdict: 'ok',
    messageAr: `جيد: الاستهلاك التقديري (${totalW} واط) ضمن ميزانية الأمان (${budgetW} واط) بنسبة ${usagePercent}٪ مع هامش ${remainingW} واط متبقٍ حتى الحد التعليمي.`,
    notesAr,
  };
}
