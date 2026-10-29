/**
 * الأنواع البصرية المشتركة بين مصنع المجسمات (partsFactory) ومدير المشهد (PCScene).
 *
 * ملاحظة توجيه v3 (أ.1/أ.2): لا يوجد أي مجسم ثلاثي الأبعاد للوحة مفاتيح أو فأرة
 * في المشهد إطلاقًا — جهازا الإدخال الحقيقيان للمستخدم هما أدوات التحكم بالتطبيق.
 */
import type * as THREE from 'three';
import type { ComponentId } from '../types';

export type SceneQuality = 'low' | 'medium' | 'high';

/** الطرفيات التفاعلية خارج الهيكل (ليست قطع PC — نقرة تُحوّل لفعل في المتجر) */
export type PeripheralKind = 'monitor' | 'monitor-power';

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
  spinners: THREE.Object3D[];                  // مجسمات تدور (شفرات مراوح)
  // ===== الطرفيات والإضافات =====
  monitor: THREE.Group;                        // الشاشة (قاعدة/عمود/إطار) — سطع العرض يُعثر عليه باسم 'monitor-screen'
  airflow: THREE.Group;                        // أسهم اتجاه تدفق الهواء (تُظهر/تخفى)
}

export interface PCSceneCallbacks {
  onSelect: (id: ComponentId | null) => void;
  /** نقرة على طرفية خارجية: زر شاشة / زر طاقة الشاشة */
  onPeripheral?: (kind: PeripheralKind, detail?: string) => void;
  /** إفلات قطعة مسحوبة بالماوس: تمرر للمنطق التعليمي للتحقق قبل قبول الحركة */
  onPartDrop?: (id: ComponentId, zone: 'tray' | 'case' | null) => void;
  onReady?: () => void;
  onError?: (messageAr: string) => void;
}
