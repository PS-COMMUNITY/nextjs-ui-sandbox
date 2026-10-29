/**
 * PC Repair 3D Studio — العقود المشتركة (Shared Contracts)
 * كل الطبقات (البيانات، المحاكاة، المشهد، الواجهة) تعتمد على هذا الملف فقط.
 * معرّفات المكوّنات ثابتة (stable ids) ولا يجوز تغييرها لاحقًا.
 */

// ============ معرّفات المكوّنات الاثني عشر ============
export type ComponentId =
  | 'case'
  | 'motherboard'
  | 'cpu'
  | 'cooler'
  | 'ram'
  | 'gpu'
  | 'psu'
  | 'ssd'
  | 'fans'
  | 'atx24'
  | 'eps'
  | 'gpuPower';

export const COMPONENT_IDS: ComponentId[] = [
  'case', 'motherboard', 'cpu', 'cooler', 'ram', 'gpu',
  'psu', 'ssd', 'fans', 'atx24', 'eps', 'gpuPower',
];

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
export type PartStatus = 'installed' | 'removed';

export interface SimulationState {
  flags: Record<MachineFlag, boolean>;
  parts: Record<ComponentId, PartStatus>;
}

export function initialSimulationState(): SimulationState {
  const flags = {} as Record<MachineFlag, boolean>;
  for (const f of MACHINE_FLAGS) flags[f] = false;
  const parts = {} as Record<ComponentId, PartStatus>;
  for (const id of COMPONENT_IDS) parts[id] = 'installed';
  return { flags, parts };
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

export const APP_VERSION = '2.0.0';
export const CATALOG_VERSION = '2025-01-rev1';
