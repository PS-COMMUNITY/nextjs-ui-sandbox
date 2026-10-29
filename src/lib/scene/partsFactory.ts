/**
 * مصنع مجسمات الجهاز الإجرائية (Procedural PC Parts Factory) — النسخة التفصيلية
 * ----------------------------------------------------------------------------
 * يبني كل المجسمات برمجيًا (بلا نماذج خارجية) وفق تخطيط layout.ts:
 *  - المحاور: X∈[0,2.1] (0=زجاج، 2.1=جدار اللوحة)، Y∈[0,4.5]، Z∈[0,4.6] (0=خلف، 4.6=أمام).
 *  - اللوحة الأم عمودية، وجهها نحو -X. كل مجموعات dynamic تُبنى متمركزة حول الأصل
 *    ثم توضع على MOUNTS[id] (المدير يحرّكها لاحقًا إلى صينية TRAY مع TRAY.rotations).
 *  - المواد: MeshStandardMaterial فقط (الزجاج MeshPhysicalMaterial) عبر cache
 *    **بنطاق لكل قطعة** — إبراز قطعة لا يُضيء خامات قطعة أخرى.
 *  - الخامات: خرائط إجرائية من textures.ts (PCB، معدن مصقول، شبك تهوية، ملصقات عامة).
 *
 * المصدَّرات: setComponentId / buildEnvironment / buildAllParts
 * المخرجات المرجعية: 6 spinners (شفرات مراوح) و~40 مرجع flags.
 */
import * as THREE from 'three';
import type { ComponentId } from '../types';
import type { SceneQuality, FlagVisuals, PartVisuals } from './visualTypes';
import { BOARD, CASE, COLORS, MOUNTS, PERIPH, TRAY } from './layout';
import {
  brushedTexture,
  fanGrillTexture,
  frontBadgeTexture,
  gpuPlateTexture,
  hddLabelTexture,
  m2LabelTexture,
  pcbTexture,
  psuLabelTexture,
  ramLabelTexture,
  socketPinsTexture,
  ventMeshTexture,
} from './textures';

// ============================================================
// حالة المصنع والمواد المشتركة
// ============================================================

/** تُفعَّل داخل buildAllParts حسب الجودة (الظلال على القطع الرئيسية) */
let castEnabled = false;

/**
 * نطاق القطعة الحالي: يجعل مفاتيح cache المواد خاصة بكل قطعة، فلا يلمس
 * تعديل emissive أثناء الإبراز خامات قطعة أخرى تشترك في اللون.
 */
let partScope = 'g';
function scope(s: string): void {
  partScope = s;
}

interface MatOpts {
  map?: THREE.Texture | null;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

/** cache للمواد القياسية — مفاتيح بنطاق القطعة */
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: number, metalness: number, roughness: number, opts?: MatOpts): THREE.MeshStandardMaterial {
  const mapId = opts?.map ? opts.map.uuid : 'n';
  const key = `${partScope}|${color}|${metalness}|${roughness}|${mapId}|${opts?.emissive ?? ''}|${opts?.emissiveIntensity ?? ''}|${opts?.transparent ?? ''}|${opts?.opacity ?? ''}|${opts?.side ?? ''}`;
  const cached = matCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    map: opts?.map ?? null,
    emissive: opts?.emissive ?? 0x000000,
    emissiveIntensity: opts?.emissiveIntensity ?? 1,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    side: opts?.side ?? THREE.FrontSide,
    flatShading: false,
  });
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

/** برغي معدني صغير — محور حسب الاستخدام (رأس سداسي + فتحة تصالب) */
function makeScrew(r: number, length: number, axis: Axis = 'y'): THREE.Mesh {
  return cyl(r, length, mat(COLORS.aluminum, 0.85, 0.35), axis);
}

/** كابل أنبوبي على منحنى CatmullRom (نقاط محلية داخل مجموعة القطعة) */
function makeCable(points: THREE.Vector3[], radius: number, color = 0x181d24): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 8, false), mat(color, 0.3, 0.6));
  if (castEnabled) m.castShadow = true;
  return m;
}

/** تحويل نقاط كابل عالمية إلى محلية بالنسبة لموضع تثبيت القطعة */
function cablePoints(mount: readonly [number, number, number], pts: Array<readonly [number, number, number]>): THREE.Vector3[] {
  return pts.map((p) => new THREE.Vector3(p[0] - mount[0], p[1] - mount[1], p[2] - mount[2]));
}

/** مستطيل مستوٍ مواجه لمحور محدد (للملصقات والشبكات) */
function plane(w: number, h: number, material: THREE.Material, axis: 'x' | 'y' | 'z', x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  if (axis === 'x') m.rotation.y = -Math.PI / 2; // مواجه -X
  else if (axis === 'y') m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

interface FanParts { frame: THREE.Group; blades: THREE.Group; }

/**
 * مروحة واقعية: إطار مربع كامل بحواف وأركان دائرية + فتحات براغي + حلقة داخلية
 * + 9 شفرات مائلة + محور بغطاء. محور الدوران الافتراضي = Y المحلي.
 */
function makeFan(radius: number): FanParts {
  const depth = Math.max(0.14, radius * 0.5);
  const half = radius * 1.32;

  // الإطار: 4 حواف كاملة + 4 أركان أسطوانية
  const frame = new THREE.Group();
  const frameMat = mat(COLORS.plastic, 0.3, 0.62);
  const barGeoX = new THREE.BoxGeometry(half * 2, depth, 0.1);
  const barGeoZ = new THREE.BoxGeometry(0.1, depth, half * 2);
  for (const s of [-1, 1]) {
    const barX = new THREE.Mesh(barGeoX, frameMat);
    barX.position.set(0, 0, s * half);
    const barZ = new THREE.Mesh(barGeoZ, frameMat);
    barZ.position.set(s * half, 0, 0);
    if (castEnabled) { barX.castShadow = true; barZ.castShadow = true; }
    frame.add(barX, barZ);
  }
  const cornerGeo = new THREE.CylinderGeometry(0.055, 0.055, depth, 10);
  const holeGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8);
  const holeMat = mat(COLORS.black, 0.2, 0.6);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const corner = new THREE.Mesh(cornerGeo, frameMat);
      corner.position.set(sx * (half - 0.05), 0, sz * (half - 0.05));
      if (castEnabled) corner.castShadow = true;
      frame.add(corner);
      // فتحة برغي مظلمة على الوجه العلوي
      const hole = new THREE.Mesh(holeGeo, holeMat);
      hole.position.set(sx * half, depth / 2, sz * half);
      frame.add(hole);
    }
  }
  // حلقة داخلية محيطية
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.99, 0.016, 6, 28), mat(COLORS.metalDark, 0.5, 0.5));
  ring.rotation.x = Math.PI / 2;
  if (castEnabled) ring.castShadow = true;
  frame.add(ring);
  // دعامات خلفية (ستراهنة بين الحواف خلف الشفرات)
  const strutGeo = new THREE.BoxGeometry(0.05, 0.02, radius * 1.7);
  for (const sz of [-1, 1]) {
    const strut = new THREE.Mesh(strutGeo, frameMat);
    strut.position.set(sz * radius * 0.72, -depth * 0.28, 0);
    strut.rotation.y = Math.PI / 2;
    frame.add(strut);
  }

  // الشفرات: 9 شفرات مائلة 35° داخل مجموعة blades (تُدفع إلى spinners)
  const blades = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(0.016, radius * 0.8, radius * 0.32);
  const bladeMat = mat(0x242c36, 0.25, 0.45);
  for (let i = 0; i < 9; i++) {
    const arm = new THREE.Object3D();
    arm.rotation.y = (i / 9) * Math.PI * 2;
    const pitch = new THREE.Object3D();
    pitch.position.set(radius * 0.52, 0, 0);
    pitch.rotation.x = 0.62; // ميلان الشفرة ≈ 35°
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.rotation.z = Math.PI / 2;
    if (castEnabled) blade.castShadow = true;
    pitch.add(blade);
    arm.add(pitch);
    blades.add(arm);
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, depth * 0.72, 14),
    mat(COLORS.metalDark, 0.5, 0.4),
  );
  if (castEnabled) hub.castShadow = true;
  blades.add(hub);
  // غطاء محور بحلقة داكنة
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.1, radius * 0.1, depth * 0.76, 12), mat(0x11161c, 0.3, 0.5));
  blades.add(cap);
  const capRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.11, 0.008, 6, 16), mat(COLORS.metalMid, 0.6, 0.4));
  capRing.rotation.x = Math.PI / 2;
  capRing.position.y = depth * 0.38;
  blades.add(capRing);

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

  const fill = new THREE.PointLight(0xffffff, 0.5, 0, 0);
  fill.position.set(3, 3, -2);
  scene.add(fill);
  const front = new THREE.PointLight(0xfff4e0, 1.0, 0, 0);
  front.position.set(-5, 3.5, 3);
  scene.add(front);
}

// ============================================================
// الهيكل الثابت (caseShell) — جدران/واجهة/خلفية/قواعد
// ============================================================

function buildCaseShell(flags: FlagVisuals): THREE.Group {
  scope('case');
  const g = new THREE.Group();
  g.name = 'case-shell';

  const cx = (CASE.minX + CASE.maxX) / 2; // 1.05
  const cy = (CASE.minY + CASE.maxY) / 2; // 2.25
  const cz = (CASE.minZ + CASE.maxZ) / 2; // 2.3
  const wX = CASE.maxX - CASE.minX;       // 2.1
  const hY = CASE.maxY - CASE.minY;       // 4.5
  const dZ = CASE.maxZ - CASE.minZ;       // 4.6

  // جدران بخامة معدن مصقول (فرشات)
  const wallMat = mat(COLORS.metalDark, 0.5, 0.5, { map: brushedTexture('#2a323c') });
  const trayWallMat = mat(0x2c343e, 0.5, 0.48, { map: brushedTexture('#333c46') });

  g.add(box(0.05, hY, dZ, trayWallMat, CASE.maxX - 0.025, cy, cz, true, true)); // يمين (صينية اللوحة)
  g.add(box(wX, 0.05, dZ, wallMat, cx, CASE.maxY - 0.025, cz, true, true));     // سقف
  g.add(box(wX, 0.05, dZ, wallMat, cx, CASE.minY + 0.025, cz, true, true));     // أرضية
  g.add(box(wX, hY, 0.05, wallMat, cx, cy, CASE.minZ + 0.025, true, true));     // خلف
  g.add(box(wX, hY, 0.05, mat(0x262d36, 0.35, 0.6), cx, cy, CASE.maxZ - 0.025, true, true)); // أمام

  // حافتا شطف عموديتان على حافة الصينية (أمام/خلف)
  g.add(box(0.02, hY * 0.92, 0.02, mat(0x414c58, 0.6, 0.4), CASE.maxX - 0.18, cy, CASE.maxZ - 0.62, false));
  g.add(box(0.02, hY * 0.92, 0.02, mat(0x414c58, 0.6, 0.4), CASE.maxX - 0.18, cy, CASE.minZ + 0.62, false));

  // ===== الواجهة الأمامية =====
  // لوح شبك تهوية سداسي يغطي منطقة السحب السفلية
  const ventPlateMat = mat(0x11151b, 0.35, 0.6, { map: ventMeshTexture('#1a2129', '#07090c') });
  g.add(box(1.6, 2.5, 0.02, ventPlateMat, cx, 1.45, CASE.maxZ + 0.005, false));
  // شريطا تجويف أفقيان فوق الشبك
  g.add(box(1.6, 0.04, 0.03, mat(0x3a4450, 0.5, 0.5), cx, 2.85, CASE.maxZ + 0.005, false));
  g.add(box(1.6, 0.04, 0.03, mat(0x3a4450, 0.5, 0.5), cx, 3.0, CASE.maxZ + 0.005, false));
  // شعار عام على أعلى الواجهة (يواجه +Z تلقائيًا)
  g.add(plane(0.72, 0.18, mat(0xffffff, 0.2, 0.5, { map: frontBadgeTexture(), transparent: true }), 'z', cx, 3.95, CASE.maxZ + 0.006));

  // ===== منطقة التحكم العلوية الأمامية (على السقف) =====
  // زر التشغيل + زر إعادة التشغيل
  g.add(cyl(0.07, 0.06, mat(COLORS.metalMid, 0.5, 0.4), 'y', 0.5, CASE.maxY + 0.005, CASE.maxZ - 0.45, false));
  g.add(cyl(0.042, 0.045, mat(0x1a2027, 0.4, 0.5), 'y', 0.28, CASE.maxY + 0.003, CASE.maxZ - 0.45, false));
  g.add(cyl(0.02, 0.012, mat(0xd8dade, 0.2, 0.5), 'y', 0.28, CASE.maxY + 0.028, CASE.maxZ - 0.45, false));
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x10151b, emissive: 0x000000, emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.1, flatShading: false,
  });
  const powerLed = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), ledMat); // مادة فريدة يتحكم بها علم powerOn
  powerLed.position.set(0.78, CASE.maxY + 0.01, CASE.maxZ - 0.45);
  flags.powerLed = powerLed;
  g.add(powerLed);

  // منفذا USB-A (تجويف داكن + لسان داخلي) + مقبسا صوت بحلقات ملونة خافتة
  const usbMat = mat(COLORS.black, 0.3, 0.55);
  const tongueMat = mat(0x3f4a55, 0.3, 0.5);
  for (const ux of [0.62, 0.86]) {
    g.add(box(0.15, 0.016, 0.09, usbMat, ux, CASE.maxY - 0.002, CASE.maxZ - 0.45, false));
    g.add(box(0.11, 0.006, 0.06, tongueMat, ux, CASE.maxY + 0.004, CASE.maxZ - 0.45, false));
  }
  g.add(cyl(0.028, 0.014, mat(0x2f6b4f, 0.4, 0.45), 'y', 1.08, CASE.maxY + 0.002, CASE.maxZ - 0.45, false));
  g.add(cyl(0.028, 0.014, mat(0x7a4040, 0.4, 0.45), 'y', 1.2, CASE.maxY + 0.002, CASE.maxZ - 0.45, false));

  // ===== السقف: فلتر غبار شبكي =====
  g.add(box(1.7, 0.012, 3.4, ventPlateMat, cx, CASE.maxY + 0.006, cz - 0.1, false));

  // ===== الخلف: قصورة I/O + منافذ =====
  g.add(box(0.55, 1.1, 0.03, mat(COLORS.black, 0.3, 0.6), 1.35, 3.35, CASE.minZ - 0.005, false));
  // منافذ خلفية على قصورة I/O (USB + إيثرنت + صوت) — توهم بصري فقط
  const portMat = mat(0x0d1116, 0.3, 0.6);
  const ethMat = mat(0x1c242c, 0.4, 0.5, { map: null });
  for (const py of [3.62, 3.5]) {
    g.add(box(0.09, 0.07, 0.02, portMat, 1.18, py, CASE.minZ - 0.018, false));
    g.add(box(0.09, 0.07, 0.02, portMat, 1.32, py, CASE.minZ - 0.018, false));
  }
  g.add(box(0.15, 0.12, 0.02, ethMat, 1.5, 3.56, CASE.minZ - 0.018, false));
  g.add(box(0.16, 0.05, 0.02, portMat, 1.24, 3.3, CASE.minZ - 0.018, false)); // شريط صوت

  // 7 مقابس توسعة أفقية مع برغي علوي لكل مقبس
  const slotStripMat = mat(COLORS.metalMid, 0.6, 0.45, { map: brushedTexture('#424d59') });
  for (let i = 0; i < 7; i++) {
    g.add(box(0.72, 0.05, 0.03, slotStripMat, 1.35, 2.55 - i * 0.13, CASE.minZ - 0.005, false));
    g.add(cyl(0.024, 0.02, mat(COLORS.aluminum, 0.8, 0.35), 'z', 1.66, 2.615 - i * 0.13, CASE.minZ - 0.012, false));
  }

  // ===== جدران الصينية: تجاويف تمرير الكابلات (grommets) =====
  const grommetMat = mat(0x0d1116, 0.2, 0.7);
  for (const gy of [1.5, 2.8, 4.0]) {
    g.add(box(0.045, 0.6, 0.32, grommetMat, CASE.maxX - 0.045, gy, 3.7, false));
    g.add(box(0.02, 0.66, 0.38, mat(0x39434e, 0.5, 0.5), CASE.maxX - 0.03, gy, 3.7, false));
  }

  // فلتر غبار سفلي تحت منطقة مزود الطاقة
  g.add(box(1.5, 0.012, 1.35, ventPlateMat, 1.32, CASE.minY + 0.012, 0.72, false));

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
  scope('panel');
  const g = new THREE.Group();
  g.name = 'part-side-panel';
  g.position.set(0, 2.25, 0.06); // محور المفصلة Y عند الحافة الخلفية

  // الزجاج: عند الدوران 0 يكون مستويًا على x=0
  const glassMesh = box(0.04, 4.4, 4.5, glass(), 0, 0, 2.24, false);
  glassMesh.name = 'panel-glass';
  g.add(glassMesh);

  // إطار معدني رفيع + تجويف مقبض أمامي
  const frameMat = mat(COLORS.metalMid, 0.6, 0.4, { map: brushedTexture('#3d4753') });
  g.add(box(0.07, 0.06, 4.56, frameMat, 0, 2.23, 2.24, true));  // علوي
  g.add(box(0.07, 0.06, 4.56, frameMat, 0, -2.23, 2.24, true)); // سفلي
  g.add(box(0.07, 4.52, 0.07, frameMat, 0, 0, 0, true));        // خلفي (عند المفصلة)
  g.add(box(0.07, 4.52, 0.07, frameMat, 0, 0, 4.49, true));     // أمامي
  g.add(box(0.03, 1.1, 0.04, mat(0x10151b, 0.3, 0.6), 0.02, 0, 4.47, false)); // تجويف المقبض

  setComponentId(g, 'case');
  return g;
}

// ============================================================
// اللوحة الأم (dynamic.motherboard) — متمركزة عند MOUNTS.motherboard
// محليًا: الوجه الأمامي نحو -X عند x = -thickness/2
// ============================================================

function buildMotherboard(flags: FlagVisuals): THREE.Group {
  scope('motherboard');
  const g = new THREE.Group();
  g.name = 'part-motherboard';
  const face = -BOARD.thickness / 2;                  // -0.03
  const onFace = (t: number): number => face - t / 2; // مركز قطعة سماكتها t على الوجه

  const pcbPlain = mat(COLORS.pcb, 0.35, 0.6);
  const pcbFront = mat(0xffffff, 0.35, 0.58, { map: pcbTexture('#14503a', '#2e8f63') });

  // 1) جسم PCB — الوجه الأمامي (-X) بخامة مسارات مطبوعة
  // (اسم ثابت mobo-pcb ليستبدله PCScene بمسح لوحة حقيقي CC0 عند نجاح التحميل)
  const pcbMats = [pcbPlain, pcbFront, pcbPlain, pcbPlain, pcbPlain, pcbPlain];
  const pcbBody = new THREE.Mesh(new THREE.BoxGeometry(BOARD.thickness, BOARD.yMax - BOARD.yMin, BOARD.zMax - BOARD.zMin), pcbMats);
  pcbBody.name = 'mobo-pcb';
  if (castEnabled) pcbBody.castShadow = true;
  pcbBody.receiveShadow = true;
  g.add(pcbBody);

  // 1ب) تفاصيل SMD: رقائق صغيرة + مكثفات VRM
  const chipMat = mat(0x11171e, 0.25, 0.5);
  const capMat = mat(0x3a4a58, 0.55, 0.4);
  const chipSpots: Array<readonly [number, number]> = [
    [1.0, -0.8], [1.0, -0.65], [1.0, -0.5], [1.04, -0.35],
    [0.45, 0.5], [0.55, 0.68], [0.4, 0.82], [0.7, 0.55], [0.85, 0.75],
    [-0.3, 0.82], [-0.42, 0.88],
    [-1.38, -0.62], [-1.38, -0.34],
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

  // 2) مقبس المعالج: إطار ألمنيوم + لوح إبر ذهبي + رافعة بمقبض
  const alu = mat(COLORS.aluminum, 0.85, 0.4, { map: brushedTexture('#a7b0ba') });
  const sx = 0.7, sz = -0.62; // مركز المقبس المحلي
  g.add(box(0.06, 0.46, 0.05, alu, onFace(0.06), sx + 0.205, sz, true)); // إطار: 4 أضلاع
  g.add(box(0.06, 0.46, 0.05, alu, onFace(0.06), sx - 0.205, sz, true));
  g.add(box(0.06, 0.05, 0.36, alu, onFace(0.06), sx, sz + 0.205, true));
  g.add(box(0.06, 0.05, 0.36, alu, onFace(0.06), sx, sz - 0.205, true));
  g.add(box(0.04, 0.37, 0.37, mat(0xffffff, 0.5, 0.45, { map: socketPinsTexture() }), onFace(0.04) - 0.005, sx, sz, false)); // لوح الإبر

  // رافعة المقبس: pivot عند حافة المقبس (يدور حول X المحلي عند الفتح) + مقبض عرضي
  const lever = new THREE.Object3D();
  lever.name = 'flag-cpu-lever';
  lever.position.set(onFace(0.06) - 0.04, 0.45, -0.87);
  lever.add(box(0.025, 0.42, 0.045, mat(COLORS.plastic, 0.2, 0.5), 0, 0.21, 0.02, false));
  lever.add(box(0.025, 0.03, 0.14, mat(COLORS.plastic, 0.2, 0.5), 0, 0.42, 0.02, false)); // مقبض
  flags.cpuLever = lever;
  g.add(lever);

  // 2ب) مشتتا VRM بأزعاج — فوق المقبس وعلى يساره (خارج حدود المقبس بلا تداخل)
  const vrmFinH = new THREE.BoxGeometry(0.05, 0.03, 0.44);   // أزعاج أفقية مكدسة على Y
  const vrmFinV = new THREE.BoxGeometry(0.05, 0.44, 0.03);   // أزعاج رأسية موزعة على Z
  for (let i = 0; i < 7; i++) {
    const finTop = new THREE.Mesh(vrmFinH, alu);
    finTop.position.set(onFace(0.03) - 0.05, 0.99 + i * 0.062, -0.62);
    g.add(finTop);
    if (i < 6) {
      const finLeft = new THREE.Mesh(vrmFinV, alu);
      finLeft.position.set(onFace(0.03) - 0.05, 0.72, -1.14 + i * 0.052);
      g.add(finLeft);
    }
  }
  g.add(box(0.03, 0.5, 0.48, alu, onFace(0.03), 1.19, -0.62, false));  // قاعدة VRM العلوي (فوق المقبس)
  g.add(box(0.03, 0.44, 0.3, alu, onFace(0.03), 0.72, -1.03, false));  // قاعدة VRM الأيسر (يسار المقبس)

  // 3) أربع فتحات RAM عمودية + مزلاجان لكل فتحة (8 pivots تدور حول X)
  const ramSlotGeo = new THREE.BoxGeometry(0.05, 1.35, 0.08);
  const ramSlotMat = mat(0x1b1f26, 0.2, 0.55);
  const ramRidgeMat = mat(0x2b333d, 0.3, 0.5);
  const clipGeo = new THREE.BoxGeometry(0.07, 0.07, 0.1);
  const clipMat = mat(0x39414c, 0.3, 0.5);
  for (const z of [-0.27, -0.07, 0.13, 0.33]) { // عالمي z = 1.30 .. 1.90
    const slot = new THREE.Mesh(ramSlotGeo, ramSlotMat);
    slot.position.set(onFace(0.05), 0.55, z);
    g.add(slot);
    g.add(box(0.052, 1.3, 0.015, ramRidgeMat, onFace(0.052) - 0.002, 0.55, z - 0.032, false)); // حدّ فتحة
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

  // 4) فتحتا PCIe أفقيتان + أطراف ذهبية داخلية + مزلاج أبيض
  const pcieMat = mat(0x242a33, 0.2, 0.55);
  const gold = mat(0xc9a23f, 0.85, 0.35);
  g.add(box(0.05, 0.07, 1.85, pcieMat, onFace(0.05), -0.75, -0.15, true));
  g.add(box(0.05, 0.07, 1.85, pcieMat, onFace(0.05), -1.1, -0.15, true));
  g.add(box(0.02, 0.015, 1.6, gold, onFace(0.02) - 0.012, -0.775, -0.15, false));
  g.add(box(0.02, 0.015, 1.6, gold, onFace(0.02) - 0.012, -1.125, -0.15, false));

  const latch = new THREE.Object3D();
  latch.name = 'flag-pcie-latch';
  latch.position.set(onFace(0.05) - 0.035, -0.75, -1.10);
  latch.add(box(0.05, 0.16, 0.06, mat(0xd8dade, 0.1, 0.5), 0, 0.06, 0, false));
  flags.pcieLatch = latch;
  g.add(latch);

  // 5) مشتت chipset: قاعدة + 7 زعانف + لوح علوي بتجويف داكن
  g.add(box(0.03, 0.38, 0.38, alu, onFace(0.03), -0.35, 0.5, true));
  const chipFinGeo = new THREE.BoxGeometry(0.09, 0.028, 0.36);
  for (let i = 0; i < 7; i++) {
    const fin = new THREE.Mesh(chipFinGeo, alu);
    fin.position.set(onFace(0.03) - 0.06, -0.5 + i * 0.062, 0.5);
    g.add(fin);
  }
  g.add(box(0.02, 0.4, 0.4, mat(0x1a2027, 0.4, 0.5), onFace(0.02) - 0.105, -0.35, 0.5, false));

  // 6) منطقة M.2: مقبس + برغي تثبيت + واقٍ
  g.add(box(0.06, 0.06, 0.1, mat(COLORS.black, 0.3, 0.5), onFace(0.06), -0.2, -0.14, false));
  const m2Screw = cyl(0.028, 0.06, mat(COLORS.aluminum, 0.85, 0.35), 'x', onFace(0.06) + 0.005, -0.2, -0.52, false);
  m2Screw.name = 'flag-m2-screw';
  flags.m2Screw = m2Screw;
  g.add(m2Screw);
  g.add(box(0.015, 0.05, 0.75, mat(0x39434e, 0.5, 0.5), onFace(0.015) - 0.005, -0.2, -0.13, false)); // واقٍ طويل

  // 7) بطارية CMOS الفضية + حاملها
  g.add(cyl(0.09, 0.045, mat(0xc9ced6, 0.9, 0.3), 'x', onFace(0.045), -0.42, 0.15, false));
  g.add(box(0.02, 0.2, 0.2, mat(0x2a323c, 0.4, 0.5), onFace(0.02), -0.42, 0.15, false));

  // 8) رأسا طاقة ATX24 و EPS مع تجويف داخلي داكن
  const black = mat(COLORS.black, 0.3, 0.5);
  g.add(box(0.08, 0.5, 0.25, black, onFace(0.08), 1.0, 1.05, true));   // ATX24 (عالمي 3.75, 2.62)
  g.add(box(0.05, 0.42, 0.19, mat(0x0a0e12, 0.25, 0.6), onFace(0.05) - 0.045, 1.0, 1.05, false));
  g.add(box(0.08, 0.26, 0.2, black, onFace(0.08), 1.27, -1.02, true)); // EPS (عالمي 4.02, 0.55)
  g.add(box(0.05, 0.2, 0.15, mat(0x0a0e12, 0.25, 0.6), onFace(0.05) - 0.045, 1.27, -1.02, false));

  // 9) عنقود المنافذ الخلفية I/O مع منافذ بارزة نحو -Z
  const ioMat = mat(0x151a20, 0.4, 0.55);
  const ioPorts = mat(0x0d1116, 0.3, 0.6);
  g.add(box(0.14, 0.55, 0.45, ioMat, onFace(0.14), 0.75, -0.99, true)); // الكتلة (عالمي y 3.5, z 0.355..0.805)
  g.add(box(0.1, 0.08, 0.02, ioPorts, onFace(0.1) - 0.045, 0.85, -1.222, false)); // USB
  g.add(box(0.1, 0.08, 0.02, ioPorts, onFace(0.1) - 0.045, 0.75, -1.222, false));
  g.add(box(0.12, 0.1, 0.02, ioPorts, onFace(0.1) - 0.045, 0.6, -1.222, false));  // إيثرنت
  g.add(box(0.12, 0.04, 0.02, ioPorts, onFace(0.1) - 0.045, 0.45, -1.222, false)); // صوت

  // 10) منفذا SATA بحرف L عند الحافة العلوية
  for (const stz of [0.05, 0.24]) {
    g.add(box(0.05, 0.07, 0.13, black, onFace(0.05), 1.32, stz, false));
    g.add(box(0.04, 0.025, 0.05, gold, onFace(0.04) - 0.03, 1.32, stz - 0.02, false));
  }

  // 11) 4 رؤوس مراوح pin headers + قابسها
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

  // 12) كتلة front-panel + قابسها
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
  scope('cpu');
  const g = new THREE.Group();
  g.name = 'part-cpu';

  // قاعدة خضراء (substrate)
  g.add(box(0.05, 0.4, 0.4, mat(0x1e6b3a, 0.3, 0.55), 0, 0, 0, true, true));
  // أطراف ذهبية محيطية على الوجه الأمامي (إشارة إلى تلامسات LGA)
  const goldEdge = mat(0xc9a23f, 0.9, 0.3);
  g.add(box(0.008, 0.4, 0.014, goldEdge, -0.026, 0, -0.193, false));
  g.add(box(0.008, 0.4, 0.014, goldEdge, -0.026, 0, 0.193, false));
  g.add(box(0.008, 0.014, 0.4, goldEdge, -0.026, -0.193, 0, false));
  g.add(box(0.008, 0.014, 0.4, goldEdge, -0.026, 0.193, 0, false));

  // غطاء IHS بأركان مشطوفة (مستطيل مشطوف عبر Cylinder ثماني مسطح؟) — نستخدم Extrude
  const ihsShape = new THREE.Shape();
  const s = 0.17;
  const r = 0.045;
  ihsShape.moveTo(-s + r, -s);
  ihsShape.lineTo(s - r, -s);
  ihsShape.quadraticCurveTo(s, -s, s, -s + r);
  ihsShape.lineTo(s, s - r);
  ihsShape.quadraticCurveTo(s, s, s - r, s);
  ihsShape.lineTo(-s + r, s);
  ihsShape.quadraticCurveTo(-s, s, -s, s - r);
  ihsShape.lineTo(-s, -s + r);
  ihsShape.quadraticCurveTo(-s, -s, -s + r, -s);
  const ihsGeo = new THREE.ExtrudeGeometry(ihsShape, { depth: 0.035, bevelEnabled: false });
  const ihs = new THREE.Mesh(ihsGeo, mat(0xc2c9d1, 0.9, 0.3));
  ihs.rotation.y = -Math.PI / 2; // البثق على المحور X نحو -X
  ihs.position.set(-0.045, 0, 0);
  if (castEnabled) ihs.castShadow = true;
  g.add(ihs);

  // شقّا اتجاه على حافتين (توجيه المعالج) — على وجه IHS الأمامي
  const notchMat = mat(0x6b7280, 0.6, 0.4);
  g.add(box(0.02, 0.03, 0.07, notchMat, -0.082, 0.155, 0.05, false));
  g.add(box(0.02, 0.03, 0.07, notchMat, -0.082, -0.155, -0.05, false));

  // مثلث اتجاه ذهبي مسطح (prism ثلاثي) على وجه IHS
  const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 3), mat(0xd4af37, 0.85, 0.3));
  tri.rotation.z = Math.PI / 2;
  tri.position.set(-0.086, 0.1, -0.1);
  g.add(tri);

  setComponentId(g, 'cpu');
  return g;
}

// ============================================================
// المبرّد البرجي (dynamic.cooler) — يبرز نحو -X من المقبس
// ============================================================

function buildCooler(spinners: THREE.Object3D[]): THREE.Group {
  scope('cooler');
  const g = new THREE.Group();
  g.name = 'part-cooler';
  const copper = mat(COLORS.copper, 0.9, 0.3);
  const alu = mat(COLORS.aluminum, 0.85, 0.4, { map: brushedTexture('#a7b0ba') });

  // قاعدة نحاسية على وجه المعالج
  g.add(box(0.05, 0.3, 0.3, copper, 0.33, 0, 0, true));

  // قائمتا تثبيت جانبيتان (من القاعدة إلى كتلة الزعانف)
  g.add(box(0.24, 0.6, 0.015, alu, 0.2, 0, 0.3, false));
  g.add(box(0.24, 0.6, 0.015, alu, 0.2, 0, -0.3, false));

  // 4 أنابيب حرارية نحاسية بقوس علوي (TubeGeometry على منحنى)
  const pipeOffsets: Array<readonly [number, number]> = [[0.09, 0.09], [0.09, -0.09], [-0.09, 0.09], [-0.09, -0.09]];
  for (const [py, pz] of pipeOffsets) {
    const pts = [
      new THREE.Vector3(0.31, py, pz),
      new THREE.Vector3(0.05, py, pz),
      new THREE.Vector3(-0.18, py, pz),
      new THREE.Vector3(-0.24, py + 0.15, pz),
      new THREE.Vector3(-0.24, py + 0.42, pz),
      new THREE.Vector3(-0.18, py + 0.52, pz),
      new THREE.Vector3(-0.08, py + 0.56, pz),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.028, 7, false), copper);
    if (castEnabled) pipe.castShadow = true;
    g.add(pipe);
    // قبعتا نهاية لبداية ونهاية الأنبوب
    const startCap = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), copper);
    startCap.position.copy(pts[0]);
    const endCap = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), copper);
    endCap.position.copy(pts[pts.length - 1]);
    g.add(startCap, endCap);
  }

  // كتلة زعانف: 14 لوحًا رفيعًا متقاربًا
  const finGeo = new THREE.BoxGeometry(0.016, 0.62, 0.5);
  for (let i = 0; i < 14; i++) {
    const fin = new THREE.Mesh(finGeo, alu);
    fin.position.set(0.12 - i * 0.026, 0, 0);
    if (castEnabled) fin.castShadow = true;
    g.add(fin);
  }
  // لوح علوي يغطي أطراف الزعانف
  g.add(box(0.38, 0.02, 0.52, alu, -0.05, 0.325, 0, false));

  // مروحة البرج الأمامية (تنظر نحو -X) + قابسان معدنيان
  const wrapper = new THREE.Group();
  wrapper.position.set(-0.38, 0, 0);
  wrapper.rotation.z = Math.PI / 2;
  const fan = makeFan(0.25);
  wrapper.add(fan.frame, fan.blades);
  spinners.push(fan.blades);
  g.add(wrapper);
  g.add(box(0.015, 0.03, 0.6, mat(COLORS.metalMid, 0.6, 0.4), -0.38, 0.385, 0, false));
  g.add(box(0.015, 0.03, 0.6, mat(COLORS.metalMid, 0.6, 0.4), -0.38, -0.385, 0, false));

  setComponentId(g, 'cooler');
  return g;
}

// ============================================================
// الذاكرة (dynamic.ram) — عصاتان متجاورتان (عالمي z 1.30 و 1.50)
// ============================================================

function buildRam(): THREE.Group {
  scope('ram');
  const g = new THREE.Group();
  g.name = 'part-ram';
  const pcbMat = mat(0x1e6b3a, 0.3, 0.55);
  const alu = mat(COLORS.aluminum, 0.8, 0.38, { map: brushedTexture('#a7b0ba') });
  const gold = mat(0xc9a23f, 0.9, 0.3);
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x0c4a5e, emissive: COLORS.accent, emissiveIntensity: 0.85, roughness: 0.35, metalness: 0.1, flatShading: false,
  });

  for (const z of [-0.1, 0.1]) { // محليًا: عالمي 1.30 و 1.50
    const stick = new THREE.Group();
    // نواة PCB
    stick.add(box(0.34, 1.3, 0.045, pcbMat, 0.03, 0, 0, true, true));
    // لوحا ناشر حراري على الوجهين بميل V خفيف
    const plateL = box(0.36, 1.06, 0.018, alu, 0, 0.04, -0.034, true);
    plateL.rotation.x = -0.16;
    const plateR = box(0.36, 1.06, 0.018, alu, 0, 0.04, 0.034, true);
    plateR.rotation.x = 0.16;
    stick.add(plateL, plateR);
    // موزّع علوي + شريط إضاءة + ملصق عام
    stick.add(box(0.36, 0.13, 0.1, mat(0x2a323c, 0.5, 0.45, { map: brushedTexture('#39434e') }), 0.02, 0.585, 0, true));
    stick.add(box(0.37, 0.045, 0.104, glowMat, 0.02, 0.665, 0, false));
    const label = plane(0.26, 0.1, mat(0xffffff, 0.2, 0.55, { map: ramLabelTexture() }), 'x', -0.163, 0.2, 0);
    stick.add(label);
    // أطراف ذهبية سفلية مع شق توجيه (key)
    stick.add(box(0.34, 0.15, 0.047, gold, 0.03, -0.575, 0, false));
    stick.add(box(0.35, 0.022, 0.05, mat(0x101418, 0.2, 0.6), 0.03, -0.535, 0, false));
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
  scope('gpu');
  const g = new THREE.Group();
  g.name = 'part-gpu';
  const shroudMat = mat(0x232b34, 0.4, 0.55, { map: brushedTexture('#2a333d') });

  // PCB أفقي + غطاء + backplate
  g.add(box(1.07, 0.04, 2.35, mat(COLORS.pcb, 0.35, 0.6, { map: pcbTexture('#14503a', '#2e8f63') }), 0, -0.03, 0, true, true));
  g.add(box(1.05, 0.42, 2.3, shroudMat, 0, -0.26, 0, true));
  // حافتا جانبيتان دائريتان للغطاء (داخل عرض الغطاء نفسه)
  g.add(cyl(0.21, 2.24, shroudMat, 'z', 0.315, -0.26, 0, true));
  g.add(cyl(0.21, 2.24, shroudMat, 'z', -0.315, -0.26, 0, true));
  // شريط إضاءة سماوي + لوحة اسم عامة
  const gpuGlow = new THREE.MeshStandardMaterial({
    color: 0x0c4a5e, emissive: COLORS.accent, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1, flatShading: false,
  });
  g.add(box(0.02, 0.07, 2.05, gpuGlow, -0.535, -0.26, 0.05, false));
  g.add(plane(0.5, 0.13, mat(0xffffff, 0.2, 0.5, { map: gpuPlateTexture() }), 'x', -0.545, -0.13, 0));
  // backplate + 4 فتحات تهوية
  g.add(box(1.07, 0.02, 2.35, mat(COLORS.metalMid, 0.7, 0.4, { map: brushedTexture('#4a545f') }), 0, 0.03, 0, true));
  for (const vz of [-0.55, 0.55]) {
    for (const vx of [-0.22, 0.22]) {
      g.add(box(0.32, 0.012, 0.07, mat(0x10151b, 0.3, 0.6), vx, 0.045, vz, false));
    }
  }

  // bracket خلفي: منافذ عرض (2×DP + HDMI) + فتحات
  g.add(box(0.06, 0.5, 0.12, mat(COLORS.aluminum, 0.8, 0.4), 0, -0.03, -1.3, true));
  const portMat = mat(0x0d1116, 0.3, 0.6);
  for (const py of [0.06, -0.06]) {
    g.add(box(0.05, 0.1, 0.02, portMat, 0, py - 0.03, -1.372, false));
  }
  g.add(box(0.07, 0.09, 0.02, portMat, 0, -0.03, -1.372, false));
  g.add(box(0.05, 0.14, 0.015, portMat, 0.02, -0.2, -1.368, false));

  // حلقتا غورز حول المراوح + مروحتان (تنظران للأسفل — محور Y)
  const ringMat = mat(0x151b22, 0.4, 0.55);
  for (const fz of [-0.55, 0.55]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.014, 6, 28), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-0.53, -0.47, fz);
    g.add(ring);
    const wrapper = new THREE.Group();
    wrapper.position.set(0, -0.55, fz);
    const fan = makeFan(0.28);
    wrapper.add(fan.frame, fan.blades);
    spinners.push(fan.blades);
    g.add(wrapper);
  }

  // أطراف PCIe الذهبية أسفل PCB (بشق توجيه) عند حافة اللوحة الأم
  const gold = mat(0xc9a23f, 0.9, 0.3);
  g.add(box(0.02, 0.05, 0.5, gold, 0.53, -0.07, -0.45, false));
  g.add(box(0.02, 0.05, 0.49, gold, 0.53, -0.07, 0.105, false));

  // موصل طاقة 8pin مرفوع على قاعدة رافعة + نقاط إبر ذهبية
  g.add(box(0.2, 0.26, 0.22, shroudMat, -0.28, 0.14, 0.63, false));
  const conn = box(0.16, 0.1, 0.18, mat(COLORS.black, 0.3, 0.5), -0.28, 0.31, 0.63, false);
  g.add(conn);
  for (let i = 0; i < 4; i++) {
    g.add(box(0.02, 0.015, 0.02, gold, -0.34 + i * 0.04, 0.363, 0.63, false));
  }

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
// مزود الطاقة (dynamic.psu) — صندوق بتفاصيل خارجية كاملة
// ============================================================

function buildPsu(flags: FlagVisuals): THREE.Group {
  scope('psu');
  const g = new THREE.Group();
  g.name = 'part-psu';

  // جسم مصقول — العمق 1.3 ليبقى بعيدًا عن الجدار الخلفي (لا اختراق)
  g.add(box(1.45, 0.85, 1.3, mat(0x48525e, 0.6, 0.42, { map: brushedTexture('#4d5864') }), 0, 0, 0, true, true));

  // شبكة مروحة دائرية على الوجه العلوي
  const grillT = fanGrillTexture('#2b333d');
  if (grillT) {
    g.add(plane(0.95, 0.95, mat(0xffffff, 0.35, 0.5, { map: grillT }), 'y', 0, 0.427, 0.28));
  }
  g.add(box(1.3, 0.02, 0.08, mat(0x2b333d, 0.4, 0.5), 0, 0.432, -0.45, false));

  // الوجه الخلفي: مأوى AC بثلاثة أقطاب + مفتاح روكر + شريط تهوية
  g.add(box(0.24, 0.18, 0.03, mat(COLORS.black, 0.3, 0.55), 0.42, -0.08, -0.665, false));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.02, 0.02, 0.015, mat(0xc9a23f, 0.85, 0.35), 0.36 + i * 0.06, -0.08, -0.685, false));
  }
  g.add(box(0.11, 0.13, 0.028, mat(0x6e2a2a, 0.3, 0.5), 0.02, -0.08, -0.668, false));
  g.add(box(0.08, 0.016, 0.01, mat(0xe8eaed, 0.1, 0.5), 0.02, -0.08, -0.685, false));
  const grilleGeo = new THREE.BoxGeometry(1.15, 0.035, 0.03);
  const grilleMat = mat(0x272f38, 0.5, 0.5);
  for (let i = 0; i < 5; i++) {
    const strip = new THREE.Mesh(grilleGeo, grilleMat);
    strip.position.set(-0.1, -0.34 + i * 0.1, -0.66);
    g.add(strip);
  }

  // الوجه الأمامي: 3 مقابس موديولارية بنقاط إبر
  const sockMat = mat(COLORS.black, 0.3, 0.55);
  const gold = mat(0xc9a23f, 0.85, 0.35);
  const socks: Array<readonly [number, number]> = [[-0.4, 0.12], [-0.4, -0.14], [0.08, -0.14]];
  for (const [px, py] of socks) {
    g.add(box(0.3, 0.18, 0.02, sockMat, px, py, 0.655, false));
    for (let i = 0; i < 4; i++) {
      g.add(box(0.025, 0.025, 0.012, gold, px - 0.09 + i * 0.06, py + 0.03, 0.668, false));
    }
  }

  // ملصق عام على الوجه -X + شريط accent
  const labelT = psuLabelTexture();
  if (labelT) {
    g.add(plane(0.95, 0.6, mat(0xffffff, 0.2, 0.65, { map: labelT }), 'x', -0.728, 0.02, 0.05));
  }
  g.add(box(0.015, 0.09, 0.7, mat(COLORS.accent, 0.4, 0.5), -0.732, 0.33, 0.05, false));

  // 4 قوائم مطاطية سفلية (تلامس الأرضية بلا اختراق)
  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) {
      g.add(box(0.14, 0.03, 0.14, mat(0x0d1116, 0.2, 0.7), px * 0.55, -0.415, pz * 0.45, false));
    }
  }

  // 4 براغي الخلف (تبقى مع مزود الطاقة) — على السطح البعيد الجديد
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const s = makeScrew(0.028, 0.05, 'z');
      s.position.set(sx * 0.62, sy * 0.35, -0.67);
      s.name = 'flag-psu-screw';
      flags.psuScrews.push(s);
      g.add(s);
    }
  }

  setComponentId(g, 'psu');
  return g;
}

// ============================================================
// قرص M.2 (dynamic.ssd) — رقاقة على اللوحة بمشتت وملصق وأطراف ذهبية
// ============================================================

function buildSsd(): THREE.Group {
  scope('ssd');
  const g = new THREE.Group();
  g.name = 'part-ssd';
  g.add(box(0.05, 0.16, 0.8, mat(0x1e6b3a, 0.3, 0.55), 0, 0, 0, true, true)); // الرقاقة الخضراء
  const chipMat = mat(COLORS.black, 0.3, 0.5);
  g.add(box(0.03, 0.1, 0.14, chipMat, -0.04, 0, -0.22, false)); // رقاقة سوداء 1
  g.add(box(0.03, 0.1, 0.14, chipMat, -0.04, 0, 0.22, false));  // رقاقة سوداء 2

  // مشتت حراري ألمنيوم على النصف الأمامي + ملصق عام
  g.add(box(0.03, 0.145, 0.42, mat(COLORS.aluminum, 0.8, 0.4, { map: brushedTexture('#a7b0ba') }), -0.045, 0, 0.06, false));
  const labelT = m2LabelTexture();
  if (labelT) {
    g.add(plane(0.26, 0.095, mat(0xffffff, 0.2, 0.55, { map: labelT }), 'x', -0.062, 0, 0.06));
  }

  // أطراف ذهبية عند الطرف +Z (نحو مقبس M.2) بشق توجيه
  const gold = mat(0xc9a23f, 0.9, 0.3);
  g.add(box(0.045, 0.052, 0.05, gold, 0, -0.038, 0.405, false));
  g.add(box(0.045, 0.052, 0.05, gold, 0, 0.038, 0.405, false));
  // ثقب برغي الطرف الآخر
  g.add(cyl(0.02, 0.015, mat(0x0d1116, 0.3, 0.6), 'x', -0.028, 0, -0.4, false));

  setComponentId(g, 'ssd');
  return g;
}

// ============================================================
// مراوح الهيكل (dynamic.fans) — أماميتان + خلفية علوية
// ============================================================

function buildFans(flags: FlagVisuals, spinners: THREE.Object3D[]): THREE.Group {
  scope('fans');
  const g = new THREE.Group();
  g.name = 'part-fans';
  const mount = MOUNTS.fans;
  const defs: Array<{ pos: readonly [number, number, number]; rotX: number }> = [
    { pos: [1.05, 2.9, 4.42], rotX: Math.PI / 2 },  // أمامية علوية (محور Z)
    { pos: [1.05, 1.5, 4.42], rotX: Math.PI / 2 },  // أمامية سفلية
    { pos: [1.05, 3.9, 0.33], rotX: -Math.PI / 2 }, // خلفية علوية (مزاحة عن الجدار — لا اختراق)
  ];
  for (const d of defs) {
    const wrapper = new THREE.Group();
    wrapper.position.set(d.pos[0] - mount[0], d.pos[1] - mount[1], d.pos[2] - mount[2]);
    wrapper.rotation.x = d.rotX; // محور الدوران Y المحلي → Z عالمي
    const fan = makeFan(0.42);
    wrapper.add(fan.frame, fan.blades);
    spinners.push(fan.blades);
    // 4 براغي زوايا لكل مروحة (على المحور المحلي Y = محور المروحة)
    const half = 0.42 * 1.32;
    const sy = 0.42 * 0.5 / 2 + 0.015;
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
  scope('atx24');
  const g = new THREE.Group();
  g.name = 'part-atx24';
  g.add(box(0.12, 0.5, 0.25, mat(COLORS.black, 0.3, 0.5), 0, 0, 0, true, true)); // الموصل
  g.add(box(0.125, 0.44, 0.04, mat(0x0a0e12, 0.25, 0.6), 0, 0, 0.11, false));     // عارضة تجزئة
  g.add(box(0.125, 0.035, 0.26, mat(0x39434e, 0.4, 0.5), 0, 0.0, -0.1, false));   // حدّ تسنين

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
  scope('eps');
  const g = new THREE.Group();
  g.name = 'part-eps';
  g.add(box(0.12, 0.26, 0.2, mat(COLORS.black, 0.3, 0.5), 0, 0, 0, true, true));
  g.add(box(0.125, 0.22, 0.03, mat(0x0a0e12, 0.25, 0.6), 0, 0, 0.09, false));

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
  scope('gpuPower');
  const g = new THREE.Group();
  g.name = 'part-gpu-power';
  g.add(box(0.16, 0.1, 0.18, mat(COLORS.black, 0.3, 0.5), 0, 0, 0, true, true)); // يتطابق فوق موصل البطاقة
  g.add(box(0.165, 0.02, 0.06, mat(0x39434e, 0.4, 0.5), 0, 0.055, 0, false));     // حدّ تسنين

  // 4 أسلاك قصيرة على الوجه -X
  const wireGeo = new THREE.BoxGeometry(0.035, 0.03, 0.03);
  for (let i = 0; i < 4; i++) {
    const wire = new THREE.Mesh(wireGeo, mat(WIRE_COLORS[i % WIRE_COLORS.length], 0.2, 0.6));
    wire.position.set(-0.095, 0, -0.06 + i * 0.04);
    g.add(wire);
  }

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
  scope('tray');
  const g = new THREE.Group();
  g.name = 'tray-table'; // غير قابلة للاختيار عمدًا

  const cx = (TRAY.minX + TRAY.maxX) / 2; // -3.35
  const cz = (TRAY.minZ + TRAY.maxZ) / 2; // 2.4

  // السطح (أعلى = TRAY.tableTopY = 0.9)
  g.add(box(TRAY.maxX - TRAY.minX, 0.08, TRAY.maxZ - TRAY.minZ, mat(0x2b333d, 0.4, 0.6), cx, 0.86, cz, true, true));
  // سجادة مضادة للكهرباء الساكنة بحدين فاتحين
  g.add(box(1.9, 0.012, 3.4, mat(0x1c2830, 0.2, 0.8), cx + 0.1, 0.906, cz, false));
  g.add(box(1.9, 0.004, 0.03, mat(0x22d3ee, 0.3, 0.6), cx + 0.1, 0.913, cz - 1.685, false));
  g.add(box(1.9, 0.004, 0.03, mat(0x22d3ee, 0.3, 0.6), cx + 0.1, 0.913, cz + 1.685, false));

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
    { id: 'hdd', size: [1.1, 1.5] },
    { id: 'fans', size: [1.0, 1.0] },
    { id: 'psu', size: [1.5, 1.5] },
    { id: 'motherboard', size: [2.05, 2.4] },
    { id: 'atx24', size: [0.4, 0.6] },
    { id: 'eps', size: [0.35, 0.5] },
    { id: 'sataData', size: [0.4, 0.5] },
    { id: 'sataPower', size: [0.45, 0.5] },
  ];
  const markerMat = mat(0x24303a, 0.2, 0.8);
  for (const mk of markers) {
    const p = TRAY.slots[mk.id];
    const px = Math.min(Math.max(p[0], TRAY.minX + mk.size[0] / 2 + 0.02), TRAY.maxX - mk.size[0] / 2 - 0.02);
    const pz = Math.min(Math.max(p[2], TRAY.minZ + mk.size[1] / 2 + 0.02), TRAY.maxZ - mk.size[1] / 2 - 0.02);
    g.add(box(mk.size[0], 0.012, mk.size[1], markerMat, px, 0.906, pz, false));
  }

  // ===== عدة عمل (زينة تعليمية غير تفاعلية — الالتقاط يتوقف عندها كفراغ) =====
  // صينية مسامير صغيرة مع 6 مسامير متناثرة
  const trayBox = new THREE.Group();
  trayBox.name = 'deco-screw-tray';
  const tbx = TRAY.maxX - 0.35, tbz = TRAY.minZ + 0.45;
  trayBox.add(box(0.5, 0.05, 0.35, mat(0x39434e, 0.4, 0.55), tbx, 0.945, tbz, false));
  trayBox.add(box(0.5, 0.035, 0.04, mat(0x4a5560, 0.4, 0.5), tbx, 0.955, tbz - 0.175, false));
  trayBox.add(box(0.5, 0.035, 0.04, mat(0x4a5560, 0.4, 0.5), tbx, 0.955, tbz + 0.175, false));
  trayBox.add(box(0.04, 0.035, 0.35, mat(0x4a5560, 0.4, 0.5), tbx - 0.25, 0.955, tbz, false));
  trayBox.add(box(0.04, 0.035, 0.35, mat(0x4a5560, 0.4, 0.5), tbx + 0.25, 0.955, tbz, false));
  const decoScrewMat = mat(COLORS.aluminum, 0.85, 0.35);
  for (let i = 0; i < 6; i++) {
    const sc = cyl(0.02, 0.035, decoScrewMat, 'y', tbx - 0.15 + (i % 3) * 0.15, 0.975, tbz - 0.08 + Math.floor(i / 3) * 0.16, false);
    sc.rotation.y = i * 0.7;
    trayBox.add(sc);
  }
  g.add(trayBox);

  // مفك براغي مستلقي على حافة الطاولة (مقبض + ساق + سن)
  const driver = new THREE.Group();
  driver.name = 'deco-screwdriver';
  const dx = TRAY.minX + 0.45, dz = TRAY.minZ + 0.5;
  const handle = cyl(0.045, 0.34, mat(0x5a2323, 0.3, 0.55), 'z', dx, 0.95, dz, false);
  driver.add(handle);
  driver.add(cyl(0.012, 0.4, mat(COLORS.aluminum, 0.85, 0.35), 'z', dx, 0.95, dz + 0.36, false));
  driver.add(box(0.02, 0.012, 0.05, mat(0x8a8f96, 0.8, 0.35), dx, 0.95, dz + 0.58, false));
  driver.add(cyl(0.05, 0.02, mat(0x39434e, 0.4, 0.5), 'z', dx, 0.95, dz - 0.17, false));
  g.add(driver);

  // سوار مضاد للكهرباء الساكنة (سوار دائري صغير)
  const esd = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.02, 8, 24),
    mat(0x22484f, 0.2, 0.7),
  );
  esd.name = 'deco-esd-bracelet';
  esd.rotation.x = -Math.PI / 2;
  esd.position.set(TRAY.minX + 1.1, 0.93, TRAY.maxZ - 0.5);
  g.add(esd);

  return g;
}

// ============================================================
// القرص الميكانيكي 3.5" (dynamic.hdd) — علبة معدنية وملصق ومنفذا SATA خلفيان
// ============================================================

function buildHdd(): THREE.Group {
  scope('hdd');
  const g = new THREE.Group();
  g.name = 'part-hdd';
  const bodyMat = mat(COLORS.aluminum, 0.75, 0.38, { map: brushedTexture('#9aa3ad') });
  g.add(box(1.02, 0.26, 1.47, bodyMat, 0, 0, 0, true, true)); // الجسم
  // إطار داخلي أغمق أعلى/أسفل (تفصيل مسطح)
  g.add(box(0.94, 0.02, 1.39, mat(0x6f7780, 0.7, 0.45), 0, 0.135, 0, false));
  g.add(box(0.94, 0.02, 1.39, mat(0x6f7780, 0.7, 0.45), 0, -0.135, 0, false));
  // ملصق علوي
  const labelT = hddLabelTexture();
  if (labelT) {
    g.add(plane(0.86, 1.2, mat(0xffffff, 0.25, 0.6, { map: labelT }), 'y', 0, 0.15, 0.02));
  }
  // منفدا SATA على الوجه الخلفي (-Z): بيانات (صغير) + طاقة (أعرض) بأطراف ذهبية
  const gold = mat(0xc9a23f, 0.9, 0.3);
  g.add(box(0.06, 0.1, 0.06, mat(0x0d1116, 0.3, 0.55), -0.25, 0, -0.745, false));
  g.add(box(0.05, 0.09, 0.04, gold, -0.25, 0, -0.772, false)); // بيانات
  g.add(box(0.14, 0.1, 0.06, mat(0x0d1116, 0.3, 0.55), -0.02, 0, -0.745, false));
  g.add(box(0.13, 0.09, 0.04, gold, -0.02, 0, -0.772, false)); // طاقة
  // ثقوب براغي الأركان الأربعة
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.024, 0.012, mat(0x0d1116, 0.3, 0.6), 'y', sx * 0.45, 0.135, sz * 0.67, false));
    }
  }
  setComponentId(g, 'hdd');
  return g;
}

// ============================================================
// كابل SATA للبيانات (dynamic.sataData) — أحمر رفيع من اللوحة إلى خلفية القرص
// ============================================================

function buildSataData(): THREE.Group {
  scope('sataData');
  const g = new THREE.Group();
  g.name = 'part-sata-data';
  // موصل الطرف عند منفذ اللوحة
  g.add(box(0.05, 0.09, 0.1, mat(0x8c1d1d, 0.3, 0.55), 0, 0, 0, true, true));
  g.add(box(0.035, 0.07, 0.02, mat(0xc9a23f, 0.9, 0.3), -0.04, 0, -0.02, false));
  // كابل أحمر رفيع: منفذ اللوحة (1.78,2.2,2.35) → انحناء لطيف → خلفية القرص (1.05,0.8,2.8)
  g.add(makeCable(cablePoints(MOUNTS.sataData, [
    [1.78, 2.2, 2.35],
    [1.6, 1.45, 2.62],
    [1.3, 0.95, 2.66],
    [1.12, 0.8, 2.72],
  ]), 0.022, 0x8c1d1d));
  setComponentId(g, 'sataData');
  return g;
}

// ============================================================
// كابل SATA للطاقة (dynamic.sataPower) — أسود أعرض من PSU إلى خلفية القرص
// ============================================================

function buildSataPower(): THREE.Group {
  scope('sataPower');
  const g = new THREE.Group();
  g.name = 'part-sata-power';
  g.add(box(0.13, 0.1, 0.12, mat(COLORS.black, 0.3, 0.5), 0, 0, 0, true, true));
  g.add(box(0.11, 0.08, 0.02, mat(0xc9a23f, 0.9, 0.3), -0.06, 0, -0.03, false));
  g.add(makeCable(cablePoints(MOUNTS.sataPower, [
    [1.28, 0.78, 2.9],
    [1.24, 0.76, 2.6],
    [1.12, 0.8, 2.5],
  ]), 0.032, 0x11161c));
  setComponentId(g, 'sataPower');
  return g;
}

// ============================================================
// الطرفيات: الشاشة + لوحة المفاتيح + الفأرة (الجلسة 4 — المواصفة §5)
// ليست قطع PC — تُنقر عبر callbacks.onPeripheral
// ============================================================

function buildMonitor(spinners: THREE.Object3D[]): THREE.Group {
  scope('monitor');
  const g = new THREE.Group();
  g.name = 'periph-monitor';
  g.userData['peripheral'] = 'monitor';

  // قاعدة + عمود
  g.add(box(2.0, 0.1, 1.3, mat(COLORS.metalDark, 0.6, 0.45), 0, 0.05, 0, true, true));
  g.add(box(0.34, 1.35, 0.22, mat(COLORS.metalDark, 0.6, 0.45), 0, 0.75, -0.18, true));
  // الإطار
  const bezelW = PERIPH.screenW + 0.22;
  const bezelH = PERIPH.screenH + 0.2;
  const bezel = box(bezelW, bezelH, 0.14, mat(0x14181e, 0.4, 0.5), 0, 0, 0, true, true);
  bezel.position.set(PERIPH.screenCenterLocal[0], PERIPH.screenCenterLocal[1] + 0.05, PERIPH.screenCenterLocal[2] - 0.07);
  g.add(bezel);
  // لمبة طاقة صغيرة على الحافة السفلية
  const led = box(0.05, 0.05, 0.02, mat(COLORS.green, 0.2, 0.5, { emissive: 0x22c55e, emissiveIntensity: 0.9 }), -bezelW / 2 + 0.22, PERIPH.screenCenterLocal[1] + 0.05 - bezelH / 2 + 0.07, 0.08, false);
  g.add(led);

  // سطح العرض — مادة أساسية يستبدلها PCScene بنسيج الرسّام
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x05070c });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(PERIPH.screenW, PERIPH.screenH), screenMat);
  screen.position.set(PERIPH.screenCenterLocal[0], PERIPH.screenCenterLocal[1] + 0.05, PERIPH.screenCenterLocal[2]);
  screen.name = 'monitor-screen';
  g.add(screen);

  // زر التشغيل (قابل للنقر) أسفل يمين الإطار
  const btn = box(0.12, 0.12, 0.05, mat(0x2a323c, 0.5, 0.4), bezelW / 2 - 0.2, PERIPH.screenCenterLocal[1] + 0.05 - bezelH / 2 + 0.09, 0.075, false);
  btn.userData['peripheral'] = 'monitor-power';
  g.add(btn);

  // كابل إشارة من الشاشة نحو البطاقة (يُخفى عند فصل الكابل — يتولاه PCScene)
  const cableGroup = new THREE.Group();
  cableGroup.name = 'monitor-cable';
  const pts = cablePoints([0, 0, 0], [
    [PERIPH.monitorPos[0] - 0.9, 0.95, PERIPH.monitorPos[2] - 0.2],
    [PERIPH.monitorPos[0] - 2.2, 0.92, PERIPH.monitorPos[2] - 1.6],
    [2.6, 0.9, 3.2],
    [1.4, 0.9, 2.4],
  ]);
  cableGroup.add(makeCable(pts, 0.03, 0x14181e));
  g.add(cableGroup);

  // دوران شاشة بسيط حول Y مستبعد — لكن نضيف اهتزاز LED إلى spinners ليومض؟ لا — spinners للمراوح فقط.
  void spinners;

  return g;
}

// ============================================================
// أسهم اتجاه تدفق الهواء (تُظهر/تُخفى عبر setAirflow)
// ============================================================

function makeArrow(len: number, matArrow: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shaft = cyl(0.045, len - 0.16, matArrow, 'z', 0, 0, 0, false);
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.18, 10), matArrow);
  head.rotation.x = -Math.PI / 2; // رأس نحو -Z
  head.position.z = -(len - 0.16) / 2 - 0.09;
  g.add(head);
  return g;
}

function buildAirflow(): THREE.Group {
  scope('airflow');
  const g = new THREE.Group();
  g.name = 'airflow-arrows';
  g.visible = false;
  const matArrow = mat(0x22d3ee, 0.2, 0.5, { emissive: 0x22d3ee, emissiveIntensity: 0.55, transparent: true, opacity: 0.85 });

  // دخول من الأمام (+Z → داخل الهيكل): سهمان عند مستوى المراوح الأمامية
  for (const y of [1.5, 2.9]) {
    const a = makeArrow(1.1, matArrow);
    a.position.set(1.05, y, 5.15);
    g.add(a);
  }
  // خروج من الخلف (نحو -Z خارج الهيكل)
  for (const y of [2.2, 3.9]) {
    const a = makeArrow(1.0, matArrow);
    a.position.set(1.05, y, 0.05);
    g.add(a);
  }
  // سهم داخل مروحة المعالج: من الأمام نحو المبرد
  const cpu = makeArrow(0.8, matArrow);
  cpu.position.set(1.05, 3.45, 1.85);
  cpu.rotation.y = Math.PI / 2; // يتجه نحو -X (داخل نحو المبرد)
  g.add(cpu);
  // خروج مزود الطاقة لأسفل-خلف
  const psu = makeArrow(0.7, matArrow);
  psu.rotation.x = Math.PI / 2; // رأس نحو +Y؟ لا: نريد نزولًا → اقلبه
  psu.rotation.x = -Math.PI / 2; // رأس نحو -Y (داخل نحو الأسفل عند PSU)
  psu.position.set(1.05, 0.85, 0.72);
  g.add(psu);
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
  const hdd = buildHdd();
  const fans = buildFans(flags, spinners);
  const atx24 = buildAtx24();
  const eps = buildEps();
  const gpuPower = buildGpuPower();
  const sataData = buildSataData();
  const sataPower = buildSataPower();
  const trayTable = buildTrayTable();
  const monitor = buildMonitor(spinners);
  const airflow = buildAirflow();

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
  place(hdd, 'hdd');
  place(fans, 'fans');
  place(atx24, 'atx24');
  place(eps, 'eps');
  place(gpuPower, 'gpuPower');
  place(sataData, 'sataData');
  place(sataPower, 'sataPower');

  // مجموعة placeholder للمكوّن 'case' (الهيكل نفسه لا يُحرك أبدًا — فارغة للأمان)
  const caseAnchor = new THREE.Group();
  caseAnchor.name = 'case-anchor';
  place(caseAnchor, 'case');

  // ===== الطرفيات على المكتب =====
  monitor.position.set(...PERIPH.monitorPos);
  monitor.rotation.y = PERIPH.monitorRotY;

  // حصيرة مكتب تحت الشاشة (تأطير بصري لطيف — توجيه v3: بلا ديكور زائد)
  const deskMat = box(PERIPH.matSize[0], 0.012, PERIPH.matSize[1], mat(0x182029, 0.2, 0.85), PERIPH.matCenter[0], PERIPH.matCenter[1], PERIPH.matCenter[2], false);
  deskMat.receiveShadow = castEnabled;

  const root = new THREE.Group();
  root.name = 'pc-parts-root';
  root.add(caseShell, sidePanel, trayTable, caseAnchor);
  root.add(motherboard, cpu, cooler, ram, gpu, psu, ssd, hdd, fans, atx24, eps, gpuPower, sataData, sataPower);
  root.add(monitor); // لا كيبورد ولا ماوس — توجيه v3 أ.1
  root.add(airflow);
  root.add(deskMat);

  const dynamic: Record<ComponentId, THREE.Group> = {
    case: caseAnchor,
    motherboard,
    cpu,
    cooler,
    ram,
    gpu,
    psu,
    ssd,
    hdd,
    fans,
    atx24,
    eps,
    gpuPower,
    sataData,
    sataPower,
  };

  return { root, dynamic, caseShell, sidePanel, flags, spinners, monitor, airflow };
}
