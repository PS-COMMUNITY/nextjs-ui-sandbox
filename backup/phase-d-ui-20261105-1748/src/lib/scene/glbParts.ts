/**
 * دمج النماذج ثلاثية الأبعاد الحقيقية (V5 — High-Fidelity Hardware Assets)
 * ============================================================================
 * يستبدل المجسمات الإجرائية القديمة بنماذج GLB حقيقية منزّلة ومُرخّصة:
 *  - طقم مكوّنات PC (case/motherboard/cpu/cooler/gpu/ram/psu/ssd/fan):
 *    GitHub `Wissemm697/pc-builder` — رخصة MIT (انظر public/models/parts/CREDITS.md).
 *  - الشاشة (monitor): OpenGameArt «Low-poly monitor» — رخصة CC0 (محوّل من FBX).
 *
 * آلية العمل:
 *  1) preloadGlbAssets() — تُستدعى **قبل** إنشاء PCScene (من LabScreen) وتخزّن المشاهد.
 *  2) applyGlbParts(visuals) — تُستدعى داخل buildAllParts (تزامنيًا) فتستبدل محتوى
 *     المجموعات الديناميكية قبل أن يربط PCScene سجلات الأعلام والتحديد.
 *
 * المحافظة على منظومة التفاعل (v3/v4):
 *  - معرّفات القطع componentId تبقى على المجموعات (الالتقاط بالأشعة عبر الأجداد).
 *  - أعمال الأعلام (FlagVisuals) يُعاد بناؤها من عقد النماذج الحقيقية:
 *    رافعة المقبس، مزالج RAM، مزلاج PCIe، برغي M.2، لمبة الطاقة + براغي إجرائية صغيرة.
 *  - الدوّارات (spinners) من عقد `*_rotor` الحقيقية (مراوح GPU/المبرد/PSU/الهيكل).
 *  - فشل تحميل أي نموذج يُبقي المجسم الإجرائي مكانه (لا مشهد مكسور أبدًا).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PERIPH } from './layout';
import type { FlagVisuals, PartVisuals } from './visualTypes';

type Vec3 = [number, number, number];

/** تعريف تحويل نموذج: أساس (صور +X +Y +Z المحلية في فضائنا) + مقياس لكل محور + مرساة */
interface PartDef {
  url: string;
  /** صورة المحاور المحلية للنموذج في فضاء المشهد: basis[0] = اتجاه +X المحلي بعد التحويل */
  basis: [Vec3, Vec3, Vec3];
  /** مقياس لكل محور محلي (وحدة مشهد / متر) */
  scale: Vec3;
  /** المرساة: ماذا يصبح عند أصل المجموعة */
  anchor: 'center' | 'minAll' | 'minY';
  /** أسماء خامات تُجبر على شفافية (زجاج الأصلي بلا transparent في بعض الصادرات) */
  forceTransparent?: string[];
  /** فرض DoubleSide (نماذج مُعكوسة الاتجاه أو أسطح رقيقة) */
  doubleSide?: boolean;
}

/** أساس اللوحة الأم: +X النموذج (العرض) → +Z، +Y (الارتفاع) → +Y، +Z (سمك/المكوّنات) → −X */
const BOARD_BASIS: [Vec3, Vec3, Vec3] = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];

const DEFS: Record<'case' | 'motherboard' | 'cpu' | 'cooler' | 'ram' | 'gpu' | 'psu' | 'ssd' | 'fan' | 'monitor', PartDef> = {
  // صندوق: العمق +X_g→+Z (الواجهة +X_g عند 4.6)، الزجاج +Z_g→−X (جهة الكاميرا)، قاع النموذج عند Y=0
  case: { url: '/models/parts/case.glb', basis: BOARD_BASIS, scale: [10.11, 9.36, 9.55], anchor: 'minAll', forceTransparent: ['glass'] },
  // اللوحة: مركز الـbbox عند أصل المجموعة (MOUNTS.motherboard) — الوجه نحو −X
  motherboard: { url: '/models/parts/motherboard.glb', basis: BOARD_BASIS, scale: [9.31, 9.84, 1.3], anchor: 'center' },
  // المعالج: IHS (+Z_g) نحو −X (وجه المشاهد)
  cpu: { url: '/models/parts/cpu.glb', basis: BOARD_BASIS, scale: [10, 10, 10], anchor: 'center' },
  // المبرد البرجي: محور البرج +Z_g → −X (يبرز من اللوحة)، محور المروحة +X_g → +Z (النفخ من الأمام للخلف)
  cooler: { url: '/models/parts/cooler.glb', basis: BOARD_BASIS, scale: [10.4, 9.92, 9.69], anchor: 'center' },
  // شريحة RAM: الطول +Y_g → +Y (رأسيًا في الفتحات)، الارتفاع +Z_g → −X، السماكة +X_g → +Z
  ram: { url: '/models/parts/ram.glb', basis: BOARD_BASIS, scale: [10, 10, 10], anchor: 'center' },
  // بطاقة الرسومات (تصحيح هندسي V6-A): الطول +X_g → +Z (البراكيت −X_g عند الخلف)،
  // السماكة +Y_g → +Y (المراوح −Y_g نحو الأسفل)، عرض البطاقة +Z_g → −X
  // (الأصابع الذهبية عند −Z_g نحو اللوحة الأم +X). كان الأساس القديم يدير البطاقة
  // على جنبها فبدت واقفة فوق منطقة المعالج — الأساس الصحيح يجعلها أفقية في شق PCIe x16.
  gpu: { url: '/models/parts/gpu.glb', basis: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], scale: [10, 10.08, 9.94], anchor: 'center' },
  // مزود الطاقة: العمق +X_g → +Z (المفتاح −X_g عند الخلف)، المراوح −Y_g نحو الأعلى، العرض +Z_g → +X
  psu: { url: '/models/parts/psu.glb', basis: [[0, 0, 1], [0, -1, 0], [1, 0, 0]], scale: [10, 9.99, 10], anchor: 'center' },
  // M.2: الطول +X_g → +Z (أفقي أسفل المقبس)، العرض +Y_g → +Y، السماكة +Z_g → −X
  ssd: { url: '/models/parts/ssd.glb', basis: BOARD_BASIS, scale: [10, 10, 10], anchor: 'center' },
  // مروحة هيكل 120mm: محورها +X_g (يوجَّه لاحقًا داخل الغلاف المُدار)
  fan: { url: '/models/parts/fan.glb', basis: BOARD_BASIS, scale: [10, 10, 10], anchor: 'center' },
  // الشاشة: كما هي (+Z_g وجه الشاشة نحو الكاميرا بعد دوران المجموعة)، القاع عند Y=0
  monitor: { url: '/models/parts/monitor.glb', basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], scale: [4.2, 4.2, 4.2], anchor: 'minY' },
};

// ============================================================
// التحميل المسبق
// ============================================================

const cache = new Map<string, THREE.Object3D>();
let preloadPromise: Promise<void> | null = null;

/** تحميل كل النماذج مسبقًا — ينجح دائمًا (الفشل الفردي يتخطى النموذج) */
export function preloadGlbAssets(): Promise<void> {
  if (!preloadPromise) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const jobs = Object.values(DEFS).map(
      (def) =>
        new Promise<void>((resolve) => {
          loader.load(
            def.url,
            (gltf) => {
              const scene = gltf.scene;
              const mats = new Set<THREE.Material>();
              scene.traverse((obj) => {
                if (!(obj instanceof THREE.Mesh)) return;
                const arr = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (const m of arr) {
                  if (def.forceTransparent?.some((n) => (m.name || '').toLowerCase().includes(n))) {
                    m.transparent = true;
                    m.depthWrite = false;
                  }
                  if (def.doubleSide) m.side = THREE.DoubleSide;
                  if ('emissiveIntensity' in m) (m as THREE.MeshStandardMaterial).emissiveIntensity = Math.min((m as THREE.MeshStandardMaterial).emissiveIntensity ?? 0, 1);
                  mats.add(m);
                }
              });
              cache.set(def.url, scene);
              console.info('[glb] loaded:', def.url);
              resolve();
            },
            undefined,
            (err) => {
              console.warn('[glb] FAILED:', def.url, String(err));
              resolve(); // فشل التحميل → يبقى المجسم الإجرائي
            },
          );
        }),
    );
    preloadPromise = Promise.all(jobs).then(() => undefined);
  }
  return preloadPromise;
}

// ============================================================
// مساعدات التحويل والتطبيع
// ============================================================

function vec3(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

/**
 * يطبع نسخة النموذج على المرساة: يعيد (الجذر + الإزاحة المطبقة).
 * التطبيع: world = R·S·p ثم إزاحة بحيث تقع نقطة المرساة عند الأصل.
 */
function normalize(src: THREE.Object3D, def: PartDef): { root: THREE.Group; offset: THREE.Vector3 } {
  const root = new THREE.Group();
  root.name = 'glb-normalized';
  root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec3(def.basis[0]), vec3(def.basis[1]), vec3(def.basis[2])));
  root.scale.set(def.scale[0], def.scale[1], def.scale[2]);
  root.add(src);
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  const offset = new THREE.Vector3();
  if (def.anchor === 'center') offset.copy(bbox.getCenter(new THREE.Vector3())).negate();
  else if (def.anchor === 'minAll') offset.copy(bbox.min).negate();
  else {
    // minY: القاع عند Y=0 ومركز X/Z عند الصفر
    const c = bbox.getCenter(new THREE.Vector3());
    offset.set(c.x, bbox.min.y, c.z).negate();
  }
  // الإزاحة على الجذر نفسه (تُطبَّق بعد R·S في فضاء العالم) — لا تلمس src المحلي
  root.position.copy(offset);
  return { root, offset };
}

/** تفريغ مجموعة من أبنائها مع تحرير الهندسات (الخامات مشتركة من الـcache — لا تُحرر) */
function clearGroup(g: THREE.Object3D, keep: THREE.Object3D[] = []): void {
  for (const child of [...g.children]) {
    if (keep.includes(child)) continue;
    g.remove(child);
    child.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

/** تطبيق الظلال على كل الشبكات */
function setShadows(root: THREE.Object3D, cast: boolean, receive = false): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = cast;
      if (receive) o.receiveShadow = true;
    }
  });
}

/**
 * غلاف pivot على مستوى المجموعة الديناميكية (فضاءها = فضاء العالم قبل التموضع):
 * يسمح بتدوير الرافعة/المزلاج حول محور عالمي صحيح حتى لو كان الأب المباشر مُدارًا.
 */
function pivotAround(node: THREE.Object3D, group: THREE.Object3D, localY: Vec3): THREE.Object3D {
  group.updateMatrixWorld(true);
  const pivot = new THREE.Object3D();
  pivot.name = `${node.name || 'node'}-pivot`;
  node.getWorldPosition(pivot.position);
  group.worldToLocal(pivot.position);
  pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec3(localY).normalize());
  group.add(pivot);
  pivot.attach(node);
  return pivot;
}

/** برغي إجرائي صغير (للقطع التي لا تحمل براغٍ في النموذج الأصلي — أداة تفاعل الفك) */
function makeScrewAt(axis: 'x' | 'y' | 'z', r: number, len: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, len, 10);
  const m = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.85, roughness: 0.35 });
  const mesh = new THREE.Mesh(geo, m);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/** صندوق إجرائي صغير (قوابس الموصلات) */
function makePlugBox(w: number, h: number, d: number, color = 0x101418): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6 }));
  return mesh;
}

function findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
  return root.getObjectByName(name) ?? null;
}

/** إيجاد شبكة سطح العرض (المادة الداكنة) في نموذج الشاشة */
function findScreenMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (found || !(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => m.name === 'Monitor2_mat')) found = o;
  });
  return found;
}

// ============================================================
// الدمج الرئيسي
// ============================================================

/** يستبدل المجسمات الإجرائية بالنماذج الحقيقية (تزامني — يُستدعى داخل buildAllParts) */
export function applyGlbParts(visuals: PartVisuals): void {
  try {
    swapCase(visuals);
    swapMotherboard(visuals);
    swapCpu(visuals);
    swapCooler(visuals);
    swapRam(visuals);
    swapGpu(visuals);
    swapPsu(visuals);
    swapSsd(visuals);
    swapFans(visuals);
    swapMonitor(visuals);
    // (V6-A) تثبيت البطاقة على شق PCIe x16 الحقيقي المقاس من عقد النموذج
    alignGpuToSlot(visuals);
    console.info('[glb] apply done, cached =', cache.size);
    // hdd + الكابلات (atx24/eps/gpuPower/sata*) تبقى إجرائية — لا نموذج مجاني مناسب (موثق في التقرير)
  } catch (e) {
    console.warn('[glb] apply failed:', e);
  }
}

// ============================================================
// (V6-A) محاذاة البطاقة إلى شق PCIe x16 الحقيقي — من Anchors المقاسة
// ============================================================

/** سجل الارتكازات المقاسة لحظة التشغيل (يقرأه PCScene للتقارير والفحوص) */
export interface GpuSeatReport {
  seated: boolean;
  /** مركز شق PCIe x16 في فضاء المشهد */
  slotPoint: Vec3 | null;
  /** مستوى فتحات التوسعة الخلفية (Z) */
  bracketZ: number | null;
  /** صندوق البطاقة بعد الجلوس (world-ish في فضاء الجذر) */
  gpuBox: { min: Vec3; max: Vec3 } | null;
  /** مسافات التخلوص المكتشفة (وحدات مشهد، 1 = 10سم) */
  clearance: { toCooler: number; toRam: number } | null;
  source: 'glb-anchors' | 'procedural-fallback';
}

export const gpuSeat: GpuSeatReport = {
  seated: false, slotPoint: null, bracketZ: null, gpuBox: null, clearance: null,
  source: 'procedural-fallback',
};

/** مركز صندوق إحاطة عقدة باسمها داخل مجموعة (فضاء المجموعة الأب) */
function anchorCenter(group: THREE.Object3D, name: string, out: THREE.Vector3): boolean {
  const node = findNode(group, name);
  if (!node) return false;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(node);
  if (!isFinite(box.min.x)) {
    // عقدة بلا شبكة: استخدم موضعها
    node.getWorldPosition(out);
    group.parent?.worldToLocal(out);
    return true;
  }
  box.getCenter(out);
  group.parent?.worldToLocal(out);
  return true;
}

/**
 * يجلس البطاقة في شق PCIe x16 الحقيقي (توجيه V6 §2.3):
 *  1) مركز الشق من عقدة anchor_pcie_x16 في لوحة الأم الحقيقية (بديل إجرائي عند الفشل).
 *  2) مستوى البراكيت من anchor_slot_1 في هيكل الصندوق الحقيقي.
 *  3) القيود: الأطراف الذهبية (الحافة +X للبطاقة) داخل الشق، أعلى البطاقة بمستوى أعلى الشق،
 *     والبراكيت على مستوى فتحات التوسعة — ثم يفحص التخلوص من المبرد والذاكرة ويسجل النتيجة.
 */
function alignGpuToSlot(visuals: PartVisuals): void {
  const gpuGroup = visuals.dynamic.gpu;
  const boardGroup = visuals.dynamic.motherboard;
  gpuSeat.seated = false;
  gpuSeat.clearance = null;
  // تصفير كامل حتى لا يقرأ alignGpuPowerCable صناديق قديمة إن فشل التطبيق قبل الجلوس
  gpuSeat.gpuBox = null;
  gpuSeat.slotPoint = null;
  gpuSeat.bracketZ = null;

  const slot = new THREE.Vector3();
  const fromGlb = anchorCenter(boardGroup, 'anchor_pcie_x16', slot);
  // مستوى فتحات التوسعة الخلفية من الهيكل الحقيقي
  const bracket = new THREE.Vector3();
  const caseOk = anchorCenter(visuals.caseShell, 'anchor_slot_1', bracket);

  let seatX: number;
  let topY: number;
  let bracketZ: number;
  if (fromGlb) {
    // الأطراف تدخل قناة الشق ~2سم (الشق بارز من وجه اللوحة)
    seatX = slot.x + 0.02;
    topY = slot.y + 0.012;
    gpuSeat.source = 'glb-anchors';
  } else {
    // بديل إجرائي: فتحة x16 في مصنع القطع (Y=2.0، وجه اللوحة 1.82)
    seatX = 1.79;
    topY = 2.01;
    slot.set(1.79, 2.0, 1.42);
  }
  bracketZ = caseOk ? bracket.z : 0.12;
  gpuSeat.slotPoint = [slot.x, slot.y, slot.z];
  gpuSeat.bracketZ = bracketZ;

  gpuGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gpuGroup);
  if (isFinite(box.min.x)) {
    const dx = seatX - box.max.x;           // دفع الأطراف نحو الشق
    const dy = topY - box.max.y;            // إنزال البطاقة حتى مستوى الشق
    const dz = bracketZ + 0.004 - box.min.z; // البراكيت على مستوى الفتحات
    gpuGroup.position.x += dx;
    gpuGroup.position.y += dy;
    gpuGroup.position.z += dz;
  } else {
    // bbox غير متاح (مجسم إجرائي) — استخدم MOUNTS كما هي
    gpuGroup.position.set(1.47, 2.2, 1.42);
  }
  gpuGroup.updateMatrixWorld(true);

  const box2 = new THREE.Box3().setFromObject(gpuGroup);
  gpuSeat.gpuBox = { min: [box2.min.x, box2.min.y, box2.min.z], max: [box2.max.x, box2.max.y, box2.max.z] };
  gpuSeat.seated = true;

  // فحص تصادم تقريبي (توجيه V6 §2.3.7): مبرد CPU وRAM مقابل جسم البطاقة
  const coolerBox = new THREE.Box3().setFromObject(visuals.dynamic.cooler);
  const ramBox = new THREE.Box3().setFromObject(visuals.dynamic.ram);
  const gapTo = (other: THREE.Box3): number => {
    if (!isFinite(other.min.x)) return 99;
    const dy = Math.max(other.min.y - box2.max.y, box2.min.y - other.max.y);
    if (dy >= 0) return dy;
    // تداخل رأسي: قس الفجوة الأفقية
    const dz = Math.max(other.min.z - box2.max.z, box2.min.z - other.max.z);
    const dx2 = Math.max(other.min.x - box2.max.x, box2.min.x - other.max.x);
    return Math.max(dz, dx2);
  };
  gpuSeat.clearance = { toCooler: gapTo(coolerBox), toRam: gapTo(ramBox) };
  console.info(
    `[v6] GPU seated at slot (${slot.x.toFixed(2)}, ${slot.y.toFixed(2)}, ${slot.z.toFixed(2)}), bracketZ=${bracketZ.toFixed(2)}, ` +
    `clearance cooler=${(gpuSeat.clearance.toCooler * 10).toFixed(1)}cm ram=${(gpuSeat.clearance.toRam * 10).toFixed(1)}cm`,
  );
}

// ---------- (V6-G) موصل طاقة البطاقة + نهاية كابل الشاشة — اشتقاق من البطاقة الجالسة ----------

/**
 * يُستدعى مرة واحدة من buildAllParts بعد applyGlbParts (يغطي مسار GLB ومسار الفشل
 * الإجرائي معًا — gpuSeat.gpuBox يُملأ في alignGpuToSlot في الحالتين):
 *  1) موصل gpuPower كان مثبتًا على MOUNTS.gpuPower القديمة فيطفو ~1.4 وحدة فوق البطاقة
 *     بعد محاذاتها — يُعاد وضعه على مقبس 8pin فوق البطاقة: عقدة anchor_gpu_power في
 *     النموذج الحقيقي، أو مركز مقبس المجسم الإجرائي 'gpu-power-socket'، ثم أعلى البطاقة
 *     قرب حافتها الخلفية كحل أخير.
 *  2) كابل الطاقة يُعاد بناؤه لينتهي عند الموصل نفسه (النقاط الثابتة مخزنة في userData).
 *  3) نهاية كابل إشارة الشاشة تُشتق من منطقة منافذ البراكيت للبطاقة الجالسة — كانت
 *     معايرة على بطاقة v3 فكانت تغوص خلف الهيكل.
 * حتمية وقابلة لإعادة النداء — لا تعتمد على حالة متغيرة بين الندائين.
 */
export function alignGpuPowerCable(visuals: PartVisuals): void {
  const box = gpuSeat.gpuBox;
  if (!box) return;
  const gpuGroup = visuals.dynamic.gpu;
  const powerGroup = visuals.dynamic.gpuPower;
  if (!gpuGroup || !powerGroup) return;

  // 1) موضع موصل 8pin فوق سطح البطاقة
  const target = new THREE.Vector3();
  if (anchorCenter(gpuGroup, 'anchor_gpu_power', target)) {
    // لا يغرق الموصل داخل جسم البطاقة إن وسمت العقدة سطحًا أدنى من القمة
    target.y = Math.max(target.y, box.max[1] + 0.04);
  } else {
    const socket = findNode(gpuGroup, 'gpu-power-socket'); // مقبس المجسم الإجرائي
    if (socket) {
      gpuGroup.updateMatrixWorld(true);
      const sb = new THREE.Box3().setFromObject(socket);
      if (isFinite(sb.min.x)) sb.getCenter(target);
      else socket.getWorldPosition(target);
    } else {
      // حل أخير: أعلى البطاقة قرب حافتها الخلفية العلوية
      target.set((box.min[0] + box.max[0]) / 2, box.max[1] + 0.05, box.min[2] + 0.35);
    }
  }
  powerGroup.position.copy(target);
  powerGroup.updateMatrixWorld(true);

  // 2) إعادة بناء كابل الطاقة: مخرج PSU ثابت → صعود يسار الهيكل → فوق البطاقة → الموصل
  const cable = powerGroup.getObjectByName('gpu-power-cable');
  if (cable instanceof THREE.Mesh) {
    const fixed = cable.userData['worldPts'] as Array<readonly [number, number, number]> | undefined;
    if (fixed && fixed.length >= 2) {
      const rel = (p: THREE.Vector3): THREE.Vector3 => p.clone().sub(powerGroup.position);
      const pts = fixed.map((p) => rel(new THREE.Vector3(p[0], p[1], p[2])));
      // نقطة الاقتراب: من يسار البطاقة وفوق قمتها — لا يخترق الكابل جسم البطاقة
      pts.push(rel(new THREE.Vector3(box.min[0] - 0.25, box.max[1] + 0.3, (fixed[fixed.length - 1][2] + target.z) / 2)));
      pts.push(rel(target)); // الموصل نفسه = أصل المجموعة
      cable.geometry.dispose();
      cable.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.04, 8, false);
    }
  }

  // 3) نهاية كابل إشارة الشاشة على منطقة منافذ البراكيت الخلفي (F5)
  const portZ = box.min[2] + 0.02; // أطراف المنافذ عند الحد الخلفي للبطاقة
  let portX: number;
  let portY: number;
  if (gpuSeat.source === 'glb-anchors') {
    // حافة الشق = حافة البراكيت (موثقة بالتدقيق: منافذ عند x≈1.8، أعلى القمة بقليل)
    portX = box.max[0] - 0.03;
    portY = box.max[1] - 0.06;
  } else {
    // المجسم الإجرائي: مركز البراكيت المسماي = منطقة منافذه تمامًا
    const bracket = findNode(gpuGroup, 'gpu-bracket');
    gpuGroup.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(bracket ?? gpuGroup);
    if (isFinite(bb.min.x)) {
      portX = (bb.min.x + bb.max.x) / 2;
      portY = (bb.min.y + bb.max.y) / 2;
    } else {
      portX = gpuGroup.position.x;
      portY = box.max[1] - 0.06;
    }
  }
  const port = new THREE.Vector3(portX, portY, portZ);
  const signal = visuals.monitor.getObjectByName('monitor-signal-cable');
  if (signal instanceof THREE.Mesh) {
    const fixed = signal.userData['worldPts'] as Array<readonly [number, number, number]> | undefined;
    if (fixed) {
      const mp = PERIPH.monitorPos;
      const pts = fixed.map((p) => new THREE.Vector3(p[0] - mp[0], p[1] - mp[1], p[2] - mp[2]));
      pts.push(port.clone().sub(new THREE.Vector3(mp[0], mp[1], mp[2])));
      signal.geometry.dispose();
      signal.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.028, 8, false);
    }
  }

  console.info(
    `[v6] gpuPower connector seated at (${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}), ` +
    `monitor cable end at (${port.x.toFixed(2)}, ${port.y.toFixed(2)}, ${port.z.toFixed(2)})`,
  );
}

// ---------- الصندوق + الغطاء الزجاجي ----------

function swapCase(visuals: PartVisuals): void {
  const def = DEFS.case;
  const model = cache.get(def.url);
  if (!model) return;

  // 1) الهيكل: كل العقد ما عدا الزجاج
  const shellClone = model.clone(true);
  const glassNode = findNode(shellClone, 'case_glass');
  glassNode?.removeFromParent();
  const shellRoot = new THREE.Group();
  shellRoot.add(shellClone);
  const shellN = normalize(shellRoot, def);
  clearGroup(visuals.caseShell);
  setShadows(shellN.root, true, true);
  visuals.caseShell.add(shellN.root);

  // لمبة الطاقة الحقيقية — خامتها تُستنسخ لعزل التحكم بالإطفاء/التشغيل
  const led = findNode(visuals.caseShell, 'case_power_led');
  if (led instanceof THREE.Mesh) {
    const mats = Array.isArray(led.material) ? [led.material[0]] : [led.material];
    led.material = (mats[0] as THREE.MeshStandardMaterial).clone();
    visuals.flags.powerLed = led;
  }

  // 2) الغطاء الزجاجي داخل المجموعة المفصلية (محور المفصلة عند (0,2.25,0.06))
  // الهدف: عند زاوية الدوران 0 يكون الزجاج في مكانه الحقيقي في الإحداثيات العالمية:
  //   world = hinge · translate(offset − hinge) · R·S
  const glassSource = findNode(model, 'case_glass');
  if (glassSource) {
    const hinge = new THREE.Vector3(0, 2.25, 0.06);
    const wrap = new THREE.Group();
    wrap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec3(def.basis[0]), vec3(def.basis[1]), vec3(def.basis[2])));
    wrap.scale.set(def.scale[0], def.scale[1], def.scale[2]);
    wrap.position.copy(shellN.offset).sub(hinge);
    wrap.add(glassSource.clone(true));
    clearGroup(visuals.sidePanel);
    visuals.sidePanel.add(wrap);
    setShadows(wrap, false);
  }
}

// ---------- اللوحة الأم ----------

function swapMotherboard(visuals: PartVisuals): void {
  const def = DEFS.motherboard;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.dynamic.motherboard;
  const keep: THREE.Object3D[] = [];
  clearGroup(group, keep);

  const board = normalize(model.clone(true), def);
  setShadows(board.root, true, true);
  group.add(board.root);

  const flags = visuals.flags;

  // رافعة مقبس المعالج — تدور حول محور Z العالمي (عمودي على طول الرافعة)
  const lever = findNode(group, 'socket_lever');
  if (lever) {
    const pivot = pivotAround(lever, group, [0, 0, -1]);
    pivot.name = 'flag-cpu-lever';
    flags.cpuLever = pivot;
  }

  // مزالج RAM الأربعة — كل واحدة داخل pivot محلي-Z نحو محور الفتحة (+Y العالمي)
  flags.ramClips = [];
  for (const name of ['dimm_latch_A1', 'dimm_latch_A2', 'dimm_latch_B1', 'dimm_latch_B2']) {
    const latch = findNode(group, name);
    if (!latch) continue;
    const pivot = pivotAround(latch, group, [0, 1, 0]);
    pivot.name = 'flag-ram-clip';
    flags.ramClips.push(pivot);
  }

  // مزلاج PCIe x16 — يدور حول محور الفتحة (±Z العالمي)
  const pcieLatch = findNode(group, 'pcie_x16_latch');
  if (pcieLatch) {
    const pivot = pivotAround(pcieLatch, group, [0, 0, -1]);
    pivot.name = 'flag-pcie-latch';
    flags.pcieLatch = pivot;
  }

  // برغي M.2 الحقيقي
  const m2 = findNode(group, 'm2_screw');
  if (m2) flags.m2Screw = m2;

  // براغي تثبيت اللوحة (إجرائية — النموذج لا يحمل براغٍ منفصلة): تُسحب نحو −X عند الفك
  flags.moboScrews = [];
  for (const wy of [-1.4, 0, 1.4]) {
    for (const wz of [-1.12, 1.12]) {
      const s = makeScrewAt('x', 0.035, 0.22);
      s.position.set(-0.02, wy, wz);
      s.name = 'flag-mobo-screw';
      flags.moboScrews.push(s);
      group.add(s);
    }
  }

  // قابس رؤوس المراوح + قابس Front Panel (إجرائيان — مواضع منطقية على اللوحة)
  const fanPlug = makePlugBox(0.08, 0.08, 0.18);
  fanPlug.position.set(-0.07, 1.44, 0.775);
  fanPlug.name = 'flag-fan-header-plug';
  flags.fanHeaderPlug = fanPlug;
  group.add(fanPlug);

  const fpPlug = makePlugBox(0.05, 0.14, 0.22);
  fpPlug.position.set(-0.115, -1.2, 0.9);
  fpPlug.name = 'flag-front-panel-plug';
  flags.frontPanelPlug = fpPlug;
  group.add(fpPlug);
}

// ---------- المعالج ----------

function swapCpu(visuals: PartVisuals): void {
  const def = DEFS.cpu;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.dynamic.cpu;
  clearGroup(group);
  const cpu = normalize(model.clone(true), def);
  setShadows(cpu.root, true);
  group.add(cpu.root);
}

// ---------- المبرد ----------

function swapCooler(visuals: PartVisuals): void {
  const def = DEFS.cooler;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.dynamic.cooler;
  clearGroup(group);
  const cooler = normalize(model.clone(true), def);
  setShadows(cooler.root, true);
  group.add(cooler.root);
}

// ---------- ذاكرة RAM (شريحتان في الفتحتين 1 و3) ----------

function swapRam(visuals: PartVisuals): void {
  const def = DEFS.ram;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.dynamic.ram;
  clearGroup(group);
  for (const dz of [-0.08, 0.08]) {
    const stick = normalize(model.clone(true), def);
    stick.root.position.z = dz;
    setShadows(stick.root, true);
    group.add(stick.root);
  }
}

// ---------- بطاقة الرسومات ----------

function swapGpu(visuals: PartVisuals): void {
  const def = DEFS.gpu;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.dynamic.gpu;
  clearGroup(group);
  const gpu = normalize(model.clone(true), def);
  gpu.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.side = THREE.DoubleSide;
    }
  });
  setShadows(gpu.root, true);
  group.add(gpu.root);

  // براغي البراكيت (إجرائية) — ترتفع عند الفك
  visuals.flags.gpuScrews = [];
  for (const dz of [-1.42, -1.34]) {
    const s = makeScrewAt('y', 0.035, 0.1);
    s.position.set(0, 0.74, dz);
    s.name = 'flag-gpu-screw';
    visuals.flags.gpuScrews.push(s);
    group.add(s);
  }
}

// ---------- مزود الطاقة ----------

function swapPsu(visuals: PartVisuals): void {
  const def = DEFS.psu;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.dynamic.psu;
  clearGroup(group);
  const psu = normalize(model.clone(true), def);
  setShadows(psu.root, true);
  group.add(psu.root);

  // 4 براغي الوجه الخلفي (إجرائية)
  visuals.flags.psuScrews = [];
  for (const dx of [-0.45, 0.45]) {
    for (const dy of [-0.25, 0.25]) {
      const s = makeScrewAt('y', 0.03, 0.08);
      s.position.set(dx, dy, -0.74);
      s.name = 'flag-psu-screw';
      visuals.flags.psuScrews.push(s);
      group.add(s);
    }
  }
}

// ---------- M.2 SSD ----------

function swapSsd(visuals: PartVisuals): void {
  const def = DEFS.ssd;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.dynamic.ssd;
  clearGroup(group);
  const ssd = normalize(model.clone(true), def);
  setShadows(ssd.root, true);
  group.add(ssd.root);
}

// ---------- مراوح الهيكل (أمامية ×2 + خلفية) ----------

function swapFans(visuals: PartVisuals): void {
  const def = DEFS.fan;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.dynamic.fans;
  clearGroup(group);
  // براغي المراوح الإجرائية القديمة (مراجع ميتة بعد التفريغ) تُمسح قبل إعادة البناء
  visuals.flags.fanScrews = [];

  const mount = visuals.dynamic.fans.position;
  for (const fd of [
    { id: 'front-1', pos: [1.05, 2.8, 4.42], rotX: Math.PI / 2, front: true },
    { id: 'front-2', pos: [1.05, 1.4, 4.42], rotX: Math.PI / 2, front: true },
    { id: 'rear', pos: [1.05, 3.7, 0.33], rotX: -Math.PI / 2, front: false },
  ] as Array<{ id: string; pos: Vec3; rotX: number; front: boolean }>) {
    const d = fd;
    const wrapper = new THREE.Group();
    wrapper.name = `case-fan-${d.id}`;
    wrapper.position.set(d.pos[0] - mount.x, d.pos[1] - mount.y, d.pos[2] - mount.z);
    wrapper.rotation.x = d.rotX;
    // داخل الغلاف المُدار: محور المروحة (+X_g) نحو +Y المحلي (يصبح ±Z عالميًا)
    const basis: [Vec3, Vec3, Vec3] = d.front ? [[0, 1, 0], [0, 0, 1], [1, 0, 0]] : [[0, -1, 0], [0, 0, -1], [1, 0, 0]];
    const bdef: PartDef = { ...def, basis, scale: [10, 10, 10], anchor: 'center' };
    const fan = normalize(model.clone(true), bdef);
    wrapper.add(fan.root);

    // 4 براغي الزوايا (إجرائية — على محور المروحة المحلي Y)
    const half = 0.53;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const s = makeScrewAt('y', 0.03, 0.06);
        s.position.set(sx * half, 0.16, sz * half);
        s.name = 'flag-fan-screw';
        visuals.flags.fanScrews.push(s);
        wrapper.add(s);
      }
    }
    group.add(wrapper);
    const rotor = findNode(wrapper, 'fan_rotor');
    if (rotor) {
      rotor.name = `fan_rotor_${d.id}`; // اسم فريد لكل مروحة (منظومة V6 للمراوح)
    }
  }
}

// ---------- الشاشة (جسم GLB + سطح عرض Canvas + الزر والكابل الإجرائيان) ----------

function swapMonitor(visuals: PartVisuals): void {
  const def = DEFS.monitor;
  const model = cache.get(def.url);
  if (!model) return;
  const group = visuals.monitor;

  // إبقاء الكابل وزر الطاقة الإجرائيين (المصنوعان في buildMonitor) ثم استبدال الجسم
  const cable = group.getObjectByName('monitor-cable');
  const oldBtn = group.getObjectByName('monitor-power-btn');

  clearGroup(group, [cable, oldBtn].filter(Boolean) as THREE.Object3D[]);

  const mon = normalize(model.clone(true), def);
  setShadows(mon.root, true);
  group.add(mon.root);

  // إعادة تلوين: الجسم والبيزل الفتشان → معدن داكن (CC0 يسمح بالتعديل)
  const targets = ['Monitor3_mat', 'Monitor4_mat'];
  mon.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (targets.includes(m.name || '')) {
        const std = m as THREE.MeshStandardMaterial;
        std.color.set(0x1c222a);
        std.metalness = 0.55;
        std.roughness = 0.45;
      }
    }
  });

  // سطح العرض: إطار Plane فوق وجه الشاشة الحقيقي (المادة الداكنة Monitor2_mat)
  const screenMesh = findScreenMesh(mon.root);
  if (screenMesh) {
    const bbox = new THREE.Box3().setFromObject(screenMesh);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    // المحور الرقيق = عمود سطح العرض
    const dims = [size.x, size.y, size.z];
    const thinAxis = dims.indexOf(Math.min(...dims)) as 0 | 1 | 2;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 0.985, size.y * 0.975),
      new THREE.MeshBasicMaterial({ color: 0x05070c }),
    );
    if (thinAxis === 2) {
      plane.position.set(center.x, center.y, center.z + size.z * 0.75);
    } else if (thinAxis === 1) {
      plane.rotation.x = Math.PI / 2;
      plane.position.set(center.x, center.y + size.y * 0.75, center.z);
    } else {
      plane.rotation.y = Math.PI / 2;
      plane.position.set(center.x + size.x * 0.75, center.y, center.z);
    }
    plane.name = 'monitor-screen';
    group.add(plane);

    // زر الطاقة + لمبة — أسفل يمين سطح العرض (قابل للنقر)
    const btn = oldBtn ?? makePlugBox(0.12, 0.09, 0.05, 0x2a323c);
    btn.userData['peripheral'] = 'monitor-power';
    btn.name = 'monitor-power-btn';
    const chinY = bbox.min.y - 0.14;
    const chinZ = center.z + size.z * 0.75 + 0.02;
    btn.position.set(bbox.max.x - 0.3, chinY, chinZ);
    group.add(btn);
    const ledMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.045, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.5 }),
    );
    ledMesh.position.set(bbox.min.x + 0.28, chinY, chinZ);
    ledMesh.name = 'monitor-chin-led';
    group.add(ledMesh);
  } else {
    // (إصلاح تدقيق V6-G) نموذج بلا مادة سطح العرض (Monitor2_mat): يعاد إنشاء السطح
    // الإجرائي بنفس أبعاد buildMonitor وإلا بقي بلا 'monitor-screen' فيفقد الرسّام
    // كانفسه وتظل الشاشة سوداء بلا زر تفاعلي
    console.warn('[glb] monitor.glb بلا مادة سطح العرض (Monitor2_mat) — أُعيد إنشاء السطح الإجرائي');
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(PERIPH.screenW, PERIPH.screenH),
      new THREE.MeshBasicMaterial({ color: 0x05070c }),
    );
    plane.name = 'monitor-screen';
    plane.position.set(PERIPH.screenCenterLocal[0], PERIPH.screenCenterLocal[1] + 0.05, PERIPH.screenCenterLocal[2]);
    group.add(plane);

    // زر الطاقة + لمبة الذقن — نفس هندسة buildMonitor (الزر قابل للنقر)
    const panelY = PERIPH.screenCenterLocal[1] + 0.05;
    const panelZ = PERIPH.screenCenterLocal[2] - 0.07;
    const chinY = panelY - (PERIPH.screenH + 0.2) / 2 + 0.07;
    const btn = oldBtn ?? makePlugBox(0.12, 0.09, 0.05, 0x2a323c);
    btn.userData['peripheral'] = 'monitor-power';
    btn.name = 'monitor-power-btn';
    btn.position.set((PERIPH.screenW + 0.2) / 2 - 0.26, chinY, panelZ + 0.08);
    group.add(btn);
    const ledMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.045, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.5 }),
    );
    ledMesh.position.set(-((PERIPH.screenW + 0.2) / 2) + 0.28, chinY, panelZ + 0.086);
    ledMesh.name = 'monitor-chin-led';
    group.add(ledMesh);
  }
}
