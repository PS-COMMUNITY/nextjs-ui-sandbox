/**
 * مصنع مجسمات الجهاز الإجرائية (Procedural PC Parts Factory)
 * ------------------------------------------------------------
 * يبني كل المجسمات البرمجية (بلا نماذج خارجية) وفق تخطيط layout.ts:
 *  - المحاور: X∈[0,2.1] (0=زجاج، 2.1=جدار اللوحة)، Y∈[0,4.5]، Z∈[0,4.6] (0=خلف، 4.6=أمام).
 *  - اللوحة الأم عمودية، وجهها نحو -X. كل مجموعات dynamic تُبنى متمركزة حول الأصل
 *    ثم توضع على MOUNTS[id] (المدير يحرّكها لاحقًا إلى صينية TRAY مع TRAY.rotations).
 *  - المواد: MeshStandardMaterial فقط (الزجاج MeshPhysicalMaterial) عبر cache موحّد.
 *
 * المصدَّرات: setComponentId / buildEnvironment / buildAllParts
 * المخرجات المرجعية: 6 spinners (شفرات مراوح) و~40 مرجع flags.
 */
import * as THREE from 'three';
import type { ComponentId } from '../types';
import type { SceneQuality, FlagVisuals, PartVisuals } from './visualTypes';
import { BOARD, CASE, COLORS, MOUNTS, TRAY } from './layout';

// ============================================================
// حالة المصنع والمواد المشتركة
// ============================================================

/** تُفعَّل داخل buildAllParts حسب الجودة (الظلال على القطع الرئيسية) */
let castEnabled = false;

/** cache للمواد القياسية — لا تنشئ مواد جديدة لكل إطار */
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial {
  const key = `${color}-${metalness}-${roughness}`;
  const cached = matCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: false });
  matCache.set(key, m);
  return m;
}

/** زجاج الغطاء الجانبي — مادة فيزيائية واحدة مشتركة */
let glassMat: THREE.MeshPhysicalMaterial | null = null;
function glass(): THREE.MeshPhysicalMaterial {
  if (!glassMat) {
    glassMat = new THREE.MeshPhysicalMaterial({
      color: COLORS.glass,
      metalness: 0.1,
      roughness: 0.08,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      flatShading: false,
    });
  }
  return glassMat;
}

// ============================================================
// مساعدات هندسية
// ============================================================

/** صندوق سريع مع ضبط الظلال حسب الجودة */
function box(
  w: number, h: number, d: number, material: THREE.Material,
  x = 0, y = 0, z = 0, cast = true, receive = false,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (castEnabled && cast) m.castShadow = true;
  if (receive) m.receiveShadow = true;
  return m;
}

type Axis = 'x' | 'y' | 'z';

/** أسطوانة سريعة بمحور محدد (12 قطعة قطاعية — اقتصادية) */
function cyl(radius: number, length: number, material: THREE.Material, axis: Axis, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  if (castEnabled && cast) m.castShadow = true;
  return m;
}

/** برغي معدني صغير — محور حسب الاستخدام */
function makeScrew(r: number, length: number, axis: Axis = 'y'): THREE.Mesh {
  return cyl(r, length, mat(COLORS.aluminum, 0.85, 0.35), axis);
}

/** كابل أنبوبي على منحنى CatmullRom (نقاط محلية داخل مجموعة القطعة) */
function makeCable(points: THREE.Vector3[], radius: number): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 8, false), mat(0x181d24, 0.3, 0.6));
  if (castEnabled) m.castShadow = true;
  return m;
}

/** تحويل نقاط كابل عالمية إلى محلية بالنسبة لموضع تثبيت القطعة */
function cablePoints(mount: readonly [number, number, number], pts: Array<readonly [number, number, number]>): THREE.Vector3[] {
  return pts.map((p) => new THREE.Vector3(p[0] - mount[0], p[1] - mount[1], p[2] - mount[2]));
}

interface FanParts { frame: THREE.Group; blades: THREE.Group; }

/**
 * مروحة عامة: إطار (4 أركان + حلقة Torus) + شفرات (7 ألواح مائلة 30°) + محور مركزي.
 * محور الدوران الافتراضي = Y المحلي (تُلف المروحة لاحقًا حسب موضعها).
 */
function makeFan(radius: number): FanParts {
  const depth = Math.max(0.12, radius * 0.55);
  const half = radius + 0.06;

  // الإطار
  const frame = new THREE.Group();
  const frameMat = mat(COLORS.plastic, 0.3, 0.6);
  const postGeo = new THREE.BoxGeometry(0.09, depth, 0.09);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(sx * half, 0, sz * half);
      if (castEnabled) post.castShadow = true;
      frame.add(post);
    }
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.97, 0.018, 6, 24), mat(COLORS.metalDark, 0.5, 0.5));
  ring.rotation.x = Math.PI / 2; // الحلقة في مستوى XZ (عمودية على محور Y)
  if (castEnabled) ring.castShadow = true;
  frame.add(ring);

  // الشفرات: 7 ألواح موزعة دائريًا داخل مجموعة blades (تُدفع إلى spinners)
  const blades = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(0.02, radius * 0.8, radius * 0.35);
  const bladeMat = mat(COLORS.metalMid, 0.4, 0.5);
  for (let i = 0; i < 7; i++) {
    const arm = new THREE.Object3D();
    arm.rotation.y = (i / 7) * Math.PI * 2;
    const pitch = new THREE.Object3D();
    pitch.position.set(radius * 0.5, 0, 0);
    pitch.rotation.x = Math.PI / 6; // ميلان الشفرة 30° حول المحور الشعاعي
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.z = Math.PI / 2; // الطول شعاعيًا
    if (castEnabled) blade.castShadow = true;
    pitch.add(blade);
    arm.add(pitch);
    blades.add(arm);
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, depth * 0.7, 12),
    mat(COLORS.metalDark, 0.5, 0.4),
  );
  if (castEnabled) hub.castShadow = true;
  blades.add(hub);

  return { frame, blades };
}

/** ألوان أسلاك داكنة متنوعة (توهم أسلاك كابل الطاقة) */
const WIRE_COLORS: readonly number[] = [0x141414, 0x1d1414, 0x14201a, 0x141424, 0x241f10, 0x101418];

// ============================================================
// تعريف المكوّن لأغراض الالتقاط (Raycast)
// ============================================================

/** يضع userData.componentId على الجذر وعلى كل أبناء الشجرة */
export function setComponentId(g: THREE.Object3D, id: ComponentId): void {
  g.traverse((o) => {
    o.userData.componentId = id;
  });
}

// ============================================================
// بيئة المشهد (خلفية/ضباب/أرضية/شبكة/إضاءة)
// ============================================================

export function buildEnvironment(scene: THREE.Scene, quality: SceneQuality): void {
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 18, 42);

  // أرضية دائرية داكنة تستقبل الظلال
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(22, 24),
    new THREE.MeshStandardMaterial({ color: 0x141a22, metalness: 0, roughness: 0.92, flatShading: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  // شبكة أرضية خفيفة
  const grid = new THREE.GridHelper(30, 30, 0x2a3340, 0x1a212b);
  grid.position.y = 0.01;
  const gridMat: THREE.Material | THREE.Material[] = grid.material;
  const gridMats = Array.isArray(gridMat) ? gridMat : [gridMat];
  for (const gm of gridMats) {
    gm.transparent = true;
    gm.opacity = 0.4;
  }
  scene.add(grid);

  // إضاءة مباشرة مخفّضة — الخريطة البيئية (scene.environment) تتكفل بالملء العام
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x20242c, 0.5));

  // شمس دافئة مع ظلال (حسب الجودة)
  const dir = new THREE.DirectionalLight(0xfff2e0, 2.0);
  dir.position.set(-6, 8, 6);
  if (quality !== 'low') {
    dir.castShadow = true;
    const size = quality === 'high' ? 2048 : 1024;
    dir.shadow.mapSize.set(size, size);
    dir.shadow.camera.left = -6;
    dir.shadow.camera.right = 6;
    dir.shadow.camera.top = 6;
    dir.shadow.camera.bottom = -6;
    dir.shadow.camera.near = 2;
    dir.shadow.camera.far = 30;
    dir.shadow.camera.updateProjectionMatrix();
    dir.shadow.bias = -0.0004;
    dir.shadow.normalBias = 0.02;
  }
  scene.add(dir);

  // ضوء تعبئة خفيف خلفي (بلا ظلال؛ decay=0 ليبقى «خفيفًا» بمقدار 0.5 فعليًا)
  const fill = new THREE.PointLight(0xffffff, 0.5, 0, 0);
  fill.position.set(3, 3, -2);
  scene.add(fill);
  // ضوء أمامي موجّه من جهة الزجاج لإبراز وجه اللوحة الأم
  const front = new THREE.PointLight(0xfff4e0, 1.0, 0, 0);
  front.position.set(-5, 3.5, 3);
  scene.add(front);
}

// ============================================================
// الهيكل الثابت (caseShell) — جدران/خلفية/واجهة/قواعد
// ============================================================

function buildCaseShell(flags: FlagVisuals): THREE.Group {
  const g = new THREE.Group();
  g.name = 'case-shell';

  const cx = (CASE.minX + CASE.maxX) / 2; // 1.05
  const cy = (CASE.minY + CASE.maxY) / 2; // 2.25
  const cz = (CASE.minZ + CASE.maxZ) / 2; // 2.3
  const wX = CASE.maxX - CASE.minX;       // 2.1
  const hY = CASE.maxY - CASE.minY;       // 4.5
  const dZ = CASE.maxZ - CASE.minZ;       // 4.6
  const wallMat = mat(COLORS.metalDark, 0.45, 0.55);
  const trayWallMat = mat(0x2c343e, 0.5, 0.5); // جدار صينية اللوحة الأم — أفتح قليلًا لتمييزه

  // الجدران (سماكة 0.05) — الجدار الأيمن عند x≈2.1 يستقبل اللوحة الأم
  g.add(box(0.05, hY, dZ, trayWallMat, CASE.maxX - 0.025, cy, cz, true, true)); // يمين
  g.add(box(wX, 0.05, dZ, wallMat, cx, CASE.maxY - 0.025, cz, true, true)); // سقف
  g.add(box(wX, 0.05, dZ, wallMat, cx, CASE.minY + 0.025, cz, true, true)); // أرضية
  g.add(box(wX, hY, 0.05, wallMat, cx, cy, CASE.minZ + 0.025, true, true)); // خلف
  g.add(box(wX, hY, 0.05, mat(0x262d36, 0.35, 0.6), cx, cy, CASE.maxZ - 0.025, true, true)); // أمام

  // حافة مشطوفة على مخطط الصينية (شريط معدني فاتح يفصل الصينية عن قصورة الكابلات)
  g.add(box(0.02, hY * 0.92, 0.02, mat(0x414c58, 0.6, 0.4), CASE.maxX - 0.18, cy, CASE.maxZ - 0.62, false));

  // قصورة I/O الخلفية (مستطيل داكن بارز قليلًا خارج اللوحة الخلفية)
  g.add(box(0.55, 1.1, 0.03, mat(COLORS.black, 0.3, 0.6), 1.35, 3.35, CASE.minZ - 0.005, false));

  // 7 مقابس توسعة أفقية (محور X) مكدسة رأسيًا أسفل I/O
  const slotStripMat = mat(COLORS.metalMid, 0.6, 0.45);
  for (let i = 0; i < 7; i++) {
    g.add(box(0.72, 0.05, 0.03, slotStripMat, 1.35, 2.55 - i * 0.13, CASE.minZ - 0.005, false));
  }

  // شريط شبكة تهوية على الواجهة الأمامية (شرائط أفقية رفيعة)
  const ventMat = mat(0x11151b, 0.3, 0.6);
  for (let i = 0; i < 9; i++) {
    g.add(box(1.5, 0.035, 0.03, ventMat, 1.05, 1.1 + i * 0.275, CASE.maxZ + 0.035, false));
  }

  // زر التشغيل (أسطوانة على السطح العلوي قرب الواجهة) + لمبة LED
  g.add(cyl(0.07, 0.06, mat(COLORS.metalMid, 0.5, 0.4), 'y', 0.5, CASE.maxY + 0.005, CASE.maxZ - 0.45, false));
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x10151b, emissive: 0x000000, emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.1, flatShading: false,
  });
  const powerLed = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), ledMat); // مادة فريدة يتحكم بها علم powerOn
  powerLed.position.set(0.78, CASE.maxY + 0.01, CASE.maxZ - 0.45);
  flags.powerLed = powerLed;
  g.add(powerLed);

  // قاعدتان سفليتان
  const footMat = mat(COLORS.black, 0.3, 0.6);
  g.add(box(wX, 0.06, 0.45, footMat, cx, 0.03, CASE.minZ + 0.45, true));
  g.add(box(wX, 0.06, 0.45, footMat, cx, 0.03, CASE.maxZ - 0.45, true));

  // 6 مسامير تثبيت اللوحة الأم — أبناء الهيكل (تبقى في الهيكل عند فك اللوحة)
  const ys = [BOARD.yMin + 0.1, (BOARD.yMin + BOARD.yMax) / 2, BOARD.yMax - 0.1];
  const zs = [BOARD.zMin + 0.1, BOARD.zMax - 0.1];
  for (const wy of ys) {
    for (const wz of zs) {
      const s = makeScrew(0.035, 0.3, 'x');
      s.position.set(BOARD.x + 0.05, wy, wz);
      flags.moboScrews.push(s);
      g.add(s);
    }
  }

  setComponentId(g, 'case');
  return g;
}

// ============================================================
// الغطاء الجانبي الزجاجي المفصلي (sidePanel)
// ============================================================

function buildSidePanel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-side-panel';
  g.position.set(0, 2.25, 0.06); // محور المفصلة Y عند الحافة الخلفية

  // الزجاج: عند الدوران 0 يكون مستويًا على x=0
  const glassMesh = box(0.04, 4.4, 4.5, glass(), 0, 0, 2.24, false);
  glassMesh.name = 'panel-glass';
  g.add(glassMesh);

  // إطار معدني رفيع
  const frameMat = mat(COLORS.metalMid, 0.6, 0.4);
  g.add(box(0.07, 0.06, 4.56, frameMat, 0, 2.23, 2.24, true));  // علوي
  g.add(box(0.07, 0.06, 4.56, frameMat, 0, -2.23, 2.24, true)); // سفلي
  g.add(box(0.07, 4.52, 0.07, frameMat, 0, 0, 0, true));        // خلفي (عند المفصلة)
  g.add(box(0.07, 4.52, 0.07, frameMat, 0, 0, 4.49, true));     // أمامي

  setComponentId(g, 'case');
  return g;
}

// ============================================================
// اللوحة الأم (dynamic.motherboard) — متمركزة عند MOUNTS.motherboard
// محليًا: الوجه الأمامي نحو -X عند x = -thickness/2
// ============================================================

function buildMotherboard(flags: FlagVisuals): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-motherboard';
  const face = -BOARD.thickness / 2;                  // -0.03
  const onFace = (t: number): number => face - t / 2; // مركز قطعة سماكتها t على الوجه

  // 1) جسم PCB (السماكة على X، الأبعاد من BOARD)
  g.add(box(BOARD.thickness, BOARD.yMax - BOARD.yMin, BOARD.zMax - BOARD.zMin, mat(COLORS.pcb, 0.35, 0.6), 0, 0, 0, true, true));

  // 1ب) تفاصيل SMD: رقائق صغيرة + مكثفات VRM تملأ الوجه الأمامي (مواقع خارج كل القطع الأخرى)
  const chipMat = mat(0x11171e, 0.25, 0.5);
  const capMat = mat(0x3a4a58, 0.55, 0.4);
  const chipSpots: Array<readonly [number, number]> = [
    [1.0, -0.8], [1.0, -0.65], [1.0, -0.5], [1.04, -0.35],          // صف VRM فوق المقبس
    [0.45, 0.5], [0.55, 0.68], [0.4, 0.82], [0.7, 0.55], [0.85, 0.75], // يمين فتحات RAM
    [-0.3, 0.82], [-0.42, 0.88],                                     // تحت فتحات RAM
    [-1.38, -0.62], [-1.38, -0.34],                                  // أسفل فتحات PCIe
  ];
  for (const [sy, sz] of chipSpots) {
    g.add(box(0.045, 0.09, 0.15, chipMat, onFace(0.045), sy, sz, false));
  }
  const capGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.09, 10);
  for (const cz of [-0.98, -0.84, -0.7, -0.56]) {
    const c = new THREE.Mesh(capGeo, capMat);
    c.rotation.z = Math.PI / 2;
    c.position.set(onFace(0.09), 0.86, cz);
    g.add(c);
  }

  // 2) مقبس المعالج: إطار + لوح معدني داخلي (عالمي y=3.45, z=0.95)
  g.add(box(0.06, 0.42, 0.42, mat(COLORS.aluminum, 0.8, 0.45), onFace(0.06), 0.7, -0.62, true));
  g.add(box(0.04, 0.36, 0.36, mat(0xc2c9d1, 0.9, 0.3), onFace(0.04) - 0.005, 0.7, -0.62, false));

  // رافعة المقبس: pivot عند حافة المقبس (يدور حول X المحلي عند الفتح)
  const lever = new THREE.Object3D();
  lever.name = 'flag-cpu-lever';
  lever.position.set(onFace(0.06) - 0.04, 0.45, -0.87);
  lever.add(box(0.025, 0.42, 0.045, mat(COLORS.plastic, 0.2, 0.5), 0, 0.21, 0.02, false));
  flags.cpuLever = lever;
  g.add(lever);

  // 3) أربع فتحات RAM عمودية + مزلاجان لكل فتحة (8 pivots تدور حول X)
  const ramSlotGeo = new THREE.BoxGeometry(0.05, 1.35, 0.08);
  const ramSlotMat = mat(0x1b1f26, 0.2, 0.55);
  const clipGeo = new THREE.BoxGeometry(0.07, 0.07, 0.1);
  const clipMat = mat(0x39414c, 0.3, 0.5);
  for (const z of [-0.27, -0.07, 0.13, 0.33]) { // عالمي z = 1.30 .. 1.90
    const slot = new THREE.Mesh(ramSlotGeo, ramSlotMat);
    slot.position.set(onFace(0.05), 0.55, z);
    g.add(slot);
    for (const end of [1, -1]) {
      const clip = new THREE.Object3D();
      clip.name = 'flag-ram-clip';
      clip.position.set(onFace(0.05) - 0.005, 0.55 + end * 0.675, z);
      const cm = new THREE.Mesh(clipGeo, clipMat);
      cm.position.set(0, end * 0.05, 0);
      clip.add(cm);
      flags.ramClips.push(clip);
      g.add(clip);
    }
  }

  // 4) فتحتا PCIe أفقيتان على Z (x16 عند عالمي y=2.0، x4 عند 1.65)
  const pcieMat = mat(0x242a33, 0.2, 0.55);
  g.add(box(0.05, 0.07, 1.85, pcieMat, onFace(0.05), -0.75, -0.15, true));
  g.add(box(0.05, 0.07, 1.85, pcieMat, onFace(0.05), -1.1, -0.15, true));

  // مزلاج PCIe الأبيض عند الطرف الخلفي للفتحة الأولى (pivot عند z المحلي السالب)
  const latch = new THREE.Object3D();
  latch.name = 'flag-pcie-latch';
  latch.position.set(onFace(0.05) - 0.035, -0.75, -1.10);
  latch.add(box(0.05, 0.16, 0.06, mat(0xd8dade, 0.1, 0.5), 0, 0.06, 0, false));
  flags.pcieLatch = latch;
  g.add(latch);

  // 5) مشتت chipset: قاعدة + زعانف ألمنيوم
  const alu = mat(COLORS.aluminum, 0.85, 0.4);
  g.add(box(0.03, 0.35, 0.35, alu, onFace(0.03), -0.35, 0.5, true));
  const finGeo = new THREE.BoxGeometry(0.09, 0.03, 0.35);
  for (let i = 0; i < 5; i++) {
    const fin = new THREE.Mesh(finGeo, alu);
    fin.position.set(onFace(0.03) - 0.06, -0.49 + i * 0.07, 0.5);
    g.add(fin);
  }

  // 6) منطقة M.2: مقبس صغير + برغي التثبيت (يبقى على اللوحة عند فك ssd)
  g.add(box(0.06, 0.06, 0.1, mat(COLORS.black, 0.3, 0.5), onFace(0.06), -0.2, -0.14, false));
  const m2Screw = cyl(0.028, 0.06, mat(COLORS.aluminum, 0.85, 0.35), 'x', onFace(0.06) + 0.005, -0.2, -0.52, false);
  m2Screw.name = 'flag-m2-screw';
  flags.m2Screw = m2Screw;
  g.add(m2Screw);

  // 7) رؤوس الموصلات على الوجه -X
  const black = mat(COLORS.black, 0.3, 0.5);
  g.add(box(0.08, 0.5, 0.25, black, onFace(0.08), 1.0, 1.05, true));   // ATX24 (عالمي 3.75, 2.62)
  g.add(box(0.08, 0.26, 0.2, black, onFace(0.08), 1.27, -1.02, true)); // EPS (عالمي 4.02, 0.55)

  // 4 منافذ مراوح pin headers عند الحافة العلوية + قابسها
  const headerMat = mat(0x1b1f26, 0.2, 0.55);
  const headerGeo = new THREE.BoxGeometry(0.05, 0.06, 0.1);
  for (const hz of [0.7, 0.85, 1.0, 1.15]) {
    const h = new THREE.Mesh(headerGeo, headerMat);
    h.position.set(onFace(0.05), 1.44, hz);
    g.add(h);
  }
  const fanPlug = box(0.08, 0.08, 0.18, mat(0x101418, 0.2, 0.6), onFace(0.08) - 0.03, 1.44, 0.775, false);
  fanPlug.name = 'flag-fan-header-plug';
  flags.fanHeaderPlug = fanPlug;
  g.add(fanPlug);

  // كتلة front-panel + قابسها (عند الحافة السفلية الأمامية)
  g.add(box(0.06, 0.14, 0.22, headerMat, onFace(0.06), -1.2, 0.9, false));
  const fpPlug = box(0.05, 0.14, 0.22, mat(0x101418, 0.2, 0.6), onFace(0.06) - 0.055, -1.2, 0.9, false);
  fpPlug.name = 'flag-front-panel-plug';
  flags.frontPanelPlug = fpPlug;
  g.add(fpPlug);

  setComponentId(g, 'motherboard');
  return g;
}

// ============================================================
// المعالج (dynamic.cpu) — متمركز عند MOUNTS.cpu، الوجه نحو -X
// ============================================================

function buildCpu(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-cpu';
  // قاعدة خضراء (substrate) + IHS معدني يبرزان نحو -X
  g.add(box(0.05, 0.4, 0.4, mat(0x1e6b3a, 0.3, 0.55), 0, 0, 0, true, true));
  g.add(box(0.04, 0.34, 0.34, mat(0xc2c9d1, 0.9, 0.3), -0.045, 0, 0, true));
  // مثلث اتجاه ذهبي على وجه IHS بزاوية واحدة (مخروط مسطح ثلاثي)
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.02, 3), mat(COLORS.accent, 0.6, 0.3));
  tri.rotation.z = Math.PI / 2; // القمة نحو -X
  tri.position.set(-0.075, 0.1, -0.1);
  g.add(tri);
  setComponentId(g, 'cpu');
  return g;
}

// ============================================================
// المبرّد البرجي (dynamic.cooler) — يبرز نحو -X من المقبس
// ============================================================

function buildCooler(spinners: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-cooler';
  const copper = mat(COLORS.copper, 0.9, 0.3);
  const alu = mat(COLORS.aluminum, 0.85, 0.4);

  // قاعدة نحاسية على وجه المعالج (عالمي x≈1.75)
  g.add(box(0.05, 0.3, 0.3, copper, 0.33, 0, 0, true));

  // 4 أنابيب حرارية نحاسية (أسطوانات مستقيمة محور X)
  const pipeGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10);
  const pipeOffsets: Array<readonly [number, number]> = [[0.07, 0.07], [0.07, -0.07], [-0.07, 0.07], [-0.07, -0.07]];
  for (const [py, pz] of pipeOffsets) {
    const pipe = new THREE.Mesh(pipeGeo, copper);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0.1, py, pz);
    if (castEnabled) pipe.castShadow = true;
    g.add(pipe);
  }

  // كتلة زعانف: 7 ألواح ألمنيوم موازية للوحة (حتى عالمي x≈1.1)
  const finGeo = new THREE.BoxGeometry(0.02, 0.6, 0.6);
  for (let i = 0; i < 7; i++) {
    const fin = new THREE.Mesh(finGeo, alu);
    fin.position.set(0.1 - i * 0.067, 0, 0);
    if (castEnabled) fin.castShadow = true;
    g.add(fin);
  }

  // مروحة البرج الأمامية (تنظر نحو -X): محور الدوران Y المحلي → -X
  const wrapper = new THREE.Group();
  wrapper.position.set(-0.38, 0, 0);
  wrapper.rotation.z = Math.PI / 2;
  const fan = makeFan(0.25);
  wrapper.add(fan.frame, fan.blades);
  spinners.push(fan.blades);
  g.add(wrapper);

  setComponentId(g, 'cooler');
  return g;
}

// ============================================================
// الذاكرة (dynamic.ram) — عصاتان متجاورتان (عالمي z 1.30 و 1.50)
// ============================================================

function buildRam(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-ram';
  const stickMat = mat(COLORS.metalMid, 0.7, 0.45);
  const notchMat = mat(COLORS.black, 0.2, 0.6);
  const labelMat = mat(COLORS.accentSoft, 0.3, 0.5);
  // شريط إضاءة RGB علوي — مادة واحدة مشتركة بتوهج سماوي خافت
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x0c4a5e, emissive: COLORS.accent, emissiveIntensity: 0.85, roughness: 0.35, metalness: 0.1, flatShading: false,
  });
  for (const z of [-0.1, 0.1]) { // محليًا: عالمي 1.30 و 1.50
    const stick = new THREE.Group();
    stick.add(box(0.4, 1.3, 0.06, stickMat, 0, 0, 0, true));        // الجسم: بروز 0.4 نحو -X
    stick.add(box(0.41, 0.06, 0.065, notchMat, 0, -0.45, 0, false)); // شق اتجاه داكن غير متمركز
    stick.add(box(0.41, 0.2, 0.065, labelMat, 0, 0.48, 0, false));   // ملصق علوي بلون accent
    stick.add(box(0.41, 0.045, 0.068, glowMat, 0, 0.665, 0, false)); // شريط إضاءة علوي متوهج
    stick.position.set(0, 0, z);
    g.add(stick);
  }
  setComponentId(g, 'ram');
  return g;
}

// ============================================================
// بطاقة الرسوميات (dynamic.gpu) — أفقية، PCB عند مستوى فتحة x16
// ============================================================

function buildGpu(flags: FlagVisuals, spinners: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-gpu';

  // PCB أفقي (السماكة على Y) عند مستوى الفتحة (عالمي y≈2.0)
  g.add(box(1.07, 0.04, 2.35, mat(COLORS.pcb, 0.35, 0.6), 0, -0.03, 0, true, true));
  // غطاء shroud أسفل الـPCB
  const shroudMat = mat(0x232b34, 0.4, 0.55);
  g.add(box(1.05, 0.42, 2.3, shroudMat, 0, -0.26, 0, true));
  // شريط إضاءة سماوي على وجه الغطاء المواجه للزجاج (-X)
  const gpuGlow = new THREE.MeshStandardMaterial({
    color: 0x0c4a5e, emissive: COLORS.accent, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1, flatShading: false,
  });
  g.add(box(0.02, 0.07, 2.05, gpuGlow, -0.535, -0.26, 0.05, false));
  // backplate رفيع فوق الـPCB
  g.add(box(1.07, 0.02, 2.35, mat(COLORS.metalMid, 0.7, 0.4), 0, 0.03, 0, true));

  // bracket معدني عند الطرف الخلفي (عالمي z≈0.12) مع فتحة داكنة
  g.add(box(0.06, 0.5, 0.12, mat(COLORS.aluminum, 0.8, 0.4), 0, -0.03, -1.3, true));
  g.add(box(0.015, 0.3, 0.08, mat(COLORS.black, 0.2, 0.6), -0.038, -0.03, -1.3, false));

  // مروحتان تتوسطان الغطاء (تنظران للأسفل — محور Y)
  for (const fz of [-0.55, 0.55]) {
    const wrapper = new THREE.Group();
    wrapper.position.set(0, -0.55, fz);
    const fan = makeFan(0.28);
    wrapper.add(fan.frame, fan.blades);
    spinners.push(fan.blades);
    g.add(wrapper);
  }

  // موصل طاقة 8pin مرفوع على وجه علوي رافع — عالمي (1.0, 2.34, 2.05)
  g.add(box(0.2, 0.26, 0.22, shroudMat, -0.28, 0.14, 0.63, false));  // قاعدة رافعة (تمنع «طفو» الموصل)
  g.add(box(0.16, 0.1, 0.18, mat(COLORS.black, 0.3, 0.5), -0.28, 0.31, 0.63, false));

  // براغي bracket (تنتقل مع البطاقة إلى الصينية)
  for (const sy of [0.12, -0.18]) {
    for (const sx of [-0.18, 0.18]) {
      const s = makeScrew(0.03, 0.05, 'z');
      s.position.set(sx, sy, -1.375);
      s.name = 'flag-gpu-screw';
      flags.gpuScrews.push(s);
      g.add(s);
    }
  }

  setComponentId(g, 'gpu');
  return g;
}

// ============================================================
// مزود الطاقة (dynamic.psu) — صندوق مغلق بلا تفاصيل داخلية
// ============================================================

function buildPsu(flags: FlagVisuals): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-psu';

  g.add(box(1.45, 0.85, 1.45, mat(0x48525e, 0.6, 0.45), 0, 0, 0, true, true));

  // وجه شبكي خلفي (شرائط رفيعة على الوجه -Z)
  const grilleGeo = new THREE.BoxGeometry(1.15, 0.035, 0.03);
  const grilleMat = mat(0x272f38, 0.5, 0.5);
  for (let i = 0; i < 6; i++) {
    const strip = new THREE.Mesh(grilleGeo, grilleMat);
    strip.position.set(0, -0.3 + i * 0.12, -0.745);
    g.add(strip);
  }

  // ملصق على الوجه -X + شريط accent
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.55), mat(0x3d4653, 0.2, 0.7));
  label.rotation.y = -Math.PI / 2;
  label.position.set(-0.728, 0.02, 0.05);
  g.add(label);
  g.add(box(0.015, 0.09, 0.7, mat(COLORS.accent, 0.4, 0.5), -0.732, 0.33, 0.05, false));

  // 4 براغي الخلف (تبقى مع مزود الطاقة)
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const s = makeScrew(0.028, 0.05, 'z');
      s.position.set(sx * 0.62, sy * 0.35, -0.75);
      s.name = 'flag-psu-screw';
      flags.psuScrews.push(s);
      g.add(s);
    }
  }

  setComponentId(g, 'psu');
  return g;
}

// ============================================================
// قرص M.2 (dynamic.ssd) — رقاقة مستوية على اللوحة
// ============================================================

function buildSsd(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-ssd';
  g.add(box(0.05, 0.16, 0.8, mat(0x1e6b3a, 0.3, 0.55), 0, 0, 0, true, true)); // الرقاقة الخضراء
  const chipMat = mat(COLORS.black, 0.3, 0.5);
  g.add(box(0.03, 0.1, 0.14, chipMat, -0.04, 0, -0.22, false)); // رقاقة سوداء 1
  g.add(box(0.03, 0.1, 0.14, chipMat, -0.04, 0, 0.22, false));  // رقاقة سوداء 2
  g.add(box(0.012, 0.13, 0.26, mat(0xd8dade, 0.1, 0.5), -0.036, 0, 0, false)); // ملصق أبيض رفيع
  setComponentId(g, 'ssd');
  return g;
}

// ============================================================
// مراوح الهيكل (dynamic.fans) — أماميتان + خلفية علوية
// ============================================================

function buildFans(flags: FlagVisuals, spinners: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-fans';
  const mount = MOUNTS.fans;
  const defs: Array<{ pos: readonly [number, number, number]; rotX: number }> = [
    { pos: [1.05, 2.9, 4.42], rotX: Math.PI / 2 },  // أمامية علوية (محور Z)
    { pos: [1.05, 1.5, 4.42], rotX: Math.PI / 2 },  // أمامية سفلية
    { pos: [1.05, 3.9, 0.12], rotX: -Math.PI / 2 }, // خلفية علوية (تدفع للخلف)
  ];
  for (const d of defs) {
    const wrapper = new THREE.Group();
    wrapper.position.set(d.pos[0] - mount[0], d.pos[1] - mount[1], d.pos[2] - mount[2]);
    wrapper.rotation.x = d.rotX; // محور الدوران Y المحلي → Z عالمي
    const fan = makeFan(0.42);
    wrapper.add(fan.frame, fan.blades);
    spinners.push(fan.blades);
    // 4 براغي زوايا لكل مروحة (على المحور المحلي Y = محور المروحة)
    const half = 0.42 + 0.06;
    const sy = 0.42 * 0.55 / 2 + 0.015;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const s = makeScrew(0.03, 0.06, 'y');
        s.position.set(sx * half, sy, sz * half);
        s.name = 'flag-fan-screw';
        flags.fanScrews.push(s);
        wrapper.add(s);
      }
    }
    g.add(wrapper);
  }
  setComponentId(g, 'fans');
  return g;
}

// ============================================================
// موصل ATX24 (dynamic.atx24) + كابل من PSU
// ============================================================

function buildAtx24(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-atx24';
  g.add(box(0.12, 0.5, 0.25, mat(COLORS.black, 0.3, 0.5), 0, 0, 0, true, true)); // الموصل (طويل على Y)

  // 24 سلكًا مصغرة: صفان على Z (12 موضعًا على Y لكل صف)
  const wireGeo = new THREE.BoxGeometry(0.04, 0.035, 0.035);
  let idx = 0;
  for (let i = 0; i < 12; i++) {
    for (const zr of [-0.06, 0.06]) {
      const wire = new THREE.Mesh(wireGeo, mat(WIRE_COLORS[idx % WIRE_COLORS.length], 0.2, 0.6));
      wire.position.set(-0.08, -0.22 + i * 0.04, zr);
      g.add(wire);
      idx++;
    }
  }

  // كابل من قرب PSU عالمي (1.3,0.75,1.2) عبر (0.9,2.0,1.9) و(1.4,3.0,2.5) إلى الموصل
  g.add(makeCable(cablePoints(MOUNTS.atx24, [
    [1.3, 0.75, 1.2],
    [0.9, 2.0, 1.9],
    [1.4, 3.0, 2.5],
    [1.7, 3.75, 2.62],
  ]), 0.045));

  setComponentId(g, 'atx24');
  return g;
}

// ============================================================
// موصل EPS (dynamic.eps) + كابل من PSU
// ============================================================

function buildEps(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-eps';
  g.add(box(0.12, 0.26, 0.2, mat(COLORS.black, 0.3, 0.5), 0, 0, 0, true, true));

  // 8 أسلاك: صفان على Z × 4 على Y
  const wireGeo = new THREE.BoxGeometry(0.04, 0.035, 0.035);
  let idx = 1;
  for (let i = 0; i < 4; i++) {
    for (const zr of [-0.05, 0.05]) {
      const wire = new THREE.Mesh(wireGeo, mat(WIRE_COLORS[idx % WIRE_COLORS.length], 0.2, 0.6));
      wire.position.set(-0.08, -0.09 + i * 0.06, zr);
      g.add(wire);
      idx += 2;
    }
  }

  // كابل منحدر من PSU (1.3,0.8,1.0) عبر (1.0,3.2,0.5) إلى الموضع
  g.add(makeCable(cablePoints(MOUNTS.eps, [
    [1.3, 0.8, 1.0],
    [1.0, 3.2, 0.5],
    [1.72, 4.02, 0.55],
  ]), 0.04));

  setComponentId(g, 'eps');
  return g;
}

// ============================================================
// موصل طاقة البطاقة (dynamic.gpuPower) + كابل من PSU
// ============================================================

function buildGpuPower(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part-gpu-power';
  g.add(box(0.16, 0.1, 0.18, mat(COLORS.black, 0.3, 0.5), 0, 0, 0, true, true)); // يتطابق فوق موصل البطاقة

  // 4 أسلاك قصيرة على الوجه -X
  const wireGeo = new THREE.BoxGeometry(0.035, 0.03, 0.03);
  for (let i = 0; i < 4; i++) {
    const wire = new THREE.Mesh(wireGeo, mat(WIRE_COLORS[i % WIRE_COLORS.length], 0.2, 0.6));
    wire.position.set(-0.095, 0, -0.06 + i * 0.04);
    g.add(wire);
  }

  // كابل من PSU (1.2,0.7,1.1) عبر (0.7,1.4,2.2) إلى الموضع
  g.add(makeCable(cablePoints(MOUNTS.gpuPower, [
    [1.2, 0.7, 1.1],
    [0.7, 1.4, 2.2],
    [1.05, 2.32, 2.05],
  ]), 0.04));

  setComponentId(g, 'gpuPower');
  return g;
}

// ============================================================
// صينية القطع (داخل root مباشرة — بلا componentId)
// ============================================================

function buildTrayTable(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'tray-table'; // غير قابلة للاختيار عمدًا

  const cx = (TRAY.minX + TRAY.maxX) / 2; // -3.35
  const cz = (TRAY.minZ + TRAY.maxZ) / 2; // 2.4

  // السطح (أعلى = TRAY.tableTopY = 0.9)
  g.add(box(TRAY.maxX - TRAY.minX, 0.08, TRAY.maxZ - TRAY.minZ, mat(0x2b333d, 0.4, 0.6), cx, 0.86, cz, true, true));

  // 4 أرجل أسطوانية
  const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.82, 12);
  const legMat = mat(COLORS.metalMid, 0.6, 0.45);
  for (const lx of [TRAY.minX + 0.15, TRAY.maxX - 0.15]) {
    for (const lz of [TRAY.minZ + 0.15, TRAY.maxZ - 0.15]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.41, lz);
      if (castEnabled) leg.castShadow = true;
      g.add(leg);
    }
  }

  // خطوط خانات باهتة لكل مكوّن (عدا case) — تُثبَّت داخل حدود الطاولة
  const markers: Array<{ id: ComponentId; size: readonly [number, number] }> = [
    { id: 'ram', size: [0.55, 1.55] },
    { id: 'gpu', size: [1.15, 2.45] },
    { id: 'cpu', size: [0.55, 0.55] },
    { id: 'gpuPower', size: [0.4, 0.45] },
    { id: 'cooler', size: [0.7, 0.95] },
    { id: 'ssd', size: [0.3, 0.9] },
    { id: 'fans', size: [1.0, 1.0] },
    { id: 'psu', size: [1.5, 1.5] },
    { id: 'motherboard', size: [2.05, 2.4] },
    { id: 'atx24', size: [0.4, 0.6] },
    { id: 'eps', size: [0.35, 0.5] },
  ];
  const markerMat = mat(0x24303a, 0.2, 0.8);
  for (const mk of markers) {
    const p = TRAY.slots[mk.id];
    const px = Math.min(Math.max(p[0], TRAY.minX + mk.size[0] / 2 + 0.02), TRAY.maxX - mk.size[0] / 2 - 0.02);
    const pz = Math.min(Math.max(p[2], TRAY.minZ + mk.size[1] / 2 + 0.02), TRAY.maxZ - mk.size[1] / 2 - 0.02);
    g.add(box(mk.size[0], 0.012, mk.size[1], markerMat, px, 0.906, pz, false));
  }

  return g;
}

// ============================================================
// التجميع النهائي
// ============================================================

export function buildAllParts(quality: SceneQuality): PartVisuals {
  castEnabled = quality !== 'low';

  const flags: FlagVisuals = {
    ramClips: [],
    gpuScrews: [],
    psuScrews: [],
    fanScrews: [],
    moboScrews: [],
  };
  const spinners: THREE.Object3D[] = [];

  // بناء الأجزاء
  const caseShell = buildCaseShell(flags);
  const sidePanel = buildSidePanel();
  const motherboard = buildMotherboard(flags);
  const cpu = buildCpu();
  const cooler = buildCooler(spinners);
  const ram = buildRam();
  const gpu = buildGpu(flags, spinners);
  const psu = buildPsu(flags);
  const ssd = buildSsd();
  const fans = buildFans(flags, spinners);
  const atx24 = buildAtx24();
  const eps = buildEps();
  const gpuPower = buildGpuPower();
  const trayTable = buildTrayTable();

  // مواضع التثبيت الابتدائية (المدير يعيد تموضعها عند الفك/التفجير)
  const place = (grp: THREE.Group, id: ComponentId): void => {
    grp.position.set(...MOUNTS[id]);
  };
  place(motherboard, 'motherboard');
  place(cpu, 'cpu');
  place(cooler, 'cooler');
  place(ram, 'ram');
  place(gpu, 'gpu');
  place(psu, 'psu');
  place(ssd, 'ssd');
  place(fans, 'fans');
  place(atx24, 'atx24');
  place(eps, 'eps');
  place(gpuPower, 'gpuPower');

  // مجموعة placeholder للمكوّن 'case' (الهيكل نفسه لا يُحرك أبدًا — فارغة للأمان)
  const caseAnchor = new THREE.Group();
  caseAnchor.name = 'case-anchor';
  place(caseAnchor, 'case');

  const root = new THREE.Group();
  root.name = 'pc-parts-root';
  root.add(caseShell, sidePanel, trayTable, caseAnchor);
  root.add(motherboard, cpu, cooler, ram, gpu, psu, ssd, fans, atx24, eps, gpuPower);

  const dynamic: Record<ComponentId, THREE.Group> = {
    case: caseAnchor,
    motherboard,
    cpu,
    cooler,
    ram,
    gpu,
    psu,
    ssd,
    fans,
    atx24,
    eps,
    gpuPower,
  };

  return { root, dynamic, caseShell, sidePanel, flags, spinners };
}
