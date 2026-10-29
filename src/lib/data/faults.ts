/**
 * faults.ts — محرك الأعطال التعليمية: 14 عطلًا مسمّى وفق المواصفة.
 *
 * كل عطل دالة نقية (Pure Function) تستقبل حالة المحاكاة وتعيد نسخة جديدة —
 * لا تعدل الحالة المُدخلة إطلاقًا (يُتحقق من ذلك آليًا في faultTests.ts).
 *
 * لكل عطل: بطاقة طلب (شكوى العميل)، فرضية تشخيص محايدة (بلا إفصاح مباشر)،
 * أدلة يجب جمعها، دالة تركيب العطل، دالة إصلاح مرجعية (للاختبارات الآلية)،
 * ونتيجة POST/الشاشة المتوقعة قبل الإصلاح.
 */

import { COMPONENT_IDS, isInstalled, type DiagnosisCode, type MonitorScreen, type SimulationState } from '../types';

export type FaultDifficulty = 'سهل' | 'متوسط' | 'صعب' | 'مركّب';

export interface FaultDef {
  id: string;                 // F01..F14
  titleAr: string;
  difficulty: FaultDifficulty;
  complaintAr: string;        // بطاقة الطلب — ماذا يقول العميل
  hypothesisAr: string;       // فرضية التشخيص (إحدى الفرضيات في مرحلة التخطيط)
  faultAr: string;            // العطل الفعلي (يُكشف في التقرير)
  evidencesAr: string[];      // الأدلة التي تثبت العطل
  apply: (s: SimulationState) => SimulationState;
  fix: (s: SimulationState) => SimulationState;   // إصلاح مرجعي — للاختبارات الآلية
  isFixed: (s: SimulationState) => boolean;
  preCode: DiagnosisCode;     // نتيجة POST المتوقعة مع العطل (والجهاز مُشغّل)
  preScreen: MonitorScreen;   // حالة الشاشة المتوقعة مع العطل بعد انقضاء التمهيد
  /** فصل كابل الكهرباء هو العطل نفسه — الاختبار الآلي لا يعيد توصيله */
  acIsTheFault?: boolean;
}

const copy = (s: SimulationState): SimulationState => ({
  flags: { ...s.flags },
  parts: { ...s.parts },
  peripherals: { ...s.peripherals },
});

/** حالة مرجعية مشغّلة للاختبارات: كهرباء موصولة، جهاز يعمل، غطاء مغلق */
export function poweredState(s: SimulationState): SimulationState {
  const next = copy(s);
  next.flags.acConnected = true;
  next.flags.powerOn = true;
  next.flags.panelOpen = false;
  return next;
}

export const FAULTS: FaultDef[] = [
  // ===== F01 =====
  {
    id: 'F01',
    titleAr: 'كابل الكهرباء غير موصول',
    difficulty: 'سهل',
    complaintAr: '«الجهاز لا يعمل إطلاقًا منذ أمس — لا أضواء ولا صوت ولا شيء».',
    hypothesisAr: 'لا توجد طاقة تصل الجهاز أصلًا (كابل/مقبس/مفتاح خلفي).',
    faultAr: 'كابل الكهرباء AC غير موصول من الحائط إلى مزود الطاقة.',
    evidencesAr: ['لا مراوح تدور ولا لمبة طاقة', 'الزر مضغوط بلا أي استجابة', 'المقبس خلف PSU فارغ'],
    apply: (s) => {
      const n = copy(s);
      n.flags.acConnected = false;
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.flags.acConnected = true;
      return n;
    },
    isFixed: (s) => s.flags.acConnected,
    preCode: 'POWER_OFF',
    preScreen: 'noSignal',
    acIsTheFault: true,
  },
  // ===== F02 =====
  {
    id: 'F02',
    titleAr: 'كابل ATX 24-pin غير موصول',
    difficulty: 'سهل',
    complaintAr: '«أعيدت أسلاك الصالة بعد تنظيف مكتبه — والجهاز صار لا يفتح».',
    hypothesisAr: 'المراوح قد تدور لكن اللوحة بلا تغذية رئيسية — تحقق من موصل 24-pin.',
    faultAr: 'موصل ATX 24-pin مفصول عن اللوحة الأم — اللوحة بلا تغذية رئيسية.',
    evidencesAr: ['المراوح تدور ولا صورة إطلاقًا', 'موصل 24-pin مرتخٍ أو خارج مقبسه', 'لا بيب ولا رسائل POST'],
    apply: (s) => {
      const n = copy(s);
      n.parts.atx24 = 'removed';
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.atx24 = 'installed';
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.atx24),
    preCode: 'POST_FAIL',
    preScreen: 'post',
  },
  // ===== F03 =====
  {
    id: 'F03',
    titleAr: 'كابل طاقة المعالج EPS مفصول',
    difficulty: 'متوسط',
    complaintAr: '«الجهاز كان يعمل، فتحته لتغيير قطعة وأغلقته — لم يعد يشتغل».',
    hypothesisAr: 'تغذية المعالج مقطوعة — كابل EPS 8-pin في الزاوية العلوية.',
    faultAr: 'كابل EPS 8-pin مفصول — مرحلة تغذية المعالج بلا جهد 12 فولت.',
    evidencesAr: ['المراوح تدور والجهاز «حي» بلا صورة', 'مقبس EPS أعلى اللوحة فارغ', 'لا بيب إطلاقًا'],
    apply: (s) => {
      const n = copy(s);
      n.parts.eps = 'removed';
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.eps = 'installed';
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.eps),
    preCode: 'POST_FAIL',
    preScreen: 'post',
  },
  // ===== F04 =====
  {
    id: 'F04',
    titleAr: 'وحدة الذاكرة غير مثبتة في مكانها',
    difficulty: 'متوسط',
    complaintAr: '«نقلت الطاولة والجهاز اهتز — صار يعطي صفارات ولا صورة».',
    hypothesisAr: 'وحدة الذاكرة خرجت جزئيًا من فتحتها — أعد ضغطها حتى طقّة المزالج.',
    faultAr: 'وحدة RAM منفصلة جزئيًا (مزالجها مفتوحة) — فشل الاختبار الذاتي.',
    evidencesAr: ['صفارات متكررة قصيرة', 'أحد مزالج DIMM مفتوح', 'الوحدة غير مستوية في الفتحة'],
    apply: (s) => {
      const n = copy(s);
      n.parts.ram = 'separated';
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.ram = 'installed';
      n.flags.ramClipsOpen = false;
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.ram) && !s.flags.ramClipsOpen,
    preCode: 'POST_FAIL',
    preScreen: 'post',
  },
  // ===== F05 =====
  {
    id: 'F05',
    titleAr: 'ذاكرة غير متوافقة مع اللوحة',
    difficulty: 'صعب',
    complaintAr: '«اشتريت ذاكرة جديدة أسرع ورُكّبها فني سابق — الجهاز يعطي خمس صفارات».',
    hypothesisAr: 'الذاكرة المركّبة غير مطابقة لنوع/سرعة مدعومة على اللوحة.',
    faultAr: 'ذاكرة خارج نطاق دعم اللوحة (نوع/تردد غير متوافق) — POST يفشل بخمس بيبات.',
    evidencesAr: ['خمس صفارات متتالية', 'العطل بدأ بعد تغيير الذاكرة', 'المواصفات غير مدرجة في قائمة QVL'],
    apply: (s) => {
      const n = copy(s);
      n.peripherals.ramIncompatible = true;
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.peripherals.ramIncompatible = false;
      return n;
    },
    isFixed: (s) => !s.peripherals.ramIncompatible,
    preCode: 'POST_FAIL',
    preScreen: 'post',
  },
  // ===== F06 =====
  {
    id: 'F06',
    titleAr: 'بطاقة الرسوميات غير مثبتة',
    difficulty: 'متوسط',
    complaintAr: '«أخذت البطاقة لصديق جربها عنده — بعد إرجاعها الشاشة سوداء دائمًا».',
    hypothesisAr: 'لا إشارة عرض: البطاقة غائبة عن فتحة PCIe (المعالج بلا رسوميات مدمجة).',
    faultAr: 'بطاقة الرسوميات غير مثبتة في فتحة PCIe x16 — لا مصدر إشارة عرض.',
    evidencesAr: ['المراوح تدور والجهاز «حي»', 'الشاشة تعمل وتقول لا إشارة', 'فتحة PCIe فارغة ومزلاجها مطوي'],
    apply: (s) => {
      const n = copy(s);
      n.parts.gpu = 'removed';
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.gpu = 'installed';
      n.flags.pcieLatchOpen = false;
      n.flags.gpuScrewsOut = false;
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.gpu),
    preCode: 'POST_PASS_BOOT_WARNING',
    preScreen: 'noSignal',
  },
  // ===== F07 =====
  {
    id: 'F07',
    titleAr: 'كابل طاقة البطاقة مفصول',
    difficulty: 'متوسط',
    complaintAr: '«الجهاز يشتغل يشتغل ثم ينطفئ أول ما أفتح لعبة».',
    hypothesisAr: 'البطاقة مثبتة لكن كابل طاقتها PCIe مفصول — تفشل تحت الحمل.',
    faultAr: 'كابل PCIe 8-pin للبطاقة مفصول — تعطل تحت حمل الرسوميات.',
    evidencesAr: ['ينطفئ عند أول حمل رسوميات', 'رأس الكابل على حافة البطاقة فارغ', 'POST قد يمر بلا تنبيه'],
    apply: (s) => {
      const n = copy(s);
      n.parts.gpuPower = 'removed';
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.gpuPower = 'installed';
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.gpuPower),
    preCode: 'POST_PASS_BOOT_WARNING',
    preScreen: 'warning',
  },
  // ===== F08 =====
  {
    id: 'F08',
    titleAr: 'كابل إشارة الشاشة مفصول',
    difficulty: 'سهل',
    complaintAr: '«نظفت خلف المكتب — الشاشة صارت تقول لا إشارة لكن أسمع الجهاز يشتغل».',
    hypothesisAr: 'الجهاز يعمل فعلاً — مسار الإشارة إلى الشاشة مقطوع (كابل HDMI/DP).',
    faultAr: 'كابل إشارة العرض مفصول عن البطاقة أو الشاشة — الجهاز نفسه سليم تمامًا.',
    evidencesAr: ['أصوات الجهاز وأضواؤه طبيعية', 'الشاشة تعمل وتُظهر رسالة لا إشارة', 'طرف الكابل على البطاقة مفصول'],
    apply: (s) => {
      const n = copy(s);
      n.peripherals.monitorCableConnected = false;
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.peripherals.monitorCableConnected = true;
      return n;
    },
    isFixed: (s) => s.peripherals.monitorCableConnected,
    preCode: 'POST_PASS_BOOT_OK',
    preScreen: 'noSignal',
  },
  // ===== F09 =====
  {
    id: 'F09',
    titleAr: 'كابل SATA للبيانات مفصول',
    difficulty: 'متوسط',
    complaintAr: '«الجهاز يشتغل لكن يقول لا يوجد نظام تشغيل، والقرص الميكانيكي لا يظهر».',
    hypothesisAr: 'القرص الميكانيكي مثبت ومُغذّى لكن مسار بياناته إلى اللوحة مقطوع.',
    faultAr: 'كابل SATA للبيانات مفصول عن القرص/اللوحة — القرص غير مرئي رغم التغذية (المختبر بلا قرص M.2 في هذا السيناريو).',
    evidencesAr: ['BIOS لا يرى القرص', 'ضوء نشاط القرص لا يومض إطلاقًا', 'كابل البيانات (الرفيع) غير مقفل'],
    apply: (s) => {
      const n = copy(s);
      n.parts.sataData = 'removed';
      n.parts.ssd = 'removed'; // القرص الميكانيكي هو قرص الإقلاع الوحيد هنا
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.sataData = 'installed';
      n.parts.ssd = 'installed';
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.sataData),
    preCode: 'POST_PASS_BOOT_WARNING',
    preScreen: 'bios',
  },
  // ===== F10 =====
  {
    id: 'F10',
    titleAr: 'لا يوجد قرص إقلاع',
    difficulty: 'متوسط',
    complaintAr: '«اشتريت الجهاز بدون أقراص لأناقة السعر — يعطي POST ثم لا يدخل ويندوز».',
    hypothesisAr: 'POST ينجح لكن لا وسيط إقلاع عليه نظام تشغيل — POST ≠ إقلاع.',
    faultAr: 'لا يوجد أي قرص مثبت (لا M.2 ولا ميكانيكي) — لا جهاز إقلاع إطلاقًا.',
    evidencesAr: ['POST يكتمل بلا أخطاء', 'UEFI يدخل تلقائيًا بقائمة إقلاع فارغة', 'قفص الأقراص فارغ'],
    apply: (s) => {
      const n = copy(s);
      n.parts.ssd = 'removed';
      n.parts.hdd = 'removed';
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.ssd = 'installed';
      n.parts.hdd = 'installed';
      n.parts.sataData = 'installed';
      n.parts.sataPower = 'installed';
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.ssd) || (isInstalled(s.parts.hdd) && isInstalled(s.parts.sataData) && isInstalled(s.parts.sataPower)),
    preCode: 'POST_PASS_BOOT_WARNING',
    preScreen: 'bios',
  },
  // ===== F11 =====
  {
    id: 'F11',
    titleAr: 'مشكلة تهوية — مراوح الهيكل مفقودة',
    difficulty: 'متوسط',
    complaintAr: '«الجهاز يشتغل لكن الحرارة عالية واللوحة تعرض تنبيه مروحة».',
    hypothesisAr: 'مراوح الهيكل غير مثبتة/غير موصولة — تدفق هواء معدوم.',
    faultAr: 'مراوح الهيكل غير مثبتة — POST ينجح مع تحذير تهوية وارتفاع حراري تدريجي.',
    evidencesAr: ['تنبيه Fan Error على الشاشة', 'الحرارة ترتفع مع كل دقيقة', 'أماكن المراوح فارغة أو مفصولة'],
    apply: (s) => {
      const n = copy(s);
      n.parts.fans = 'removed';
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.fans = 'installed';
      n.flags.fanScrewsOut = false;
      n.flags.fanHeadersDisconnected = false;
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.fans),
    preCode: 'POST_PASS_BOOT_WARNING',
    preScreen: 'warning',
  },
  // ===== F12 =====
  {
    id: 'F12',
    titleAr: 'مزود الطاقة معطل',
    difficulty: 'صعب',
    complaintAr: '«انقطعت الكهرباء البارحة مع عاصفة — الجهاز لم يعد يستجيب لأي زر».',
    hypothesisAr: 'استجابة ميتة رغم كهرباء موصولة — الاشتباه الأول مزود الطاقة نفسه.',
    faultAr: 'مزود الطاقة تالف داخليًا (تعليميًا: يُستبدل ولا يُفتح أبدًا) — لا استجابة تُذكر.',
    evidencesAr: ['كهرباء موصولة وغطاء مغلق', 'لا مراوح ولا أضواء ولا صفارة إطلاقًا', 'كابل AC سليم ومقفول'],
    apply: (s) => {
      const n = copy(s);
      n.peripherals.psuDead = true;
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.peripherals.psuDead = false;
      return n;
    },
    isFixed: (s) => !s.peripherals.psuDead,
    preCode: 'POWER_OFF',
    preScreen: 'noSignal',
  },
  // ===== F13 (مركّب) =====
  {
    id: 'F13',
    titleAr: 'عطل مركّب: تغذية معالج + كابل الشاشة',
    difficulty: 'مركّب',
    complaintAr: '«الجهاز بعد تنسيق غرفة: الشاشة سوداء وأسمع مراوح — لا أعرف من أين أبدأ».',
    hypothesisAr: 'عطلان معًا: تغذية المعالج مقطوعة ومسار إشارة الشاشة مقطوع — اجمع دليلين قبل الحكم.',
    faultAr: 'كابل EPS مفصول + كابل إشارة الشاشة مفصول — عطلان مستقلان يحجبان بعضهما عن التشخيص السطحي.',
    evidencesAr: ['الشاشة بلا إشارة (يقود للاشتباه بالشاشة أولاً)', 'لكن حتى بعد إصلاح الكابل يبقى POST فاشلًا', 'مقبس EPS فارغ أعلى اللوحة'],
    apply: (s) => {
      const n = copy(s);
      n.parts.eps = 'removed';
      n.peripherals.monitorCableConnected = false;
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.eps = 'installed';
      n.peripherals.monitorCableConnected = true;
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.eps) && s.peripherals.monitorCableConnected,
    preCode: 'POST_FAIL',
    preScreen: 'noSignal',
  },
  // ===== F14 (مركّب) =====
  {
    id: 'F14',
    titleAr: 'عطل مركّب: ذاكرة نصف مفكوكة + طاقة البطاقة مفصولة',
    difficulty: 'مركّب',
    complaintAr: '«نقلت الجهاز لغرفة جديدة: صفارات ولا يدخل النظام، وحين يدخل أحيانًا ينطفئ».',
    hypothesisAr: 'عطلان معًا: وحدة ذاكرة خارج مقعدها جزئيًا وكابل طاقة البطاقة مفصول.',
    faultAr: 'RAM منفصلة جزئيًا (فشل POST) + كابل PCIe للبطاقة مفصول (فشل تحت الحمل لو نجح POST).',
    evidencesAr: ['صفارات متكررة قصيرة (دليل الذاكرة)', 'مزلاج DIMM مفتوح', 'رأس طاقة PCIe على البطاقة فارغ (دليل ثانٍ لا يظهر إلا بعد إصلاح الذاكرة)'],
    apply: (s) => {
      const n = copy(s);
      n.parts.ram = 'separated';
      n.parts.gpuPower = 'removed';
      return n;
    },
    fix: (s) => {
      const n = copy(s);
      n.parts.ram = 'installed';
      n.flags.ramClipsOpen = false;
      n.parts.gpuPower = 'installed';
      return n;
    },
    isFixed: (s) => isInstalled(s.parts.ram) && isInstalled(s.parts.gpuPower),
    preCode: 'POST_FAIL',
    preScreen: 'post',
  },
];

/** تطبيق عطل على حالة — يعيد نسخة جديدة (بلا تعديل للمُدخل) */
export function applyFault(s: SimulationState, id: string): SimulationState {
  const fault = FAULTS.find((f) => f.id === id);
  if (!fault) return s;
  const next = fault.apply(copy(s));
  // تركيب العطل يطفئ الجهاز دائمًا (بداية واقعية: الجهاز جاءك مطفأًا)
  next.flags.powerOn = false;
  next.flags.acConnected = false;
  return next;
}

/** إصلاح مرجعي مباشر — يُستخدم في الاختبارات الآلية فقط (لا يُعرض كزر تسليم) */
export function fixFault(s: SimulationState, id: string): SimulationState {
  const fault = FAULTS.find((f) => f.id === id);
  if (!fault) return s;
  return fault.fix(copy(s));
}

/** وصف نتيجة POST المتوقعة بالعربية — للتقارير */
export function codeLabelAr(code: DiagnosisCode): string {
  switch (code) {
    case 'POWER_OFF':
      return 'لا طاقة / لا استجابة';
    case 'POST_FAIL':
      return 'فشل POST';
    case 'POST_PASS_BOOT_WARNING':
      return 'POST ناجح مع تحذير إقلاع/عرض';
    case 'POST_PASS_BOOT_OK':
      return 'POST ناجح وإقلاع سليم';
    case 'INCOMPATIBLE_BUILD':
      return 'تجميعة غير متوافقة';
  }
}

/** جلب عطل بمعرّفه (null إن لم يوجد) */
export function getFault(id: string | null): FaultDef | null {
  return FAULTS.find((f) => f.id === id) ?? null;
}

/** ضمان ذكاء البناء: كل الأعطال معرّفة على مكوّنات قائمة */
export const FAULT_IDS: string[] = FAULTS.map((f) => f.id);
export const COMPONENT_IDS_REF = COMPONENT_IDS;
