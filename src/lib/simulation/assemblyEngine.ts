/**
 * assemblyEngine.ts — محرك الفك والتركيب (Assembly / Removal Engine).
 *
 * الجدولان REMOVE_REQS و INSTALL_REQS هما المصدر النهائي للحقيقة في اعتماديات
 * الفك والتركيب. كل الدوال pure: لا تحقق جوانب، وتعيد نسخة جديدة من الحالة.
 *
 * قرارات تصميمية:
 * - سلسلة السلامة (إطفاء + فصل الكهرباء) شرط إلزامي لكل عمل داخلي (كل القطع عدا
 *   الهيكل) — وهي أول عنصرين في كل قائمة فحص وأول شرطين في canRemove/canInstall.
 * - applyRemove/applyInstall يغيّران parts[id] فقط؛ إغلاق المزالج/البراغي خطوات
 *   مستقلة يقوم بها المستخدم عبر الأعلام (لا تعديل أعلام يدويًا هنا).
 * - الهيكل (case) لا يُفك ولا يُركَّب — الوصول إليه عبر علم «الغطاء الجانبي مفتوح».
 */

import type {
  ChecklistItem,
  ChecklistItemSource,
  ComponentId,
  MachineFlag,
  PartStatus,
  SimulationState,
  StepResult,
} from '../types';

/** الأسماء العربية المعتمدة للقطع — تظهر في الرسائل والقوائم التعليمية. */
export const PART_NAMES_AR: Record<ComponentId, string> = {
  case: 'الهيكل',
  motherboard: 'اللوحة الأم',
  cpu: 'المعالج',
  cooler: 'المبرد',
  ram: 'الذاكرة',
  gpu: 'بطاقة الرسوميات',
  psu: 'مزود الطاقة',
  ssd: 'قرص M.2',
  fans: 'مراوح الهيكل',
  atx24: 'كابل ATX 24-pin',
  eps: 'كابل EPS',
  gpuPower: 'كابل طاقة البطاقة',
};

/** هل الجهاز آمن للعمل الداخلي؟ (مطفأ + كهرباء مفصولة) */
export function isSafeForInternals(s: SimulationState): boolean {
  return !s.flags.powerOn && !s.flags.acConnected;
}

// ============ تعريف الشرط الواحد في قوائم الفك/التركيب ============

interface Requirement {
  source: ChecklistItemSource;
  labelAr: string;
  hintAr: string;
  done: (s: SimulationState) => boolean;
  /** رسالة تربوية تشرح أول شرط ناقص والخطوة التالية. */
  failAr: string;
  /** إن كانت الشرط فك/تركيب قطعة — لجعله قابلًا للتنفيذ من الواجهة */
  actionPart?: ComponentId;
}

function flagReq(flag: MachineFlag, labelAr: string, hintAr: string, failAr: string): Requirement {
  return { source: flag, labelAr, hintAr, done: (s) => s.flags[flag], failAr };
}

function partReq(id: ComponentId, want: PartStatus, labelAr: string, hintAr: string, failAr: string): Requirement {
  return { source: 'base', labelAr, hintAr, done: (s) => s.parts[id] === want, failAr, actionPart: id };
}

// ============ شروط مشتركة ============

const SAFETY_OFF: Requirement = {
  source: 'safetyOff',
  labelAr: 'إطفاء الجهاز',
  hintAr: 'لا تعمل داخل الهيكل والجهاز يعمل — أطفئه من زر الطاقة.',
  done: (s) => !s.flags.powerOn,
  failAr: 'الجهاز يعمل الآن — أطفئه من زر الطاقة قبل أي عمل داخل الهيكل.',
};

const SAFETY_UNPLUG: Requirement = {
  source: 'safetyUnplug',
  labelAr: 'فصل كابل الكهرباء',
  hintAr: 'افصل الكابل من الحائط — أول خطوة سلامة دائمًا.',
  done: (s) => !s.flags.acConnected,
  failAr: 'افصل كابل الكهرباء من الحائط أولًا — السلامة قبل أي عمل داخلي.',
};

const PANEL_OPEN_REMOVE: Requirement = flagReq(
  'panelOpen',
  'فتح الغطاء الجانبي',
  'الوصول إلى الداخل يبدأ من الغطاء — بعد الإطفاء والفصل.',
  'افتح الغطاء الجانبي أولًا للوصول إلى القطع الداخلية.',
);

const PANEL_OPEN_INSTALL: Requirement = flagReq(
  'panelOpen',
  'فتح الغطاء الجانبي',
  'التركيب يتم والغطاء مفتوح.',
  'افتح الغطاء الجانبي أولًا قبل تركيب القطعة.',
);

// ============ جدول اعتماديات الفك (المصدر النهائي للحقيقة) ============

const REMOVE_REQS: Record<ComponentId, Requirement[]> = {
  case: [], // غير قابل للفك — معالجة خاصة
  motherboard: [
    PANEL_OPEN_REMOVE,
    partReq('gpu', 'removed', 'سحب بطاقة الرسوميات', 'البطاقة تحجب مسامير اللوحة.', 'انزع بطاقة الرسوميات أولًا — فهي تحجب مسامير اللوحة وتصعّب رفعها.'),
    partReq('atx24', 'removed', 'فصل كابل ATX 24-pin', 'أكبر موصل في اللوحة — اضغط القفل وارفعه.', 'افصل كابل ATX 24-pin عن اللوحة أولًا — لا ترفع اللوحة والموصل الرئيسي موصولًا.'),
    partReq('eps', 'removed', 'فصل كابل EPS 8-pin', 'يقع في الزاوية العلوية للوحة.', 'افصل كابل EPS 8-pin أولًا — يقع في الزاوية العلوية ويشد اللوحة عند الرفع.'),
    flagReq('fanHeadersDisconnected', 'فصل موصلات مراوح اللوحة', 'رؤوس CPU_FAN/SYS_FAN الصغيرة.', 'افصل موصلات مراوح اللوحة أولًا — الأسلاك المشدودة تقلع رؤوس الموصلات عند رفع اللوحة.'),
    flagReq('frontPanelDisconnected', 'فصل موصلات اللوحة الأمامية', 'Power/Reset/USB/Audio.', 'افصل موصلات اللوحة الأمامية أولًا — موصلات دقيقة تتلف بسهولة إذا شُدّت مع اللوحة.'),
    partReq('ssd', 'removed', 'سحب قرص M.2', 'حتى لا يتلف أثناء رفع اللوحة.', 'اسحب قرص M.2 أولًا حتى لا يتلف أثناء رفع اللوحة.'),
    flagReq('moboScrewsOut', 'فك مسامير اللوحة الأم', '6–9 مسامير على الحوامل النحاسية عادة.', 'فك مسامير تثبيت اللوحة الأم أولًا — ثم ارفع اللوحة بلطف نحو الخلف.'),
  ],
  cpu: [
    PANEL_OPEN_REMOVE,
    partReq('cooler', 'removed', 'فك المبرد', 'المعجون الحراري يلصق — التفّ بطيء لا قوة.', 'انزع المبرد أولًا — لا تسحب المعالج والمبرد مركّبَين؛ التصاق المعجون قد ينتزع المعالج وينثني أرجل المقبس.'),
    flagReq('cpuLeverOpen', 'تحرير رافعة المقبس', 'اضغط الرافعة للخارج قليلًا ثم ارفعها.', 'حرّر رافعة مقبس المعالج أولًا — السحب والرافعة مغلقة ينثني دبابيس المقبس.'),
  ],
  cooler: [PANEL_OPEN_REMOVE],
  ram: [
    PANEL_OPEN_REMOVE,
    flagReq('ramClipsOpen', 'تحرير مزالج الذاكرة', 'اضغط الطرفين للخارج حتى ترتفع الوحدة.', 'حرّر مزالج الذاكرة على الطرفين أولًا — السحب والمزالج مغلقة يكسر أجنحة الفتحة (خطأ شائع).'),
  ],
  gpu: [
    PANEL_OPEN_REMOVE,
    partReq('gpuPower', 'removed', 'فصل كابل طاقة البطاقة', 'اسحب من رأس البطاقة لا من PSU.', 'افصل كابل طاقة البطاقة أولًا — الكابل الموصول يمنع السحب ويشد الفتحة.'),
    flagReq('gpuScrewsOut', 'فك براغي قوس البطاقة', 'على الهيكل الخلفي — عادة برغان.', 'فك براغي بطاقة الرسوميات من قوس الهيكل أولًا.'),
    flagReq('pcieLatchOpen', 'تحرير مزلاج PCIe', 'في نهاية الفتحة — اضغطه أو اسحبه حسب التصميم.', 'لا يمكن سحب البطاقة قبل تحرير مزلاج PCIe — هذا خطأ شائع يكسر الفتحة.'),
  ],
  psu: [
    PANEL_OPEN_REMOVE,
    partReq('atx24', 'removed', 'فصل كابل ATX 24-pin', 'لا تسحب PSU وكابلاته موصولة.', 'افصل كابل ATX 24-pin من اللوحة أولًا — لا تسحب مزود الطاقة وكابلاته موصولة.'),
    partReq('eps', 'removed', 'فصل كابل EPS', 'كابل تغذية المعالج.', 'افصل كابل EPS أولًا قبل فك مزود الطاقة.'),
    partReq('gpuPower', 'removed', 'فصل كابل طاقة البطاقة', 'من رأس البطاقة.', 'افصل كابل طاقة البطاقة أولًا قبل فك مزود الطاقة.'),
    flagReq('psuScrewsOut', 'فك براغي مزود الطاقة', 'من خلف الهيكل — عادة 4 براغٍ.', 'فك براغي مزود الطاقة من الهيكل الخلفي أولًا (عادة 4 براغٍ).'),
  ],
  ssd: [
    PANEL_OPEN_REMOVE,
    flagReq('m2ScrewOut', 'فك برغي تثبيت M.2', 'برغي صغير في نهاية القرص.', 'فك برغي تثبيت M.2 أولًا — القرص مثبت به في نهايته.'),
  ],
  fans: [
    PANEL_OPEN_REMOVE,
    flagReq('fanScrewsOut', 'فك براغي المراوح', 'ثبّت المروحة بيدك أثناء الفك.', 'فك براغي مراوح الهيكل أولًا.'),
    flagReq('fanHeadersDisconnected', 'فصل موصلات المراوح', 'اسحب من رأس الموصل لا من السلك.', 'افصل موصلات المراوح عن اللوحة أولًا — لا تسحب مروحة وسلكها موصول.'),
  ],
  atx24: [PANEL_OPEN_REMOVE],
  eps: [PANEL_OPEN_REMOVE],
  gpuPower: [PANEL_OPEN_REMOVE],
};

// ============ جدول اعتماديات التركيب (المصدر النهائي للحقيقة) ============

const INSTALL_REQS: Record<ComponentId, Requirement[]> = {
  case: [], // لا يُركَّب — معالجة خاصة
  motherboard: [
    PANEL_OPEN_INSTALL,
    flagReq('moboScrewsOut', 'مسامير اللوحة مفكوكة (حالة التجهيز)', 'أمسك اللوحة فوق الحوامل ثم اربط المسامير بعدها.', 'الأمساك غير مهيأة: فعّل علم «مسامير اللوحة الأم مفكوكة» لتجهيز الحوامل، ركّب اللوحة ثم اربط المسامير عبر العلم نفسه.'),
  ],
  cpu: [
    PANEL_OPEN_INSTALL,
    flagReq('cpuLeverOpen', 'رفع رافعة المقبس', 'المعالج لا يدخل برافعة مغلقة.', 'ارفع رافعة المقبس أولًا — المعالج لا يدخل برافعة مغلقة.'),
    partReq('cooler', 'removed', 'إبقاء المبرد مرفوعًا', 'المعالج يُركّب على مقعد عارٍ.', 'انزع المبرد أولًا — لا يُركَّب المعالج والمبرد مركّبَين؛ ضع المعالج بمحاذاة مثلث الاتجاه ثم أعد المبرد.'),
  ],
  cooler: [
    PANEL_OPEN_INSTALL,
    partReq('cpu', 'installed', 'وجود المعالج مثبتًا', 'المبرد يجلس فوق معالج مثبّت ومعجون حراري.', 'المعالج غير مثبت — ثبّت المعالج في المقبس أولًا قبل تركيب المبرد فوقه.'),
  ],
  ram: [
    PANEL_OPEN_INSTALL,
    flagReq('ramClipsOpen', 'فتح مزالج الفتحة', 'صوّب الوحدة على سن الفتحة ثم اضغط.', 'حرّر مزالج فتحة الذاكرة أولًا ثم اضغط الوحدة حتى طقّة انغلاق المزالج على الطرفين.'),
  ],
  gpu: [
    PANEL_OPEN_INSTALL,
    flagReq('pcieLatchOpen', 'تحرير مزلاج PCIe', 'تُدخل البطاقة والمزلاج محلَّر.', 'حرّر مزلاج فتحة PCIe أولًا — البطاقة تُدخل والمزلاج محلَّر ثم يُغلق.'),
    partReq('gpuPower', 'removed', 'ترك كابل طاقة البطاقة مفصولًا', 'الكابل يوصَل بعد تثبيت البطاقة.', 'اترك كابل طاقة البطاقة غير موصول حتى تثبّت البطاقة في الفتحة تمامًا، ثم وصّل الكابل.'),
    partReq('motherboard', 'installed', 'وجود اللوحة الأم مثبتة', 'الفتحة جزء من اللوحة.', 'اللوحة الأم غير مثبتة — ثبّت اللوحة الأم أولًا قبل بطاقة الرسوميات.'),
  ],
  psu: [
    PANEL_OPEN_INSTALL,
    flagReq('psuScrewsOut', 'براغي PSU مفكوكة (حالة التجهيز)', 'أدخل PSU في مكانه ثم اربط البراغي.', 'جهّز الموضع: فعّل علم «براغي مزود الطاقة مفكوكة»، أدخل PSU في مكانه ثم اربط براغيه بعدها.'),
  ],
  ssd: [
    PANEL_OPEN_INSTALL,
    flagReq('m2ScrewOut', 'برغي M.2 مفكوك (حالة التجهيز)', 'أدخل القرص مائلًا ثم اربط البرغي.', 'فعّل علم «برغي تثبيت M.2 مفكوك»، أدخل القرص بزاوية مائلة، اضغطه للأسفل ثم اربط البرغي.'),
  ],
  fans: [
    PANEL_OPEN_INSTALL,
    flagReq('fanScrewsOut', 'براغي المراوح مفكوكة (حالة التجهيز)', 'ثبّت المروحة في موضعها ثم اربط براغيها.', 'جهّز الموضع: فعّل علم «براغي مراوح الهيكل مفكوكة»، ثبّت المروحة في موضعها ثم اربط براغيها.'),
  ],
  atx24: [
    PANEL_OPEN_INSTALL,
    partReq('motherboard', 'installed', 'وجود اللوحة الأم مثبتة', 'ATX 24-pin يوصَل بعد تثبيت اللوحة.', 'اللوحة الأم غير مثبتة — ثبّت اللوحة أولًا ثم وصّل كابل ATX 24-pin حتى طقّة القفل.'),
  ],
  eps: [
    PANEL_OPEN_INSTALL,
    partReq('motherboard', 'installed', 'وجود اللوحة الأم مثبتة', 'EPS يوصَل بالزاوية العلوية.', 'اللوحة الأم غير مثبتة — ثبّت اللوحة أولًا ثم وصّل كابل EPS 8-pin في الزاوية العلوية.'),
  ],
  gpuPower: [
    PANEL_OPEN_INSTALL,
    partReq('gpu', 'installed', 'وجود البطاقة مثبتة', 'طاقة البطاقة آخر خطوة في تركيبها.', 'ركّب بطاقة الرسوميات أولًا قبل توصيل كابل طاقتها.'),
  ],
};

// ============ بناء قوائم الفحص ============

function buildChecklist(s: SimulationState, reqs: Requirement[]): ChecklistItem[] {
  // أول عنصرين دائمًا: إطفاء ثم فصل الكهرباء (للمكوّنات الداخلية).
  const chain: Requirement[] = [SAFETY_OFF, SAFETY_UNPLUG, ...reqs];
  const items: ChecklistItem[] = [];
  let previousDone = true;
  for (const r of chain) {
    const done = r.done(s);
    items.push({
      source: r.source,
      labelAr: r.labelAr,
      hintAr: r.hintAr,
      done,
      available: previousDone,
      actionPart: r.actionPart,
    });
    previousDone = previousDone && done;
  }
  return items;
}

export function getRemovalChecklist(s: SimulationState, id: ComponentId): ChecklistItem[] {
  if (id === 'case') {
    return [
      {
        source: 'base',
        labelAr: 'الهيكل قطعة ثابتة — الوصول عبر الغطاء الجانبي',
        hintAr: 'الهيكل هو جسم الجهاز ولا يُفك؛ افتح/أغلق الغطاء الجانبي عبر علمه.',
        done: s.flags.panelOpen,
        available: true,
      },
    ];
  }
  return buildChecklist(s, REMOVE_REQS[id]);
}

export function getInstallChecklist(s: SimulationState, id: ComponentId): ChecklistItem[] {
  if (id === 'case') {
    return [
      {
        source: 'base',
        labelAr: 'الهيكل موجود دائمًا — لا يحتاج تركيبًا',
        hintAr: 'الهيكل هو جسم الجهاز؛ تعامل معه عبر فتح وإغلاق الغطاء الجانبي.',
        done: true,
        available: true,
      },
    ];
  }
  return buildChecklist(s, INSTALL_REQS[id]);
}

// ============ الحكم قبل التنفيذ ============

export function canRemove(s: SimulationState, id: ComponentId): StepResult {
  if (id === 'case') {
    return { ok: false, messageAr: 'الهيكل هو جسم الجهاز؛ استخدم زر فتح/إغلاق الغطاء الجانبي.' };
  }
  const chain: Requirement[] = [SAFETY_OFF, SAFETY_UNPLUG, ...REMOVE_REQS[id]];
  const unmet = chain.find((r) => !r.done(s));
  if (unmet !== undefined) {
    return { ok: false, messageAr: unmet.failAr };
  }
  return { ok: true, messageAr: `كل الشروط مستوفاة — يمكنك الآن سحب ${PART_NAMES_AR[id]} بأمان.` };
}

export function canInstall(s: SimulationState, id: ComponentId): StepResult {
  if (id === 'case') {
    return { ok: false, messageAr: 'الهيكل هو جسم الجهاز — موجود دائمًا ولا يُفك أو يُركَّب كقطعة منفصلة.' };
  }
  const chain: Requirement[] = [SAFETY_OFF, SAFETY_UNPLUG, ...INSTALL_REQS[id]];
  const unmet = chain.find((r) => !r.done(s));
  if (unmet !== undefined) {
    return { ok: false, messageAr: unmet.failAr };
  }
  return { ok: true, messageAr: `الشروط مستوفاة — يمكنك تركيب ${PART_NAMES_AR[id]} الآن.` };
}

// ============ التنفيذ (تطبيق نقدي على نسخة جديدة) ============

/** يسحب القطعة (تغيير parts[id] فقط — الأعلام لا تُعدَّل هنا). */
export function applyRemove(s: SimulationState, id: ComponentId): SimulationState {
  const parts: Record<ComponentId, PartStatus> = { ...s.parts };
  if (id !== 'case') {
    parts[id] = 'removed'; // الهيكل لا يُفك — الحالة تبقى كما هي
  }
  return { flags: { ...s.flags }, parts };
}

/** يركّب القطعة (تغيير parts[id] فقط — الأعلام لا تُعدَّل هنا). */
export function applyInstall(s: SimulationState, id: ComponentId): SimulationState {
  const parts: Record<ComponentId, PartStatus> = { ...s.parts };
  if (id !== 'case') {
    parts[id] = 'installed'; // الهيكل موجود دائمًا — لا تغيير
  }
  return { flags: { ...s.flags }, parts };
}
