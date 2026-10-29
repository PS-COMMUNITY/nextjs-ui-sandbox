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
import { createScreenPainter, type ScreenPainter } from './screenTexture';
import { computeMonitorView } from '../simulation/monitorEngine';
import { BOARD, CASE, COLORS, DEFAULT_CAMERA, EXPLODE_VECTORS, MONITOR_CAMERA, MOUNTS, SEPARATE_FACTOR, TRAY, VIEW_PRESETS } from './layout';
import type { ViewPresetId } from './layout';
import type { FlagVisuals, PCSceneCallbacks, PartVisuals, PeripheralKind, SceneQuality } from './visualTypes';
import { COMPONENT_IDS, isInstalled } from '../types';
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
const SPIN_SPEED = 2.2;         // سرعة دوران شفرات المراوح (rad/s)
const LERP_RATE = 8;            // معدل الاقتراب الأسي للمواضع في حلقة الرسم
const HIGHLIGHT_HEX = 0x84cc16; // لون إبراز المكوّن المحدد (أخضر ليموني واضح)
const HIGHLIGHT_INTENSITY = 0.55;
const ENV_INTENSITY = 0.55;     // شدة الإضاءة البيئية (IBL) — توازن مع الأضواء المباشرة
const TONE_EXPOSURE = 1.12;     // تعريض النغمة السينمائية
const LED_INTENSITY = 1.2;      // شدة توهج لمبة الطاقة
const CLICK_MAX_DIST_SQ = 36;   // (6px)² — أقصى مسافة بين down/up تُعد نقرة
const DRAG_START_DIST_SQ = 64;  // (8px)² — أقل حركة لتحويل الضغط إلى سحب قطعة
const HOVER_THROTTLE_MS = 100;  // أقصى معدل لفحص التحويم
const MONITOR_REDRAW_MS = 400;  // معدل إعادة رسم نسيج الشاشة الافتراضية
const DAMAGED_HEX = 0xef4444;   // لون توهج القطعة التالفة تدريبيًا

/** نتيجة التقاط النقرة: قطعة PC أو طرفية خارجية */
type PickedInfo =
  | { type: 'part'; id: ComponentId }
  | { type: 'periph'; kind: PeripheralKind; detail?: string }
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

/** دوّار (شفرات مروحة) مع محوره المحفوظ */
interface SpinnerRec {
  obj: THREE.Object3D;
  axis: THREE.Vector3; // متجه وحدة في الفضاء المحلي للدوّار
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
  private spinners: SpinnerRec[] = [];

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
  private spinning = false;
  private lastMonitorDrawAt = 0;
  private monitorCableGroup: THREE.Object3D | null = null;

  // ---- توهج القطع التالفة (استعادة مستقلة عن الإبراز) ----
  private damagedOriginals = new Map<THREE.Mesh, SavedEmissive>();
  private damagedIds = new Set<ComponentId>();

  // ---- خرائط استعادة القيم الأصلية ----
  private emissiveOriginals = new Map<THREE.Mesh, SavedEmissive>();
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
      this.controls.maxDistance = 14;
      this.controls.maxPolarAngle = 1.45;
      this.controls.update();
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

      // (الجلسة 4) الشاشة الافتراضية: نسيج ديناميكي + مرجع كابل الإشارة
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

      // أصل حقيقي CC0 (Poly Haven): مسح لوحة دوائر كأساس PCB واقعي + مفك تدريبي
      this.loadRealAssets(visuals);

      // (7)(15) مستمعو المؤشر + مراقب الحجم
      renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
      renderer.domElement.addEventListener('pointerup', this.onPointerUp);
      renderer.domElement.addEventListener('pointermove', this.onPointerMove);
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.container);

      // (13) ضبط كثافة البكسل حسب الجودة (الظلال مضبوطة أعلاه بنفس القيمة)
      this.setQuality(this.quality);

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
    }
  }

  /** (10) شفافية الهيكل والغطاء (X-Ray) مع استعادة الأصول عند الإيقاف */
  setXray(on: boolean): void {
    if (this.blocked) return;
    if (this.xrayOn === on) return;
    this.xrayOn = on;
    this.refreshShellMaterials();
  }

  /** (5) فتح/إغلاق الغطاء الجانبي حول مفصلته الخلفية */
  setPanelOpen(on: boolean, animate?: boolean): void {
    if (this.blocked) return;
    this.panelTarget = on ? PANEL_OPEN_ANGLE : 0;
    if (this.lastState) this.lastState.flags.panelOpen = on;
    if (animate === false) this.visuals.sidePanel.rotation.y = this.panelTarget;
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
    this.lastState = {
      flags: { ...s.flags },
      parts: { ...s.parts },
      peripherals: { ...s.peripherals },
    };
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

  /** نص دفتر الملاحظات الافتراضي — يُكتب الآن من حقل إدخال حقيقي في الواجهة (توجيه v3 أ.2) */
  setNotepad(text: string): void {
    if (this.blocked) return;
    this.notepad = text;
    this.drawMonitor(true);
  }

  /** إظهار/إخفاء أسهم تدفق الهواء */
  setAirflow(on: boolean): void {
    if (this.blocked) return;
    this.visuals.airflow.visible = on;
  }

  /** توجيه الكاميرا نحو الشاشة الافتراضية */
  focusMonitor(): void {
    if (this.blocked) return;
    this.startCamTween(new THREE.Vector3(...MONITOR_CAMERA.pos), new THREE.Vector3(...MONITOR_CAMERA.target), 0.7);
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
      // نلتقط الأصل مرة واحدة لكل جلسة إبراز، ونستعيده عند الإلغاء
      if (!this.emissiveOriginals.has(obj)) {
        this.emissiveOriginals.set(obj, { hex: std.emissive.getHex(), intensity: std.emissiveIntensity });
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

  /** (6) حلقة الرسم: دوّارات، اقتراب القطع، تنعيم الغطاء، تنعيم الكاميرا، ثم الرسم */
  private readonly tick = (): void => {
    if (this.disposed || this.failed) return;
    this.rafId = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05); // حماية من قفزات التبويبات الخاملة
    const k = 1 - Math.exp(-LERP_RATE * dt);

    // دوران شفرات المراوح حول محورها المحفوظ — فقط والجهاز يعمل فعلاً
    if (this.spinning) {
      for (const spinner of this.spinners) {
        spinner.obj.rotateOnAxis(spinner.axis, SPIN_SPEED * dt);
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

    // إعادة رسم نسيج الشاشة الافتراضية بمعدل مقيد
    if (this.painter && nowMs() - this.lastMonitorDrawAt >= MONITOR_REDRAW_MS) {
      this.drawMonitor(false);
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

    // البراغي (gpu/psu/fan/m2/mobo)
    for (const [flag, recs] of this.screwMap) {
      const out = flags[flag];
      for (const rec of recs) {
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
    for (const [mesh, saved] of this.emissiveOriginals) {
      const mat = mesh.material;
      if (Array.isArray(mat) || !('emissive' in mat)) continue;
      const std = mat as THREE.MeshStandardMaterial;
      std.emissive.setHex(saved.hex);
      std.emissiveIntensity = saved.intensity;
    }
    this.emissiveOriginals.clear();
  }

  // ====================================================================
  // الخاصة — الشاشة الافتراضية والقطع التالفة
  // ====================================================================

  /**
   * تحميل الأصول الحقيقية المرخصة CC0 (توجيه v3 §3) — فشلها لا يعطل المشهد:
   *  1) مسح لوحة دوائر (Poly Haven — circuit_board): يستبدل وجه PCB الإجرائي للوحة الأم
   *     بمسح ضوئي واقعي بخامات PBR كاملة (Diffuse/Normal/ARM).
   *  2) مفك مسطّح (Poly Haven — screwdriver): أداة تدريب ثانوية على طاولة صينية القطع.
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

    // 2) مفك تدريبي على طاولة الصينية (جزء بصري ثانوي — بلا تفاعل)
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
        tool.position.set(-3.1, 0.912 - b2.min.y, 3.55);
        tool.rotation.y = 0.5;
        tool.name = 'desk-screwdriver';
        root.add(tool);
      },
      undefined,
      () => console.warn('[PCScene] تعذر تحميل المفك التدريبي'),
    );
  }

  /** رسم نسيج الشاشة الافتراضية من محرك الشاشة (المصدر الوحيد للحقيقة) */
  private drawMonitor(force: boolean): void {
    if (!this.painter || this.blocked) return;
    if (!force && nowMs() - this.lastMonitorDrawAt < MONITOR_REDRAW_MS) return;
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
    this.painter.draw(view, this.notepad, Date.now());
  }

  /** تحديثات بصرية لحظية: دوران المراوح/كابل الشاشة/توهج القطع التالفة */
  private updateRuntimeVisuals(s: SimulationState): void {
    // المراوح تدور فقط مع كهرباء موصولة وجهاز يعمل ومزود حي
    this.spinning = s.flags.powerOn && s.flags.acConnected && !s.peripherals.psuDead;

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
          if (!this.damagedOriginals.has(obj)) {
            this.damagedOriginals.set(obj, { hex: std.emissive.getHex(), intensity: std.emissiveIntensity });
          }
          std.emissive.setHex(DAMAGED_HEX);
          std.emissiveIntensity = 0.45;
        });
        this.damagedIds.add(id);
      } else if (!isDamaged && wasDamaged) {
        this.parts[id].group.traverse((obj) => {
          const saved = this.damagedOriginals.get(obj as THREE.Mesh);
          if (!saved) return;
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material;
          if (Array.isArray(mat) || !('emissive' in mat)) return;
          (mat as THREE.MeshStandardMaterial).emissive.setHex(saved.hex);
          (mat as THREE.MeshStandardMaterial).emissiveIntensity = saved.intensity;
          this.damagedOriginals.delete(mesh);
        });
        this.damagedIds.delete(id);
      }
    }
  }

  private startCamTween(toPos: THREE.Vector3, toTarget: THREE.Vector3, dur: number): void {
    this.camTween = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
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
      if (this.isSeeThrough(hit.object)) continue;    // الزجاج/الشفاف لا يحجب الاختيار
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        // الطرفيات (زر الشاشة / زر طاقة الشاشة) — لا كيبورد ولا ماوس (توجيه v3 أ.1)
        const per: unknown = cur.userData['peripheral'];
        if (typeof per === 'string') {
          return { type: 'periph', kind: per as PeripheralKind };
        }
        const cid: unknown = cur.userData['componentId'];
        if (typeof cid === 'string' && (COMPONENT_IDS as readonly string[]).includes(cid)) {
          return { type: 'part', id: cid as ComponentId };
        }
        cur = cur.parent;
      }
      return null; // أول إصابة مرئية بلا معرّف → تعامل كفراغ (الأدوات الثانوية غير قابلة للنقر)
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

  /** (4) بناء سجل الحركة لكل مكوّن من MOUNTS/TRAY/EXPLODE_VECTORS */
  private initDynamicState(visuals: PartVisuals): void {
    const parts = {} as Record<ComponentId, DynamicPart>;
    for (const id of COMPONENT_IDS) {
      const group = visuals.dynamic[id];
      const mount = MOUNTS[id];
      parts[id] = {
        group,
        basePos: new THREE.Vector3(...mount),
        baseRot: new THREE.Euler(0, 0, 0),
        trayPos: new THREE.Vector3(...TRAY.slots[id]),
        trayRot: new THREE.Euler(...TRAY.rotations[id]),
        explodeVec: new THREE.Vector3(...EXPLODE_VECTORS[id]),
        targetPos: new THREE.Vector3(...mount),
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

    // محور دوران كل دوّار يُستنتج من هندسته (أصغر بُعد = عمود قرص المروحة)
    this.spinners = visuals.spinners.map((obj): SpinnerRec => ({ obj, axis: this.computeSpinnerAxis(obj) }));
  }

  /** استنتاج محور الدوران: أصغر بُعد في صندوق الإحاطة للشبك الأول هو عمود القرص */
  private computeSpinnerAxis(spinner: THREE.Object3D): THREE.Vector3 {
    const fallback = new THREE.Vector3(0, 1, 0);
    const mesh = this.firstMesh(spinner);
    if (!mesh || !mesh.geometry) return fallback;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (!bb) return fallback;
    const ex = bb.max.x - bb.min.x;
    const ey = bb.max.y - bb.min.y;
    const ez = bb.max.z - bb.min.z;
    const axis = new THREE.Vector3(
      ex <= ey && ex <= ez ? 1 : 0,
      ey <= ex && ey <= ez ? 1 : 0,
      ez <= ex && ey <= ez ? 1 : 0,
    );
    if (axis.lengthSq() === 0) return fallback;
    // تحويل المحور من فضاء الشبك إلى الفضاء المحلي للدوّار إن كان ابنًا مُدارًا
    if (mesh !== spinner) {
      spinner.updateWorldMatrix(true, false);
      mesh.updateWorldMatrix(true, false);
      const qSpinner = new THREE.Quaternion();
      const qMesh = new THREE.Quaternion();
      spinner.getWorldQuaternion(qSpinner);
      mesh.getWorldQuaternion(qMesh);
      axis.applyQuaternion(qSpinner.invert().multiply(qMesh));
    }
    return axis.normalize();
  }

  /** أول Mesh داخل شجرة كائن (بدون تخصيصات) */
  private firstMesh(obj: THREE.Object3D): THREE.Mesh | null {
    if (obj instanceof THREE.Mesh) return obj;
    for (const child of obj.children) {
      const found = this.firstMesh(child);
      if (found) return found;
    }
    return null;
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
    const picked = this.pickAt(event.clientX, event.clientY);
    if (picked && picked.type === 'periph') {
      this.callbacks.onPeripheral?.(picked.kind, picked.detail);
      return;
    }
    this.callbacks.onSelect(picked ? picked.id : null);
  };

  /** (7) تحويم/سحب — بفحص مُقيَّد زمنيًا للتحويم (100ms) */
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.blocked) return;
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
    this.renderer.domElement.style.cursor = this.pickAt(event.clientX, event.clientY) ? 'pointer' : '';
  };

  /** دبل-كليك: إعادة الكاميرا إلى الوضع الافتراضي (موثقة في الإعدادات) */
  private readonly onDoubleClick = (): void => {
    if (this.blocked) return;
    this.resetCamera();
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
