/**
 * bench.ts — تجهيز طاولة الصيانة الحقيقية (V8.1 — «ورشة صيانة» مرئية بالكامل).
 * ============================================================================
 * الهوية البصرية لمحطة الإصلاح — كل ما يراه الفني حول الجهاز:
 *  1) سجادة ESD كبيرة تحت الجهاز وصينية القطع معًا — قلب طاولة الصيانة الحقيقية
 *     (حلقات شبكة باهتة + إطار سماوي + زر تأريض + سلك أرضي ملفوف).
 *  2) كيبورد وفأرة مكبرتان في مكانهما الصحيح أمام الشاشة، لوحة مفاتيح بنسيج
 *     مفاتيح حقيقي (CanvasTexture) + فوأرة على قاعدة — النقر يدخل وضع التحكم
 *     بالشاشة المجسمة كأن الفني جالس أمام الجهاز.
 *  3) منظم براغٍ بخانات زجاجية + حافظة تذكرة خدمة عربية — تفاصيل ورشة حقيقية.
 *  4) مقعد فني وعلاسة أرضية أمام المكتب — المشهد كامل كغرفة صيانة لا كطاولة عائمة.
 *  5) زر الطاقة الفعلي على واجهة الهيكل + مفتاح مزود الطاقة الارتدادي (من V8).
 *  6) ركن المواد الاستهلاكية: معجون حراري، كحول، فرشاة، بطاقة POST، كوب براغٍ،
 *     سوار أرضي، أربطة كابلات.
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

/** كابل أنبوبي يمر بمجموعة نقاط (CatmullRom) — أسلاك الطرفيات والسلك الأرضي */
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
// 1) سجادة ESD الكبيرة — قلب طاولة الصيانة
// ============================================================

/** حدود سجادة العمل (فضاء المشهد) — تحت الجهاز وصينية القطع معًا */
const MAT = {
  minX: -5.0, minZ: -0.45,
  width: 8.4, depth: 5.6,
  radius: 0.4, thickness: 0.04,
};
/** سطح السجادة — كل ما يوضع فوقها يرتفع بهذا المقدار */
export const MAT_TOP = MAT.thickness;

function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(r, 0);
  s.lineTo(w - r, 0);
  s.quadraticCurveTo(w, 0, w, r);
  s.lineTo(w, d - r);
  s.quadraticCurveTo(w, d, w - r, d);
  s.lineTo(r, d);
  s.quadraticCurveTo(0, d, 0, d - r);
  s.lineTo(0, r);
  s.quadraticCurveTo(0, 0, r, 0);
  s.closePath();
  return s;
}

/** ملصق «ESD SAFE» المطبوع على زاوية السجادة */
function esdLabelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 128);
  ctx.strokeStyle = '#67e8f9';
  ctx.fillStyle = '#67e8f9';
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px monospace';
  ctx.fillText('ESD SAFE', 128, 56);
  ctx.font = 'bold 24px monospace';
  ctx.fillText('GROUNDED ⏚', 128, 98);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function buildWorkMat(root: THREE.Group): void {
  const g = new THREE.Group();
  g.name = 'esd-work-mat';

  // جسم السجادة: مستطيل مستدير الزوايا مبثوث لسماكة 4سم (الشكل بإحداثيات العالم x/z)
  const shape = roundedRectShape(MAT.width, MAT.depth, MAT.radius);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: MAT.thickness, bevelEnabled: false, curveSegments: 6 });
  const body = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x11516b, roughness: 0.92, metalness: 0.05 }),
  );
  body.rotation.x = Math.PI / 2; // شكل (x,y) → عالم (x,z)، البثق نحو الأسفل
  body.position.set(MAT.minX, MAT.thickness, MAT.minZ);
  body.receiveShadow = true;
  g.add(body);

  // شبكة مربعات باهتة (نقاط LineSegments داخل حدود الزوايا المستديرة)
  const inset = 0.5;
  const pts: number[] = [];
  for (let gx = inset; gx <= MAT.width - inset; gx += 0.9) {
    pts.push(MAT.minX + gx, MAT.thickness + 0.003, MAT.minZ + inset,
             MAT.minX + gx, MAT.thickness + 0.003, MAT.minZ + MAT.depth - inset);
  }
  for (let gz = inset; gz <= MAT.depth - inset; gz += 0.9) {
    pts.push(MAT.minX + inset, MAT.thickness + 0.003, MAT.minZ + gz,
             MAT.minX + MAT.width - inset, MAT.thickness + 0.003, MAT.minZ + gz);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(
    gridGeo,
    new THREE.LineBasicMaterial({ color: 0x2f93b5, transparent: true, opacity: 0.2 }),
  );
  g.add(grid);

  // إطار سماوي داخلي رفيع (كسجادات ESD الحقيقية ذات الحد المطبوع)
  const frameMat = std(0x22d3ee, 0.3, 0.6);
  const fx = MAT.minX + 0.28, fz = MAT.minZ + 0.28;
  const fw = MAT.width - 0.56, fd = MAT.depth - 0.56;
  g.add(box(fw, 0.012, 0.035, frameMat, fx + fw / 2, MAT.thickness + 0.006, fz, false));
  g.add(box(fw, 0.012, 0.035, frameMat, fx + fw / 2, MAT.thickness + 0.006, fz + fd, false));
  g.add(box(0.035, 0.012, fd, frameMat, fx, MAT.thickness + 0.006, fz + fd / 2, false));
  g.add(box(0.035, 0.012, fd, frameMat, fx + fw, MAT.thickness + 0.006, fz + fd / 2, false));

  // ملصق ESD SAFE على الزاوية الأمامية اليمنى
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.575),
    new THREE.MeshBasicMaterial({ map: esdLabelTexture(), transparent: true }),
  );
  label.rotation.x = -Math.PI / 2;
  label.rotation.z = 0.015;
  label.position.set(MAT.minX + MAT.width - 1.0, MAT.thickness + 0.004, MAT.minZ + MAT.depth - 0.55);
  g.add(label);

  // زر التأريض المعدني + السلك الأرضي الملفوف نحو الحافة الخلفية للمكتب
  const snapX = MAT.minX + MAT.width - 0.62, snapZ = MAT.minZ + MAT.depth - 0.62;
  g.add(cyl(0.095, 0.028, std(0xd7b45a, 0.85, 0.3), 'y', snapX, MAT.thickness + 0.014, snapZ, 0.095, true));
  g.add(cyl(0.03, 0.012, std(0x1a1f26, 0.4, 0.5), 'y', snapX, MAT.thickness + 0.03, snapZ, 0.03, false));
  g.add(cable([
    new THREE.Vector3(snapX, MAT.thickness + 0.02, snapZ),
    new THREE.Vector3(snapX + 0.35, MAT.thickness + 0.02, snapZ - 0.8),
    new THREE.Vector3(3.35, 0.04, 3.0),
    new THREE.Vector3(3.15, 0.04, 0.6),
    new THREE.Vector3(2.75, 0.04, -1.55),
  ], 0.028));

  root.add(g);
}

// ============================================================
// 2) كيبورد + فأرة مكبرتان (بنسيج مفاتيح حقيقي) + قاعدة فأرة
// ============================================================

/** نسيج لوحة المفاتيح: شبكة مفاتيح مرسومة كانفاس — شكل حقيقي بلا كلفة هندسية */
function keyboardTopTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 680; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#171b21';
  ctx.fillRect(0, 0, 680, 256);
  const drawKey = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = '#2a2f37';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 5);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
  };
  const K = 44, KH = 38, G = 7;
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const y = 12 + r * (KH + G);
    let x = 14;
    // مفتاح عريض في بداية/نهاية كل صف (Tab/Caps/Shift/Backspace)
    const lead = [1.9, 1.35, 1.8, 2.25, 1.35][r];
    const tail = [1.35, 1.9, 1.55, 2.25, 1.9][r];
    drawKey(x, y, K * lead, KH);
    x += K * lead + G;
    const rowEnd = 680 - 14 - K * tail - G;
    while (x < rowEnd - K) {
      drawKey(x, y, K, KH);
      x += K + G;
    }
    drawKey(x, y, Math.max(K, rowEnd - x), KH);
  }
  // صف المسافة
  const sy = 12 + 5 * (KH + G);
  let sx = 14;
  for (const w of [K, K, K * 4.2, K, K, K]) {
    drawKey(sx, sy, w, KH);
    sx += w + G;
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function buildKeyboard(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bench-keyboard';
  const bodyMat = std(0x20252c, 0.2, 0.55);

  // جسم اللوحة بميلان خفيف
  const base = box(3.4, 0.16, 1.3, bodyMat, 0, 0.08, 0, true, true);
  base.rotation.x = -0.045;
  g.add(base);
  // سطح المفاتيح بنسيج كانفاس
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(3.26, 1.16),
    new THREE.MeshStandardMaterial({ map: keyboardTopTexture(), roughness: 0.8, metalness: 0.05 }),
  );
  top.rotation.x = -Math.PI / 2 + 0.045;
  top.position.set(0, 0.163, -0.03);
  g.add(top);
  // لمبة حالة صغيرة
  g.add(box(0.07, 0.02, 0.07, std(0x22c55e, 0, 0.5), 1.52, 0.17, 0.5));

  g.userData['peripheral'] = 'keyboard';
  return g;
}

function buildMouse(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bench-mouse';
  const bodyMat = std(0x22262c, 0.15, 0.55);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), bodyMat);
  body.scale.set(0.78, 0.58, 1.2);
  body.position.y = 0.15;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // عجلة التمرير + خط فاصل الأزرار
  g.add(box(0.06, 0.06, 0.12, std(0x0d1014, 0.1, 0.8), 0, 0.29, -0.1));
  g.add(box(0.018, 0.025, 0.24, std(0x10141a, 0.1, 0.8), 0, 0.285, 0.03));
  g.userData['peripheral'] = 'mouse';
  return g;
}

function buildPeripherals(root: THREE.Group): void {
  // (v10) نفس دوران الشاشة الجديد (-0.62) — الكيبورد والفأرة والشاشة محطة واحدة
  // مصفوفة أمام الجهاز بدل مبعثرة على زوايا المكتب
  const rotY = -0.62; // بنفس توجه الشاشة نحو الكاميرا الرئيسية

  // قاعدة الفأرة (mousepad) تحت الفأرة مباشرة — يمين الكيبورد
  const pad = box(1.55, 0.014, 1.3, std(0x10151b, 0.1, 0.9), 7.3, 0.008, 5.9, false, true);
  pad.rotation.y = rotY + 0.07;
  root.add(pad);

  const kb = buildKeyboard();
  kb.position.set(5.5, 0, 5.5);
  kb.rotation.y = rotY;
  root.add(kb);

  const ms = buildMouse();
  ms.position.set(7.3, 0.015, 5.9);
  ms.rotation.y = rotY + 0.07;
  root.add(ms);

  // نقاط التقاط واسعة (الكيبورد/الفأرة صغيرتان على شاشة كاملة)
  const kbHit = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 1.5), hitMat);
  kbHit.position.set(5.5, 0.3, 5.5);
  root.add(kbHit);
  const msHit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), hitMat);
  msHit.position.set(7.3, 0.25, 5.9);
  root.add(msHit);

  // كابلات مرئية: من مؤخرة الكيبورد/الفأرة نحو الحافة الخلفية للمكتب
  root.add(cable([
    new THREE.Vector3(5.95, 0.05, 4.9),
    new THREE.Vector3(6.9, 0.05, 3.6),
    new THREE.Vector3(7.25, 0.05, 0.8),
    new THREE.Vector3(3.0, 0.05, -1.5),
  ]));
  root.add(cable([
    new THREE.Vector3(7.45, 0.05, 5.55),
    new THREE.Vector3(7.9, 0.05, 3.0),
    new THREE.Vector3(7.4, 0.05, -0.9),
    new THREE.Vector3(3.1, 0.05, -1.45),
  ], 0.03));
}

// ============================================================
// 3) زر الطاقة الفعلي + مفتاح مزود الطاقة (تحكم فيزيائي)
// ============================================================

function buildCaseControls(root: THREE.Group): void {
  // --- زر الطاقة: واجهة الهيكل الأمامية (z=4.6) أعلى المنتصف ---
  const pw = new THREE.Group();
  pw.name = 'case-power-button';
  pw.add(box(0.52, 0.5, 0.03, std(0x1a1f26, 0.4, 0.5), 0, 0, 0.005));            // لوحة تحمل الزر
  const btn = cyl(0.15, 0.07, std(0x39424d, 0.75, 0.35), 'z', 0, 0, 0.05, 0.15, true);
  btn.name = 'power-button-cap';
  pw.add(btn);
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
// 4) منظم البراغي + حافظة تذكرة الخدمة (تفاصيل ورشة)
// ============================================================

function buildScrewOrganizer(root: THREE.Group): void {
  const g = new THREE.Group();
  g.name = 'screw-organizer';
  const bodyMat = std(0x2b323c, 0.3, 0.55);
  const wallMat = std(0x1d232b, 0.3, 0.6);

  g.add(box(1.75, 0.16, 1.25, bodyMat, 0, 0.08, 0, true, true));                  // قاعدة
  g.add(box(1.75, 0.34, 0.06, bodyMat, 0, 0.33, -0.6, true));                     // جدار خلفي
  g.add(box(1.75, 0.1, 1.25, bodyMat, 0, 0.21, 0, true));                         // إطار علوي

  // 4×2 خانات بفواصل + براغٍ داخل بعضها
  const screwMat = std(0x9aa3ad, 0.85, 0.3);
  for (let cxi = 0; cxi < 4; cxi++) {
    const cx = -0.66 + cxi * 0.44;
    g.add(box(0.035, 0.16, 1.16, wallMat, cx - 0.22, 0.29, 0, false));
    for (let czi = 0; czi < 2; czi++) {
      const cz = -0.28 + czi * 0.56;
      if (cxi === 0) g.add(box(0.44, 0.16, 0.035, wallMat, cx, 0.29, cz + 0.28, false));
      if ((cxi + czi) % 2 === 0) {
        for (let s = 0; s < 5; s++) {
          const sc = cyl(0.02, 0.07, screwMat, s % 2 ? 'x' : 'z',
            cx + ((s * 7) % 5 - 2) * 0.055, 0.24, cz + ((s * 3) % 3 - 1) * 0.09, 0.02, false);
          sc.rotation.y = s * 1.3;
          g.add(sc);
        }
      }
    }
  }
  g.add(box(0.035, 0.16, 1.16, wallMat, 0.88 - 0.22 + 0.22, 0.29, 0, false));

  // غطاء شفاف مسنود خلف المنظم (مفتوح — الفني يعمل)
  const lid = box(1.75, 1.05, 0.04,
    new THREE.MeshStandardMaterial({ color: 0x9fc4cf, metalness: 0.05, roughness: 0.15, transparent: true, opacity: 0.28 }),
    0, 0.62, -0.78, true);
  lid.rotation.x = 0.32;
  g.add(lid);

  // (v10) الزاوية الأمامية اليمنى — بجانب محطة العرض لا خلفها
  g.position.set(7.5, 0, 7.55);
  g.rotation.y = -0.45;
  root.add(g);
}

/** تذكرة الخدمة المطبوعة على حافظة — كانفاس بنص عربي حقيقي */
function ticketTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 360;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e9ecef';
  ctx.fillRect(0, 0, 256, 360);
  ctx.fillStyle = '#0b1118';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.font = 'bold 26px Tahoma, Arial, sans-serif';
  ctx.fillText('ورشة صيانة الحاسوب', 128, 46);
  ctx.font = '20px Tahoma, Arial, sans-serif';
  ctx.fillStyle = '#22a5c4';
  ctx.fillText('تذكرة خدمة #2481', 128, 78);
  ctx.fillStyle = '#3a4149';
  ctx.font = '17px Tahoma, Arial, sans-serif';
  const lines = [
    'الجهاز: تجميعة مرجعية',
    'العطل المبلغ: لا إقلاع',
    'الفني: طالب التخصص',
    'الحالة: قيد الفحص',
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, 128, 124 + i * 34));
  ctx.strokeStyle = '#9aa3ad';
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(24, 272); ctx.lineTo(232, 272);
  ctx.stroke();
  ctx.fillStyle = '#6b7280';
  ctx.font = '15px Tahoma, Arial, sans-serif';
  ctx.fillText('يُسلَّم الجهاز بعد اختبار POST', 128, 306);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function buildClipboard(root: THREE.Group): void {
  const g = new THREE.Group();
  g.name = 'service-clipboard';
  g.add(box(1.15, 0.035, 1.6, std(0x4a3a28, 0.1, 0.7), 0, 0.018, 0, true, true)); // اللوح الخشبي
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 1.42),
    new THREE.MeshStandardMaterial({ map: ticketTexture(), roughness: 0.85 }),
  );
  paper.rotation.x = -Math.PI / 2;
  paper.position.set(0, 0.038, 0.05);
  g.add(paper);
  // مشبك معدني أعلى الحافظة
  g.add(box(0.5, 0.05, 0.22, std(0x39424d, 0.7, 0.4), 0, 0.05, -0.66, true));
  // (v10) على سطح المكتب مباشرة (كانت على ارتفاع السجادة وهي خارج حدودها — تطفو)
  g.position.set(1.05, 0.006, 5.62);
  g.rotation.y = 0.07;
  root.add(g);
}

// ============================================================
// 5) مقعد الفني + علاسة أرضية (الورشة أرضية كاملة)
// ============================================================

function buildStoolAndFloorMat(root: THREE.Group): void {
  const floorY = -7.5;
  const g = new THREE.Group();
  g.name = 'technician-stool';
  const seatMat = std(0x232a33, 0.2, 0.6);
  const steelMat = std(0x39424d, 0.7, 0.4);

  // علاسة أرضية مطاطية أمام المكتب
  const fmat = box(5.8, 0.06, 2.7, std(0x10151b, 0.1, 0.95), 0.9, floorY + 0.03, 9.9, false, true);
  fmat.name = 'floor-mat';
  g.add(fmat);
  // خطوط تمزيق على العلاسة
  for (let i = 0; i < 6; i++) {
    g.add(box(5.5, 0.008, 0.06, std(0x1a2129, 0.1, 0.9), 0.9, floorY + 0.065, 8.8 + i * 0.44, false));
  }

  // المقعد: قاعدة خماسية + بكرة رفع + مقعد مبطن
  for (let a = 0; a < 5; a++) {
    const ang = (a / 5) * Math.PI * 2;
    const arm = box(1.3, 0.08, 0.16, steelMat, Math.cos(ang) * 0.55, floorY + 0.35, 10.9 + Math.sin(ang) * 0.55, true);
    arm.rotation.y = -ang;
    g.add(arm);
    const caster = cyl(0.09, 0.07, std(0x0c0f14, 0.2, 0.7), 'y',
      Math.cos(ang) * 1.1, floorY + 0.09, 10.9 + Math.sin(ang) * 1.1, 0.09, false);
    caster.rotation.z = Math.PI / 2;
    caster.rotation.y = ang;
    g.add(caster);
  }
  g.add(cyl(0.09, 3.4, steelMat, 'y', 0, floorY + 2.2, 10.9, 0.09, true));       // أسطوانة الغاز
  g.add(cyl(0.16, 0.3, seatMat, 'y', 0, floorY + 4.0, 10.9, 0.16, true));
  const seat = cyl(0.95, 0.28, seatMat, 'y', 0, floorY + 4.45, 10.9, 0.95, true);
  seat.receiveShadow = true;
  g.add(seat);

  root.add(g);
}

// ============================================================
// 6) ركن المواد الاستهلاكية (زينة واقعية غير تفاعلية)
// ============================================================

function buildConsumables(root: THREE.Group, cast: boolean): void {
  const g = new THREE.Group();
  g.name = 'bench-consumables';
  const deskY = 0.005;
  const matY = MAT_TOP + 0.005;

  // (v10) ركن المواد الاستهلاكية: عنقود واحد أمام يسار الجهاز —
  // المعجون/الكحول/الفرشاة على المكتب خلف حافة السجادة، وبطاقة POST والكوب
  // والسوار على السجادة نفسها (كانت بعضها خارج السجادة على ارتفاعها = تطفو)

  // أنبوب معجون حراري مستلقٍ
  const paste = new THREE.Group();
  paste.add(cyl(0.11, 0.62, std(0xd8dce2, 0.1, 0.45), 'x', 0, 0, 0, 0.11, cast));
  paste.add(cyl(0.06, 0.14, std(0xe8a13c, 0.3, 0.5), 'x', -0.36, 0, 0, 0.06, cast));
  paste.add(box(0.2, 0.13, 0.001, std(0x1c232b, 0.1, 0.7), 0.1, 0.001, 0.112));
  paste.position.set(-0.9, 0.12, 6.5);
  paste.rotation.z = 0.06;
  g.add(paste);

  // زجاجة كحول أيزوبروبيل
  const bottle = new THREE.Group();
  bottle.add(cyl(0.16, 0.5, new THREE.MeshStandardMaterial({ color: 0xbfd9d2, metalness: 0.05, roughness: 0.25, transparent: true, opacity: 0.55 }), 'y', 0, 0.25, 0, 0.16, cast));
  bottle.add(cyl(0.05, 0.16, std(0x2c3138, 0.2, 0.5), 'y', 0, 0.58, 0, 0.05, cast));
  bottle.position.set(-0.3, deskY, 6.9);
  g.add(bottle);

  // فرشاة تنظيف
  const brush = new THREE.Group();
  brush.add(box(0.9, 0.09, 0.14, std(0xe8a13c, 0.1, 0.6), 0, 0.045, 0, cast));
  brush.add(box(0.4, 0.11, 0.18, std(0x2c3138, 0, 0.9), 0.62, 0.055, 0, cast));
  brush.position.set(-1.8, deskY, 6.9);
  brush.rotation.y = 0.8;
  g.add(brush);

  // بطاقة POST diagnostic بعرض رقمي — على السجادة أمام الجهاز
  const post = new THREE.Group();
  post.add(box(0.72, 0.06, 0.4, std(0x14503a, 0.1, 0.7), 0, 0.03, 0, cast));
  post.add(box(0.2, 0.09, 0.14, std(0x0c0f14, 0.05, 0.4), -0.18, 0.065, 0, cast));
  const digits = box(0.17, 0.02, 0.11, new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 0.9 }), -0.18, 0.115, 0);
  post.add(digits);
  post.position.set(-0.75, matY, 4.85);
  post.rotation.y = -0.25;
  g.add(post);

  // كوب براغٍ صغير فيه براغٍ — على السجادة قرب واجهة الجهاز
  const cup = new THREE.Group();
  cup.add(cyl(0.18, 0.26, std(0x39424d, 0.5, 0.4), 'y', 0, 0.13, 0, 0.16, cast));
  for (let i = 0; i < 5; i++) {
    const s = cyl(0.025, 0.09, std(0x9aa3ad, 0.85, 0.3), i % 2 ? 'x' : 'z', (i - 2) * 0.06, 0.24, (i % 3 - 1) * 0.05, 0.025, false);
    s.rotation.z = i * 0.7;
    cup.add(s);
  }
  cup.position.set(0.15, matY, 4.95);
  g.add(cup);

  // سوار أرضي (ESD) ملقى على السجادة قرب الصينية
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 22), std(0x2c6e8f, 0.1, 0.7));
  strap.rotation.x = Math.PI / 2;
  strap.rotation.z = 0.4;
  strap.position.set(2.6, matY + 0.045, 4.75);
  strap.castShadow = cast;
  strap.receiveShadow = true;
  g.add(strap);
  g.add(box(0.26, 0.06, 0.2, std(0x1a1f26, 0.2, 0.6), 3.0, matY + 0.03, 4.9, cast));

  // أربطة كابلات (شرائط رفيعة) قرب منظم البراغي في زاويته الجديدة
  for (let i = 0; i < 3; i++) {
    const tie = box(0.7, 0.015, 0.05, std(0xd8dce2, 0, 0.8), 6.7, 0.012, 7.0 + i * 0.14, false);
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
  buildWorkMat(root);
  buildPeripherals(root);
  buildCaseControls(root);
  buildScrewOrganizer(root);
  buildClipboard(root);
  buildStoolAndFloorMat(root);
  buildConsumables(root, cast);
}
