/**
 * bench.ts — تجهيز طاولة الصيانة الحقيقية (V8 — توجيه «طاولة صيانة + تحكم كشخص حقيقي»).
 * ============================================================================
 * ما يضيفه هذا الملف فوق محطة العمل الموجودة:
 *  1) كيبورد وفأرة ماديتان على المكتب أمام الشاشة، موصولتان بكابلات مرئية —
 *     النقر على أيٍّ منهما يدخل وضع التحكم بالشاشة المجسمة (كما يفعل فني حقيقي).
 *  2) زر الطاقة الفعلي على واجهة الهيكل — النقر عليه يشغّل/يطفئ الجهاز (flag powerOn).
 *  3) مفتاح مزود الطاقة الارتدادي على الواجهة الخلفية — نقره يوصل/يفصل AC.
 *  4) ركن المواد الاستهلاكية لأي فني: معجون حراري، كحول أيزوبروبيل وفرشاة،
 *     بطاقة POST، كوب براغٍ، سوار أرضي، وأربطة كابلات.
 *
 * كل المجسمات إجرائية منخفضة الكلفة، وفشلها مستحيل (لا تحميل خارجي).
 * الكائنات التفاعلية تحمل userData (powerButton / acSwitch / peripheral) —
 * يلتقطها PCScene.pickAt ويعالجها كأحداث حقيقية لا كأزرار واجهة.
 */
import * as THREE from 'three';
import type { SceneQuality } from './visualTypes';

/** مادة غير مرئية تُصيبها الأشعة (نقاط التقاط واسعة للعناصر الصغيرة) — تُنشأ لكل مشهد
 *  (لا تُشارك على مستوى الوحدة: dispose للمشهد قد يُتلفها ثم يُعاد استخدامها لاحقًا) */
const mkHitMat = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ visible: false });
let hitMat: THREE.MeshBasicMaterial = mkHitMat();

function box(
  w: number, h: number, d: number, mat: THREE.Material,
  x: number, y: number, z: number, cast = false, receive = false,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function cyl(
  rTop: number, h: number, mat: THREE.Material, axis: 'x' | 'y' | 'z',
  x: number, y: number, z: number, rBottom = rTop, cast = false,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 16), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = cast;
  return m;
}

/** كابل أنبوبي يمر بمجموعة نقاط (CatmullRom) — يُستخدم لأسلاك الكيبورد والفأرة */
function cable(points: THREE.Vector3[], radius = 0.035): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 48, radius, 6, false);
  const mat = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.75, metalness: 0.1 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

const std = (color: number, metalness = 0.2, roughness = 0.6): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

// ============================================================
// 1) كيبورد + فأرة + كابلاتهما (طرفيات مكتب تفاعلية)
// ============================================================

function buildKeyboard(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bench-keyboard';
  const bodyMat = std(0x22262c, 0.15, 0.55);
  const keyMat = std(0x2c3138, 0.1, 0.7);
  const accentMat = std(0x161a20, 0.1, 0.8);

  // جسم اللوحة بملامح مائلة
  const base = box(2.6, 0.14, 1.0, bodyMat, 0, 0.07, 0, true, true);
  base.rotation.x = -0.04;
  g.add(base);
  // لوحة المفاتيح المرفوعة قليلًا (أحادية الشكل توحي بالمفاتيح بلا كلفة هندسية)
  const keys = box(2.4, 0.05, 0.78, keyMat, 0, 0.155, -0.06);
  keys.rotation.x = -0.04;
  g.add(keys);
  // صفوف فاصلة رفيعة تعطي إيقاع المفاتيح
  for (let i = 0; i < 4; i++) {
    const row = box(2.34, 0.02, 0.02, accentMat, 0, 0.185, -0.36 + i * 0.2);
    row.rotation.x = -0.04;
    g.add(row);
  }
  // شريط المسافة
  const space = box(1.1, 0.045, 0.16, keyMat, 0, 0.16, 0.33);
  g.add(space);
  // مؤشر LED صغير
  g.add(box(0.06, 0.02, 0.06, std(0x22c55e, 0, 0.5), 1.15, 0.15, 0.4));

  g.userData['peripheral'] = 'keyboard';
  return g;
}

function buildMouse(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bench-mouse';
  const bodyMat = std(0x22262c, 0.15, 0.55);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), bodyMat);
  body.scale.set(0.75, 0.55, 1.15);
  body.position.y = 0.12;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // عجلة التمرير
  g.add(box(0.05, 0.05, 0.1, std(0x0d1014, 0.1, 0.8), 0, 0.24, -0.08));
  // خط فاصل الأزرار
  g.add(box(0.015, 0.02, 0.2, std(0x10141a, 0.1, 0.8), 0, 0.235, 0.02));

  g.userData['peripheral'] = 'mouse';
  return g;
}

function buildPeripherals(root: THREE.Group): void {
  const rotY = -0.7; // بنفس توجه الشاشة نحو الكاميرا الرئيسية

  const kb = buildKeyboard();
  kb.position.set(4.75, 0, 7.45);
  kb.rotation.y = rotY;
  root.add(kb);

  const ms = buildMouse();
  ms.position.set(6.15, 0, 7.35);
  ms.rotation.y = rotY + 0.35;
  root.add(ms);

  // نقاط التقاط واسعة (الكيبورد/الفأرة صغيرتان على شاشة كاملة)
  const kbHit = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.5, 1.1), hitMat);
  kbHit.position.set(4.75, 0.25, 7.45);
  root.add(kbHit);
  const msHit = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), hitMat);
  msHit.position.set(6.15, 0.2, 7.35);
  root.add(msHit);

  // كابلات مرئية: من مؤخرة الكيبورد/الفأرة نحو الحافة الخلفية للمكتب
  root.add(cable([
    new THREE.Vector3(4.45, 0.06, 6.9),
    new THREE.Vector3(3.6, 0.06, 7.6),
    new THREE.Vector3(2.7, 0.06, 6.4),
    new THREE.Vector3(2.55, 0.06, 3.0),
    new THREE.Vector3(2.55, 0.06, -1.3),
  ]));
  root.add(cable([
    new THREE.Vector3(6.3, 0.06, 6.95),
    new THREE.Vector3(5.6, 0.06, 8.1),
    new THREE.Vector3(3.9, 0.06, 7.9),
    new THREE.Vector3(2.85, 0.06, 5.2),
    new THREE.Vector3(2.8, 0.06, -1.25),
  ], 0.03));
}

// ============================================================
// 2) زر الطاقة الفعلي + مفتاح مزود الطاقة (تحكم فيزيائي)
// ============================================================

function buildCaseControls(root: THREE.Group): void {
  // --- زر الطاقة: واجهة الهيكل الأمامية (z=4.6) أعلى المنتصف ---
  const pw = new THREE.Group();
  pw.name = 'case-power-button';
  pw.add(box(0.52, 0.5, 0.03, std(0x1a1f26, 0.4, 0.5), 0, 0, 0.005));            // لوحة تحمل الزر
  const btn = cyl(0.15, 0.07, std(0x39424d, 0.75, 0.35), 'z', 0, 0, 0.05, 0.15, true);
  btn.name = 'power-button-cap';
  pw.add(btn);
  // حلقة LED حول الزر تتوهج مع الإضاءة العامة في المشهد (لمبة الطاقة الأصلية تبقى مصدر الحقيقة)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.02, 8, 24),
    std(0x14181e, 0.3, 0.6),
  );
  pw.add(ring);
  pw.position.set(1.05, 4.0, 4.62);
  pw.userData['powerButton'] = true;
  root.add(pw);

  // نقطة التقاط واسعة
  const pwHit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), hitMat);
  pwHit.position.set(1.05, 4.0, 4.72);
  root.add(pwHit);

  // --- مفتاح PSU الارتدادي: الواجهة الخلفية (z=0) فوق مستوى المزود ---
  const sw = new THREE.Group();
  sw.name = 'psu-rocker-switch';
  sw.add(box(0.36, 0.52, 0.03, std(0x1a1f26, 0.4, 0.5), 0, 0, 0.02));
  sw.add(box(0.11, 0.2, 0.09, std(0xd23b3b, 0.2, 0.5), 0, 0.02, 0.05, true));    // جسم المفتاح الأحمر
  sw.position.set(1.32, 0.78, -0.03);
  sw.userData['acSwitch'] = true;
  root.add(sw);
  const swHit = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), hitMat);
  swHit.position.set(1.32, 0.78, -0.12);
  root.add(swHit);
}

// ============================================================
// 3) ركن المواد الاستهلاكية (زينة واقعية غير تفاعلية — النقر يمر منها)
// ============================================================

function buildConsumables(root: THREE.Group, cast: boolean): void {
  const g = new THREE.Group();
  g.name = 'bench-consumables';

  // أنبوب معجون حراري مستلقٍ
  const paste = new THREE.Group();
  paste.add(cyl(0.11, 0.62, std(0xd8dce2, 0.1, 0.45), 'x', 0, 0, 0, 0.11, cast));
  paste.add(cyl(0.06, 0.14, std(0xe8a13c, 0.3, 0.5), 'x', -0.36, 0, 0, 0.06, cast)); // غطاء كهرماني
  paste.add(box(0.2, 0.13, 0.001, std(0x1c232b, 0.1, 0.7), 0.1, 0.001, 0.112));      // ملصق
  paste.position.set(3.05, 0.115, 1.05);
  paste.rotation.z = 0.06;
  g.add(paste);

  // زجاجة كحول أيزوبروبيل
  const bottle = new THREE.Group();
  bottle.add(cyl(0.16, 0.5, new THREE.MeshStandardMaterial({ color: 0xbfd9d2, metalness: 0.05, roughness: 0.25, transparent: true, opacity: 0.55 }), 'y', 0, 0.25, 0, 0.16, cast));
  bottle.add(cyl(0.05, 0.16, std(0x2c3138, 0.2, 0.5), 'y', 0, 0.58, 0, 0.05, cast));
  bottle.position.set(3.5, 0.005, 1.1);
  g.add(bottle);

  // فرشاة تنظيف
  const brush = new THREE.Group();
  brush.add(box(0.9, 0.09, 0.14, std(0xe8a13c, 0.1, 0.6), 0, 0.045, 0, cast));
  brush.add(box(0.4, 0.11, 0.18, std(0x2c3138, 0, 0.9), 0.62, 0.055, 0, cast));
  brush.position.set(3.95, 0.005, 1.15);
  brush.rotation.y = 0.5;
  g.add(brush);

  // بطاقة POST diagnostic بعرض رقمي
  const post = new THREE.Group();
  post.add(box(0.72, 0.06, 0.4, std(0x14503a, 0.1, 0.7), 0, 0.03, 0, cast));
  post.add(box(0.2, 0.09, 0.14, std(0x0c0f14, 0.05, 0.4), -0.18, 0.065, 0, cast));
  const digits = box(0.17, 0.02, 0.11, new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 0.9 }), -0.18, 0.115, 0);
  post.add(digits);
  post.position.set(3.15, 0.005, 2.25);
  post.rotation.y = -0.25;
  g.add(post);

  // كوب براغٍ صغير فيه براغٍ
  const cup = new THREE.Group();
  cup.add(cyl(0.18, 0.26, std(0x39424d, 0.5, 0.4), 'y', 0, 0.13, 0, 0.16, cast));
  for (let i = 0; i < 5; i++) {
    const s = cyl(0.025, 0.09, std(0x9aa3ad, 0.85, 0.3), i % 2 ? 'x' : 'z', (i - 2) * 0.06, 0.24, (i % 3 - 1) * 0.05, 0.025, false);
    s.rotation.z = i * 0.7;
    cup.add(s);
  }
  cup.position.set(3.85, 0.005, 2.45);
  g.add(cup);

  // سوار أرضي (ESD) ملقى على الطاولة
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 22), std(0x2c6e8f, 0.1, 0.7));
  strap.rotation.x = Math.PI / 2;
  strap.rotation.z = 0.4;
  strap.position.set(3.0, 0.05, 3.1);
  strap.castShadow = cast;
  strap.receiveShadow = true;
  g.add(strap);
  g.add(box(0.26, 0.06, 0.2, std(0x1a1f26, 0.2, 0.6), 3.4, 0.03, 3.25, cast));      // مقبس الأرضي

  // أربطة كابلات (شرائط رفيعة)
  for (let i = 0; i < 3; i++) {
    const tie = box(0.7, 0.015, 0.05, std(0xd8dce2, 0, 0.8), 4.15, 0.012, 2.95 + i * 0.12, false);
    tie.rotation.y = 0.35 + i * 0.5;
    g.add(tie);
  }

  root.add(g);
}

// ============================================================
// نقطة الدخول
// ============================================================

export function buildBenchAdditions(root: THREE.Group, quality: SceneQuality): void {
  const cast = quality !== 'low';
  hitMat = mkHitMat(); // مادة جديدة لكل مشهد — سلامة دورة dispose/إعادة البناء
  buildPeripherals(root);
  buildCaseControls(root);
  buildConsumables(root, cast);
}
