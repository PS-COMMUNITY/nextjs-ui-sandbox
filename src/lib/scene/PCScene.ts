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
import { buildAllParts, buildEnvironment, setComponentId } from './partsFactory';
import { COLORS, DEFAULT_CAMERA, EXPLODE_VECTORS, MOUNTS, TRAY } from './layout';
import type { FlagVisuals, PCSceneCallbacks, PartVisuals, SceneQuality } from './visualTypes';
import { COMPONENT_IDS } from '../types';
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
const HOVER_THROTTLE_MS = 100;  // أقصى معدل لفحص التحويم

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
    this.lastState = { flags: { ...s.flags }, parts: { ...s.parts } };
    this.recomputeTargets();
    this.applyFlags(s.flags, true);
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

    // دوران شفرات المراوح حول محورها المحفوظ
    for (const spinner of this.spinners) {
      spinner.obj.rotateOnAxis(spinner.axis, SPIN_SPEED * dt);
    }

    // اقتراب القطع نحو أهدافها (الموضع lerp والدوران slerp) — عدا الهيكل الثابت
    for (const id of COMPONENT_IDS) {
      if (id === 'case') continue;
      const part = this.parts[id];
      part.group.position.lerp(part.targetPos, k);
      part.group.quaternion.slerp(part.targetQuat, k);
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
      if (parts && parts[id] === 'removed') {
        part.targetPos.copy(part.trayPos);
        part.targetRot.copy(part.trayRot);
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

    // لمبة الطاقة — مادة خاصة بها (cached)
    const led = this.visuals.flags.powerLed;
    if (led) {
      const mat = led.material;
      if (!Array.isArray(mat) && 'emissive' in mat) {
        const std = mat as THREE.MeshStandardMaterial;
        std.emissive.set(flags.powerOn ? COLORS.green : 0x000000);
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
  // الخاصة — الكاميرا
  // ====================================================================

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

  /** إيجاد المكوّن عند نقطة شاشة: أول إصابة مرئية غير شفافة صعودًا حتى userData.componentId */
  private pickAt(clientX: number, clientY: number): ComponentId | null {
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
        const cid: unknown = cur.userData['componentId'];
        if (typeof cid === 'string' && (COMPONENT_IDS as readonly string[]).includes(cid)) {
          return cid as ComponentId;
        }
        cur = cur.parent;
      }
      return null; // أول إصابة مرئية بلا معرّف → تعامل كفراغ
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
  };

  /** (7) نقرة فقط إذا كانت المسافة بين down/up أقل من 6px */
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.blocked || !this.pointerDownActive) return;
    this.pointerDownActive = false;
    const dx = event.clientX - this.downX;
    const dy = event.clientY - this.downY;
    if (dx * dx + dy * dy >= CLICK_MAX_DIST_SQ) return; // سحب لا نقرة
    this.callbacks.onSelect(this.pickAt(event.clientX, event.clientY));
  };

  /** (7) تغيير المؤشر فوق مكوّن — بفحص مُقيَّد زمنيًا (100ms) */
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.blocked) return;
    const now = performance.now();
    if (now - this.lastHoverAt < HOVER_THROTTLE_MS) return;
    this.lastHoverAt = now;
    this.renderer.domElement.style.cursor = this.pickAt(event.clientX, event.clientY) ? 'pointer' : '';
  };
}
