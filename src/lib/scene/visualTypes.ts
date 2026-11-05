/**
 * الأنواع البصرية المشتركة بين مصنع المجسمات (partsFactory) ومدير المشهد (PCScene).
 *
 * تحديث V8 (توجيه «تحكم كشخص حقيقي»): الإدخال الحقيقي يبقى أساس التحكم، وأُضيفت
 * طرفيات مكتب مادية (كيبورد وفأرة على الطاولة موصولتان بكابل) نقرة عليهما تدخل
 * وضع التحكم بالشاشة المجسمة — كما يفعل فني حقيقي يجلس على طاولة الصيانة.
 */
import type * as THREE from 'three';
import type { ComponentId, MachineFlag } from '../types';

export type SceneQuality = 'low' | 'medium' | 'high';

/** الطرفيات التفاعلية خارج الهيكل (ليست قطع PC — نقرة تُحوّل لفعل في المتجر) */
export type PeripheralKind = 'monitor' | 'monitor-power' | 'keyboard' | 'mouse';

/** أدوات المقعد (V8): اليد تنفّد المزالج والقوابس، والمفك وحده يفك/يثبّت البراغي */
export type BenchTool = 'hand' | 'screwdriver';

/** الأعلام التي تُنفَّذ بمفك حصراً (براغٍ حقيقية) */
export const SCREW_FLAGS: ReadonlySet<string> = new Set([
  'gpuScrewsOut', 'psuScrewsOut', 'fanScrewsOut', 'm2ScrewOut', 'moboScrewsOut',
]);

/** مراجع المجسمات الفرعية التي تتحكم بها أعلام المحاكاة (MachineFlag) */
export interface FlagVisuals {
  pcieLatch?: THREE.Object3D;      // مزلاج PCIe (يدور عند فتحه)
  ramClips: THREE.Object3D[];      // مزالج RAM (تدور للخارج)
  cpuLever?: THREE.Object3D;       // رافعة مقبس المعالج
  gpuScrews: THREE.Object3D[];     // براغي GPU (ترتفع عند الفك)
  psuScrews: THREE.Object3D[];
  fanScrews: THREE.Object3D[];
  m2Screw?: THREE.Object3D;
  moboScrews: THREE.Object3D[];
  fanHeaderPlug?: THREE.Object3D;  // قابس موصلات المراوح (ينبثق عند الفصل)
  frontPanelPlug?: THREE.Object3D; // قابس Front Panel
  powerLed?: THREE.Mesh;           // لمبة الطاقة على الواجهة
}

/** ناتج مصنع المجسمات */
export interface PartVisuals {
  root: THREE.Group;                           // جذر كل ما بُني
  dynamic: Record<ComponentId, THREE.Group>;   // مجموعة لكل مكوّن (تُحرك/تُحدد)
  caseShell: THREE.Group;                      // الهيكل الثابت (جدران/واجهة/خلفية)
  sidePanel: THREE.Group;                      // الغطاء الجانبي المفصلي
  flags: FlagVisuals;
  // ===== الطرفيات =====
  monitor: THREE.Group;                        // الشاشة (قاعدة/عمود/إطار) — سطع العرض يُعثر عليه باسم 'monitor-screen'
}

export interface PCSceneCallbacks {
  onSelect: (id: ComponentId | null) => void;
  /** نقرة على طرفية خارجية: زر شاشة / زر طاقة الشاشة / كيبورد المكتب والفأرة */
  onPeripheral?: (kind: PeripheralKind, detail?: string) => void;
  /** (V8) نقرة مباشرة على نقطة فعالة في المشهد: برغي/مزلاج/رافعة/قابس/غطاء/مفتاح PSU */
  onFlagClick?: (flag: MachineFlag) => void;
  /** (V8) نقر برغي بلا أداة مناسبة — الواجهة توجّه المستخدم لالتقاط المفك */
  onToolRequired?: (tool: BenchTool) => void;
  /** (V8) التقط المستخدم أداة من الطاولة (نقر المفك داخل المشهد) */
  onToolPick?: (tool: BenchTool) => void;
  /** (V8) نقرة زر الطاقة الفعلي على واجهة الهيكل */
  onPowerButton?: () => void;
  /** إفلات قطعة مسحوبة بالماوس: تمرر للمنطق التعليمي للتحقق قبل قبول الحركة */
  onPartDrop?: (id: ComponentId, zone: 'tray' | 'case' | null) => void;
  /** (V6-B) دخول/خروج وضع التحكم بالشاشة المجسمة (الواجهة تُحدّث شارتها) */
  onFocusMode?: (on: boolean) => void;
  /** (V6 §3) تحديث الحرارة المُحاكاة (بيانات تعليمية — تُعرض في الواجهة) */
  onThermal?: (cpuTempC: number, gpuTempC: number) => void;
  /** (V6 §3) إطفاء حراري تعليمي — تجاوز الحد بلا تبريد */
  onThermalShutdown?: (cpuTempC: number) => void;
  /** (V6-D) تغيير إعدادات UEFI من شاشة البرنامج الثابت داخل النظام الافتراضي */
  onFirmwareChange?: (patch: Record<string, unknown>) => void;
  /** (V6-D) اختيار جهاز إقلاع من UEFI (نقر مزدوج في تبويب Boot) */
  onBootDevice?: (deviceId: string) => void;
  /** (V6-E/F16) Startup Repair من بيئة الاسترداد (يفشل تعليميًا ويعد المحاولات) */
  onStartupRepair?: () => void;
  /** (V6-E/F16) إعادة تشغيل من بيئة الاسترداد */
  onRecoveryRestart?: () => void;
  onReady?: () => void;
  onError?: (messageAr: string) => void;
}
