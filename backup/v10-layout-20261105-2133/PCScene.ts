/**
 * PCScene — مدير المشهد ثلاثي الأبعاد (Three.js r186) لمحاكي صيانة الكمبيوتر.
 *
 * المسؤوليات:
 *  - إنشاء المُصيِّر/الكاميرا/التحكم المداري، واستدعاء مصنع المجسمات (partsFactory).
 *  - إدارة الحركة: التثبيت/الصينية/العرض التفجيري عبر أهداف تقترب عليها حلقة الرسم (lerp/slerp).
 *  - تطبيق أعلام المحاكاة (MachineFlag) على المجسمات الفرعية (غلاف، مزالج، براغٍ، قوابس، LED).
 *  - الاختيار بالأشعة، الإبراز، العزل، شفافية الهيكل (X-Ray)، تنعيم الكاميرا، وتنظيف الموارد.
 *
 * ملاحظات:
 *  - لا تُنشأ Vector3/Color جديدة داخل حلقة الرسم (مخازن مؤقتة مُعاد استخدامها).
 *  - كل الدوال العامة تنتهي مبكرًا إذا فشلت التهيئة (failed) أو بعد الإتلاف (disposed).
 *  - محاور دوران المزلاج/المزالج/الرافعة افتراضات موثقة داخل applyFlags (تعتمد على بناء المصنع).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildAllParts, buildEnvironment, setComponentId } from './partsFactory';
import { createScreenPainter, SCREEN_LOGICAL_H, SCREEN_LOGICAL_W, type ScreenPainter } from './screenTexture';
import { bootableDevices, computeMonitorView } from '../simulation/monitorEngine';
import { FanSystem } from './fans';
import { buildBenchAdditions } from './bench';
import { SCREW_FLAGS, type BenchTool } from './visualTypes';
import { VirtualOS } from '../os/vos';
import { registerVosApps } from '../os/apps';
import { drawInstaller, getSetupState, resetSetup } from '../os/installer';
import { gpuSeat } from './glbParts';
import { BOARD, CASE, COLORS, DEFAULT_CAMERA, DESK, EXPLODE_VECTORS, MONITOR_CAMERA, MOUNTS, SEPARATE_FACTOR, TRAY, VIEW_PRESETS } from './layout';
import type { ViewPresetId } from './layout';
import type { FlagVisuals, PCSceneCallbacks, PartVisuals, PeripheralKind, SceneQuality } from './visualTypes';
import { COMPONENT_IDS, copySimulation, isInstalled, MACHINE_FLAGS } from '../types';
import type { ComponentId, MachineFlag, SimulationState } from '../types';

// ======================================================================
// الثوابت
// ======================================================================

/** رسالة الخطأ الموحدة (غياب WebGL أو فشل إنشاء المُصيِّر) */
const WEBGL_ERROR_AR =
  'متصفحك لا يدعم WebGL — لن يمكن عرض المشهد ثلاثي الأبعاد. استخدم متصفحًا حديثًا أو فعّل تسريع العتاد.';

const PANEL_OPEN_ANGLE = -1.75; // فتح الغطاء الجانبي ≈100° حول المفصلة الخلفية
const LATCH_OPEN_ANGLE = -0.9;  // مزلاج PCIe — حول Y (افتراض محور موثق)
const CLIP_OPEN_ANGLE = 0.7;    // مزالج RAM — حول Z بإشارة متناوبة للطرفين
const LEVER_OPEN_ANGLE = -1.1;  // رافعة مقبس CPU — حول Y
const SCREW_LIFT = 0.06;        // إزاحة البرغي عند فكّه
const SCREW_SPIN = 0.6;         // دوران طفيف للبرغي المفكوك
const PLUG_PULL = 0.12;         // سحب القابس على -X عند الفصل
const LERP_RATE = 8;            // معدل الاقتراب الأسي للمواضع في حلقة الرسم
const HIGHLIGHT_HEX = 0x84cc16; // لون إبراز المكوّن المحدد (أخضر ليموني واضح)
const HIGHLIGHT_INTENSITY = 0.55;
const ENV_INTENSITY = 0.55;     // شدة الإضاءة البيئية (IBL) — توازن مع الأضواء المباشرة
const TONE_EXPOSURE = 1.38;     // تعريض النغمة السينمائية
const LED_INTENSITY = 1.2;      // شدة توهج لمبة الطاقة
const CLICK_MAX_DIST_SQ = 36;   // (6px)² — أقصى مسافة بين down/up تُعد نقرة
const DRAG_START_DIST_SQ = 64;  // (8px)² — أقل حركة لتحويل الضغط إلى سحب قطعة
const HOVER_THROTTLE_MS = 100;  // أقصى معدل لفحص التحويم
const MONITOR_REDRAW_MS = 400;  // معدل إعادة رسم نسيج الشاشة الافتراضية
const DAMAGED_HEX = 0xef4444;   // لون توهج القطعة التالفة تدريبيًا

/** نتيجة التقاط النقرة: قطعة PC أو طرفية أو نقطة فعالة (برغي/مزلاج/أداة/زر) */
type PickedInfo =
  | { type: 'part'; id: ComponentId }
  | { type: 'periph'; kind: PeripheralKind; detail?: string }
  | { type: 'flag'; flag: MachineFlag }
  | { type: 'tool'; tool: BenchTool }
  | { type: 'powerButton' }
  | null;

/** منطقة إفلات قطعة مسحوبة */
export type DropZone = 'tray' | 'case' | null;

/** الحالات التي يجوز فيها سحب القطعة بالماوس (وضع الفك/التركيب — توجيه v3 أ.2) */
const DRAGGABLE: ReadonlySet<string> = new Set(['separated', 'removed', 'awaiting']);

// ======================================================================
// الأنواع الداخلية
// ======================================================================

/** الحالة الحركية الداخلية لكل مكوّن */
interface DynamicPart {
  group: THREE.Group;
  basePos: THREE.Vector3;       // موضع التثبيت (من MOUNTS)
  baseRot: THREE.Euler;         // الدوران المرجعي عند التثبيت (صفر)
  trayPos: THREE.Vector3;       // موضع الراحة على صينية القطع
  trayRot: THREE.Euler;         // دوران الراحة على الصينية
  explodeVec: THREE.Vector3;    // اتجاه العرض التفجيري
  targetPos: THREE.Vector3;     // الهدف الحالي (تقترب عليه الحلقة)
  targetRot: THREE.Euler;       // الهدف الدوراني الحالي
  targetQuat: THREE.Quaternion; // نسخة Quaternion من targetRot (للـ slerp)
}

/** برغي مع محور إزاحته وقيمه الأصلية */
interface ScrewRec {
  obj: THREE.Object3D;
  basePos: THREE.Vector3;
  baseRotZ: number;
  axis: 'x' | 'y';
  delta: number;
}

/** مزلاج RAM مع اتجاه فتحه (متناوب بين الطرفين) */
interface ClipRec {
  obj: THREE.Object3D;
  baseRotZ: number;
  sign: 1 | -1;
}

/** جسم يدور حول محور واحد (مزلاج PCIe / رافعة CPU) */
interface AxisRec {
  obj: THREE.Object3D;
  baseRot: number; // القيمة الأصلية للمحور Y
}

/** قابس يُسحب على -X عند فصل موصّله */
interface PlugRec {
  flag: MachineFlag;
  obj: THREE.Object3D;
  baseX: number;
}

/** تنعيم كاميرا جارٍ (يُستكمل في حلقة الرسم) */
interface CamTween {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  dur: number;
}

/** قيم مادة الهيكل الأصلية قبل تطبيق الشفافية */
interface SavedMaterial {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/** قيم emissive الأصلية قبل الإبراز */
interface SavedEmissive {
  hex: number;
  intensity: number;
}

// ======================================================================
// (1) فحص توفر WebGL
// ======================================================================

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** تخلّص من مادة وكل خرائطها النسيجية (يُستخدم في dispose) */
function disposeMaterial(mat: THREE.Material): void {
  for (const value of Object.values(mat) as unknown[]) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  mat.dispose();
}

// ======================================================================
// (2..17) الصنف الرئيسي
// ======================================================================

export class PCScene {
  // ---- حالة الصحة ----
  failed = false;
  disposed = false;

  // ---- مراجع أساسية (تهيئة حتمية بعد نجاح البناء؛ الدوال العامة محمية بـ blocked) ----
  private quality: SceneQuality;
  private callbacks: PCSceneCallbacks;
  private container: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private visuals!: PartVisuals;
  private dirLight: THREE.DirectionalLight | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // ---- حالة القطع ----
  private parts!: Record<ComponentId, DynamicPart>;

  // ---- سجلات الأعلام (تُلتقط مرة عند البناء مع القيم الأصلية) ----
  private latchRec: AxisRec | null = null;
  private leverRec: AxisRec | null = null;
  private clipRecs: ClipRec[] = [];
  private screwMap = new Map<MachineFlag, ScrewRec[]>();
  private plugRecs: PlugRec[] = [];

  // ---- أهداف الحركة وحالة العرض ----
  private panelTarget = 0;
  private exploded = false;
  private xrayOn = false;
  private isolatedId: ComponentId | null = null;
  private highlightedId: ComponentId | null = null;
  private lastState: SimulationState | null = null;
  private camTween: CamTween | null = null;

  // ---- الشاشة الافتراضية والطرفيات ----
  private painter: ScreenPainter | null = null;
  private bootStartedAt: number | null = null;
  private notepad = '';
  private lastMonitorDrawAt = 0;
  private monitorCableGroup: THREE.Object3D | null = null;

  // ---- V6: النظام الافتراضي + منظومة المراوح + وضع التحكم بالشاشة ----
  private vos: VirtualOS | null = null;
  private fans: FanSystem | null = null;
  private focusMode = false;
  private savedCam: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private thermalAccum = 0;
  private fanConditions: import('./fans').FanConditions | null = null; // (إصلاح تدقيق V6) كائن معاد استخدامه — لا تخصيص لكل إطار
  private readonly _screenNdc = new THREE.Vector2();
  // (v9) مستوى سطح العرض اللانهائي: إدخال الماوس في وضع الشاشة يُحسب على المستوى
  // نفسه (لا على الشبكة) — المؤشر الافتراضي يلتصق بالحواف بدل أن يتوقف، كشاشة حقيقية
  private readonly _screenPlane = new THREE.Plane();
  private readonly _planeHit = new THREE.Vector3();
  private readonly _planeNormal = new THREE.Vector3();
  private readonly _planeCenter = new THREE.Vector3();
  private readonly _localPt = new THREE.Vector3();
  private readonly _invMat = new THREE.Matrix4();
  private readonly _screenQuat = new THREE.Quaternion();
  /** آخر موضع حقيقي للمؤشر (لتزامن المؤشر الافتراضي عند دخول وضع الشاشة) */
  private lastPointerX = 0;
  private lastPointerY = 0;

  // ---- توهج القطع التالفة (استعادة مستقلة عن الإبراز) ----
  private damagedOriginals = new Map<THREE.MeshStandardMaterial, SavedEmissive>();
  private damagedIds = new Set<ComponentId>();

  // ---- خرائط استعادة القيم الأصلية ----
  private emissiveOriginals = new Map<THREE.MeshStandardMaterial, SavedEmissive>();
  private shellOriginals = new Map<THREE.Material, SavedMaterial>();

  // ---- مخازن مؤقتة مُعاد استخدامها (منع الإنشاء داخل الحلقة) ----
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _v1 = new THREE.Vector3();
  private readonly _v2 = new THREE.Vector3();
  private rafId = 0;

  // ---- حالة المؤشر ----
  private downX = 0;
  private downY = 0;
  private pointerDownActive = false;
  private lastHoverAt = 0;

  // ---- سحب القطع بالماوس الحقيقي (وضع الفك/التركيب — توجيه v3 أ.2) ----
  private dragEnabled = false;
  private pendingDrag: { id: ComponentId; startX: number; startY: number } | null = null;
  private dragId: ComponentId | null = null;
  private dragPlane = new THREE.Plane();
  private dragOffset = new THREE.Vector3();
  private dragGrabbed = false;

  // ---- (V8) أداة المقعد + حركة فك/تثبيت البراغي ----
  private activeTool: BenchTool = 'hand';
  private readonly hitProxyMat = new THREE.MeshBasicMaterial({ visible: false });
  private screwAnims = new Map<ScrewRec, { out: boolean; t: number }>();
  private flagPrev: Record<MachineFlag, boolean> | null = null;

  constructor(init: { container: HTMLDivElement; quality: SceneQuality; callbacks: PCSceneCallbacks }) {
    this.container = init.container;
    this.quality = init.quality;
    this.callbacks = init.callbacks;

    // (1) فحص WebGL قبل أي شيء — عند الفشل نعلّم failed ونبلّغ دون بناء
    if (!isWebGLAvailable()) {
      this.fail(WEBGL_ERROR_AR);
      return;
    }

    try {
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);

      // (2) المُصيِّر — نغمة سينمائية ACES لدرجات لون واقعية
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setClearColor(COLORS.bg);
      renderer.shadowMap.enabled = this.quality !== 'low';
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = TONE_EXPOSURE;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      this.renderer = renderer;
      // الحاوية position:relative يديرها الاستدعاء — اللوحة تملأها بالكامل
      this.container.appendChild(renderer.domElement);

      // (3) المشهد والكاميرا والتحكم المداري
      this.scene = new THREE.Scene();
      // خريطة بيئية (IBL) عبر PMREM — تجعل المعادن تعكس مثل الواقع بدل أن تبدو سوداء
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = ENV_INTENSITY;
      pmrem.dispose();
      this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
      this.camera.position.set(...DEFAULT_CAMERA.pos);
      this.controls = new OrbitControls(this.camera, renderer.domElement);
      this.controls.target.set(...DEFAULT_CAMERA.target);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 2.2;
      this.controls.maxDistance = 22;
      this.controls.maxPolarAngle = 1.45;
      this.controls.update();
      // (V8.1) حجز الأزيموت ديناميكيًا: الكاميرا تبقى داخل الورشة ولا تعبر جدار المكتب
      // (تجربة فني حقيقي — لا خروج من الغرفة إلى الفراغ خلف الجدار)
      this.controls.addEventListener('change', () => {
        const dist = this.camera.position.distanceTo(this.controls.target);
        const cosMin = THREE.MathUtils.clamp(
          (DESK.minZ + 0.9 - this.controls.target.z) / Math.max(dist, 0.001),
          -1, 0.35,
        );
        const azMax = Math.acos(cosMin);
        this.controls.minAzimuthAngle = -azMax;
        this.controls.maxAzimuthAngle = azMax;
      });
      // تفاعل المستخدم يلغي أي تنعيم كاميرا جارٍ
      this.controls.addEventListener('start', () => {
        this.camTween = null;
      });

      // (4) البيئة ثم القطع — بنداءات المصنع المتفق عليها
      buildEnvironment(this.scene, this.quality);
      const visuals = buildAllParts(this.quality);
      this.scene.add(visuals.root);
      this.visuals = visuals;

      // ضوء اتجاهي (أضافه buildEnvironment) للتحكم به عند تبديل الظلال
      this.scene.traverse((obj) => {
        if (!this.dirLight && obj instanceof THREE.DirectionalLight) this.dirLight = obj;
      });

      // تسجيل المعرفات دفاعيًا (المصنع يفعل ذلك عادةً — إعادة النداء غير ضارة)
      for (const id of COMPONENT_IDS) setComponentId(visuals.dynamic[id], id);
      setComponentId(visuals.caseShell, 'case');
      setComponentId(visuals.sidePanel, 'case');

      this.initDynamicState(visuals);
      this.initFlagRecords(visuals);
      // (V8) طاولة الصيانة الحقيقية: كيبورد/فأرة/أزرار فيزيائية/مواد استهلاكية
      // ثم وسم نقاط الالتقاط — كل برغي ومزلاج وقابس وزر صار قابلاً للنقر المباشر
      buildBenchAdditions(visuals.root, this.quality);
      this.tagHotspots(visuals);
      this.addHitProxies(visuals);
      this.visuals.sidePanel.userData['flagTarget'] = 'panelOpen';

      // (الجلسة 4 / V6) الشاشة الافتراضية: نسيج ديناميكي + النظام الافتراضي التفاعلي
      this.painter = createScreenPainter();
      if (this.painter) {
        const screenMesh = visuals.monitor.getObjectByName('monitor-screen');
        if (screenMesh instanceof THREE.Mesh) {
          const smat = screenMesh.material;
          if (!Array.isArray(smat) && 'map' in smat) {
            (smat as THREE.MeshBasicMaterial).map = this.painter.texture;
            (smat as THREE.MeshBasicMaterial).color.set(0xffffff);
            (smat as THREE.MeshBasicMaterial).needsUpdate = true;
          }
        }
        this.drawMonitor(true);
      }
      this.monitorCableGroup = visuals.monitor.getObjectByName('monitor-cable') ?? null;

      // (V6-B/C) النظام الافتراضي على سطح الشاشة المجسمة — نفس كانفس الرسّام
      if (this.painter) {
        const canvas = (this.painter.texture as THREE.CanvasTexture).image as HTMLCanvasElement;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          // (v9) فضاء VOS المنطقي 1024×576 — يطابق تحويل المقياس الأساسي للكانفس
          this.vos = new VirtualOS(ctx, SCREEN_LOGICAL_W, SCREEN_LOGICAL_H);
          registerVosApps(this.vos);
          this.wireVosCallbacks();
        }
      }

      // (V6 §3) منظومة المراوح المستقلة لكل مروحة
      this.fans = new FanSystem(visuals);

      // أصل حقيقي CC0 (Poly Haven): مسح لوحة دوائر كأساس PCB واقعي + مفك تدريبي
      this.loadRealAssets(visuals);

      // (7)(15) مستمعو المؤشر + مراقب الحجم
      renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
      renderer.domElement.addEventListener('pointerup', this.onPointerUp);
      renderer.domElement.addEventListener('pointermove', this.onPointerMove);
      renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
      renderer.domElement.addEventListener('dblclick', this.onScreenDbl);
      renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.container);

      // (13) ضبط كثافة البكسل حسب الجودة (الظلال مضبوطة أعلاه بنفس القيمة)
      this.setQuality(this.quality);

      // خطاف تشخيصي للتطوير فقط (لا يتغير سلوك التطبيق)
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>)['__pcScene'] = this;
      }

      // (6) بدء حلقة الرسم
      this.rafId = requestAnimationFrame(this.tick);
      this.callbacks.onReady?.();
    } catch {
      // المعالجة نفسها: رسالة + failed=true
      this.fail(WEBGL_ERROR_AR);
    }
  }

  // ====================================================================
  // الواجهة العامة
  // ====================================================================

  /** (13) تبديل الجودة: كثافة البكسل + تشغيل/إيقاف الظلال */
  setQuality(q: SceneQuality): void {
    if (this.blocked) return;
    this.quality = q;
    this.renderer.setPixelRatio(this.pixelRatioFor(q));
    const wantShadows = q !== 'low';
    if (this.renderer.shadowMap.enabled !== wantShadows) {
      this.renderer.shadowMap.enabled = wantShadows;
      this.renderer.shadowMap.needsUpdate = true;
      if (this.dirLight) this.dirLight.castShadow = wantShadows;
      // (إصلاح تدقيق V6-G) تبديل shadowMap.enabled لا يُبطل الخامات تلقائيًا —
      // بلا إعادة بناء تبقى الظلال القديمة/الغائبة مجمدة حتى يتغير شيء آخر
      this.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.needsUpdate = true;
      });
    }
  }

  /** (10) شفافية الهيكل والغطاء (X-Ray) مع استعادة الأصول عند الإيقاف */
  setXray(on: boolean): void {
    if (this.blocked) return;
    if (this.xrayOn === on) return;
    this.xrayOn = on;
    this.refreshShellMaterials();
  }

  /** (5) تشغيل/إيقاف العرض التفجيري — يعيد حساب الأهداف من آخر حالة متزامنة */
  setExploded(on: boolean, animate?: boolean): void {
    if (this.blocked) return;
    this.exploded = on;
    this.recomputeTargets();
    if (animate === false) this.snapToTargets();
  }

  /** (5) مزامنة حالة المحاكاة: أهداف الحركة (تنعيم) + تطبيق الأعلام فورًا */
  syncState(s: SimulationState): void {
    if (this.blocked) return;
    // نسخة دفاعية حتى لا تؤثر طفرات المتصل على أهدافنا
    this.lastState = copySimulation(s);
    this.recomputeTargets();
    this.applyFlags(s.flags, true);
    this.updateRuntimeVisuals(s);
    this.drawMonitor(true);
  }

  /** ساعة التمهيد: يضبطها المتجر لحظة ضغط زر التشغيل/الإطفاء */
  setBootClock(startedAt: number | null): void {
    if (this.blocked) return;
    this.bootStartedAt = startedAt;
    this.drawMonitor(true);
  }

  /** نص دفتر الملاحظات الافتراضي — يُكتب الآن من حقل إدخال حقيقي في الواجهة (توجيه v3 أ.2)
   *  (V6-B): النص يُوجَّه إلى تطبيق «المفكرة» داخل النظام الافتراضي على الشاشة المجسمة */
  setNotepad(text: string): void {
    if (this.blocked) return;
    this.notepad = text;
    if (this.vos) {
      let win = this.vos.windows.find((w) => w.appId === 'notepad');
      if (!win && text.length > 0) {
        win = this.vos.openApp('notepad') ?? undefined;
      }
      if (win) {
        win.state['text'] = text;
        this.vos.dirty = true;
      }
    }
    this.drawMonitor(true);
  }

  /** (V6 §3) إظهار/إخفاء أسهم تدفق الهواء — نسخة منظومة المراوح لكل مروحة */
  setAirflow(on: boolean): void {
    if (this.blocked) return;
    this.fans?.setArrowsVisible(on);
  }

  /** توجيه الكاميرا نحو الشاشة الافتراضية */
  focusMonitor(): void {
    if (this.blocked) return;
    this.startCamTween(new THREE.Vector3(...MONITOR_CAMERA.pos), new THREE.Vector3(...MONITOR_CAMERA.target), 0.7);
  }

  // ====================================================================
  // (V6-B) وضع التحكم بالشاشة المجسمة — إدخال حقيقي عبر Raycast + UV
  // ====================================================================

  /** هل وضع التحكم بالشاشة نشط؟ */
  isFocusMode(): boolean {
    return this.focusMode;
  }

  /** تفعيل/إنهاء وضع التحكم بالشاشة: أولوية الإدخال تنتقل إلى النظام الافتراضي */
  setFocusMode(on: boolean): void {
    if (this.blocked || !this.vos) return;
    if (on === this.focusMode) return;
    const screen = this.visuals.monitor.getObjectByName('monitor-screen');
    if (!(screen instanceof THREE.Mesh)) return;
    this.focusMode = on;
    this.vos.cursor.visible = on;
    this.controls.enabled = !on;
    if (on) {
      // (v9) بناء مستوى سطح العرض من تحويله العالمي — مصدر الإدخال خلال الجلسة كلها
      screen.updateMatrixWorld(true);
      this._planeNormal.set(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion())).normalize();
      this._planeCenter.setFromMatrixPosition(screen.matrixWorld);
      this._screenPlane.setFromNormalAndCoplanarPoint(this._planeNormal, this._planeCenter);
      // تأطير الشاشة: مسافة تحسب من أبعاد السطح الفعلية وزاوية الرؤية
      // (v9) هامش 1.18 + إزاحة رأسية 0.3 — الشاشة تظهر أعلى المنتصف بعيدًا عن رصيف الأدوات السفلي
      this.savedCam = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
      const box = new THREE.Box3().setFromObject(screen);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const fov = THREE.MathUtils.degToRad(this.camera.fov);
      const aspect = Math.max(0.4, this.camera.aspect);
      const distW = size.x / 2 / (Math.tan(fov / 2) * aspect);
      const distH = size.y / 2 / Math.tan(fov / 2);
      // (v9 ضبط) هامش 1.29 + إزاحة +0.33 أعلى المركز: توجيه الكاميرا أعلى مركز الشاشة
      // ينزل المشهد في الإطار — أعلى النظام الافتراضي (وشرط عناوين النوافذ) يظهر
      // تحت الشارة مباشرة ويصبح قابلاً للإمساك بالسحب
      const dist = Math.max(distW, distH) * 1.29;
      const camPos = center.clone().addScaledVector(this._planeNormal, dist);
      camPos.y += 0.33;
      const aim = center.clone();
      aim.y += 0.33;
      this.startCamTween(camPos, aim, 0.55);
      this.renderer.domElement.style.cursor = 'none';
      // (v9) تزامن المؤشر الافتراضي مع موضع ماوس المستخدم الحقيقي لحظة الدخول
      const entry = this.screenPlaneHit(this.lastPointerX, this.lastPointerY);
      if (entry) this.vos.pointer('move', entry.x, entry.y);
      this.vos.dirty = true;
      this.callbacks.onFocusMode?.(true);
    } else {
      if (this.savedCam) {
        this.startCamTween(this.savedCam.pos, this.savedCam.target, 0.5);
        this.savedCam = null;
      }
      this.renderer.domElement.style.cursor = '';
      this.callbacks.onFocusMode?.(false);
    }
    this.drawMonitor(true);
  }

  /** توجيه مفتاح لوحة المفاتيح الحقيقي إلى النظام الافتراضي — يعيد true إن استُهلك */
  handleMonitorKey(ev: { key: string; code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
    if (!this.focusMode || !this.vos) return false;
    if (ev.key === 'Escape' || ev.code === 'Escape') {
      // (V6-G عقد مع VirtualOS) إن كان النظام الافتراضي يملك تركيز الكتابة
      // (حقل إدخال نشط) يُمرَّر Escape إليه أولًا (إغلاق حوار/إنهاء إدخال)
      // ولا يخرج من وضع الشاشة — الاختيارية تجعل الكود صالحًا قبل وصول الدالة
      const v = this.vos as unknown as { hasKeyboardFocus?: () => boolean };
      if (v?.hasKeyboardFocus?.()) {
        this.vos.key({ key: ev.key, code: ev.code, ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey });
        this.drawMonitor(true);
        return true;
      }
      // الخروج الآمن من وضع الشاشة (توجيه §4.3)
      this.setFocusMode(false);
      return true;
    }
    this.vos.key({ key: ev.key, code: ev.code, ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey });
    this.drawMonitor(true);
    return true;
  }

  /** تحويل نقطة شاشة المتصفح إلى إحداثيات سطح العرض (UV → بكسل) — null إن لم يصب السطح */
  private screenHit(clientX: number, clientY: number): { x: number; y: number } | null {
    const screen = this.visuals.monitor.getObjectByName('monitor-screen');
    if (!(screen instanceof THREE.Mesh)) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 1;
    const h = rect.height > 0 ? rect.height : 1;
    this._screenNdc.set(((clientX - rect.left) / w) * 2 - 1, -((clientY - rect.top) / h) * 2 + 1);
    this.raycaster.setFromCamera(this._screenNdc, this.camera);
    const hits = this.raycaster.intersectObject(screen, false);
    if (hits.length === 0 || hits[0].uv === undefined) return null;
    if (!this.vos) return null; // (إصلاح تدقيق V6) حارس: كان غير آمن null هنا
    const uv = hits[0].uv!;
    // PlaneGeometry: (0,0) أسفل-يسار — الكانفس: (0,0) أعلى-يسار ⇒ قلب Y فقط
    return { x: uv.x * this.vos.W, y: (1 - uv.y) * this.vos.H };
  }

  /**
   * (v9) إدخال وضع الشاشة على مستوى العرض اللانهائي — يقيد الإحداثية داخل الشاشة
   * بدل أن يتوقف المؤشر عند حدود الشبكة: سحب النوافذ والمؤشر يتصرفان كشاشة حقيقية.
   * المستوى يُشتق من تحويل الشبكة الحالية في كل نداء — يحمي من استبدال المونيتور
   * غير المتزامن (glbParts) بعد دخول وضع الشاشة.
   * يعيد null فقط إذا فشل تقاطع الشعاع مع المستوى (شعاع موازٍ/خلفي).
   */
  private screenPlaneHit(clientX: number, clientY: number): { x: number; y: number; inside: boolean } | null {
    if (!this.vos) return null;
    const screen = this.visuals.monitor.getObjectByName('monitor-screen');
    if (!(screen instanceof THREE.Mesh)) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 1;
    const h = rect.height > 0 ? rect.height : 1;
    this._screenNdc.set(((clientX - rect.left) / w) * 2 - 1, -((clientY - rect.top) / h) * 2 + 1);
    this.raycaster.setFromCamera(this._screenNdc, this.camera);
    // (v9) مستوى طازج من تحويل الشبكة الحالية — يلغي أي حالة قديمة بعد إعادة بناء المونيتور
    screen.updateMatrixWorld(true);
    this._planeNormal.set(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(this._screenQuat)).normalize();
    this._planeCenter.setFromMatrixPosition(screen.matrixWorld);
    this._screenPlane.setFromNormalAndCoplanarPoint(this._planeNormal, this._planeCenter);
    const point = this.raycaster.ray.intersectPlane(this._screenPlane, this._planeHit);
    if (!point) return null;
    // إلى الفضاء المحلي لسطح الشاشة (مركز الهندسة = أصل محلي للـ PlaneGeometry)
    this._invMat.copy(screen.matrixWorld).invert();
    this._localPt.copy(point).applyMatrix4(this._invMat);
    // (v9 إصلاح) تحويل الوحدات: المحلي بوحدات العالم (±نصف عرض السطح) بينما VOS بالبكسل —
    // النسبة من أبعاد هندسة PlaneGeometry الفعلية هي الجسر الصحيح بين الفضاءين
    const params = (screen.geometry as THREE.PlaneGeometry).parameters;
    const planeW = params?.width ?? (screen.geometry.boundingBox?.max.x ?? 0.5) * 2;
    const planeH = params?.height ?? (screen.geometry.boundingBox?.max.y ?? 0.5) * 2;
    const inside = Math.abs(this._localPt.x) <= planeW / 2 && Math.abs(this._localPt.y) <= planeH / 2;
    // محلي (‑w/2..w/2) → منطقي (0..W) — الارتفاع يُقلب (أسفل الكانفس = ‑h/2 محليًا)
    const x = THREE.MathUtils.clamp((this._localPt.x / planeW + 0.5) * this.vos.W, 0, this.vos.W - 1);
    const y = THREE.MathUtils.clamp((0.5 - this._localPt.y / planeH) * this.vos.H, 0, this.vos.H - 1);
    return { x, y, inside };
  }

  /** تقرير منظومة المراوح (للواجهة التعليمية) */
  getFanReport(): ReturnType<FanSystem['report']> {
    return this.fans?.report() ?? [];
  }

  /** تقرير جلوس البطاقة على الشق (V6-A) */
  getGpuSeat(): typeof gpuSeat {
    return gpuSeat;
  }

  /** النظام الافتراضي (للاختبارات الواجهية فقط) */
  getVos(): VirtualOS | null {
    return this.vos;
  }

  /** منظير جاهز: أمامي/جانبي/علوي (أزرار المشهد + اختصارات 1/2/3) */
  setViewPreset(id: ViewPresetId): void {
    if (this.blocked) return;
    const preset = VIEW_PRESETS[id];
    this.startCamTween(new THREE.Vector3(...preset.pos), new THREE.Vector3(...preset.target), 0.6);
  }

  /** تكبير/إبعاد خطوتين نحو الهدف (أزرار — بديل العجلة للمس/إمكانية الوصول) */
  zoomStep(sign: 1 | -1): void {
    if (this.blocked) return;
    const dir = this._v1.copy(this.camera.position).sub(this.controls.target);
    const dist = THREE.MathUtils.clamp(dir.length() * (sign > 0 ? 0.78 : 1.28), this.controls.minDistance, this.controls.maxDistance);
    dir.setLength(dist).add(this.controls.target);
    this.startCamTween(dir, this.controls.target.clone(), 0.3);
  }

  /** تفعيل سحب القطع بالماوس (وضع الفك/التركيب) — توجيه v3 أ.2/§5 */
  setDragEnabled(on: boolean): void {
    if (this.blocked) return;
    this.dragEnabled = on;
    if (!on) this.cancelDrag();
  }

  /** (V8) الأداة في يد الفني: اليد تنفّد المزالج والقوابس، والمفك وحده يفك البراغي */
  setActiveTool(tool: BenchTool): void {
    if (this.blocked) return;
    this.activeTool = tool;
    this.renderer.domElement.style.cursor = tool === 'screwdriver' ? 'crosshair' : '';
  }

  getActiveTool(): BenchTool {
    return this.activeTool;
  }

  /** (8) إبراز مكوّن بتعديل emissive — إبراز واحد نشط في كل مرة */
  highlight(id: ComponentId | null): void {
    if (this.blocked) return;
    if (this.highlightedId === id) return;
    const previous = this.highlightedId;
    this.highlightedId = id;
    if (previous !== null) this.restoreHighlight();
    if (id === null) return;
    this.parts[id].group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (Array.isArray(mat) || !('emissive' in mat)) return;
      const std = mat as THREE.MeshStandardMaterial;
      // نلتقط الأصل **مرة واحدة لكل مادة مشتركة** (توجيه v4: المفاتيح بالمواد لا
      // بالشبكات — الشبكات تتشارك خامات مخزّنة، والحفظ لكل شبك كان يلتقط قيمة
      // خضراء مطليّة حديثًا كـ«أصل» فلا يُستعاد الإبراز أبدًا)
      if (!this.emissiveOriginals.has(std)) {
        this.emissiveOriginals.set(std, { hex: std.emissive.getHex(), intensity: std.emissiveIntensity });
      }
      std.emissive.setHex(HIGHLIGHT_HEX);
      std.emissiveIntensity = HIGHLIGHT_INTENSITY;
    });
  }

  /** (9) عزل مكوّن: إظهاره وحده مع هيكل شبه شفاف — null يعيد الجميع */
  isolate(id: ComponentId | null): void {
    if (this.blocked) return;
    if (this.isolatedId === id) return;
    this.isolatedId = id;
    for (const cid of COMPONENT_IDS) this.parts[cid].group.visible = cid === id;
    // الهيكل يبقى ظاهرًا (شبه شفاف عند عزل مكوّن داخلي، معتمًا عند عزل الهيكل نفسه)
    this.visuals.caseShell.visible = true;
    this.visuals.sidePanel.visible = id === 'case' || id === null;
    this.refreshShellMaterials();
  }

  /** (11) إعادة الكاميرا إلى الوضع الافتراضي خلال 0.6 ثانية */
  resetCamera(): void {
    if (this.blocked) return;
    const toPos = new THREE.Vector3(...DEFAULT_CAMERA.pos);
    const toTarget = new THREE.Vector3(...DEFAULT_CAMERA.target);
    this.startCamTween(toPos, toTarget, 0.6);
  }

  /** (12) تقرّب الكاميرا نحو مكوّن: الهدف مركز المجموعة والمسافة 3.2 خلال 0.5 ثانية */
  focusComponent(id: ComponentId): void {
    if (this.blocked) return;
    const center = this.parts[id].group.getWorldPosition(this._v2);
    const dir = this._v1.copy(this.camera.position).sub(center);
    if (dir.lengthSq() < 1e-8) dir.set(-1, 0.35, 1); // اتجاه احتياطي إذا تطابقت النقطة
    dir.normalize().multiplyScalar(3.2).add(center);
    this.startCamTween(this._v1, this._v2, 0.5);
  }

  /** (14) إتلاف كامل: إيقاف الحلقة، فصل المستمعين، تحرير الهندسات والمواد، إزالة اللوحة */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== 0) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.controls?.dispose();
    const dom = this.renderer?.domElement;
    if (dom) {
      dom.removeEventListener('pointerdown', this.onPointerDown);
      dom.removeEventListener('pointerup', this.onPointerUp);
      dom.removeEventListener('pointermove', this.onPointerMove);
      dom.removeEventListener('wheel', this.onWheel);
      dom.removeEventListener('dblclick', this.onScreenDbl);
      dom.removeEventListener('contextmenu', this.onContextMenu);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.scene) {
      this.scene.traverse((obj) => {
        const maybeMesh = obj as THREE.Mesh;
        if (maybeMesh.geometry) maybeMesh.geometry.dispose();
        const mat: THREE.Material | THREE.Material[] | undefined = maybeMesh.material;
        if (Array.isArray(mat)) {
          for (const m of mat) disposeMaterial(m);
        } else if (mat) {
          disposeMaterial(mat);
        }
      });
      if (this.scene.environment instanceof THREE.Texture) this.scene.environment.dispose();
      if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    }
    this.renderer?.dispose();
    dom?.remove();
    // (إصلاح تدقيق V6) تنظيف الخطاف التطويري — كان يبقي مرجعًا لمشهد مُستبعد
    delete (window as unknown as Record<string, unknown>)['__pcScene'];
    this.emissiveOriginals.clear();
    this.shellOriginals.clear();
    this.damagedOriginals.clear();
    this.painter?.dispose();
    this.painter = null;
  }

  // ====================================================================
  // الخاصة — الحلقة والحركة
  // ====================================================================

  private get blocked(): boolean {
    return this.failed || this.disposed;
  }

  private fail(messageAr: string): void {
    this.failed = true;
    this.callbacks.onError?.(messageAr);
  }

  /** (6) حلقة الرسم: مراوح، اقتراب القطع، تنعيم الغطاء/الكاميرا، النظام الافتراضي، ثم الرسم */
  private readonly tick = (): void => {
    if (this.disposed || this.failed) return;
    this.rafId = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05); // حماية من قفزات التبويبات الخاملة
    const k = 1 - Math.exp(-LERP_RATE * dt);

    // (V6 §3) منظومة المراوح: سرعات ودوران كل ريش على محوره الصحيح + الحرارة المُحاكاة
    if (this.fans && this.lastState) {
      const s = this.lastState;
      const powered = s.flags.powerOn && s.flags.acConnected && !s.peripherals.psuDead;
      // (إصلاح تدقيق V6) الأحمال مشتقة من الحالة والحرارة المُحاكاة — كانت ثوابت مكتوبة يدويًا
      // حلقة تغذية راجعة تعليمية: غياب التبريد يرفع الحرارة فيرفع الأحمال فيتسارع ما تبقى من مراوح
      const heatCpu = Math.min(1, Math.max(0, (s.thermal.cpuTempC - 50) / 45));
      const heatGpu = Math.min(1, Math.max(0, (s.thermal.gpuTempC - 50) / 40));
      if (!this.fanConditions) this.fanConditions = { powered: false, cpuCoolerOk: false, gpuOk: false, caseFansOk: false, psuOk: false, cpuLoad: 0, gpuLoad: 0 };
      const conditions = this.fanConditions;
      conditions.powered = powered;
      conditions.cpuCoolerOk = isInstalled(s.parts.cooler) && !s.flags.fanHeadersDisconnected;
      conditions.gpuOk = isInstalled(s.parts.gpu) && isInstalled(s.parts.gpuPower);
      conditions.caseFansOk = isInstalled(s.parts.fans) && !s.flags.fanHeadersDisconnected;
      conditions.psuOk = powered;
      conditions.cpuLoad = powered ? Math.min(1, 0.35 + 0.65 * heatCpu) : 0;
      conditions.gpuLoad = powered && conditions.gpuOk ? Math.min(1, 0.3 + 0.7 * heatGpu) : 0;
      this.fans.update(dt, conditions);

      // الحرارة المُحاكاة (بيانات تعليمية معلنة): ترتفع بلا مبرد/بلا مراوح وتقترب من الهدف
      this.thermalAccum += dt;
      if (this.thermalAccum >= 1) {
        this.thermalAccum = 0;
        const cpuTarget = !powered ? 26 : isInstalled(s.parts.cooler) ? (s.flags.fanHeadersDisconnected ? 86 : 46) : 97;
        const gpuTarget = !powered ? 26 : conditions.gpuOk ? 52 : isInstalled(s.parts.gpu) ? 84 : 26;
        const cpu = THREE.MathUtils.lerp(s.thermal.cpuTempC, cpuTarget, 0.18);
        const gpu = THREE.MathUtils.lerp(s.thermal.gpuTempC, gpuTarget, 0.18);
        this.callbacks.onThermal?.(cpu, gpu);
        // إطفاء حراري تعليمي عند تجاوز الحد (فصّل التبريد = الجهاز ينطفئ)
        if (cpu >= 95.5 && powered) this.callbacks.onThermalShutdown?.(cpu);
      }
    }

    // اقتراب القطع نحو أهدافها (الموضع lerp والدوران slerp) — عدا الهيكل الثابت
    for (const id of COMPONENT_IDS) {
      if (id === 'case') continue;
      const part = this.parts[id];
      part.group.position.lerp(part.targetPos, k);
      part.group.quaternion.slerp(part.targetQuat, k);
    }

    // تطفو القطعة الملتقطة (awaiting) فوق الصينية بلطف — إشارة بصرية لجاهزية التركيب
    const elapsed = this.clock.getElapsedTime();
    for (const id of COMPONENT_IDS) {
      if (id === 'case') continue;
      if (this.lastState && this.lastState.parts[id] === 'awaiting' && this.dragId !== id) {
        const part = this.parts[id];
        part.group.position.y = part.trayPos.y + 0.16 + Math.sin(elapsed * 3) * 0.04;
      }
    }

    // تنعيم دوران الغطاء الجانبي نحو الهدف
    const panel = this.visuals.sidePanel;
    panel.rotation.y += (this.panelTarget - panel.rotation.y) * k;

    // (V8) استكمال حركة فك/تثبيت البراغي — لفّة ورفعة ناعمة بدل القفز المفاجئ
    if (this.screwAnims.size > 0) {
      for (const [rec, anim] of this.screwAnims) {
        anim.t = Math.min(1, anim.t + dt / 0.38);
        const kk = PCScene.easeInOut(anim.t);
        rec.obj.position.copy(rec.basePos);
        rec.obj.position[rec.axis] += anim.out ? rec.delta * kk : rec.delta * (1 - kk);
        rec.obj.rotation.z = rec.baseRotZ + SCREW_SPIN * (anim.out ? kk : 1 - kk);
        if (anim.t >= 1) this.screwAnims.delete(rec);
      }
    }

    // استكمال تنعيم الكاميرا (resetCamera / focusComponent)
    const tween = this.camTween;
    if (tween) {
      tween.t = Math.min(tween.t + dt / tween.dur, 1);
      const eased = PCScene.easeInOut(tween.t);
      this.camera.position.lerpVectors(tween.fromPos, tween.toPos, eased);
      this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
      if (tween.t >= 1) this.camTween = null;
    }

    this.controls.update();

    // إعادة رسم نسيج الشاشة الافتراضية: (v9) في وضع التحكم بالشاشة ≈30fps للسلاسة،
    // وفي المختبر مُقيّد لتوفير الموارد
    if (this.painter) {
      const interval = this.focusMode ? 30 : MONITOR_REDRAW_MS;
      if (nowMs() - this.lastMonitorDrawAt >= interval) {
        this.drawMonitor(false);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  /** تنعيم easeInOut: t<0.5 ? 2t² : 1 − (−2t+2)²/2 */
  private static easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /** إعادة حساب أهداف القطع من آخر حالة متزامنة + علم التفجير الحالي */
  private recomputeTargets(): void {
    const parts = this.lastState?.parts;
    for (const id of COMPONENT_IDS) {
      if (id === 'case') continue;
      const part = this.parts[id];
      const status: string | undefined = parts ? parts[id] : undefined;
      if (status === 'removed' || status === 'damaged') {
        part.targetPos.copy(part.trayPos);
        part.targetRot.copy(part.trayRot);
        if (status === 'damaged') {
          // القطعة التالفة تستلقي مائلة على الصينية
          part.targetRot.z += 0.35;
        }
      } else if (status === 'awaiting') {
        // ملتقطة من الصينية — ترتفع قليلاً (وتطفو في حلقة الرسم)
        part.targetPos.copy(part.trayPos);
        part.targetPos.y += 0.16;
        part.targetRot.copy(part.trayRot);
      } else if (status === 'separated') {
        // فصل جزئي: ما زالت في موضعها مع إزاحة صغيرة نحو اتجاه الفك
        part.targetPos.copy(part.basePos);
        part.targetPos.addScaledVector(part.explodeVec, SEPARATE_FACTOR);
        part.targetRot.set(0, 0, 0);
      } else {
        part.targetPos.copy(part.basePos);
        if (this.exploded) part.targetPos.add(part.explodeVec);
        part.targetRot.set(0, 0, 0);
      }
      part.targetQuat.setFromEuler(part.targetRot);
    }
  }

  /** نسخ الأهداف فورًا إلى المجسمات (للتنعيم المعطَّل animate=false) */
  private snapToTargets(): void {
    for (const id of COMPONENT_IDS) {
      if (id === 'case') continue;
      const part = this.parts[id];
      part.group.position.copy(part.targetPos);
      part.group.quaternion.copy(part.targetQuat);
    }
    this.visuals.sidePanel.rotation.y = this.panelTarget;
  }

  /**
   * (5) تطبيق الأعلام فورًا على المجسمات الفرعية.
   * افتراضات المحاور (لأن بناء المصنع موازٍ ولم يُثبَّت بعد):
   *  - مزلاج PCIe ورافعة CPU: دوران حول Y المحلي (اللوح عمودي يواجه -X).
   *  - مزالج RAM: دوران حول Z بإشارة متناوبة بين الطرفين.
   *  - البراغي: ترتفع على +Y (مسامير اللوحة تُسحب على -X) مع دوران طفيف حول Z.
   *  - القوابس: إزاحة -X 0.12 عند الفصل.
   * كل الإزاحات نسبية إلى القيم الأصلية المحفوظة عند البناء.
   */
  private applyFlags(flags: Record<MachineFlag, boolean>, animate: boolean): void {
    // (V8) لقطة سابقة للأعلام لكشف تغيّر البراغي بين المزامنات (لتوليد حركة الفك)
    const prev = this.flagPrev;
    this.flagPrev = { ...flags };

    // الغطاء الجانبي — عبر هدف تنعيمي تتبعه الحلقة
    this.panelTarget = flags.panelOpen ? PANEL_OPEN_ANGLE : 0;
    if (!animate) this.visuals.sidePanel.rotation.y = this.panelTarget;

    // مزلاج PCIe
    if (this.latchRec) {
      this.latchRec.obj.rotation.y = this.latchRec.baseRot + (flags.pcieLatchOpen ? LATCH_OPEN_ANGLE : 0);
    }

    // مزالج RAM
    for (const clip of this.clipRecs) {
      clip.obj.rotation.z = clip.baseRotZ + (flags.ramClipsOpen ? clip.sign * CLIP_OPEN_ANGLE : 0);
    }

    // رافعة مقبس CPU
    if (this.leverRec) {
      this.leverRec.obj.rotation.y = this.leverRec.baseRot + (flags.cpuLeverOpen ? LEVER_OPEN_ANGLE : 0);
    }

    // البراغي (gpu/psu/fan/m2/mobo) — (V8) فك/تثبيت متحرك: البرغي الذي تغيّر علمه يستلم أنيميشن،
    // وما تحت أنيميشن جارٍ لا تُطبّق عليه القيمة النهائية مباشرة (الأنيميشن يملكه)
    for (const [flag, recs] of this.screwMap) {
      const out = flags[flag];
      const changed = prev ? prev[flag] !== out : false;
      for (const rec of recs) {
        if (changed) this.screwAnims.set(rec, { out, t: 0 });
        if (this.screwAnims.has(rec)) continue;
        rec.obj.position.copy(rec.basePos);
        if (out) {
          rec.obj.position[rec.axis] += rec.delta;
          rec.obj.rotation.z = rec.baseRotZ + SCREW_SPIN;
        } else {
          rec.obj.rotation.z = rec.baseRotZ;
        }
      }
    }

    // قوابس الموصلات (fan headers / front panel)
    for (const plug of this.plugRecs) {
      plug.obj.position.x = plug.baseX - (flags[plug.flag] ? PLUG_PULL : 0);
    }

    // لمبة الطاقة — مادة خاصة بها (cached) — تنطفئ مع مزود ميت
    const led = this.visuals.flags.powerLed;
    if (led) {
      const mat = led.material;
      if (!Array.isArray(mat) && 'emissive' in mat) {
        const std = mat as THREE.MeshStandardMaterial;
        const alive = flags.powerOn && !(this.lastState?.peripherals.psuDead ?? false);
        std.emissive.set(alive ? COLORS.green : 0x000000);
        std.emissiveIntensity = LED_INTENSITY;
      }
    }
  }

  // ====================================================================
  // الخاصة — مواد الهيكل (X-Ray / العزل)
  // ====================================================================

  /** إعادة حساب مواد الهيكل من الحالة المجمّعة (xray يتقدم على العزل) */
  private refreshShellMaterials(): void {
    for (const [mat, saved] of this.shellOriginals) {
      mat.opacity = saved.opacity;
      mat.transparent = saved.transparent;
      mat.depthWrite = saved.depthWrite;
    }
    this.shellOriginals.clear();
    if (this.xrayOn) {
      this.applyShellOpacity(this.visuals.caseShell, 0.12);
      this.applyShellOpacity(this.visuals.sidePanel, 0.06);
    } else if (this.isolatedId !== null && this.isolatedId !== 'case') {
      this.applyShellOpacity(this.visuals.caseShell, 0.08);
    }
  }

  /** تطبيق شفافية على مواد مجموعة (الزجاج شفاف أصلًا فيبقى كما هو) */
  private applyShellOpacity(root: THREE.Object3D, opacity: number): void {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat.transparent) continue; // الزجاج/الشفاف الأصلي لا يُمسّ
        if (!this.shellOriginals.has(mat)) {
          this.shellOriginals.set(mat, {
            opacity: mat.opacity,
            transparent: mat.transparent,
            depthWrite: mat.depthWrite,
          });
        }
        mat.transparent = true;
        mat.opacity = opacity;
        mat.depthWrite = false;
      }
    });
  }

  /** استعادة emissive الأصلي لكل شبكات الإبراز الحالي */
  private restoreHighlight(): void {
    for (const [std, saved] of this.emissiveOriginals) {
      std.emissive.setHex(saved.hex);
      std.emissiveIntensity = saved.intensity;
    }
    this.emissiveOriginals.clear();
  }

  // ====================================================================
  // الخاصة — الشاشة الافتراضية والقطع التالفة
  // ====================================================================

  /**
   * تحميل الأصول الحقيقية المرخصة CC0 (توجيه v3 §3 + v4 أ.4) — فشلها لا يعطل المشهد:
   *  1) مسح لوحة دوائر (Poly Haven — circuit_board): يستبدل وجه PCB الإجرائي للوحة الأم.
   *  2) مفك مسطّح (Poly Haven — screwdriver): أداة تدريب على سجادة القطع.
   *  3) طقم مفكات (screwdrivers_02) + كماشات (pliers): أدوات حقيقية على السجادة.
   *  4) مصباح مكتب (desk_lamp_arm_01): إضاءة مكتب واقعية فوق السجادة + ضوء نقطي دافئ.
   *  5) صندوق عدة معدني (metal_tool_chest): تحت المكتب — تفصيل ورشة.
   */
  private loadRealAssets(visuals: PartVisuals): void {
    const loader = new GLTFLoader();
    const root = visuals.root;

    // 1) أساس PCB الحقيقي — يستبدل وجه اللوحة الأمامي فقط، ويبقى الباقي إجرائيًا تفاعليًا
    loader.load(
      '/models/circuit-board/circuit_board_1k.gltf',
      (gltf) => {
        if (this.disposed || this.failed) return;
        const pcb = visuals.dynamic.motherboard.getObjectByName('mobo-pcb');
        if (!pcb) return;
        const scan = gltf.scene;
        scan.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          obj.castShadow = false;
          obj.receiveShadow = true;
          // توحيد الخامات: منع أي emissive قد يأتي من الأصل (يبقى الإبراز صادقًا)
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if ('emissiveIntensity' in m) (m as THREE.MeshStandardMaterial).emissiveIntensity = 0;
          }
        });
        // bbox الأصل (م): 0.404×0.078×0.398 — رأسيًا مُدار بحيث مكوّناته نحو -X (وجه المشاهد)
        const bbox = new THREE.Box3().setFromObject(scan);
        const size = bbox.getSize(new THREE.Vector3());
        const targetH = BOARD.yMax - BOARD.yMin;      // 3.0
        const targetD = BOARD.zMax - BOARD.zMin;      // 2.44
        scan.rotation.z = Math.PI / 2;                // +Y المحلي → -X عالمي
        scan.scale.set(
          BOARD.thickness / Math.max(size.y, 1e-6),   // سماكة اللوحة
          targetH / Math.max(size.x, 1e-6),           // ارتفاع اللوحة
          targetD / Math.max(size.z, 1e-6),           // عمق اللوحة
        );
        // إعادة قياس bbox بعد الدوران ثم تمركز اللوحة على مستوى المجموعة
        scan.updateMatrixWorld(true);
        const bbox2 = new THREE.Box3().setFromObject(scan);
        const center2 = bbox2.getCenter(new THREE.Vector3());
        scan.position.sub(center2);
        scan.position.x += BOARD.thickness * 0.18;    // بارز قليلًا نحو الوجه
        scan.name = 'mobo-real-pcb';
        pcb.add(scan);
        // إخفاء الوجه الإجرائي الأخضر (يُبقى الجسم مرجعًا للسماكة والظهر)
        if (pcb instanceof THREE.Mesh && !Array.isArray(pcb.material)) {
          pcb.material = pcb.material.clone();
          (pcb.material as THREE.MeshStandardMaterial).color.set(0x0f2a1f);
        }
      },
      undefined,
      () => {
        // فشل تحميل الأصل → يبقى PCB الإجرائي كما هو (مشهد كامل بلا انقطاع)
        console.warn('[PCScene] تعذر تحميل مسح اللوحة الحقيقي — استُخدم PCB الإجرائي');
      },
    );

    // 2) مفك تدريبي على سجادة القطع (جزء بصري ثانوي — بلا تفاعل)
    loader.load(
      '/models/screwdriver/screwdriver_1k.gltf',
      (gltf) => {
        if (this.disposed || this.failed) return;
        const tool = gltf.scene;
        const bbox = new THREE.Box3().setFromObject(tool);
        const size = bbox.getSize(new THREE.Vector3());
        const s = 1.6 / Math.max(size.y, 1e-6); // طول مستهدف ≈ 16سم
        tool.scale.setScalar(s);
        tool.updateMatrixWorld(true);
        const b2 = new THREE.Box3().setFromObject(tool);
        tool.position.set(-5.35, TRAY.tableTopY - b2.min.y, 3.7);
        tool.rotation.y = 0.15;
        tool.name = 'desk-screwdriver';
        // (V8) المفك على الطاولة أداة فعلية: النقر عليه يلتقطه لفك البراغي
        tool.userData['benchTool'] = 'screwdriver';
        root.add(tool);
      },
      undefined,
      () => console.warn('[PCScene] تعذر تحميل المفك التدريبي'),
    );

    // 3..5) أدوات وزينة الورشة CC0 — كلها فشلها صامت (تفصيل ثانوي)
    const placeTool = (
      url: string,
      name: string,
      targetLen: number,          // البعد الأطول المستهدف بوحدات المشهد
      pos: [number, number, number],
      rotY: number,
      opts?: { light?: boolean },
    ): void => {
      loader.load(
        url,
        (gltf) => {
          if (this.disposed || this.failed) return;
          const obj = gltf.scene;
          // توحيد الخامات: منع أي emissive قد يأتي من الأصل
          obj.traverse((o) => {
            if (!(o instanceof THREE.Mesh)) return;
            o.castShadow = this.quality !== 'low';
            o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if ('emissiveIntensity' in m) (m as THREE.MeshStandardMaterial).emissiveIntensity = 0;
            }
          });
          const bbox = new THREE.Box3().setFromObject(obj);
          const size = bbox.getSize(new THREE.Vector3());
          const s = targetLen / Math.max(size.x, size.y, size.z, 1e-6);
          obj.scale.setScalar(s);
          obj.updateMatrixWorld(true);
          const b2 = new THREE.Box3().setFromObject(obj);
          obj.position.set(pos[0], pos[1] - b2.min.y, pos[2]);
          obj.rotation.y = rotY;
          obj.name = name;
          // (V8) طقم المفكات أيضًا أداة قابلة للالتقاط من الطاولة
          if (name === 'tool-screwdriver-set') obj.userData['benchTool'] = 'screwdriver';
          root.add(obj);
          if (opts?.light) {
            const head = new THREE.Vector3((b2.min.x + b2.max.x) / 2, b2.max.y - 0.15, (b2.min.z + b2.max.z) / 2);
            obj.updateMatrixWorld(true);
            const worldHead = head.applyMatrix4(obj.matrixWorld);
            const warm = new THREE.PointLight(0xffe7c4, 0.7, 9, 1.4);
            warm.position.copy(worldHead);
            warm.name = `${name}-light`;
            root.add(warm);
          }
        },
        undefined,
        () => console.warn(`[PCScene] تعذر تحميل ${name}`),
      );
    };

    // طقم مفكات على حافة المكتب اليسرى — خارج حدود الصينية (v9: لا تداخل مع خانات القطع)
    placeTool('/models/screwdrivers_02/screwdrivers_02_1k.gltf', 'tool-screwdriver-set', 2.2, [-5.45, TRAY.tableTopY, 1.05], 1.25);
    // كماشات على الحافة اليسرى كذلك
    placeTool('/models/pliers/pliers_1k.gltf', 'tool-pliers', 1.5, [-5.5, TRAY.tableTopY, 2.6], -0.5);
    // مصباح مكتب على الطرف الأيمن للمكتب — ذراعه يمتد فوق المكتب المفتوح
    // (بعيدًا عن جسم الجهاز كي لا يحجب النقر على القطع — توجيه v4)
    placeTool('/models/desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf', 'desk-lamp', 4.6, [7.4, 0, 3.1], -2.2, { light: true });
    // صندوق عدة معدني تحت المكتب (على أرضية المختبر)
    placeTool('/models/metal_tool_chest/metal_tool_chest_1k.gltf', 'under-desk-tool-chest', 5.4, [5.4, DESK.floorY, 5.2], 0.15);
  }

  /**
   * رسم نسيج الشاشة الافتراضية:
   *  - حالات التمهيد (off/noSignal/booting/post/warning/success) عبر الرسّام القديم.
   *  - 'os' و 'bios' يديرهما النظام الافتراضي التفاعلي (VOS): سطح مكتب/معالج تثبيت/
   *    بيئة استرداد/إعدادات UEFI — كلها تفاعلية بالماوس والكيبورد الحقيقيين (V6-B).
   */
  private drawMonitor(force: boolean): void {
    if (!this.painter || this.blocked) return;
    if (!force && nowMs() - this.lastMonitorDrawAt < 60) return;
    this.lastMonitorDrawAt = nowMs();
    const sim = this.lastState;
    const elapsed = this.bootStartedAt !== null ? Math.max(0, Date.now() - this.bootStartedAt) : 0;
    if (!sim) {
      this.painter.draw(
        { screen: 'noSignal', bootProgress: 0, postLinesAr: [], bootDevicesAr: [], canType: false },
        this.notepad,
        Date.now(),
      );
      return;
    }
    const view = computeMonitorView(sim, elapsed);
    const now = Date.now();

    if (this.vos && (view.screen === 'os' || view.screen === 'bios')) {
      this.drawVosScreen(sim, view.screen, now);
      return;
    }

    this.painter.draw(view, this.notepad, now);
  }

  /** رسم بيئة النظام الافتراضي/البرنامج الثابت على كانفس الشاشة + رفع النسيج */
  private drawVosScreen(sim: SimulationState, screen: 'os' | 'bios', now: number): void {
    if (!this.vos || !this.painter) return;
    const vos = this.vos;

    if (screen === 'bios') {
      vos.mode = 'firmware';
      // (إصلاح تدقيق V6) قائمة الأجهزة الفعلية فقط — كانت تعرض أقراصًا غير مركّبة
      const devs = bootableDevices(sim).map((d) => `${d.id} — ${d.labelAr}`);
      vos.fwData = {
        cpuAr: 'LGA1700 — 6C/12T (reference)',
        ramAr: `DDR5 32GB${sim.firmware.xmp ? ' @5200 (XMP)' : ' @2133'} — ${sim.flags.ramClipsOpen ? 'مزالج مفتوحة!' : 'مثبتة'}`,
        boardAr: 'PC LAB Z690 (reference)',
        tempsAr: `CPU ${sim.thermal.cpuTempC.toFixed(0)}°C / GPU ${sim.thermal.gpuTempC.toFixed(0)}°C (simulated)`,
        fansAr: this.fans?.report().map((f) => `${f.labelAr}: ${f.rpm} RPM`).join(' | ') ?? '—',
        bootMode: sim.firmware.bootMode,
        bootOrder: [...sim.firmware.bootOrder],
        secureBoot: sim.firmware.secureBoot,
        tpm: sim.firmware.tpm,
        xmp: sim.firmware.xmp,
        devicesAr: devs,
        onBootOrder: (order) => this.callbacks.onFirmwareChange?.({ bootOrder: order }),
        onToggle: (key) => this.callbacks.onFirmwareChange?.({ [key]: !sim.firmware[key] }),
        onBootMode: (mode) => this.callbacks.onFirmwareChange?.({ bootMode: mode }),
        onExit: () => this.callbacks.onFirmwareChange?.({ setupRequested: false }),
        onBootDevice: (id) => this.callbacks.onBootDevice?.(id),
      };
      vos.render(now);
      this.painter.texture.needsUpdate = true;
      return;
    }

    // screen === 'os': حسم وضع VOS من مصدر الحقيقة
    if (sim.usbMedia && sim.firmware.bootOrder[0] === 'usb') {
      // الإقلاع من وسيط التثبيت ⇒ معالج التثبيت (شاشة كاملة)
      if (vos.mode !== 'setup') {
        if (getSetupState().step === 0 || getSetupState().done) resetSetup();
        vos.mode = 'setup';
      }
      vos.drawSetupWith((ctx, os2, t) => drawInstaller(os2, ctx, t), now);
      this.painter.texture.needsUpdate = true;
      return;
    }

    if (sim.os.bcdCorrupt && sim.os.installed) {
      // (إصلاح F16 — تدقيق V6) كان وضع الاسترداد يُفرض كل إطار فيُخفى موجه الأوامر
      // ويجعل bootrec غير قابل للوصول نهائيًا — الآن النافذة تبقى مفتوحة حتى إغلاقها
      const cmdStillOpen = vos.recoveryCmdOpen && vos.windows.some((w) => w.appId === 'cmd' && !w.minimized);
      if (!cmdStillOpen) vos.recoveryCmdOpen = false;
      if (cmdStillOpen) {
        // سطح مكتب الاسترداد: نافذة موجه الأوامر بحالة recovery (bootrec متاح)
        vos.mode = 'desktop';
        vos.render(now);
        this.painter.texture.needsUpdate = true;
        return;
      }
      // فشل إقلاع النظام (F16) ⇒ بيئة الاسترداد
      vos.mode = 'recovery';
      vos.recoveryData = {
        attempts: sim.os.repairAttempts,
        osNameAr: sim.os.installed,
        onStartupRepair: () => this.callbacks.onStartupRepair?.(),
        onCommandPrompt: () => {
          const win = vos.openApp('cmd');
          if (win) {
            win.state['recovery'] = true;
            win.titleAr = 'موجه الأوامر — بيئة الاسترداد';
            vos.recoveryCmdOpen = true;
          }
        },
        onRestart: () => this.callbacks.onRecoveryRestart?.(),
      };
      vos.render(now);
      this.painter.texture.needsUpdate = true;
      return;
    }

    // سطح المكتب الافتراضي التفاعلي
    vos.mode = 'desktop';
    vos.render(now);
    this.painter.texture.needsUpdate = true;
  }

  /** ربط أحداث النظام الافتراضي بمتجر الحالة (مصدر الحقيقة الواحد) */
  private wireVosCallbacks(): void {
    if (!this.vos) return;
    this.vos.storeReader = () => {
      const s = this.lastState;
      return {
        os: {
          installed: s?.os.installed ?? null,
          edition: s?.os.edition ?? null,
          driversMissing: s?.os.driversMissing ?? [],
          bcdCorrupt: s?.os.bcdCorrupt ?? false,
        },
        thermal: { cpuTempC: s?.thermal.cpuTempC ?? 26, gpuTempC: s?.thermal.gpuTempC ?? 26 },
        fans: this.fans?.report().map((f) => ({ labelAr: f.labelAr, rpm: f.rpm, running: f.running })) ?? [],
      };
    };
  }

  /** تحديثات بصرية لحظية: كابل الشاشة/توهج القطع التالفة (المراوح في منظومة fans) */
  private updateRuntimeVisuals(s: SimulationState): void {
    // كابل إشارة الشاشة يختفي عند فصله (المواصفة: الكابلات لا تطفو في الفراغ)
    if (this.monitorCableGroup) {
      this.monitorCableGroup.visible = s.peripherals.monitorCableConnected;
    }

    // توهج أحمر ثابت للقطع التالفة تدريبيًا
    for (const id of COMPONENT_IDS) {
      const isDamaged = s.parts[id] === 'damaged';
      const wasDamaged = this.damagedIds.has(id);
      if (isDamaged && !wasDamaged) {
        this.parts[id].group.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          const mat = obj.material;
          if (Array.isArray(mat) || !('emissive' in mat)) return;
          const std = mat as THREE.MeshStandardMaterial;
          // حفظ بالمواد المشتركة (نفس إصلاح الإبراز — توجيه v4)
          if (!this.damagedOriginals.has(std)) {
            this.damagedOriginals.set(std, { hex: std.emissive.getHex(), intensity: std.emissiveIntensity });
          }
          std.emissive.setHex(DAMAGED_HEX);
          std.emissiveIntensity = 0.45;
        });
        this.damagedIds.add(id);
      } else if (!isDamaged && wasDamaged) {
        this.parts[id].group.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          const mat = obj.material;
          if (Array.isArray(mat) || !('emissive' in mat)) return;
          const std = mat as THREE.MeshStandardMaterial;
          const saved = this.damagedOriginals.get(std);
          if (!saved) return;
          std.emissive.setHex(saved.hex);
          std.emissiveIntensity = saved.intensity;
          // (إصلاح تدقيق V6-G) الإبراز النشط أثناء الإصلاح التقط القيمة الحمراء كـ«أصل» —
          // نحدّث قيد الاستعادة إلى القيمة الصحية وإلا أعادت فكّ الإبراز التلفًا على قطعة سليمة
          const hl = this.emissiveOriginals.get(std);
          if (hl) {
            hl.hex = saved.hex;
            hl.intensity = saved.intensity;
          }
          this.damagedOriginals.delete(std);
        });
        this.damagedIds.delete(id);
      }
    }
  }

  private startCamTween(toPos: THREE.Vector3, toTarget: THREE.Vector3, dur: number): void {
    // (إصلاح تدقيق V6-G) استنساخ الهدفين: المتصل قد يمرر مخازن مشتركة (_v1/_v2)
    // يعيد rayPlaneHit الكتابة فيها أثناء الطيران فيفسد التنعيم الجاري
    this.camTween = {
      fromPos: this.camera.position.clone(),
      toPos: toPos.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: toTarget.clone(),
      t: 0,
      dur,
    };
  }

  // ====================================================================
  // الخاصة — الاختيار بالأشعة
  // ====================================================================

  /** إيجاد الهدف عند نقطة شاشة: أول إصابة مرئية غير شفافة — قطعة PC أو طرفية */
  private pickAt(clientX: number, clientY: number): PickedInfo {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 1;
    const h = rect.height > 0 ? rect.height : 1;
    this._ndc.set(((clientX - rect.left) / w) * 2 - 1, -((clientY - rect.top) / h) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.visuals.root.children, true);
    for (const hit of hits) {
      if (this.isHidden(hit.object)) continue;        // تجاهل ما خفيه العزل
      // (V8) النقاط الفعالة أسبق من القطعة الحاملة: برغي/مزلاج/رافعة/قابس/أداة/زر فيزيائي
      let cur: THREE.Object3D | null = hit.object;
      let hotspot: PickedInfo = null;
      let panelGlassClosed = false;
      while (cur) {
        const per: unknown = cur.userData['peripheral'];
        if (typeof per === 'string') {
          hotspot = { type: 'periph', kind: per as PeripheralKind };
          break;
        }
        const ft: unknown = cur.userData['flagTarget'];
        if (typeof ft === 'string' && (MACHINE_FLAGS as readonly string[]).includes(ft)) {
          if (ft === 'panelOpen' && this.isSeeThrough(hit.object) && !(this.lastState?.flags.panelOpen ?? false)) {
            // زجاج الغطاء المغلق يمرّر النقر إلى القطع الداخلية — الإطار/الحواف فقط تفتح وتغلق
            panelGlassClosed = true;
            break;
          }
          hotspot = { type: 'flag', flag: ft as MachineFlag };
          break;
        }
        if (cur.userData['benchTool'] === 'screwdriver') {
          hotspot = { type: 'tool', tool: 'screwdriver' };
          break;
        }
        if (cur.userData['powerButton'] === true) {
          hotspot = { type: 'powerButton' };
          break;
        }
        if (cur.userData['acSwitch'] === true) {
          hotspot = { type: 'flag', flag: 'acConnected' };
          break;
        }
        cur = cur.parent;
      }
      if (hotspot) return hotspot;
      if (panelGlassClosed) continue;
      if (this.isSeeThrough(hit.object)) continue;    // الزجاج/الشفاف لا يحجب الاختيار
      let cur2: THREE.Object3D | null = hit.object;
      while (cur2) {
        const cid: unknown = cur2.userData['componentId'];
        if (typeof cid === 'string' && (COMPONENT_IDS as readonly string[]).includes(cid)) {
          return { type: 'part', id: cid as ComponentId };
        }
        cur2 = cur2.parent;
      }
      // إصابة أولى بلا معرف (عدة/زينة) — تمرير النقر عبرها إلى ما خلفها (توجيه v4)
      continue;
    }
    return null;
  }

  /** هل الجسم (أو أحد أسلافه) مخفي؟ */
  private isHidden(obj: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (!cur.visible) return true;
      cur = cur.parent;
    }
    return false;
  }

  /** هل الشبك بمادة شفافة؟ (الزجاج والهيكل الشفاف يسمحان بمرور النقر) */
  private isSeeThrough(obj: THREE.Object3D): boolean {
    if (!(obj instanceof THREE.Mesh)) return false;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat.transparent) return true;
    }
    return false;
  }

  // ====================================================================
  // الخاصة — بناء السجلات الداخلية
  // ====================================================================

  /** (4) بناء سجل الحركة لكل مكوّن — الموضع الأساس من موضع المجموعة الفعلي
   *  (البطاقة تُحاذى لحظة البناء على شق PCIe x16 الحقيقي المقاس من العقد — V6-A) */
  private initDynamicState(visuals: PartVisuals): void {
    const parts = {} as Record<ComponentId, DynamicPart>;
    for (const id of COMPONENT_IDS) {
      const group = visuals.dynamic[id];
      parts[id] = {
        group,
        basePos: group.position.clone(), // يجسد MOUNTS أو المحاذاة المقاسة للبطاقة
        baseRot: new THREE.Euler(0, 0, 0),
        trayPos: new THREE.Vector3(...TRAY.slots[id]),
        trayRot: new THREE.Euler(...TRAY.rotations[id]),
        explodeVec: new THREE.Vector3(...EXPLODE_VECTORS[id]),
        targetPos: group.position.clone(),
        targetRot: new THREE.Euler(0, 0, 0),
        targetQuat: new THREE.Quaternion(),
      };
    }
    this.parts = parts;
  }

  /** التقاط القيم الأصلية لمجسمات الأعلام مرة واحدة عند البناء */
  private initFlagRecords(visuals: PartVisuals): void {
    const flags: FlagVisuals = visuals.flags;

    if (flags.pcieLatch) this.latchRec = { obj: flags.pcieLatch, baseRot: flags.pcieLatch.rotation.y };
    if (flags.cpuLever) this.leverRec = { obj: flags.cpuLever, baseRot: flags.cpuLever.rotation.y };

    this.clipRecs = flags.ramClips.map((obj, index): ClipRec => ({
      obj,
      baseRotZ: obj.rotation.z,
      sign: index % 2 === 0 ? 1 : -1,
    }));

    const screwDefs: Array<{ flag: MachineFlag; objs: THREE.Object3D[]; axis: 'x' | 'y'; delta: number }> = [
      { flag: 'gpuScrewsOut', objs: flags.gpuScrews, axis: 'y', delta: SCREW_LIFT },
      { flag: 'psuScrewsOut', objs: flags.psuScrews, axis: 'y', delta: SCREW_LIFT },
      { flag: 'fanScrewsOut', objs: flags.fanScrews, axis: 'y', delta: SCREW_LIFT },
      { flag: 'm2ScrewOut', objs: flags.m2Screw ? [flags.m2Screw] : [], axis: 'y', delta: SCREW_LIFT },
      // مسامير اللوحة تُسحب بعيدًا عن الجدار الأيمن (-X)
      { flag: 'moboScrewsOut', objs: flags.moboScrews, axis: 'x', delta: -SCREW_LIFT },
    ];
    for (const def of screwDefs) {
      this.screwMap.set(
        def.flag,
        def.objs.map((obj): ScrewRec => ({
          obj,
          basePos: obj.position.clone(),
          baseRotZ: obj.rotation.z,
          axis: def.axis,
          delta: def.delta,
        })),
      );
    }

    if (flags.fanHeaderPlug) {
      this.plugRecs.push({ flag: 'fanHeadersDisconnected', obj: flags.fanHeaderPlug, baseX: flags.fanHeaderPlug.position.x });
    }
    if (flags.frontPanelPlug) {
      this.plugRecs.push({ flag: 'frontPanelDisconnected', obj: flags.frontPanelPlug, baseX: flags.frontPanelPlug.position.x });
    }
  }

  /** (V8) وسم نقاط الالتقاط: كل مجسم علم يصبح قابلاً للنقر المباشر داخل المشهد */
  private tagHotspots(visuals: PartVisuals): void {
    if (this.latchRec) this.latchRec.obj.userData['flagTarget'] = 'pcieLatchOpen';
    if (this.leverRec) this.leverRec.obj.userData['flagTarget'] = 'cpuLeverOpen';
    for (const clip of this.clipRecs) clip.obj.userData['flagTarget'] = 'ramClipsOpen';
    for (const [flag, recs] of this.screwMap) {
      for (const rec of recs) rec.obj.userData['flagTarget'] = flag;
    }
    for (const plug of this.plugRecs) plug.obj.userData['flagTarget'] = plug.flag;
  }

  /** (V8) نقاط التقاط غير مرئية حول المجسمات الصغيرة — نقر دقيق على برغي بحجم 2سم */
  private addHitProxies(visuals: PartVisuals): void {
    const mk = (parent: THREE.Object3D, r: number): void => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), this.hitProxyMat);
      p.name = 'hit-proxy';
      parent.add(p);
    };
    if (this.latchRec) mk(this.latchRec.obj, 0.3);
    if (this.leverRec) mk(this.leverRec.obj, 0.3);
    for (const clip of this.clipRecs) mk(clip.obj, 0.2);
    for (const recs of this.screwMap.values()) {
      for (const rec of recs) mk(rec.obj, 0.2);
    }
    for (const plug of this.plugRecs) mk(plug.obj, 0.24);
  }

  // ====================================================================
  // الخاصة — الحجم والمؤشر
  // ====================================================================

  /** (13)(15) كثافة البكسل حسب الجودة */
  private pixelRatioFor(q: SceneQuality): number {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (q === 'low') return 1;
    if (q === 'medium') return Math.min(dpr, 1.5);
    return Math.min(dpr, 2);
  }

  /** (15) استجابة تغيّر حجم الحاوية */
  private onResize(): void {
    if (this.blocked) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false); // updateStyle=false — CSS 100% يتكفل بالعرض
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.blocked) return;
    this.pointerDownActive = true;
    this.downX = event.clientX;
    this.downY = event.clientY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    // (V6-B + v9) وضع التحكم بالشاشة: إدخال على مستوى العرض + التقاط المؤشر
    // كي تظل سحبات النوافذ حية حتى خارج حدود اللوحة/المتصفح
    if (this.focusMode && this.vos) {
      try { this.renderer.domElement.setPointerCapture(event.pointerId); } catch { /* آمن */ }
      const hit = this.screenPlaneHit(event.clientX, event.clientY);
      if (hit && hit.inside) this.vos.pointer('down', hit.x, hit.y, { button: event.button });
      this.drawMonitor(true);
      return;
    }

    // بدء سحب محتمل: فقط بالزر الأيسر وعند تفعيل وضع الفك/التركيب
    if (this.dragEnabled && event.button === 0) {
      const picked = this.pickAt(event.clientX, event.clientY);
      if (picked && picked.type === 'part' && DRAGGABLE.has(this.lastState?.parts[picked.id] ?? '')) {
        this.pendingDrag = { id: picked.id, startX: event.clientX, startY: event.clientY };
      }
    }
  };

  /** (7) نقرة فقط إذا كانت المسافة بين down/up أقل من 6px — والسحب الفعلي يُعالج قبلها */
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.blocked) return;

    // (V6-B + v9) رفع الزر: مستوى العرض + تحرير الالتقاط + نبضة نقرة على المؤشر الافتراضي
    if (this.focusMode && this.vos) {
      try { this.renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* آمن */ }
      const hit = this.screenPlaneHit(event.clientX, event.clientY);
      if (hit && hit.inside) this.vos.pointer('up', hit.x, hit.y, { button: event.button });
      this.drawMonitor(true);
      this.pointerDownActive = false;
      return;
    }

    if (this.dragId) {
      this.finishDrag(event.clientX, event.clientY);
      this.pointerDownActive = false;
      return;
    }
    this.pendingDrag = null;
    if (!this.pointerDownActive) return;
    this.pointerDownActive = false;
    const dx = event.clientX - this.downX;
    const dy = event.clientY - this.downY;
    if (dx * dx + dy * dy >= CLICK_MAX_DIST_SQ) return; // سحب لا نقرة

    // (V6-B §4.3) النقر على سطح الشاشة المجسمة نفسه يدخل وضع التحكم ويسلّم النقرة
    const onScreen = this.screenHit(event.clientX, event.clientY);
    if (onScreen && this.vos) {
      this.setFocusMode(true);
      this.vos.pointer('down', onScreen.x, onScreen.y, { button: event.button });
      this.vos.pointer('up', onScreen.x, onScreen.y, { button: event.button });
      this.drawMonitor(true);
      return;
    }

    const picked = this.pickAt(event.clientX, event.clientY);
    if (picked && picked.type === 'periph') {
      this.callbacks.onPeripheral?.(picked.kind, picked.detail);
      return;
    }
    // (V8) التحكم المباشر كفني حقيقي: برغي/مزلاج/رافعة/قابس/زر طاقة/مفتاح PSU
    if (picked && picked.type === 'flag') {
      if (SCREW_FLAGS.has(picked.flag) && this.activeTool !== 'screwdriver') {
        // البراغي لا تُفك بالأصابع — التقط المفك أولًا (كما في الواقع)
        this.callbacks.onToolRequired?.('screwdriver');
        return;
      }
      this.callbacks.onFlagClick?.(picked.flag);
      return;
    }
    if (picked && picked.type === 'tool') {
      this.setActiveTool(picked.tool);
      this.callbacks.onToolPick?.(picked.tool);
      return;
    }
    if (picked && picked.type === 'powerButton') {
      this.callbacks.onPowerButton?.();
      return;
    }
    this.callbacks.onSelect(picked && picked.type === 'part' ? picked.id : null);
  };

  /** (7) تحويم/سحب — بفحص مُقيَّد زمنيًا للتحويم (100ms) */
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.blocked) return;

    // (V6-B + v9) حركة المؤشر الحقيقي → الافتراضي: مستوى العرض اللانهائي يعني
    // أن المؤشر يلاحق اليد حتى خارج حدود السطح (يلتصق بالحافة) — سلاسة كاملة
    if (this.focusMode && this.vos) {
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      const hit = this.screenPlaneHit(event.clientX, event.clientY);
      if (hit) this.vos.pointer('move', hit.x, hit.y);
      this.drawMonitor(true);
      return;
    }

    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    if (this.dragId) {
      this.updateDrag(event.clientX, event.clientY);
      return;
    }
    if (this.pendingDrag) {
      const dx = event.clientX - this.pendingDrag.startX;
      const dy = event.clientY - this.pendingDrag.startY;
      if (dx * dx + dy * dy >= DRAG_START_DIST_SQ) {
        this.beginDrag(this.pendingDrag.id, event.clientX, event.clientY);
        this.updateDrag(event.clientX, event.clientY);
      }
      return;
    }
    const now = performance.now();
    if (now - this.lastHoverAt < HOVER_THROTTLE_MS) return;
    this.lastHoverAt = now;
    const hovering = this.pickAt(event.clientX, event.clientY);
    // (V8) مؤشر المفك:crosshair عندما تكون الأداة باليد — إحساس أدوات حقيقي
    this.renderer.domElement.style.cursor = hovering
      ? 'pointer'
      : this.activeTool === 'screwdriver' ? 'crosshair' : '';
  };

  /** (V6-B + v9) عجلة الماوس → تمرير داخل النظام الافتراضي في وضع الشاشة */
  private readonly onWheel = (event: WheelEvent): void => {
    if (this.blocked) return;
    if (!this.focusMode || !this.vos) return;
    event.preventDefault();
    const hit = this.screenPlaneHit(event.clientX, event.clientY);
    if (hit) this.vos.wheel(hit.x, hit.y, event.deltaY);
    this.drawMonitor(true);
  };

  /** (V6-B) نقر مزدوج: داخل وضع الشاشة يوجه للنظام الافتراضي، وفي المختبر يعيد الكاميرا (موثقة) */
  private readonly onScreenDbl = (event: MouseEvent): void => {
    if (this.blocked) return;
    if (this.focusMode && this.vos) {
      const hit = this.screenPlaneHit(event.clientX, event.clientY);
      if (hit && hit.inside) this.vos.pointer('dbl', hit.x, hit.y);
      this.drawMonitor(true);
      return;
    }
    // وضع المختبر: دبل-كليك = إعادة ضبط الكاميرا (كان معلنًا غير مسجل — إصلاح تدقيق V6)
    this.resetCamera();
  };

  /** (V6-B) الزر الأيمن → قائمة سياق النظام الافتراضي */
  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.blocked) return;
    if (!this.focusMode || !this.vos) return;
    event.preventDefault();
    const hit = this.screenPlaneHit(event.clientX, event.clientY);
    if (hit && hit.inside) this.vos.pointer('right', hit.x, hit.y);
    this.drawMonitor(true);
  };

  // ====================================================================
  // الخاصة — سحب القطع (فك/تركيب بالماوس الحقيقي)
  // ====================================================================

  /** بدء سحب فعلي: تعطيل المداري + سطح أفقي عند ارتفاع القطعة */
  private beginDrag(id: ComponentId, clientX: number, clientY: number): void {
    const part = this.parts[id];
    if (!part) return;
    this.pendingDrag = null;
    this.dragId = id;
    this.controls.enabled = false;
    this.dragPlane.set(new THREE.Vector3(0, 1, 0), -part.group.position.y);
    // إزاحة الإمساك: فرق نقطة النقر عن مركز القطعة على السطح نفسه
    const hit = this.rayPlaneHit(clientX, clientY);
    if (hit) this.dragOffset.copy(part.group.position).sub(hit);
    this.renderer.domElement.style.cursor = 'grabbing';
  }

  /** تحديث موضع القطعة أثناء السحب (بصريًا فقط — الحالة المنطقية لا تتغير هنا) */
  private updateDrag(clientX: number, clientY: number): void {
    const id = this.dragId;
    if (!id) return;
    const hit = this.rayPlaneHit(clientX, clientY);
    if (!hit) return;
    const part = this.parts[id];
    part.group.position.set(hit.x + this.dragOffset.x, part.group.position.y, hit.z + this.dragOffset.z);
    // الهدف يتبع اليد — يمنع حلقة الرسم من محاربة السحب
    part.targetPos.copy(part.group.position);
  }

  /** إنهاء السحب: تحديد منطقة الإفلات ثم إبلاغ المنطق (التحقق أولًا ثم الحركة — توجيه v3 §6) */
  private finishDrag(clientX: number, clientY: number): void {
    const id = this.dragId;
    this.dragId = null;
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = '';
    if (!id) return;
    const hit = this.rayPlaneHit(clientX, clientY);
    let zone: DropZone = null;
    if (hit) {
      const inTray = hit.x >= TRAY.minX && hit.x <= TRAY.maxX && hit.z >= TRAY.minZ && hit.z <= TRAY.maxZ;
      const inCase = hit.x >= CASE.minX && hit.x <= CASE.maxX && hit.z >= CASE.minZ && hit.z <= CASE.maxZ;
      zone = inTray ? 'tray' : inCase ? 'case' : null;
    }
    // المرور عبر منطق المتجر: إن رُفض الإجراء تعاد القطعة لموضع راحتها عبر syncState
    this.callbacks.onPartDrop?.(id, zone);
  }

  /** إلغاء أي سحب جارٍ (Esc / إيقاف الوضع) */
  private cancelDrag(): void {
    if (this.dragId) {
      const part = this.parts[this.dragId];
      this.recomputeTargets(); // يعيد الهدف الصحيح من آخر حالة
      if (part) part.group.position.copy(part.targetPos);
    }
    this.dragId = null;
    this.pendingDrag = null;
    if (this.controls) this.controls.enabled = true;
    if (this.renderer) this.renderer.domElement.style.cursor = '';
  }

  /** تقاطع شعاع المؤشر مع سطح السحب الحالي */
  private rayPlaneHit(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 1;
    const h = rect.height > 0 ? rect.height : 1;
    this._ndc.set(((clientX - rect.left) / w) * 2 - 1, -((clientY - rect.top) / h) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this._v2;
    return this.raycaster.ray.intersectPlane(this.dragPlane, hit) ? hit : null;
  }
}

/** طابع زمني بسيط (تجنب الاعتماد على performance في كل موضع) */
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
