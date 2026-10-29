/**
 * PC Repair 3D Studio — طبقة البيانات: سيناريوهات الأعطال التعليمية
 * كل سيناريو دالة نقية (Pure Function) تستقبل حالة المحاكاة وتعيد نسخة جديدة
 * معدَّلة دون تغيير الحالة المُدخلة إطلاقًا.
 */

import { COMPONENT_IDS, MACHINE_FLAGS, type SimulationState } from '../types';

export interface ScenarioDef {
  id: string;
  titleAr: string;
  descriptionAr: string;
  faultAr: string;
  apply: (s: SimulationState) => SimulationState;
}

/** نسخة سطحية ثنائية المستوى كافية لبنية SimulationState (flags + parts). */
const copyState = (s: SimulationState): SimulationState => ({
  flags: { ...s.flags },
  parts: { ...s.parts },
});

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'sc-missing-ssd',
    titleAr: 'قرص التخزين مفقود',
    descriptionAr:
      'يوضح أن الجهاز قد ينجح في فحص POST كاملًا ثم يفشل الإقلاع عند غياب قرص التخزين — تظهر رسالة «لا يوجد جهاز إقلاع» بدل أن يبدو الجهاز ميتًا.',
    faultAr: 'قرص M.2 غير مثبت في فتحة التخزين.',
    apply: (s) => {
      const next = copyState(s);
      next.parts.ssd = 'removed';
      return next;
    },
  },
  {
    id: 'sc-gpu-no-power',
    titleAr: 'بطاقة الرسوميات بلا كابل طاقة',
    descriptionAr:
      'القطعة مثبتة في فتحة PCIe لكن كابل الطاقة PCIe 8-pin مفصول، فيفشل العرض أو يتوقف الجهاز تحت حمل الرسوميات رغم بقاء POST سليمًا في كثير من الحالات.',
    faultAr: 'كابل طاقة البطاقة gpuPower مفصول عن حافة البطاقة.',
    apply: (s) => {
      const next = copyState(s);
      next.parts.gpuPower = 'removed';
      return next;
    },
  },
  {
    id: 'sc-no-eps',
    titleAr: 'كابل طاقة المعالج EPS مفصول',
    descriptionAr:
      'الشريحة الأشهر: الجهاز «لا يشتغل» رغم موصولة الكابل الرئيسي 24-pin، لأن مرحلة تغذية المعالج بلا جهد 12 فولت فيفشل POST فورًا.',
    faultAr: 'كابل EPS 8-pin للمعالج مفصول عن أعلى اللوحة الأم.',
    apply: (s) => {
      const next = copyState(s);
      next.parts.eps = 'removed';
      return next;
    },
  },
  {
    id: 'sc-missing-ram',
    titleAr: 'ذاكرة RAM مفقودة',
    descriptionAr:
      'بلا ذاكرة لا يستطيع المعالج تشغيل أي شيء: يفشل POST مبكرًا وغالبًا مع صفارة تنبيه من اللوحة. درس في أن الذاكرة شرط أساسي للفحص نفسه لا للإقلاع فقط.',
    faultAr: 'وحدة الذاكرة غير مثبتة في فتحات DIMM.',
    apply: (s) => {
      const next = copyState(s);
      next.parts.ram = 'removed';
      return next;
    },
  },
  {
    id: 'sc-cold',
    titleAr: 'جهاز بارد: مطفأ ومفصول والغطاء مفتوح',
    descriptionAr:
      'حالة البداية الآمنة لأي عمل داخلي: الجهاز مطفأ، كابل الكهرباء مفصول، والغطاء الجانبي مفتوح. نقطة الانطلاق لكل الدروس العملية.',
    faultAr: 'لا عطل فعليًا — حالة باردة جاهزة للعمل (غطاء مفتوح وجهاز مفصول).',
    apply: (s) => {
      const next = copyState(s);
      next.flags.powerOn = false;
      next.flags.acConnected = false;
      next.flags.panelOpen = true;
      return next;
    },
  },
  {
    id: 'sc-mobo-midway',
    titleAr: 'وسط مهمة إزالة اللوحة الأم',
    descriptionAr:
      'حالة وسيطة من درس اللوحة الأم: كابلا الطاقة atx24 وeps مُزالان، والمسامير وموصلات المراوح والواجهة الأمامية مفكوكة، مع بقاء بقية القطع مثبتة. تُستخدم لاستكمال المهمة من منتصفها.',
    faultAr: 'كابل الطاقة الرئيسي وكابل EPS مفصولان واللوحة غير مثبتة بالمسامير.',
    apply: (s) => {
      const next = copyState(s);
      // حالة حتمية كاملة: كل القطع مثبتة ثم تُزال atx24 و eps فقط
      for (const id of COMPONENT_IDS) {
        next.parts[id] = id === 'atx24' || id === 'eps' ? 'removed' : 'installed';
      }
      // الأعلام تعود للصفر ثم تُضبط أعلام وسط المهمة
      for (const flag of MACHINE_FLAGS) {
        next.flags[flag] = false;
      }
      next.flags.moboScrewsOut = true;
      next.flags.frontPanelDisconnected = true;
      next.flags.fanHeadersDisconnected = true;
      return next;
    },
  },
];

/**
 * تطبيق سيناريو على حالة معطاة:
 * يعيد نسخة جديدة معدَّلة إذا وُجد السيناريو، أو الحالة نفسها إذا لم يوجد id مطابق.
 */
export function applyScenario(s: SimulationState, id: string): SimulationState {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) return s;
  return scenario.apply(copyState(s));
}
