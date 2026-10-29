/**
 * PC Repair 3D Studio — العقود المشتركة (Shared Contracts)
 * كل الطبقات (البيانات، المحاكاة، المشهد، الواجهة) تعتمد على هذا الملف فقط.
 * معرّفات المكوّنات ثابتة (stable ids) ولا يجوز تغييرها لاحقًا.
 */

// ============ معرّفات المكوّنات (15 مكوّنًا) ============
export type ComponentId =
  | 'case'
  | 'motherboard'
  | 'cpu'
  | 'cooler'
  | 'ram'
  | 'gpu'
  | 'psu'
  | 'ssd'
  | 'hdd'
  | 'fans'
  | 'atx24'
  | 'eps'
  | 'gpuPower'
  | 'sataData'
  | 'sataPower';

export const COMPONENT_IDS: ComponentId[] = [
  'case', 'motherboard', 'cpu', 'cooler', 'ram', 'gpu',
  'psu', 'ssd', 'hdd', 'fans', 'atx24', 'eps', 'gpuPower',
  'sataData', 'sataPower',
];

/** الكابلات تُفصل/توصَل بحركة واحدة (بلا فصل جزئي/براغٍ) */
export const CABLE_IDS: ComponentId[] = ['atx24', 'eps', 'gpuPower', 'sataData', 'sataPower'];

// ============ أعلام حالة الجهاز (Machine Flags) ============
export type MachineFlag =
  | 'powerOn'                 // الجهاز قيد التشغيل
  | 'acConnected'             // كابل الكهرباء (من الحائط إلى PSU) موصول
  | 'panelOpen'               // الغطاء الجانبي مفتوح
  | 'pcieLatchOpen'           // مزلاج فتحة PCIe محلَّر
  | 'ramClipsOpen'            // مزالج RAM محلَّرة
  | 'cpuLeverOpen'            // رافعة مقبس المعالج مفتوحة
  | 'gpuScrewsOut'            // براغي بطاقة الرسوميات مفكوكة
  | 'psuScrewsOut'            // براغي مزود الطاقة مفكوكة
  | 'fanScrewsOut'            // براغي مراوح الهيكل مفكوكة
  | 'm2ScrewOut'              // برغي تثبيت M.2 مفكوك
  | 'moboScrewsOut'           // مسامير تثبيت اللوحة الأم مفكوكة
  | 'fanHeadersDisconnected'  // موصلات مراوح اللوحة (fan headers) مفصولة
  | 'frontPanelDisconnected'; // موصلات Front Panel / USB / Audio مفصولة

export const MACHINE_FLAGS: MachineFlag[] = [
  'powerOn', 'acConnected', 'panelOpen', 'pcieLatchOpen', 'ramClipsOpen',
  'cpuLeverOpen', 'gpuScrewsOut', 'psuScrewsOut', 'fanScrewsOut',
  'm2ScrewOut', 'moboScrewsOut', 'fanHeadersDisconnected', 'frontPanelDisconnected',
];

// ============ حالة المحاكاة الكاملة ============
/**
 * حالة القطعة الفعلية (المصدر الوحيد للحقيقة):
 *  - installed  : مثبتة في موضعها (أو مؤمّنة بالكامل — انظر AssemblyState)
 *  - separated  : فصل جزئي — ما زالت في مكانها لكن البراغي/المزالج مفتوحة (PARTIALLY_SEPARATED)
 *  - removed    : مفصولة كليًا ومستقرة في صينية القطع (TEMP_STORAGE)
 *  - awaiting   : ملتقطة من الصينية وبانتظار التركيب (AWAITING_INSTALL)
 *  - damaged    : تلف تدريبي مقصود (TRAINING_DAMAGE) — تُستبدل من المخزن التعليمي
 * لحظة الفصل الكلي (FULLY_SEPARATED) انتقال حركي أثناء الاستخراج، ولحظة الرفض
 * (INSTALL_REJECTED) حدث مؤجل يُسجّل في المتجر — انظر assemblyStateOf.
 */
export type PartStatus = 'installed' | 'separated' | 'removed' | 'awaiting' | 'damaged';

export const INSTALLED: PartStatus = 'installed';
export function isInstalled(p: PartStatus): boolean {
  return p === 'installed';
}

// ============ آلة الحالات الثمانية (المواصفة المرجعية) ============
export type AssemblyState =
  | 'INSTALLED_SECURED'
  | 'PARTIALLY_SEPARATED'
  | 'FULLY_SEPARATED'
  | 'TEMP_STORAGE'
  | 'AWAITING_INSTALL'
  | 'INSTALLED_CORRECTLY'
  | 'INSTALL_REJECTED'
  | 'TRAINING_DAMAGE';

export const ASSEMBLY_STATE_INFO: Record<AssemblyState, { labelAr: string; colorAr: string }> = {
  INSTALLED_SECURED: { labelAr: 'مثبتة — بحاجة إغلاق مزالج/براغٍ', colorAr: 'amber' },
  PARTIALLY_SEPARATED: { labelAr: 'فصل جزئي — ما زالت في مكانها', colorAr: 'amber' },
  FULLY_SEPARATED: { labelAr: 'مفصولة كليًا (لحظة الاستخراج)', colorAr: 'amber' },
  TEMP_STORAGE: { labelAr: 'في صينية القطع', colorAr: 'slate' },
  AWAITING_INSTALL: { labelAr: 'بانتظار التركيب', colorAr: 'cyan' },
  INSTALLED_CORRECTLY: { labelAr: 'مثبتة بإحكام كامل', colorAr: 'emerald' },
  INSTALL_REJECTED: { labelAr: 'رُفض التركيب — راجع الشروط', colorAr: 'rose' },
  TRAINING_DAMAGE: { labelAr: 'تلف تدريبي — استبدلها من المخزن', colorAr: 'rose' },
};

/** أعلام ما بعد التركيب (المزالج/البراغي) لكل قطعة — تُغلق لإكمال التثبيت */
export const SECURE_FLAGS: Partial<Record<ComponentId, MachineFlag[]>> = {
  gpu: ['pcieLatchOpen', 'gpuScrewsOut'],
  ram: ['ramClipsOpen'],
  cpu: ['cpuLeverOpen'],
  ssd: ['m2ScrewOut'],
  hdd: [],
  fans: ['fanScrewsOut'],
  psu: ['psuScrewsOut'],
  motherboard: ['moboScrewsOut'],
};

/** الحالة الثمانية المشتقة — تُحسب من الحالة الفعلية (لا تُخزّن أبدًا) */
export function assemblyStateOf(part: PartStatus, secureFlagsOpen: boolean): AssemblyState {
  switch (part) {
    case 'installed':
      return secureFlagsOpen ? 'INSTALLED_SECURED' : 'INSTALLED_CORRECTLY';
    case 'separated':
      return 'PARTIALLY_SEPARATED';
    case 'removed':
      return 'TEMP_STORAGE';
    case 'awaiting':
      return 'AWAITING_INSTALL';
    case 'damaged':
      return 'TRAINING_DAMAGE';
  }
}

// ============ الطرفيات وأعطال النظام الإضافية ============
/** حالة الطرفيات الخارجية (الشاشة) وأعطال تُفعّل عبر السيناريوهات */
export interface PeripheralState {
  monitorOn: boolean;              // زر تشغيل الشاشة نفسها
  monitorCableConnected: boolean;  // كابل إشارة العرض من البطاقة إلى الشاشة
  psuDead: boolean;                // عطل مزود الطاقة (سيناريو تعليمي)
  ramIncompatible: boolean;        // ذاكرة غير متوافقة مع اللوحة (سيناريو تعليمي)
}

export function initialPeripheralState(): PeripheralState {
  return { monitorOn: true, monitorCableConnected: true, psuDead: false, ramIncompatible: false };
}

export interface SimulationState {
  flags: Record<MachineFlag, boolean>;
  parts: Record<ComponentId, PartStatus>;
  peripherals: PeripheralState;
}

export function initialSimulationState(): SimulationState {
  const flags = {} as Record<MachineFlag, boolean>;
  for (const f of MACHINE_FLAGS) flags[f] = false;
  const parts = {} as Record<ComponentId, PartStatus>;
  for (const id of COMPONENT_IDS) parts[id] = 'installed';
  return { flags, parts, peripherals: initialPeripheralState() };
}

/** دمج دفاعي: حالة محفوظة قديمة/ناقصة + قيم افتراضية للحقول الجديدة */
export function normalizeSimulationState(raw: Partial<SimulationState> | undefined | null): SimulationState {
  const base = initialSimulationState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    flags: { ...base.flags, ...(typeof raw.flags === 'object' && raw.flags ? raw.flags : {}) },
    parts: { ...base.parts, ...(typeof raw.parts === 'object' && raw.parts ? raw.parts : {}) },
    peripherals: { ...base.peripherals, ...(typeof raw.peripherals === 'object' && raw.peripherals ? raw.peripherals : {}) },
  };
}

// ============ نتائج الفحص والقوائم ============
export interface StepResult {
  ok: boolean;
  messageAr: string;
}

export type ChecklistItemSource = MachineFlag | 'safetyOff' | 'safetyUnplug' | 'base';

export interface ChecklistItem {
  source: ChecklistItemSource;
  labelAr: string;
  hintAr: string;
  done: boolean;      // هل الخطوة منفذة الآن؟
  available: boolean; // هل يمكن تنفيذها الآن (اعتمادياتها السابقة مكتملة)؟
  actionPart?: ComponentId; // إن كانت الخطوة فك/تركيب قطعة — معرفها لجعلها قابلة للتنفيذ
}

// ============ كتالوج المكوّنات ============
export interface CatalogEntry {
  id: ComponentId;
  nameAr: string;
  nameEn: string;
  category: string;            // بالعربية: هيكل/لوحات/معالجة/تبريد/ذاكرة/رسوميات/تخزين/طاقة/كابلات/تهوية
  role: string;                // دور القطعة في جملة واحدة
  description: string;         // وصف تعليمي مفصل
  referenceSpecs: Record<string, string>; // مواصفات مرجعية للمنصة الافتراضية
  meshKey: string;             // مفتاح المجسم في المشهد (ثابت)
  mountPoint: string;          // موضع التثبيت بالعربية
  removeRequirements: string[];// خطوات الفك المطلوبة (وصف نصي للعرض)
  installRequirements: string[];// خطوات التركيب
  faults: string[];            // أعطال محتملة
  safety: string[];            // تنبيهات السلامة
  powerEstimateW?: number;     // تقدير تعليمي فقط
  priceIllustrativeUsd?: number; // سعر تعليمي توضيحي من الكتالوج المرجعي (وليس سعر سوق)
  isIllustrative: boolean;     // true = القيم تعليمية توضيحية وليست قياسًا حقيقيًا
  compatibilityNotes: string[];// ملاحظات توافق
  sourceNote: string;          // مصدر المحتوى / ملاحظة مراجعة
  reviewedAt: string;          // تاريخ مراجعة المحتوى ISO
}

// ============ خيارات بناء التجميعة (Compatibility Builder) ============
export type BuildSlot = 'cpu' | 'cooler' | 'motherboard' | 'ram' | 'gpu' | 'ssd' | 'psu' | 'case';

export interface BuildOption {
  id: string;
  slot: BuildSlot;
  nameAr: string;
  nameEn: string;
  specs: Record<string, string>;  // مواصفات تُقرأ منها قواعد التوافق
  priceIllustrative?: number;     // سعر تعليمي توضيحي فقط
  powerW?: number;                // قدرة/استهلاك تقديري تعليمي
}

export interface BuildSelection {
  cpu?: string;
  cooler?: string;
  motherboard?: string;
  ram?: string;
  gpu?: string;
  ssd?: string;
  psu?: string;
  case?: string;
}

// ============ نتائج التوافق والطاقة ============
export type RuleVerdict = 'compatible' | 'incompatible' | 'needs-review';

export interface CompatibilityRuleResult {
  ruleId: string;
  titleAr: string;
  status: RuleVerdict;
  reasonAr: string;
}

export interface PowerEstimateResult {
  totalW: number;                 // مجموع تقديري لاستهلاك القطع المختارة + مراوح الهيكل
  budgetW: number | null;         // ميزانية الأمان التعليمية = psuW * 0.80 (صيغة الموسوعة)
  usagePercent: number | null;    // نسبة الحمل من ميزانية الأمان
  remainingW: number | null;      // الهامش المتبقي حتى ميزانية الأمان
  recommendedPsuW: number;        // قدرة موصى بها إرشادية (لتحقيق هامش 80٪)
  psuW: number | null;            // قدرة PSU المختار إن وُجد
  verdict: 'ok' | 'low' | 'unknown';
  messageAr: string;
  notesAr: string[];              // تنبيهات إلزامية أن الأرقام تقديرية
}

// ============ التشخيص POST/BOOT ============
export type DiagnosisCode =
  | 'POWER_OFF'                 // لا طاقة (مطفأ/غير موصول)
  | 'POST_FAIL'                 // فشل POST
  | 'POST_PASS_BOOT_WARNING'    // POST ناجح مع تحذير إقلاع/عرض
  | 'POST_PASS_BOOT_OK'         // POST ناجح والإقلاع سليم
  | 'INCOMPATIBLE_BUILD';       // تجميعة غير متوافقة منطقيًا

export interface DiagnosisFinding {
  code: DiagnosisCode;
  titleAr: string;
  detailsAr: string[];
  nextStepsAr: string[];
  isSimulated: true; // كل النتائج محاكاة تعليمية
}

// ============ SMART (محاكاة تعليمية صريحة) ============
export interface SmartSimResult {
  scenario: 'healthy' | 'aging' | 'failing';
  healthPercent: number;
  temperatureC: number;
  reallocatedSectors: number;
  powerOnHours: number;
  badgeAr: string; // دائمًا «محاكاة تعليمية»
  interpretationAr: string;
}

// ============ الدروس والتدريب الموجّه ============
export interface MissionStep {
  id: string;
  textAr: string;
  hintAr?: string;
  verify: VerifySpec; // يُتحقق منه آليًا عبر حالة المحاكاة
}

export type VerifySpec =
  | { kind: 'flag-on'; target: MachineFlag }
  | { kind: 'flag-off'; target: MachineFlag }
  | { kind: 'part-removed'; target: ComponentId }
  | { kind: 'part-installed'; target: ComponentId }
  | { kind: 'post-result'; target: DiagnosisCode };

export interface Mission {
  id: string;
  titleAr: string;
  objectiveAr: string;
  safetyAr: string[];
  difficulty: 'مبتدئ' | 'متوسط' | 'متقدم';
  steps: MissionStep[];
  completionMessageAr: string;
}

export interface QuizQuestion {
  id: string;
  textAr: string;
  optionsAr: string[];
  correctIndex: number;
  explanationAr: string;
  topic: string;
}

// ============ الشاشة الخارجية (8 حالات مرئية) ============
export type MonitorScreen =
  | 'off'        // الشاشة مطفأة (زرها)
  | 'noSignal'   // تعمل بلا إشارة — كابل/بطاقة/جهاز مطفأ
  | 'booting'    // شعار بدء التشغيل
  | 'post'       // رسائل POST (أو فشلها)
  | 'bios'       // إعدادات UEFI — لا جهاز إقلاع
  | 'warning'    // تحذير بعد POST ناجح
  | 'success'    // نجاح قبل الدخول للنظام
  | 'os';        // نظام افتراضي مبسّط

// ============ سجل الجلسة والتقارير ============
export interface SessionEvent {
  ts: number;          // epoch ms
  kind: string;        // safety | remove | install | flag | post | quiz | lesson | export | scenario | other
  labelAr: string;
  ok: boolean;
  detailAr?: string;
}

export interface ReportSummary {
  sessionId: string;
  startedAt: number;
  eventsCount: number;
  correctActions: number;
  failedActions: number;
  quizTaken: number;
  quizAverageScore: number;   // 0-100
  missionsCompleted: string[];
  lastDiagnosis: DiagnosisCode | null;
  simulatedValuesNoticeAr: string;
}

export const APP_VERSION = '3.0.0';
export const CATALOG_VERSION = '2025-01-rev2';
