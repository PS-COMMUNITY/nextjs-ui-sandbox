/**
 * تخطيط المشهد — وحدة ~10سم.
 * الهيكل: X∈[0,2.1] (0=جهة الغطاء الزجاجي، 2.1=جدار اللوحة الأم)،
 * Y∈[0,4.5] (0=أرضية)، Z∈[0,4.6] (0=خلف الجهاز، 4.6=الواجهة الأمامية).
 * اللوحة الأم عمودية على الجدار الأيمن ووجهها نحو -X (نحو المشاهد).
 */
import type { ComponentId } from '../types';

export type Vec3 = [number, number, number];

export const CASE = {
  minX: 0, maxX: 2.1,
  minY: 0, maxY: 4.5,
  minZ: 0, maxZ: 4.6,
  center: [1.05, 2.25, 2.3] as Vec3,
};

export const BOARD = {
  x: 1.85,          // مستوى اللوحة (وجه نحو -X)
  thickness: 0.06,
  yMin: 1.25, yMax: 4.25,
  zMin: 0.35, zMax: 2.79,
  center: [1.85, 2.75, 1.57] as Vec3,
};

/** مركز كل مجموعة مكوّن أثناء التثبيت */
export const MOUNTS: Record<ComponentId, Vec3> = {
  case: [1.05, 2.25, 2.3],
  motherboard: [1.85, 2.75, 1.57],
  cpu: [1.78, 3.45, 0.95],
  cooler: [1.42, 3.45, 0.95],
  ram: [1.62, 3.3, 1.4],
  gpu: [1.28, 2.03, 1.42],
  psu: [1.32, 0.43, 0.72],
  ssd: [1.8, 2.55, 1.05],
  hdd: [1.05, 0.78, 3.55],     // قفص القرص الميكانيكي 3.5" أسفل الواجهة الأمامية
  fans: [1.05, 2.7, 2.27],
  atx24: [1.7, 3.75, 2.62],
  eps: [1.72, 4.02, 0.55],
  gpuPower: [1.05, 2.32, 2.05],
  sataData: [1.78, 2.2, 2.35], // منفذ SATA على اللوحة + كابل نحو القرص
  sataPower: [1.28, 0.78, 2.9],// كابل طاقة SATA من PSU نحو القرص
};

/** صينية القطع المفكوكة: طاولة أمام-يسار الجهاز */
export const TRAY = {
  tableTopY: 0.9,
  minX: -4.4, maxX: -2.3,
  minZ: 0.5, maxZ: 4.3,
  /** موضع الراحة لكل مكوّن على الطاولة (مسطح) */
  slots: {
    ram: [-2.6, 0.98, 1.2],
    gpu: [-3.45, 1.02, 1.25],
    cpu: [-4.05, 0.95, 1.2],
    gpuPower: [-2.9, 0.95, 1.95],
    cooler: [-2.7, 1.05, 2.6],
    ssd: [-3.35, 0.95, 2.6],
    hdd: [-2.55, 0.98, 3.05],
    fans: [-3.9, 1.0, 2.6],
    psu: [-2.7, 0.95, 3.9],
    motherboard: [-3.55, 0.98, 3.85],
    atx24: [-4.1, 0.95, 3.35],
    eps: [-4.1, 0.95, 3.9],
    sataData: [-2.95, 0.95, 1.7],
    sataPower: [-3.3, 0.95, 1.75],
    case: [0, 0, 0],
  } as Record<ComponentId, Vec3>,
  /** دوران كل قطعة لتستلقي مسطحة على الطاولة (Euler بالراديان) */
  rotations: {
    case: [0, 0, 0],
    motherboard: [0, 0, -Math.PI / 2],
    cpu: [0, 0, -Math.PI / 2],
    cooler: [0, 0, -Math.PI / 2],
    ram: [Math.PI / 2, 0, 0],
    gpu: [0, 0, 0],
    psu: [0, 0, 0],
    ssd: [0, 0, -Math.PI / 2],
    hdd: [0, 0, 0],
    fans: [-Math.PI / 2, 0, 0],
    atx24: [0, 0, 0],
    eps: [0, 0, 0],
    gpuPower: [0, 0, 0],
    sataData: [0, 0, 0],
    sataPower: [0, 0, 0],
  } as Record<ComponentId, Vec3>,
};

/** اتجاه العرض التفجيري لكل مكوّن (إزاحة عن موضع التثبيت) */
export const EXPLODE_VECTORS: Record<ComponentId, Vec3> = {
  case: [0, 0, 0],
  motherboard: [-1.5, 0, 0],
  cpu: [-2.2, 0, 0],
  cooler: [-2.7, 0, 0],
  ram: [-2.3, 0, 0],
  gpu: [-1.7, 0, 0],
  psu: [-0.5, -0.15, 0],
  ssd: [-1.9, 0, 0],
  hdd: [-0.8, 0, 0.3],
  fans: [-0.6, 0, 0],
  atx24: [-1.2, 0, 0.3],
  eps: [-1.2, 0, -0.2],
  gpuPower: [-1.5, 0, 0.2],
  sataData: [-1.1, 0, 0.15],
  sataPower: [-0.9, 0, 0.3],
};

/** إزاحة الفصل الجزئي (نسبة من متجه التفجير — القطعة ما زالت في مكانها) */
export const SEPARATE_FACTOR = 0.22;

export const DEFAULT_CAMERA = {
  // زاوية ثلاثية الأرباع من جهة الزجاج: تُظهر وجه اللوحة الأم والداخل + الطرفيات على اليمين
  pos: [-6.8, 4.9, 9.4] as Vec3,
  target: [0.7, 2.05, 2.6] as Vec3,
};

// ============ الشاشة على المكتب (لا كيبورد ولا ماوس — توجيه v3 أ.1) ============
export const PERIPH = {
  /** موضع قاعدة الشاشة على المكتب + دورانها (تتجه نحو الجهاز/الكاميرا) */
  monitorPos: [5.1, 0.9, 6.3] as Vec3,
  monitorRotY: -0.62,
  /** مركز سطح العرض بالنسبة لجذر مجموعة الشاشة */
  screenCenterLocal: [0, 2.5, 0.1] as Vec3,
  screenW: 5.3,
  screenH: 3.05,
  /** حصيرة مكتب تحت الشاشة فقط */
  matCenter: [5.1, 0.905, 6.1] as Vec3,
  matSize: [5.2, 3.2] as [number, number],
};

/** موضع زاوية الكاميرا نحو الشاشة (توجيه سريع — بمحاذاة عمود سطح العرض) */
export const MONITOR_CAMERA = {
  pos: [0.6, 3.5, 13.2] as Vec3,
  target: [5.0, 3.2, 6.4] as Vec3,
};

/** مناظير جاهزة (توجيه v3 2.1): أمامي/جانبي/علوي — تُستخدم بالأزرار و1/2/3 */
export type ViewPresetId = 'front' | 'side' | 'top';
export const VIEW_PRESETS: Record<ViewPresetId, { pos: Vec3; target: Vec3 }> = {
  front: { pos: [1.05, 2.8, 11.8], target: [1.05, 2.2, 2.4] },
  side: { pos: [-7.8, 3.4, 2.4], target: [1.5, 2.3, 2.3] },
  top: { pos: [1.2, 11.8, 4.9], target: [1.1, 0.4, 2.4] },
};

/** ألوان المشهد الموحدة — فاتحة كفاية لتبقى القطع مقروءة داخل هيكل داكن */
export const COLORS = {
  bg: 0x0d1218,
  metalDark: 0x232a33,
  metalMid: 0x3a4450,
  pcb: 0x1a5c40,
  pcbDark: 0x14503a,
  glass: 0x11151b,
  accent: 0x22d3ee,      // سماوي — هوية الموسوعة (معلومات)
  accentSoft: 0x0e7490,
  plastic: 0x2a323c,
  copper: 0xb87333,
  aluminum: 0x9aa3ad,
  black: 0x12161c,
  white: 0xe8eaed,
  green: 0x22c55e,
  red: 0xef4444,
  yellow: 0xeab308,
};
