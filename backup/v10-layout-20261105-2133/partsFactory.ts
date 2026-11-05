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
 * المخرجات المرجعية: مراوح مسماة (rotors) لمنظومة V6 و~40 مرجع flags.
 */
import * as THREE from 'three';
import type { ComponentId } from '../types';
import type { SceneQuality, FlagVisuals, PartVisuals } from './visualTypes';
import { BOARD, CASE, COLORS, DESK, MOUNTS, PERIPH, TRAY } from './layout';
import { alignGpuPowerCable, applyGlbParts } from './glbParts';
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
  scene.fog = new THREE.Fog(COLORS.bg, 26, 64);

  // أرضية المختبر — 75سم أسفل سطح مكتب الورشة (توجيه v4 أ.1)
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 28),
    new THREE.MeshStandardMaterial({ color: 0x131820, metalness: 0, roughness: 0.94, flatShading: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = DESK.floorY;
  ground.receiveShadow = true;
  scene.add(ground);

  // شبكة أرضية خفيفة
  const grid = new THREE.GridHelper(40, 40, 0x232c38, 0x171d26);
  grid.position.y = DESK.floorY + 0.01;
  const gridMat: THREE.Material | THREE.Material[] = grid.material;
  const gridMats = Array.isArray(gridMat) ? gridMat : [gridMat];
  for (const gm of gridMats) {
    gm.transparent = true;
    gm.opacity = 0.35;
  }
  scene.add(grid);

  scene.add(new THREE.AmbientLight(0xffffff, 1.35));
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1b2028, 1.3));

  // شمس دافئة مع ظلال (حسب الجودة) — تغطي المكتب كاملًا
  const dir = new THREE.DirectionalLight(0xfff2e0, 3.2);
  dir.position.set(-7, 10, 8);
  if (quality !== 'low') {
    dir.castShadow = true;
    const size = quality === 'high' ? 2048 : 1024;
    dir.shadow.mapSize.set(size, size);
    dir.shadow.camera.left = -12;
    dir.shadow.camera.right = 12;
    dir.shadow.camera.top = 12;
    dir.shadow.camera.bottom = -12;
    dir.shadow.camera.near = 2;
    dir.shadow.camera.far = 45;
    dir.shadow.camera.updateProjectionMatrix();
    dir.shadow.bias = -0.0004;
    dir.shadow.normalBias = 0.02;
  }
  scene.add(dir);

  const fill = new THREE.PointLight(0xffffff, 0.6, 0, 0);
  fill.position.set(4, 7, -2);
  scene.add(fill);
  const front = new THREE.PointLight(0xfff4e0, 1.6, 0, 0);
  front.position.set(-5, 4.5, 6);
  scene.add(front);

  // (V8.1) كشاف مركّز على منطقة العمل: الجهاز + سجادة ESD — إضاءة فني حقيقية
  const workSpot = new THREE.SpotLight(0xfff3e2, 1000, 0, 0.8, 0.5, 2);
  workSpot.position.set(0.5, 11.5, 5.6);
  workSpot.target.position.set(0.4, 0, 2.6);
  scene.add(workSpot);
  scene.add(workSpot.target);

  // محطة العمل: مكتب + جدار ورشة + إضاءة سقفية + مشترك كهرباء
  scene.add(buildWorkstation());
}

// ============================================================
// محطة عمل الورشة (توجيه v4 أ.1 — مكتب واحد يجمع الجهاز والشاشة والصينية)
// ============================================================

function buildWorkstation(): THREE.Group {
  scope('desk');
  const g = new THREE.Group();
  g.name = 'workstation';

  const w = DESK.maxX - DESK.minX; // 15
  const d = DESK.maxZ - DESK.minZ; // 10.6
  const cx = (DESK.minX + DESK.maxX) / 2;
  const cz = (DESK.minZ + DESK.maxZ) / 2;

  // --- سطح المكتب: لوح سميك بحافة ألمنيوم على الأطراف ---
  const topMat = mat(0x525c68, 0.25, 0.65, { map: brushedTexture('#5d6672') });
  const top = box(w, DESK.thickness, d, topMat, cx, DESK.topY - DESK.thickness / 2, cz, true, true);
  top.name = 'desk-top';
  g.add(top);
  const trimMat = mat(0x565f6a, 0.7, 0.4);
  // أربعة أشرطة حواف معدنية رفيعة (تفصل السطح عن الأطراف كطاولات الورش الحقيقية)
  g.add(box(w, 0.06, 0.06, trimMat, cx, DESK.topY - 0.03, DESK.minZ + 0.03, false));
  g.add(box(w, 0.06, 0.06, trimMat, cx, DESK.topY - 0.03, DESK.maxZ - 0.03, false));
  g.add(box(0.06, 0.06, d, trimMat, DESK.minX + 0.03, DESK.topY - 0.03, cz, false));
  g.add(box(0.06, 0.06, d, trimMat, DESK.maxX - 0.03, DESK.topY - 0.03, cz, false));

  // --- أرجل فولاذية على شكل حرف L + عارضات عرضية + رف سفلي ---
  const legMat = mat(COLORS.deskSteel, 0.6, 0.45, { map: brushedTexture('#2f3740') });
  const legH = DESK.topY - DESK.thickness - DESK.floorY; // 7
  const legCy = DESK.floorY + legH / 2;
  for (const lx of [DESK.minX + DESK.legInset, DESK.maxX - DESK.legInset]) {
    for (const lz of [DESK.minZ + DESK.legInset, DESK.maxZ - DESK.legInset]) {
      g.add(box(0.24, legH, 0.24, legMat, lx, legCy, lz, true));
      // قدم مطاطية سوداء
      g.add(box(0.3, 0.08, 0.3, mat(0x0c0f14, 0.2, 0.7), lx, DESK.floorY + 0.04, lz, false));
    }
  }
  // عارضتان طوليتان تربطان الأرجل + رف سفلي كامل
  for (const lz of [DESK.minZ + DESK.legInset, DESK.maxZ - DESK.legInset]) {
    g.add(box(w - DESK.legInset * 2, 0.14, 0.1, legMat, cx, DESK.floorY + 1.1, lz, false));
  }
  g.add(box(w - 1.4, 0.1, d - 1.4, mat(0x232a32, 0.5, 0.55), cx, DESK.floorY + 3.6, cz, true, true));

  // --- جدار الورشة خلف المكتب + لوح تعليق أدوات معلقة + لافتة الورشة + رف قطع ---
  const wallMat = mat(COLORS.wall, 0.15, 0.85);
  const wall = box(34, 26, 0.4, wallMat, cx, DESK.floorY + 13, DESK.minZ - 0.8, false, true);
  wall.name = 'workshop-wall';
  g.add(wall);
  // إيزود السقف/الجدار: شريط داكن أفقياً
  g.add(box(34, 0.5, 0.06, mat(0x11161d, 0.2, 0.8), cx, DESK.floorY + 6.4, DESK.minZ - 0.58, false));
  // (V8.1) لوح تعليق الأدوات — الجانب الأيسر المرئي من الكاميرا الافتراضية، بأدوات معلقة حقيقية
  const pegboard = box(6.2, 5.6, 0.06, mat(0x26303c, 0.3, 0.75, { map: ventMeshTexture('#313c4a', '#1a222c') }), -2.0, DESK.floorY + 8.6, DESK.minZ - 0.56, false);
  pegboard.name = 'pegboard';
  g.add(pegboard);
  // ضوء مركّز فوق لوح الأدوات حتى تظهر المعلقات بوضوح
  const pegLight = new THREE.PointLight(0xeaf4ff, 90, 16, 1.6);
  pegLight.position.set(-2.0, DESK.floorY + 12.4, DESK.minZ + 1.2);
  g.add(pegLight);
  buildPegboardKit(g);
  // (V8.1) لافتة الورشة المضيئة أعلى لوح التعليق
  g.add(buildWorkshopSign());
  // رفان معدنيان يمين الجدار مع صناديق قطع وأدوات (V8.1: محتويات قطع PC حقيقية)
  buildPartsShelf(g, 6.8, DESK.floorY + 10.6);
  buildPartsShelf(g, 6.8, DESK.floorY + 12.2);

  // --- مصابيح سقفية معلقة (زينة + إضاءة) ---
  const barMat = mat(0x39424d, 0.5, 0.45);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xf5f8ff, emissive: 0xeef4ff, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0, flatShading: false });
  for (const bx of [-2.4, 4.6]) {
    const bz = bx < 0 ? 2.2 : 6.2; // توزيع المصباحين على عمق المكتب
    g.add(cyl(0.02, 3.4, mat(0x1a2028, 0.4, 0.5), 'y', bx, DESK.floorY + 16.2, bz, false)); // سلك التعليق
    g.add(box(0.5, 0.12, 4.4, barMat, bx, DESK.floorY + 14.4, bz, false));
    g.add(box(0.42, 0.03, 4.2, glowMat, bx, DESK.floorY + 14.32, bz, false));
    const lamp = new THREE.PointLight(0xf2f6ff, 55, 26, 1.4);
    lamp.position.set(bx, DESK.floorY + 14.0, bz);
    g.add(lamp);
  }

  // --- مشترك كهرباء على المكتب خلف الشاشة (تفصيل واقعي غير تفاعلي) ---
  const strip = new THREE.Group();
  strip.name = 'power-strip';
  const sx = 6.4, sz = 7.5;
  strip.add(box(1.9, 0.14, 0.42, mat(0x252c34, 0.35, 0.6), sx, 0.07, sz, true));
  for (let i = 0; i < 4; i++) {
    strip.add(box(0.26, 0.02, 0.24, mat(0x0d1116, 0.2, 0.7), sx - 0.66 + i * 0.44, 0.145, sz, false));
  }
  strip.add(box(0.14, 0.05, 0.1, mat(0x8c1d1d, 0.3, 0.5, { emissive: 0x8c1d1d, emissiveIntensity: 0.5 }), sx + 0.82, 0.16, sz, false)); // لمبة حمراء
  // كابلا مخرجان: نحو الجدار خلف المكتب
  strip.add(makeCable([
    new THREE.Vector3(sx - 0.85, 0.09, sz),
    new THREE.Vector3(sx - 1.4, 0.05, sz + 0.5),
    new THREE.Vector3(sx - 1.7, 0.05, DESK.maxZ - 0.4),
    new THREE.Vector3(sx - 1.75, 0.05, DESK.maxZ + 0.15),
  ], 0.045));
  g.add(strip);

  return g;
}

// ============================================================
// (V8.1) لوح التعليق بأدوات معلقة + لافتة الورشة + رف قطع PC
// ============================================================

/** أدوات معلقة على لوح التعليق: مفكات ملونة كماشة فرشاة + صناديق صغيرة */
function buildPegboardKit(g: THREE.Group): void {
  const hookMat = mat(0x8b939d, 0.85, 0.35);
  const zF = DESK.minZ - 0.47; // أمام وجه لوح التعليق
  const topY = DESK.floorY + 10.9; // مستوى الخطاف

  // 4 مفكات معلقة رأسًا بمقابض ملونة مختلفة (كما في كل ورشة)
  const handles = [0xc2453a, 0xe8a13c, 0x3f9d7a, 0x9aa3ad];
  const xs = [-4.5, -3.65, -2.8, -1.95];
  for (let i = 0; i < 4; i++) {
    const x = xs[i];
    g.add(cyl(0.035, 0.22, hookMat, 'z', x, topY + 0.18, zF, false));       // خطاف
    const shaft = cyl(0.032, 1.15, mat(0xb8c0c9, 0.9, 0.3), 'y', x, topY - 0.62, zF, true);
    g.add(shaft);
    g.add(cyl(0.095, 0.62, mat(handles[i], 0.25, 0.55), 'y', x, topY + 0.28, zF, true)); // المقبض فوق الخطاف
    g.add(cyl(0.05, 0.1, mat(0x2a323c, 0.4, 0.5), 'y', x, topY - 1.24, zF, false));        // طرف المفك
  }

  // كماشة معلقة (ساقان متقاطعتان بمقبضين أحمرين)
  const plx = -1.15;
  g.add(cyl(0.035, 0.22, hookMat, 'z', plx, topY + 0.18, zF, false));
  for (const side of [-1, 1]) {
    const leg = box(0.07, 1.7, 0.09, mat(0x9aa3ad, 0.8, 0.35), plx + side * 0.09, topY - 0.75, zF, true);
    leg.rotation.z = side * 0.1;
    g.add(leg);
    const grip = box(0.11, 0.62, 0.12, mat(0xc2453a, 0.25, 0.55), plx + side * 0.22, topY - 1.35, zF, true);
    grip.rotation.z = side * 0.16;
    g.add(grip);
  }
  g.add(cyl(0.05, 0.08, mat(0x2a323c, 0.6, 0.4), 'z', plx, topY + 0.05, zF, false)); // مفصل

  // فرشاة تنظيف معلقة
  const brx = -0.45;
  g.add(cyl(0.035, 0.22, hookMat, 'z', brx, topY + 0.18, zF, false));
  g.add(box(0.24, 0.8, 0.12, mat(0x39424d, 0.3, 0.55), brx, topY - 0.55, zF, true));
  g.add(box(0.3, 0.5, 0.16, mat(0xe8c76b, 0.05, 0.85), brx, topY - 1.2, zF, true));        // شعيرات

  // جهاز اختبار شبكة معلق (صندوق صغير بمصابيح)
  const tx = -4.95;
  g.add(cyl(0.035, 0.22, hookMat, 'z', tx, topY + 0.18, zF, false));
  g.add(box(0.42, 0.85, 0.14, mat(0x1d232b, 0.3, 0.55), tx, topY - 0.55, zF, true));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.07, 0.07, 0.03,
      mat(i % 2 ? 0x22c55e : 0xeab308, 0.1, 0.5, { emissive: i % 2 ? 0x114422 : 0x443311, emissiveIntensity: 0.8 }),
      tx - 0.12 + (i % 2) * 0.24, topY - 0.35 - Math.floor(i / 2) * 0.22, zF + 0.08, false));
  }

  // شريط صناديق صغيرة أسفل اللوح (براغٍ ووصلات مصنفة)
  for (let i = 0; i < 4; i++) {
    const bx = -4.3 + i * 1.3;
    g.add(box(1.05, 0.78, 0.72, mat(i % 2 ? 0x2c3641 : 0x39434e, 0.25, 0.65), bx, DESK.floorY + 6.55, DESK.minZ - 0.35, false));
    g.add(box(1.05, 0.5, 0.05, mat(0x1d232b, 0.3, 0.6), bx, DESK.floorY + 6.55, DESK.minZ - 0.02, false)); // واجهة الدرج
    g.add(cyl(0.05, 0.06, mat(0x9aa3ad, 0.8, 0.35), 'z', bx, DESK.floorY + 6.55, DESK.minZ + 0.01, false)); // مقبض
  }
}

/** لافتة الورشة المضيئة — كانفاس بنص عربي/إنجليزي */
function workshopSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0a1219';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, 1000, 232);
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.fillStyle = '#e8fbff';
  ctx.font = 'bold 92px Tahoma, Arial, sans-serif';
  ctx.fillText('ورشة صيانة الحاسوب', 512, 122);
  ctx.fillStyle = '#22d3ee';
  ctx.font = 'bold 40px monospace';
  ctx.fillText('PC REPAIR WORKSHOP — ESD SAFE AREA', 512, 200);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function buildWorkshopSign(): THREE.Mesh {
  const tex = workshopSignTexture();
  const dark = mat(0x0d141c, 0.3, 0.7);
  const face = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.85,
    roughness: 0.6,
    metalness: 0.1,
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(4.9, 1.25, 0.12), [dark, dark, dark, dark, face, dark]);
  sign.position.set(0.4, DESK.floorY + 12.35, DESK.minZ - 0.5);
  sign.name = 'workshop-sign';
  return sign;
}

/** رف قطع على الجدار: صناديق أدراج + رامات واقفة + مروحة غيار */
function buildPartsShelf(g: THREE.Group, centerX: number, sy: number): void {
  const shelfMat = mat(0x2b323b, 0.6, 0.45, { map: brushedTexture('#2f3740') });
  g.add(box(5.2, 0.1, 1.2, shelfMat, centerX, sy, DESK.minZ - 0.2, false));
  // دعامتان تحت الرف
  g.add(box(0.08, 0.9, 1.0, shelfMat, centerX - 2.2, sy - 0.5, DESK.minZ - 0.2, false));
  g.add(box(0.08, 0.9, 1.0, shelfMat, centerX + 2.2, sy - 0.5, DESK.minZ - 0.2, false));

  // صناديق أدراج مصنفة (3 عبر عرض الرف)
  for (let i = 0; i < 3; i++) {
    const bx = centerX - 1.7 + i * 1.7;
    g.add(box(1.4, 0.75, 0.9, mat(i % 2 ? 0x2c3641 : 0x39434e, 0.25, 0.65), bx, sy + 0.43, DESK.minZ - 0.2, false));
    g.add(box(1.4, 0.45, 0.06, mat(0x1d232b, 0.3, 0.6), bx, sy + 0.38, DESK.minZ + 0.26, false));
    g.add(cyl(0.05, 0.06, mat(0x9aa3ad, 0.8, 0.35), 'z', bx, sy + 0.38, DESK.minZ + 0.3, false));
  }

  const isLower = sy < DESK.floorY + 11.4;
  if (isLower) {
    // شرائح RAM واقفة مائلة على الرف السفلي
    for (let i = 0; i < 3; i++) {
      const ram = box(0.14, 1.15, 0.42, mat(0x1a5c40, 0.4, 0.5, { map: pcbTexture('#1a5c40') }), centerX - 0.6 + i * 0.2, sy + 0.62, DESK.minZ + 0.25, false);
      ram.rotation.x = -0.16;
      ram.rotation.z = 0.06 * (i - 1);
      g.add(ram);
    }
    // مروحة غيار 120mm مستلقية
    const fan = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 26), mat(0x232a33, 0.4, 0.55));
    fan.add(frame);
    fan.add(cyl(0.13, 0.16, mat(0x2a323c, 0.4, 0.5), 'x', 0, 0, 0, false));
    for (let b = 0; b < 5; b++) {
      const blade = box(0.34, 0.02, 0.16, mat(0x3a4450, 0.3, 0.5), 0.22, 0, 0, false);
      blade.rotation.y = (b / 5) * Math.PI * 2;
      blade.rotation.x = 0.5;
      blade.position.set(Math.cos((b / 5) * Math.PI * 2) * 0.24, 0.05, Math.sin((b / 5) * Math.PI * 2) * 0.24);
      fan.add(blade);
    }
    fan.rotation.y = Math.PI / 2;
    fan.rotation.x = Math.PI / 2;
    fan.position.set(centerX + 1.55, sy + 0.56, DESK.minZ - 0.2);
    g.add(fan);
  } else {
    // علبة GPU مغلفة + علبة أقراص على الرف العلوي
    g.add(box(2.2, 0.6, 0.8, mat(0x1d232b, 0.3, 0.6), centerX - 1.0, sy + 0.4, DESK.minZ - 0.2, false));
    g.add(box(2.2, 0.16, 0.84, mat(0x22d3ee, 0.3, 0.5, { emissive: 0x0e4a55, emissiveIntensity: 0.4 }), centerX - 1.0, sy + 0.68, DESK.minZ - 0.2, false));
    for (let i = 0; i < 2; i++) {
      g.add(box(1.1, 0.24, 0.75, mat(0x39434e, 0.3, 0.6), centerX + 1.35, sy + 0.22 + i * 0.28, DESK.minZ - 0.2, false));
    }
  }
}

// ============================================================
// الهيكل الثابت (caseShell) — توجيه v4 (أولوية 2):
//  - حوض فولاذي حقيقي مبثوق من مقطع C بسماكة جدران (ExtrudeGeometry)
//    بدل خمسة صناديق ملسقة — الحواف والأركان لها سماكة وحدود واضحة.
//  - جدار صينية اللوحة الأم مع مساند نحاسية (standoffs) وتجويفات تمرير كابلات.
//  - واجهة أمامية صناعية: إطار بارز + محيط محفور + شبك سحب سداسي + لوح علوي مصقول.
//  - خلفية بمنافذ توسعة وقصورة I/O وشبك عسلوي لمزود الطاقة.
//  - قفص تخزين 3.5" بأرضية ومساند ومطاطات + أقدام مطاطية.
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
  const T = 0.09;                         // سماكة جدار الحوض

  // ===== 1) حوض الهيكل: مقطع C (خلف + سقف + أرضية) مبثوق على طول X =====
  // المقطع في مستوى (u=Z of case, v=Y of case)، البثق على عمق wX ثم يدور إلى محور X.
  const shellShape = new THREE.Shape();
  shellShape.moveTo(0, 0);
  shellShape.lineTo(dZ, 0);
  shellShape.lineTo(dZ, T);
  shellShape.lineTo(T, T);
  shellShape.lineTo(T, hY - T);
  shellShape.lineTo(dZ, hY - T);
  shellShape.lineTo(dZ, hY);
  shellShape.lineTo(0, hY);
  shellShape.closePath();
  const shellGeo = new THREE.ExtrudeGeometry(shellShape, { depth: wX, bevelEnabled: false, curveSegments: 4 });
  const shellMat = mat(COLORS.metalDark, 0.62, 0.46, { map: brushedTexture('#2b333d') });
  const tub = new THREE.Mesh(shellGeo, shellMat);
  tub.rotation.y = -Math.PI / 2; // عمق البثق (+Z الشكلي) → -X العالمي
  tub.position.x = CASE.maxX;    // يمتد البثق من X=2.1 نحو X=0
  tub.castShadow = castEnabled;
  tub.receiveShadow = true;
  tub.name = 'case-tub';
  g.add(tub);

  // ===== 2) جدار صينية اللوحة الأم (يمين) بمساند نحاسية وتجويفات كابلات =====
  const trayWallMat = mat(0x2c343e, 0.55, 0.48, { map: brushedTexture('#333c46') });
  g.add(box(0.06, hY - 2 * T, dZ - T, trayWallMat, CASE.maxX - 0.03, cy, cz + T / 2, true, true));
  // 6 مساند نحاسية تحت مسامير اللوحة
  const standoffMat = mat(0xb08d3e, 0.85, 0.35);
  const ys = [BOARD.yMin + 0.1, (BOARD.yMin + BOARD.yMax) / 2, BOARD.yMax - 0.1];
  const zs = [BOARD.zMin + 0.1, BOARD.zMax - 0.1];
  for (const wy of ys) {
    for (const wz of zs) {
      g.add(cyl(0.032, 0.1, standoffMat, 'x', BOARD.x + 0.02, wy, wz, false));
      const s = makeScrew(0.035, 0.3, 'x');
      s.position.set(BOARD.x + 0.05, wy, wz);
      flags.moboScrews.push(s);
      g.add(s);
    }
  }
  // تجويفات تمرير الكابلات (grommets) بثلاثة مستويات
  const grommetMat = mat(0x0d1116, 0.2, 0.7);
  for (const gy of [1.5, 2.8, 4.0]) {
    g.add(box(0.045, 0.6, 0.32, grommetMat, CASE.maxX - 0.045, gy, 3.7, false));
    g.add(box(0.02, 0.66, 0.38, mat(0x39434e, 0.5, 0.5), CASE.maxX - 0.03, gy, 3.7, false));
  }

  // ===== 3) الواجهة الأمامية — تصميم صناعي بثلاث طبقات =====
  const bezelBodyMat = mat(0x1c222a, 0.4, 0.55);
  const bezelFrameMat = mat(0x2a323c, 0.55, 0.45, { map: brushedTexture('#333c46') });
  // لوح خلفي يلامس حوض الهيكل
  g.add(box(wX + 0.1, hY, 0.1, bezelBodyMat, cx, cy, CASE.maxZ + 0.05, true, true));
  // إطار بارز يحيط بمحيط الشبك (4 أشرطة بسماكة ظاهرة)
  const fx0 = 0.16, fx1 = wX - 0.16, fy0 = 0.3, fy1 = 3.05; // فتحة الشبك
  const fw = fx1 - fx0, fh = fy1 - fy0;
  const fz = CASE.maxZ + 0.13;
  g.add(box(fw + 0.16, 0.09, 0.12, bezelFrameMat, cx, fy1 + 0.045, fz, false));
  g.add(box(fw + 0.16, 0.09, 0.12, bezelFrameMat, cx, fy0 - 0.045, fz, false));
  g.add(box(0.09, fh + 0.18, 0.12, bezelFrameMat, fx0 - 0.045, (fy0 + fy1) / 2, fz, false));
  g.add(box(0.09, fh + 0.18, 0.12, bezelFrameMat, fx1 + 0.045, (fy0 + fy1) / 2, fz, false));
  // شبك السحب السداسي داخل المحيط (غائر للداخل — عمق حقيقي)
  const ventPlateMat = mat(0x11151b, 0.35, 0.6, { map: ventMeshTexture('#1a2129', '#07090c') });
  g.add(box(fw, fh, 0.04, ventPlateMat, cx, (fy0 + fy1) / 2, CASE.maxZ + 0.09, false));
  // لوح علوي مصقول بشعار عام وشريط LED سماوي
  g.add(box(wX + 0.1, hY - fy1 - 0.06, 0.14, mat(0x262d36, 0.5, 0.5, { map: brushedTexture('#2e3640') }), cx, (fy1 + hY) / 2, CASE.maxZ + 0.07, true));
  g.add(plane(0.8, 0.2, mat(0xffffff, 0.2, 0.5, { map: frontBadgeTexture(), transparent: true }), 'z', cx, 4.02, CASE.maxZ + 0.145));
  g.add(box(1.5, 0.035, 0.02, mat(COLORS.accent, 0.3, 0.4, { emissive: COLORS.accent, emissiveIntensity: 0.7 }), cx, fy1 + 0.115, CASE.maxZ + 0.145, false));
  // شريط سفلي صلب أسفل الشبك
  g.add(box(wX + 0.1, fy0, 0.12, bezelBodyMat, cx, fy0 / 2, CASE.maxZ + 0.06, false));

  // ===== 4) الخلف: قصورة I/O + منافذ + 7 مقابس توسعة + شبك عسلوي =====
  g.add(box(0.55, 1.1, 0.03, mat(COLORS.black, 0.3, 0.6), 1.35, 3.35, CASE.minZ - 0.005, false));
  const portMat = mat(0x0d1116, 0.3, 0.6);
  const ethMat = mat(0x1c242c, 0.4, 0.5, { map: null });
  for (const py of [3.62, 3.5]) {
    g.add(box(0.09, 0.07, 0.02, portMat, 1.18, py, CASE.minZ - 0.018, false));
    g.add(box(0.09, 0.07, 0.02, portMat, 1.32, py, CASE.minZ - 0.018, false));
  }
  g.add(box(0.15, 0.12, 0.02, ethMat, 1.5, 3.56, CASE.minZ - 0.018, false));
  g.add(box(0.16, 0.05, 0.02, portMat, 1.24, 3.3, CASE.minZ - 0.018, false));
  // شبك عسلوي عمودي بجوار قصورة I/O + شبك ألمنيوم مزود الطاقة أسفل
  g.add(box(0.42, 1.15, 0.02, ventPlateMat, 0.42, 3.35, CASE.minZ - 0.005, false));
  g.add(box(1.2, 0.85, 0.02, ventPlateMat, 1.35, 0.48, CASE.minZ - 0.005, false));

  const slotStripMat = mat(COLORS.metalMid, 0.6, 0.45, { map: brushedTexture('#424d59') });
  for (let i = 0; i < 7; i++) {
    g.add(box(0.72, 0.05, 0.03, slotStripMat, 1.35, 2.55 - i * 0.13, CASE.minZ - 0.005, false));
    g.add(cyl(0.024, 0.02, mat(COLORS.aluminum, 0.8, 0.35), 'z', 1.66, 2.615 - i * 0.13, CASE.minZ - 0.012, false));
  }

  // ===== 5) قفص التخزين 3.5" (يبقى بالهيكل عند فك القرص) =====
  const cageMat = mat(0x272f38, 0.55, 0.5, { map: brushedTexture('#2f3842') });
  const hx = MOUNTS.hdd; // [1.05, 0.78, 3.55]
  g.add(box(1.34, 0.04, 1.56, cageMat, hx[0], hx[1] - 0.15, hx[2], true, true)); // أرضية القفص
  g.add(box(1.34, 0.55, 0.05, cageMat, hx[0], hx[1] + 0.12, hx[2] - 0.76, true)); // جدار خلفي
  for (const px of [hx[0] - 0.62, hx[0] + 0.62]) {
    g.add(box(0.05, 0.55, 1.56, cageMat, px, hx[1] + 0.12, hx[2], true));       // قضيبان جانبيان
    // مطاطات تثبيت دائرية على الجانبين
    for (const qz of [hx[2] - 0.55, hx[2] + 0.55]) {
      g.add(cyl(0.045, 0.07, mat(0x15191f, 0.2, 0.75), 'x', px, hx[1], qz, false));
    }
  }
  // 4 مسامير قفص أمامية
  for (const px of [hx[0] - 0.55, hx[0] + 0.55]) {
    for (const py of [hx[1] - 0.08, hx[1] + 0.08]) {
      g.add(cyl(0.02, 0.02, mat(COLORS.aluminum, 0.8, 0.35), 'z', px, py, hx[2] + 0.77, false));
    }
  }

  // ===== 6) السقف: فلتر غبار شبكي + منطقة التحكم العلوية (زر/LED/USB) =====
  g.add(box(1.7, 0.012, 3.4, ventPlateMat, cx, CASE.maxY + 0.006, cz - 0.1, false));
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
  const usbMat = mat(COLORS.black, 0.3, 0.55);
  const tongueMat = mat(0x3f4a55, 0.3, 0.5);
  for (const ux of [0.62, 0.86]) {
    g.add(box(0.15, 0.016, 0.09, usbMat, ux, CASE.maxY - 0.002, CASE.maxZ - 0.45, false));
    g.add(box(0.11, 0.006, 0.06, tongueMat, ux, CASE.maxY + 0.004, CASE.maxZ - 0.45, false));
  }
  g.add(cyl(0.028, 0.014, mat(0x2f6b4f, 0.4, 0.45), 'y', 1.08, CASE.maxY + 0.002, CASE.maxZ - 0.45, false));
  g.add(cyl(0.028, 0.014, mat(0x7a4040, 0.4, 0.45), 'y', 1.2, CASE.maxY + 0.002, CASE.maxZ - 0.45, false));

  // فلتر غبار سفلي تحت منطقة مزود الطاقة
  g.add(box(1.5, 0.012, 1.35, ventPlateMat, 1.32, CASE.minY + 0.012, 0.72, false));

  // ===== 7) أقدام مطاطية أربعة (الجهاز يقف على المكتب) =====
  const footMat = mat(0x0c0f14, 0.2, 0.75);
  for (const fxp of [0.28, wX - 0.28]) {
    for (const fzp of [0.5, dZ - 0.5]) {
      g.add(box(0.42, 0.06, 0.5, footMat, fxp, CASE.minY + 0.03, fzp, false));
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
  // (إصلاح تدقيق V6-G F3) مركز المقبس مشتق من MOUNTS.cpu (مصدر الحقيقة الواحد) —
  // كانت إحداثيات v4 قديمة (عالمي z 0.95 مقابل المعالج عند 1.33)
  const alu = mat(COLORS.aluminum, 0.85, 0.4, { map: brushedTexture('#a7b0ba') });
  const sx = MOUNTS.cpu[1] - BOARD.center[1]; // محلي 0.62
  const sz = MOUNTS.cpu[2] - BOARD.center[2]; // محلي -0.24
  g.add(box(0.06, 0.46, 0.05, alu, onFace(0.06), sx + 0.205, sz, true)); // إطار: 4 أضلاع
  g.add(box(0.06, 0.46, 0.05, alu, onFace(0.06), sx - 0.205, sz, true));
  g.add(box(0.06, 0.05, 0.36, alu, onFace(0.06), sx, sz + 0.205, true));
  g.add(box(0.06, 0.05, 0.36, alu, onFace(0.06), sx, sz - 0.205, true));
  g.add(box(0.04, 0.37, 0.37, mat(0xffffff, 0.5, 0.45, { map: socketPinsTexture() }), onFace(0.04) - 0.005, sx, sz, false)); // لوح الإبر

  // رافعة المقبس: pivot عند حافة المقبس (يدور حول X المحلي عند الفتح) + مقبض عرضي
  const lever = new THREE.Object3D();
  lever.name = 'flag-cpu-lever';
  lever.position.set(onFace(0.06) - 0.04, sx - 0.25, sz - 0.25);
  lever.add(box(0.025, 0.42, 0.045, mat(COLORS.plastic, 0.2, 0.5), 0, 0.21, 0.02, false));
  lever.add(box(0.025, 0.03, 0.14, mat(COLORS.plastic, 0.2, 0.5), 0, 0.42, 0.02, false)); // مقبض
  flags.cpuLever = lever;
  g.add(lever);

  // 2ب) مشتتا VRM بأزعاج — فوق المقبس وعلى يساره (خارج حدود المقبس بلا تداخل)
  // (F3) كل الإزاحات نسبية إلى مركز المقبس المشتق — تنتقل معه عند أي تغيير في MOUNTS.cpu
  const vrmFinH = new THREE.BoxGeometry(0.05, 0.03, 0.44);   // أزعاج أفقية مكدسة على Y
  const vrmFinV = new THREE.BoxGeometry(0.05, 0.44, 0.03);   // أزعاج رأسية موزعة على Z
  for (let i = 0; i < 7; i++) {
    const finTop = new THREE.Mesh(vrmFinH, alu);
    finTop.position.set(onFace(0.03) - 0.05, sx + 0.29 + i * 0.062, sz);
    g.add(finTop);
    if (i < 6) {
      const finLeft = new THREE.Mesh(vrmFinV, alu);
      finLeft.position.set(onFace(0.03) - 0.05, sx + 0.02, sz - 0.52 + i * 0.052);
      g.add(finLeft);
    }
  }
  g.add(box(0.03, 0.5, 0.48, alu, onFace(0.03), sx + 0.49, sz, false));  // قاعدة VRM العلوي (فوق المقبس)
  g.add(box(0.03, 0.44, 0.3, alu, onFace(0.03), sx + 0.02, sz - 0.41, false));  // قاعدة VRM الأيسر (يسار المقبس)

  // 3) أربع فتحات RAM عمودية + مزلاجان لكل فتحة (8 pivots تدور حول X)
  // (F3) المراكز مشتقة من MOUNTS.ram (العصاتان على ±0.1 تسقطان في الفتحتين الوسطيين)
  const ramSlotGeo = new THREE.BoxGeometry(0.05, 1.35, 0.08);
  const ramSlotMat = mat(0x1b1f26, 0.2, 0.55);
  const ramRidgeMat = mat(0x2b333d, 0.3, 0.5);
  const clipGeo = new THREE.BoxGeometry(0.07, 0.07, 0.1);
  const clipMat = mat(0x39414c, 0.3, 0.5);
  const ramZ = MOUNTS.ram[2] - BOARD.center[2]; // محلي 0.50 — عالمي 2.07
  for (const z of [ramZ - 0.3, ramZ - 0.1, ramZ + 0.1, ramZ + 0.3]) { // عالمي 1.77 .. 2.37
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
  // (F3) رأس ATX24 على XZ الموصل نفسه (MOUNTS.atx24) — كان منحرفًا (عالمي 3.75,2.62 مقابل 3.1,2.7)
  const black = mat(COLORS.black, 0.3, 0.5);
  const atxY = MOUNTS.atx24[1] - BOARD.center[1]; // محلي 0.35
  const atxZ = MOUNTS.atx24[2] - BOARD.center[2]; // محلي 1.13
  g.add(box(0.08, 0.5, 0.25, black, onFace(0.08), atxY, atxZ, true));   // ATX24 (عالمي 3.1, 2.7)
  g.add(box(0.05, 0.42, 0.19, mat(0x0a0e12, 0.25, 0.6), onFace(0.05) - 0.045, atxY, atxZ, false));
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

  // 10) منفذا SATA بحرف L قرب موصل sataData (F3 — كانت على الحافة العلوية بإحداثيات v4)
  const satY = MOUNTS.sataData[1] - BOARD.center[1]; // محلي -1.30
  const satZ = MOUNTS.sataData[2] - BOARD.center[2]; // محلي 0.96
  for (const stz of [satZ, satZ - 0.19]) {
    g.add(box(0.05, 0.07, 0.13, black, onFace(0.05), satY, stz, false));
    g.add(box(0.04, 0.025, 0.05, gold, onFace(0.04) - 0.03, satY, stz - 0.02, false));
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

  // 13) توجيه v4: تجمع الصوت — رقاقة الكودك + مكثفات + عزل ذهبي (زاوية سفلية)
  g.add(box(0.03, 0.14, 0.14, mat(0x11171e, 0.25, 0.5), onFace(0.03), -1.32, -0.55, false));
  const capAudioGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10);
  for (const az of [-0.78, -0.86, -0.94, -1.02]) {
    const c = new THREE.Mesh(capAudioGeo, mat(0x3a4a58, 0.55, 0.4));
    c.rotation.z = Math.PI / 2;
    c.position.set(onFace(0.08), -1.28, az);
    g.add(c);
  }
  g.add(box(0.02, 0.5, 0.015, gold, onFace(0.02) - 0.012, -1.28, -0.68, false)); // خط عزل الصوت

  // 14) توجيه v4: فتحة PCIe x1 قصيرة تحت فتحتي x16
  g.add(box(0.05, 0.05, 0.5, pcieMat, onFace(0.05), -1.38, 0.3, false));

  // 15) توجيه v4: رأس USB 3.0 أزرق داخلي (يسار أعلى اللوحة)
  g.add(box(0.09, 0.16, 0.26, mat(0x1d4ed8, 0.35, 0.5), onFace(0.09), 1.05, -0.42, false));
  g.add(box(0.06, 0.1, 0.18, mat(0x0d1116, 0.25, 0.6), onFace(0.06) - 0.05, 1.05, -0.42, false));

  // 16) توجيه v4: ملفات VRM (chokes) مربعة داكنة يسار المقبس (F3: نسبية إلى المقبس)
  for (const chy of [sx - 0.38, sx - 0.54, sx - 0.7]) {
    for (const chz of [sz - 0.3, sz - 0.16]) {
      const choke = box(0.05, 0.13, 0.13, mat(0x181e26, 0.3, 0.55), onFace(0.05), chy, chz, false);
      g.add(choke);
      g.add(box(0.02, 0.05, 0.05, mat(0x39434e, 0.4, 0.5), onFace(0.02) - 0.04, chy, chz, false));
    }
  }

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

function buildCooler(): THREE.Group {
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
  // (إصلاح تدقيق V6) تسمية الـRotor + محور الدوران المحلي — مرجع منظومة المراوح عند غياب GLB
  fan.blades.name = 'cooler_fan_rotor';
  fan.blades.userData.spinAxis = 'y'; // الريش الإجرائي يدور حول Y المحلي للغلاف
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

function buildGpu(flags: FlagVisuals): THREE.Group {
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
    color: 0x0c4a5e, emissive: COLORS.accent, emissiveIntensity: 0.85, roughness: 0.35, metalness: 0.1, flatShading: false,
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
  // (V6-G) اسم ثابت — مرجع alignGpuPowerCable لنهاية كابل الشاشة عند غياب GLB
  const gpuBracket = box(0.06, 0.5, 0.12, mat(COLORS.aluminum, 0.8, 0.4), 0, -0.03, -1.3, true);
  gpuBracket.name = 'gpu-bracket';
  g.add(gpuBracket);
  const portMat = mat(0x0d1116, 0.3, 0.6);
  for (const py of [0.06, -0.06]) {
    g.add(box(0.05, 0.1, 0.02, portMat, 0, py - 0.03, -1.372, false));
  }
  g.add(box(0.07, 0.09, 0.02, portMat, 0, -0.03, -1.372, false));
  g.add(box(0.05, 0.14, 0.015, portMat, 0.02, -0.2, -1.368, false));

  // حلقتا غورز حول المراوح + مروحتان (تنظران للأسفل — محور Y)
  const ringMat = mat(0x151b22, 0.4, 0.55);
  let fanIdx = 0;
  for (const fz of [-0.55, 0.55]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.014, 6, 28), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-0.53, -0.47, fz);
    g.add(ring);
    const wrapper = new THREE.Group();
    wrapper.position.set(0, -0.55, fz);
    const fan = makeFan(0.28);
    wrapper.add(fan.frame, fan.blades);
    // (إصلاح تدقيق V6) تسمية ريش البطاقة للنسخة الاحتياطية الإجرائية
    fan.blades.name = `gpu_fan_rotor_${++fanIdx}`;
    fan.blades.userData.spinAxis = 'y';
    g.add(wrapper);
  }

  // أطراف PCIe الذهبية أسفل PCB (بشق توجيه) عند حافة اللوحة الأم
  const gold = mat(0xc9a23f, 0.9, 0.3);
  g.add(box(0.02, 0.05, 0.5, gold, 0.53, -0.07, -0.45, false));
  g.add(box(0.02, 0.05, 0.49, gold, 0.53, -0.07, 0.105, false));

  // موصل طاقة 8pin مرفوع على قاعدة رافعة + نقاط إبر ذهبية
  g.add(box(0.2, 0.26, 0.22, shroudMat, -0.28, 0.14, 0.63, false));
  // (V6-G) اسم ثابت للمقبس — مرجع alignGpuPowerCable عند غياب GLB
  const conn = box(0.16, 0.1, 0.18, mat(COLORS.black, 0.3, 0.5), -0.28, 0.31, 0.63, false);
  conn.name = 'gpu-power-socket';
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

  // (إصلاح تدقيق V6) ريش مروحة المزود في النسخة الإجرائية — كانت شبكة ساكنة فقط
  // فتغيب المروحة من منظومة المراوح عند غياب GLB. الريش الأصلي يدور حول Y المحلي = Y العالمي (مروحة علوية مسطحة)
  const psuFan = makeFan(0.4);
  psuFan.blades.name = 'psu_fan_rotor';
  psuFan.blades.userData.spinAxis = 'y';
  const psuFanWrap = new THREE.Group();
  psuFanWrap.position.set(0, 0.3, 0.1);
  psuFanWrap.add(psuFan.frame, psuFan.blades);
  g.add(psuFanWrap);

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

function buildFans(flags: FlagVisuals): THREE.Group {
  scope('fans');
  const g = new THREE.Group();
  g.name = 'part-fans';
  const mount = MOUNTS.fans;
  // (إصلاح تدقيق V6) المواضع موحّدة مع مسار GLB (كانت تختلف 0.1–0.2 بين المسارين)
  const defs: Array<{ pos: readonly [number, number, number]; rotX: number; rotor: string }> = [
    { pos: [1.05, 2.8, 4.42], rotX: Math.PI / 2, rotor: 'fan_rotor_front-1' },   // أمامية علوية
    { pos: [1.05, 1.4, 4.42], rotX: Math.PI / 2, rotor: 'fan_rotor_front-2' },   // أمامية سفلية
    { pos: [1.05, 3.7, 0.33], rotX: -Math.PI / 2, rotor: 'fan_rotor_rear' },     // خلفية علوية (طرد)
  ];
  for (const d of defs) {
    const wrapper = new THREE.Group();
    wrapper.position.set(d.pos[0] - mount[0], d.pos[1] - mount[1], d.pos[2] - mount[2]);
    wrapper.rotation.x = d.rotX; // محور الدوران Y المحلي → Z عالمي
    const fan = makeFan(0.42);
    wrapper.add(fan.frame, fan.blades);
    // (إصلاح تدقيق V6) تسمية ريش مراوح الهيكل — كانت بلا أسماء فتتعطل المراوح عند غياب GLB
    fan.blades.name = d.rotor;
    fan.blades.userData.spinAxis = 'y';
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
  // (F3) النهاية على رأس ATX24 المشتق من MOUNTS.atx24 بدل الإحداثيات القديمة
  g.add(makeCable(cablePoints(MOUNTS.atx24, [
    [1.3, 0.75, 1.2],
    [0.9, 2.0, 1.9],
    [1.4, 3.0, 2.5],
    [1.7, MOUNTS.atx24[1], MOUNTS.atx24[2]],
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

  // (V6-G F1) كابل PSU→البطاقة: النقطتان الثابتتان مخزنتان فضاء العالم في userData،
  // والنهاية عند الموصل نفسه — ثم يعاد اشتقاق النهايتين الأخيرتين من البطاقة الجالسة
  // في alignGpuPowerCable (كان الكابل ينتهي عند [1.05,2.32,2.05] والموصل يطفو بعيدًا)
  const fixedPts: Array<readonly [number, number, number]> = [
    [1.2, 0.7, 1.1],   // مخرج من مزود الطاقة
    [0.55, 1.5, 1.4],  // صعود من يسار الهيكل (خارج جسم البطاقة في المسارين)
  ];
  const mount = MOUNTS.gpuPower;
  const pts: Array<readonly [number, number, number]> = [
    ...fixedPts,
    [0.55, mount[1] + 0.3, (fixedPts[1][2] + mount[2]) / 2], // نقطة اقتراب مبدئية فوق البطاقة
    [mount[0], mount[1], mount[2]],                          // الموصل نفسه
  ];
  const cable = makeCable(cablePoints(mount, pts), 0.04);
  cable.name = 'gpu-power-cable';
  cable.userData['worldPts'] = fixedPts;
  g.add(cable);

  setComponentId(g, 'gpuPower');
  return g;
}

// ============================================================
// سجادة القطع المفكوكة (داخل root مباشرة — بلا componentId)
// توجيه v4: سجادة مضادة للكهرباء الساكنة موضوعة على سطح مكتب الورشة
// يسار الجهاز — كل قطعة تفك تستلقي عليها عند TRAY.slots.
// ============================================================

function buildTrayTable(): THREE.Group {
  scope('tray');
  const g = new THREE.Group();
  g.name = 'tray-table'; // غير قابلة للاختيار عمدًا

  const cx = (TRAY.minX + TRAY.maxX) / 2; // -3.35
  const cz = (TRAY.minZ + TRAY.maxZ) / 2; // 2.4
  const top = TRAY.tableTopY;             // 0.06 — أعلى السجادة فوق سطح المكتب

  // السجادة المضادة للكهرباء الساكنة بحدين سماويين
  g.add(box(TRAY.maxX - TRAY.minX + 0.3, 0.012, TRAY.maxZ - TRAY.minZ + 0.3, mat(0x1c2830, 0.2, 0.8), cx, top - 0.006, cz, false, true));
  g.add(box(TRAY.maxX - TRAY.minX + 0.3, 0.004, 0.03, mat(0x22d3ee, 0.3, 0.6), cx, top + 0.002, cz - (TRAY.maxZ - TRAY.minZ) / 2 - 0.135, false));
  g.add(box(TRAY.maxX - TRAY.minX + 0.3, 0.004, 0.03, mat(0x22d3ee, 0.3, 0.6), cx, top + 0.002, cz + (TRAY.maxZ - TRAY.minZ) / 2 + 0.135, false));

  // خطوط خانات باهتة لكل مكوّن (عدا case) — داخل حدود السجادة
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
    g.add(box(mk.size[0], 0.006, mk.size[1], markerMat, px, top + 0.003, pz, false));
  }

  // ===== عدة عمل (زينة تعليمية غير تفاعلية — الالتقاط يتوقف عندها كفراغ) =====
  // صينية مسامير صغيرة مع 6 مسامير متناثرة
  const trayBox = new THREE.Group();
  trayBox.name = 'deco-screw-tray';
  const tbx = TRAY.maxX - 0.3, tbz = TRAY.minZ + 0.4;
  trayBox.add(box(0.5, 0.05, 0.35, mat(0x39434e, 0.4, 0.55), tbx, top + 0.025, tbz, false));
  trayBox.add(box(0.5, 0.035, 0.04, mat(0x4a5560, 0.4, 0.5), tbx, top + 0.055, tbz - 0.175, false));
  trayBox.add(box(0.5, 0.035, 0.04, mat(0x4a5560, 0.4, 0.5), tbx, top + 0.055, tbz + 0.175, false));
  trayBox.add(box(0.04, 0.035, 0.35, mat(0x4a5560, 0.4, 0.5), tbx - 0.25, top + 0.055, tbz, false));
  trayBox.add(box(0.04, 0.035, 0.35, mat(0x4a5560, 0.4, 0.5), tbx + 0.25, top + 0.055, tbz, false));
  const decoScrewMat = mat(COLORS.aluminum, 0.85, 0.35);
  for (let i = 0; i < 6; i++) {
    const sc = cyl(0.02, 0.035, decoScrewMat, 'y', tbx - 0.15 + (i % 3) * 0.15, top + 0.07, tbz - 0.08 + Math.floor(i / 3) * 0.16, false);
    sc.rotation.y = i * 0.7;
    trayBox.add(sc);
  }
  g.add(trayBox);

  // سوار مضاد للكهرباء الساكنة (سوار دائري صغير)
  const esd = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.02, 8, 24),
    mat(0x22484f, 0.2, 0.7),
  );
  esd.name = 'deco-esd-bracelet';
  esd.rotation.x = -Math.PI / 2;
  esd.position.set(TRAY.minX + 0.55, top + 0.02, TRAY.maxZ - 0.4);
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
  // كابل أحمر رفيع: يبدأ من موصل منفذ اللوحة نفسه (MOUNTS.sataData — إصلاح F4:
  // كان يبدأ من [1.78,2.2,2.35] فينفصل عن موصله بـ0.75) → انحناء → خلفية القرص
  g.add(makeCable(cablePoints(MOUNTS.sataData, [
    [1.8, 1.45, 2.53],
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
// الطرفيات: الشاشة (توجيه v4 — أولوية 1)
// كيان مادي مستقل يقف على مكتب الورشة: قاعدة بيضاوية + حامل مائل + لوح بإطار
// وذقن ولمبة وزر طاقة. لا كيبورد ولا ماوس — توجيه v3 أ.1.
// ليست قطع PC — تُنقر عبر callbacks.onPeripheral
// ============================================================

function buildMonitor(): THREE.Group {
  scope('monitor');
  const g = new THREE.Group();
  g.name = 'periph-monitor';
  g.userData['peripheral'] = 'monitor';

  const standMat = mat(0x2a323c, 0.6, 0.42, { map: brushedTexture('#39434e') });
  const bezelMat = mat(0x14181e, 0.45, 0.5, { map: brushedTexture('#1b2027') });

  // ===== 1) القاعدة: قرص بيضاوي مندرج يلامس سطح المكتب (Y=0 محليًا) =====
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.18, 0.09, 30), standMat);
  base.scale.z = 0.74;
  base.position.set(0, 0.045, -0.1);
  base.castShadow = castEnabled;
  base.receiveShadow = true;
  g.add(base);
  // صرة اتصال القاعدة بالحامل
  g.add(cyl(0.34, 0.07, standMat, 'y', 0, 0.11, -0.1, false));
  // خط لمعة علوي على القاعدة
  g.add(cyl(0.86, 0.012, mat(0x525c68, 0.7, 0.35), 'y', 0, 0.092, -0.1, false));

  // ===== 2) الحامل: عمود مائل يرتفع من القاعدة إلى ظهر اللوح =====
  // اللوح: مركزه screenCenterLocal=(0,2.55,0.1)، سماكته 0.14 → ظهره عند z=0.03.
  // العمود يمتد من صرة القاعدة (y 0.14) حتى خلف اللوح (y ~1.6) باتصال هندسي صحيح.
  const neck = new THREE.Group();
  neck.position.set(0, 0.85, -0.12);
  neck.rotation.x = -0.06; // ميلان خلفي خفيف كشاشات حقيقية
  const neckBody = box(0.34, 1.5, 0.17, standMat, 0, 0, 0, true);
  neck.add(neckBody);
  // حز خلفي على العمود (إدارة الكابلات)
  neck.add(box(0.1, 1.1, 0.05, mat(0x10151b, 0.3, 0.6), 0, 0.05, -0.1, false));
  g.add(neck);
  // لوح VESA خلف اللوح يغلق الفجوة بين العمود واللوح
  g.add(box(0.95, 0.75, 0.04, standMat, 0, 1.42, -0.045, false));

  // ===== 3) اللوح: إطار + ذقن سفلي + شاشة =====
  const bezelW = PERIPH.screenW + 0.2;   // 5.5
  const bezelH = PERIPH.screenH + 0.2;   // 3.25
  const panelY = PERIPH.screenCenterLocal[1] + 0.05; // 2.6
  const panelZ = PERIPH.screenCenterLocal[2] - 0.07; // 0.03
  const bezel = box(bezelW, bezelH, 0.14, bezelMat, 0, panelY, panelZ, true, true);
  bezel.name = 'monitor-panel';
  g.add(bezel);
  // إطار أمامي رفيع حول الشاشة (3 أشرطة — يترك سطح العرض مكشوفًا تمامًا)
  const frameMat = mat(0x1b2129, 0.4, 0.55);
  g.add(box(bezelW, 0.1, 0.02, frameMat, 0, panelY + bezelH / 2 - 0.05, panelZ + 0.075, false));
  g.add(box(0.1, bezelH - 0.1, 0.02, frameMat, -bezelW / 2 + 0.05, panelY, panelZ + 0.075, false));
  g.add(box(0.1, bezelH - 0.1, 0.02, frameMat, bezelW / 2 - 0.05, panelY, panelZ + 0.075, false));
  // ذقن سفلي بشعار + لمبة طاقة — أسفل حافة الشاشة بلا تغطيتها
  const chinY = panelY - bezelH / 2 + 0.07;
  g.add(box(bezelW, 0.14, 0.02, mat(0x232b34, 0.4, 0.5), 0, chinY, panelZ + 0.075, false));
  g.add(plane(0.62, 0.07, mat(0xffffff, 0.2, 0.5, { map: frontBadgeTexture(), transparent: true }), 'z', 0, chinY, panelZ + 0.087));
  const led = box(0.05, 0.045, 0.02, mat(COLORS.green, 0.2, 0.5, { emissive: 0x22c55e, emissiveIntensity: 0.9 }), -bezelW / 2 + 0.28, chinY, panelZ + 0.086, false);
  g.add(led);

  // سطح العرض — مادة أساسية يستبدلها PCScene بنسيج الرسّام
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x05070c });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(PERIPH.screenW, PERIPH.screenH), screenMat);
  screen.position.set(PERIPH.screenCenterLocal[0], PERIPH.screenCenterLocal[1] + 0.05, PERIPH.screenCenterLocal[2]);
  screen.name = 'monitor-screen';
  g.add(screen);

  // زر التشغيل (قابل للنقر) أسفل يمين الذقن
  const btn = box(0.12, 0.09, 0.05, mat(0x2a323c, 0.5, 0.4), bezelW / 2 - 0.26, chinY, panelZ + 0.08, false);
  btn.userData['peripheral'] = 'monitor-power';
  g.add(btn);

  // ===== 4) كابل الإشارة: من خلف الشاشة → سطح المكتب → خلف الجهاز → منفذ البطاقة =====
  // مجموعة مستقلة عالميًا (يُلغى دوران الأب عليها) لضمان التوجيه الصحيح،
  // ويُخفى/يُظهر من PCScene عبر مرجع 'monitor-cable' (المنطق بلا تغيير).
  // (V6-G F5) النقاط الثابتة مخزنة في userData ونقطة النهاية (منفذ البطاقة) تعاد
  // اشتقاقها من البطاقة الجالسة في alignGpuPowerCable — كانت معايرة على بطاقة v3
  const cableGroup = new THREE.Group();
  cableGroup.name = 'monitor-cable';
  cableGroup.rotation.y = -PERIPH.monitorRotY; // إلغاء دوران المجموعة الأم — النقاط إحداثيات عالمية
  const mp = PERIPH.monitorPos;
  const signalPts: Array<readonly [number, number, number]> = [
    [mp[0] - 0.1, 0.28, mp[2] - 0.1],   // دخول من أسفل ظهر الشاشة
    [mp[0] + 0.5, 0.05, mp[2] + 1.1],   // هبوط يمين القاعدة على سطح المكتب
    [mp[0] + 2.4, 0.05, mp[2] - 0.4],   // قوس يمين الشاشة نحو خلف المكتب
    [7.6, 0.05, 1.0],                   // حافة المكتب اليمنى
    [6.2, 0.05, -1.3],                  // خلف المكتب
    [2.4, 0.05, -1.35],                 // امتداد خلف الجهاز (بعيد عن الواجهة)
    [1.28, 0.4, -0.95],                 // بداية الصعود خلف الهيكل
    [1.28, 1.4, -0.7],
  ];
  const endPts: Array<readonly [number, number, number]> = [...signalPts, [1.28, 1.98, 0.02]];
  const signal = makeCable(cablePoints(mp, endPts), 0.028, 0x14181e);
  signal.name = 'monitor-signal-cable';
  signal.userData['worldPts'] = signalPts;
  cableGroup.add(signal);
  g.add(cableGroup);

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

  // بناء الأجزاء
  const caseShell = buildCaseShell(flags);
  const sidePanel = buildSidePanel();
  const motherboard = buildMotherboard(flags);
  const cpu = buildCpu();
  const cooler = buildCooler();
  const ram = buildRam();
  const gpu = buildGpu(flags);
  const psu = buildPsu(flags);
  const ssd = buildSsd();
  const hdd = buildHdd();
  const fans = buildFans(flags);
  const atx24 = buildAtx24();
  const eps = buildEps();
  const gpuPower = buildGpuPower();
  const sataData = buildSataData();
  const sataPower = buildSataPower();
  const trayTable = buildTrayTable();
  const monitor = buildMonitor();

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

  const visualResult: PartVisuals = { root, dynamic, caseShell, sidePanel, flags, monitor };

  // (V5) استبدال المجسمات الإجرائية بالنماذج الحقيقية (GLB مُحمّلة مسبقًا قبل إنشاء المشهد).
  // الفشل الفردي يُبقي المجسم الإجرائي في مكانه — لا مشهد مكسور أبدًا.
  applyGlbParts(visualResult);

  // (V6-G F1/F5) توحيد موصل طاقة البطاقة وكابل الشاشة على البطاقة الجالسة —
  // نداء واحد يغطي مسار GLB ومسار الفشل الإجرائي (gpuSeat.gpuBox يُملأ دائمًا)
  alignGpuPowerCable(visualResult);

  return visualResult;
}
