/**
 * machineFlags.ts — محرك أعلام حالة الجهاز (Machine Flags).
 *
 * القواعد الذهبية:
 * - كل الدوال pure: تستقبل الحالة وتعيد نتيجة أو نسخة جديدة، بلا أي تحقق جانب.
 * - canToggleFlag: الحكم المنطقي قبل قلب العلم (رسالة تشرح السبب والخطوة التالية).
 * - applyToggleFlag: قلب العلم على نسخة جديدة بلا شروط — يُستدعى بعد نجاح canToggleFlag.
 */

import { COMPONENT_IDS, isInstalled } from '../types';
import type { ComponentId, MachineFlag, SimulationState, StepResult } from '../types';
import { copySimulation } from '../types';

/** أسماء عربية للقطع — تظهر في رسالة «أول قطعة ناقصة» عند محاولة التشغيل. */
const PART_LABELS_AR: Record<ComponentId, string> = {
  case: 'الهيكل',
  motherboard: 'اللوحة الأم',
  cpu: 'المعالج',
  cooler: 'المبرد',
  ram: 'الذاكرة',
  gpu: 'بطاقة الرسوميات',
  psu: 'مزود الطاقة',
  ssd: 'قرص M.2',
  hdd: 'القرص الميكانيكي',
  fans: 'مراوح الهيكل',
  atx24: 'كابل ATX 24-pin',
  eps: 'كابل EPS',
  gpuPower: 'كابل طاقة البطاقة',
  sataData: 'كابل SATA للبيانات',
  sataPower: 'كابل SATA للطاقة',
};

/** بطاقة تعريف عربية لكل علم: تسمية قصيرة + إرشاد تعليمي. */
export const FLAG_INFO: Record<MachineFlag, { labelAr: string; hintAr: string }> = {
  powerOn: {
    labelAr: 'تشغيل الجهاز',
    hintAr: 'الجهاز يعمل — لا تعمل داخل الهيكل إلا بعد الإطفاء',
  },
  acConnected: {
    labelAr: 'كابل الكهرباء موصول بالحائط',
    hintAr: 'مصدر الطاقة الأول — افصل الكابل من الحائط قبل أي عمل داخلي',
  },
  panelOpen: {
    labelAr: 'الغطاء الجانبي مفتوح',
    hintAr: 'بوابتك إلى الداخل — لا يُفتح إلا بعد الإطفاء وفصل الكهرباء',
  },
  pcieLatchOpen: {
    labelAr: 'مزلاج PCIe محلَّر',
    hintAr: 'قفل نهاية الفتحة يمسك البطاقة — حتّره قبل السحب، وأغلق بعد التثبيت',
  },
  ramClipsOpen: {
    labelAr: 'مزالج RAM محلَّرة',
    hintAr: 'مزالج أطراف الفتحة تثبت الوحدة — حرّرها بضغطة لطيفة للخارج',
  },
  cpuLeverOpen: {
    labelAr: 'رافعة مقبس المعالج مفتوحة',
    hintAr: 'الرافعة تضغط المعالج في مكانه — ارفعها للتركيب/السحب واخفضها للتثبيت',
  },
  gpuScrewsOut: {
    labelAr: 'براغي بطاقة الرسوميات مفكوكة',
    hintAr: 'البراغي تثبت قوس البطاقة بالهيكل — فكّها قبل سحب البطاقة',
  },
  psuScrewsOut: {
    labelAr: 'براغي مزود الطاقة مفكوكة',
    hintAr: 'تثبيت PSU من خلف الهيكل — أطفئ وافصل الكهرباء قبل لمسه',
  },
  fanScrewsOut: {
    labelAr: 'براغي مراوح الهيكل مفكوكة',
    hintAr: 'المراوح مثبتة ببراغٍ على جدران الهيكل — افصل موصلاتها أولًا',
  },
  m2ScrewOut: {
    labelAr: 'برغي تثبيت M.2 مفكوك',
    hintAr: 'برغي صغير يثبت نهاية قرص M.2 — فكّه قبل إخراج القرص المائل',
  },
  moboScrewsOut: {
    labelAr: 'مسامير اللوحة الأم مفكوكة',
    hintAr: 'اللوحة مثبتة على حوامل نحاسية — فك المسامير بعد فصل كل الكابلات',
  },
  fanHeadersDisconnected: {
    labelAr: 'موصلات مراوح اللوحة مفصولة',
    hintAr: 'رؤوس CPU_FAN/SYS_FAN — تُفصل قبل فك المراوح أو رفع اللوحة',
  },
  frontPanelDisconnected: {
    labelAr: 'موصلات اللوحة الأمامية مفصولة',
    hintAr: 'Power/Reset/USB/Audio — موصلات دقيقة تُفصل قبل رفع اللوحة الأم',
  },
};

/**
 * تحقق منطقي قبل قلب علم: هل القلب مسموح في الحالة الحالية؟
 * يعيد ok مع رسالة عربية تشرح السبب والخطوة التالية.
 */
export function canToggleFlag(s: SimulationState, f: MachineFlag): StepResult {
  const turningOn = !s.flags[f];

  // ===== الغطاء الجانبي =====
  if (f === 'panelOpen') {
    if (turningOn) {
      if (s.flags.powerOn || s.flags.acConnected) {
        return {
          ok: false,
          messageAr: 'أطفئ الجهاز وافصل كابل الكهرباء أولًا — السلامة قبل أي شيء',
        };
      }
      return { ok: true, messageAr: 'الجهاز مطفأ والكهرباء مفصولة — يمكنك فتح الغطاء بأمان.' };
    }
    // الإغلاق مسموح دائمًا — حتى لو قطع أو براغٍ مفكوكة (لا يمنع إغلاق الغطاء)
    return { ok: true, messageAr: 'إغلاق الغطاء مسموح في أي وقت — لكن أعد تركيب القطع المفكوكة قبل التشغيل.' };
  }

  // ===== زر الطاقة =====
  if (f === 'powerOn') {
    if (turningOn) {
      if (!s.flags.acConnected) {
        return { ok: false, messageAr: 'وصّل كابل الكهرباء أولًا' };
      }
      if (s.flags.panelOpen) {
        return {
          ok: false,
          messageAr: 'أغلق الغطاء الجانبي قبل التشغيل — الغطاء ما زال مفتوحًا.',
        };
      }
      // القطعة النصف مفكوكة (فصل جزئي) تمنع التشغيل — أكمل استخراجها أو أعدها
      const half = COMPONENT_IDS.find((id) => id !== 'case' && s.parts[id] === 'separated');
      if (half !== undefined) {
        return {
          ok: false,
          messageAr: `أكمل فك ${PART_LABELS_AR[half]} أو أعد تركيبها أولًا — لا يُشغّل الجهاز وقطعة نصف مفكوكة داخله.`,
        };
      }
      // القطع المفقودة/التالفة لا تمنع الضغط على الزر — ستظهر نتيجتها في فحص POST (ثلاثة مصائر ممكنة)
      return { ok: true, messageAr: 'بدء التشغيل — راقب شاشة العرض لقراءة نتيجة POST.' };
    }
    return { ok: true, messageAr: 'الإطفاء مسموح في أي وقت — وهو أول خطوة السلامة دائمًا.' };
  }

  // ===== كابل الكهرباء =====
  if (f === 'acConnected') {
    if (turningOn) {
      return { ok: true, messageAr: 'توصيل الكهرباء مسموح — تذكّر فصلها قبل أي عمل داخل الهيكل.' };
    }
    if (s.flags.powerOn) {
      return { ok: false, messageAr: 'أطفئ الجهاز قبل فصل الكهرباء' };
    }
    return { ok: true, messageAr: 'الكهرباء مفصولة — الآن فتح الغطاء والعمل الداخلي مسموح.' };
  }

  // ===== الأعلام الميكانيكية الداخلية =====
  // أي فتح/فك/تحرير يتطلب غطاء مفتوحًا.
  if (turningOn && !s.flags.panelOpen) {
    return { ok: false, messageAr: 'افتح الغطاء الجانبي أولًا' };
  }

  // مزلاج PCIe: يُغلق بعد تركيب البطاقة وكابل طاقتها كاملين (تعليميًا).
  if (f === 'pcieLatchOpen' && !turningOn) {
    if (!isInstalled(s.parts.gpu) || !isInstalled(s.parts.gpuPower)) {
      return { ok: false, messageAr: 'ثبّت البطاقة وكابل طاقتها قبل إغلاق المزلاج' };
    }
    return { ok: true, messageAr: 'البطاقة وكابل طاقتها مثبتان — أغلق المزلاج ليمسك البطاقة في الفتحة.' };
  }

  // مزالج RAM: تُغلق لتثبيت وحدة موجودة في الفتحة.
  if (f === 'ramClipsOpen' && !turningOn) {
    if (!isInstalled(s.parts.ram)) {
      return { ok: false, messageAr: 'ثبّت الذاكرة أولًا — المزالج تُغلق لتثبيت وحدة موجودة داخل الفتحة.' };
    }
    return { ok: true, messageAr: 'اضغط الوحدة للأسفل حتى تسمع طقّة انغلاق المزالج على الطرفين.' };
  }

  // رافعة المقبس: تُخفض لتثبيت معالج موجود.
  if (f === 'cpuLeverOpen' && !turningOn) {
    if (!isInstalled(s.parts.cpu)) {
      return { ok: false, messageAr: 'ثبّت المعالج أولًا ثم اخفض الرافعة لتثبيته في المقبس.' };
    }
    return { ok: true, messageAr: 'اخفض الرافعة تحت القفل لتثبيت المعالج في المقبس.' };
  }

  // بقية الأعلام الميكانيكية: الإغلاق مسموح دائمًا — اعتماديات التركيب تُفحص عند التركيب.
  return {
    ok: true,
    messageAr: turningOn
      ? 'مسموح — الغطاء مفتوح ويمكنك التعديل.'
      : 'مسموح — اعتماديات التركيب تُفحص عند محاولة تركيب القطعة.',
  };
}

/** يقلب العلم على نسخة جديدة من الحالة (بلا شروط — تحقّق أولًا بـ canToggleFlag). */
export function applyToggleFlag(s: SimulationState, f: MachineFlag): SimulationState {
  const flags: Record<MachineFlag, boolean> = { ...s.flags };
  flags[f] = !s.flags[f];
  return { ...copySimulation(s), flags };
}
