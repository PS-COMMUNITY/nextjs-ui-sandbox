/**
 * خامات إجرائية مولّدة بـ Canvas 2D (Procedural CanvasTextures)
 * ------------------------------------------------------------
 * كل الخامات تُرسم برمجيًا — لا أصول خارجية ولا حقوق، وتُخزَّن في cache
 * مفاتيحه ثابتة حتى لا تُنشأ خامة مرتين. تعمل في المتصفح فقط؛ وعند
 * غياب document (SSR) تُعيد null ويتعامل معها مصنع المجسمات بأمان.
 *
 * القاعدة التعليمية: النصوص على الملصقات عامة (بلا علامات تجارية).
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture | null>();

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

function finish(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeatX !== 1 || repeatY !== 1) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
  }
  return t;
}

/** مولّد شبه-عشوائي حتمي (نفس البذرة = نفس الرسم — ثبات بين الإعادة) */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ============================================================
// 1) خامة لوحة دوائر مطبوعة PCB — مسارات + منافذ + حرير
// ============================================================

export function pcbTexture(bg = '#14503a', trace = '#2e8f63'): THREE.CanvasTexture | null {
  const key = `pcb-${bg}-${trace}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(512, 512);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  const rnd = seeded(7);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 512);

  // مسارات نحاسية — خطوط منكسرة بزوايا 45° كمخططات PCB الحقيقية
  ctx.strokeStyle = trace;
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    ctx.lineWidth = 1 + rnd() * 2.4;
    ctx.globalAlpha = 0.28 + rnd() * 0.4;
    ctx.beginPath();
    let x = rnd() * 512;
    let y = rnd() * 512;
    ctx.moveTo(x, y);
    const segs = 2 + Math.floor(rnd() * 3);
    for (let s = 0; s < segs; s++) {
      const dx = (rnd() - 0.5) * 260;
      const dy = (rnd() - 0.5) * 260;
      // خط مائل ثم قطعة محورية (شكل مسارات الدوائر)
      ctx.lineTo(x + dx, y + dy);
      ctx.lineTo(x + dx + (rnd() - 0.5) * 120, y + dy);
      x += dx;
      y += dy;
    }
    ctx.stroke();
  }

  // منافذ (vias) — دوائر صغيرة بحلقة فاتحة
  for (let i = 0; i < 110; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 1.6 + rnd() * 2.6;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#0d2e21';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = trace;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // حرير (silkscreen) — مستطيلات ورموز مرجعية فاتحة
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = '#cfe3d8';
  ctx.fillStyle = '#cfe3d8';
  ctx.lineWidth = 1.5;
  const refs = ['R12', 'C48', 'Q7', 'U3', 'L2', 'J1'];
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 480;
    const y = rnd() * 480;
    const w = 14 + rnd() * 34;
    const h = 8 + rnd() * 16;
    if (rnd() > 0.5) {
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.font = '10px monospace';
      ctx.fillText(refs[Math.floor(rnd() * refs.length)], x, y);
    }
  }
  ctx.globalAlpha = 1;

  const t = finish(c, 2, 2);
  cache.set(key, t);
  return t;
}

// ============================================================
// 2) معدن مصقول بالخطوط (Brushed metal)
// ============================================================

export function brushedTexture(base = '#3a4450', streak = 0.05): THREE.CanvasTexture | null {
  const key = `brush-${base}-${streak}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(256, 256);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  const rnd = seeded(21);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const y = rnd() * 256;
    const w = 30 + rnd() * 220;
    const x = rnd() * 256 - 60;
    const light = rnd() > 0.5;
    ctx.globalAlpha = 0.02 + rnd() * streak;
    ctx.strokeStyle = light ? '#ffffff' : '#000000';
    ctx.lineWidth = 0.6 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = finish(c, 2, 2);
  cache.set(key, t);
  return t;
}

// ============================================================
// 3) شبكة تهوية سداسية/منقّطة (Hex vent mesh)
// ============================================================

export function ventMeshTexture(bg = '#10151b', hole = '#05070a'): THREE.CanvasTexture | null {
  const key = `vent-${bg}-${hole}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(256, 256);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  const rnd = seeded(3);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);
  const step = 22;
  const r = 7.5;
  for (let row = 0; row < 256 / step + 1; row++) {
    for (let col = 0; col < 256 / step + 1; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0);
      const y = row * step;
      ctx.globalAlpha = 0.75 + rnd() * 0.25;
      ctx.fillStyle = hole;
      ctx.beginPath();
      // شكل سداسي مبسّط
      ctx.moveTo(x + r, y);
      for (let a = 1; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2;
        ctx.lineTo(x + r * Math.cos(ang), y + r * Math.sin(ang));
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const t = finish(c, 3, 3);
  cache.set(key, t);
  return t;
}

// ============================================================
// 4) شبكة حلقات دائرية (شبكة مروحة مزود الطاقة)
// ============================================================

export function fanGrillTexture(bg = '#2b333d'): THREE.CanvasTexture | null {
  const key = `grill-${bg}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(256, 256);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#151b22';
  ctx.translate(128, 128);
  for (let r = 18; r < 128; r += 13) {
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(14 * Math.cos(ang), 14 * Math.sin(ang));
    ctx.lineTo(128 * Math.cos(ang), 128 * Math.sin(ang));
    ctx.stroke();
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

// ============================================================
// 5) شبكة إبر مقبس المعالج (LGA pin field)
// ============================================================

export function socketPinsTexture(): THREE.CanvasTexture | null {
  const key = 'socket-pins';
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(256, 256);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  ctx.fillStyle = '#26303a';
  ctx.fillRect(0, 0, 256, 256);
  const step = 10;
  for (let y = 8; y < 250; y += step) {
    for (let x = 8; x < 250; x += step) {
      ctx.fillStyle = (x / step + y / step) % 2 === 0 ? '#c9a23f' : '#a8842f';
      ctx.fillRect(x, y, 4, 4);
    }
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

// ============================================================
// 6) ملصقات عامة (بلا علامات تجارية)
// ============================================================

function labelBase(w: number, h: number, bg: string): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const made = canvas2d(w, h);
  if (!made) return null;
  const [c, ctx] = made;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#9aa3ad';
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  return [c, ctx];
}

/** ملصق مزود الطاقة — نص عام فقط */
export function psuLabelTexture(): THREE.CanvasTexture | null {
  const key = 'psu-label';
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = labelBase(512, 320, '#39424e');
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  ctx.fillStyle = '#e8eaed';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('ATX POWER SUPPLY', 256, 80);
  ctx.font = '28px sans-serif';
  ctx.fillText('PS-650A   •   650W', 256, 130);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#b9c2cc';
  ctx.fillText('AC INPUT: 100-240V~  6A   50/60Hz', 256, 175);
  ctx.fillText('DC OUTPUT: +3.3V  +5V  +12V  -12V  +5VSB', 256, 205);
  // شريط تحذيري مخطط
  ctx.save();
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#eab308' : '#1a1f26';
    ctx.fillRect(20 + i * 39, 240, 39, 22);
  }
  ctx.restore();
  ctx.fillStyle = '#e8eaed';
  ctx.font = '17px sans-serif';
  ctx.fillText('محتوى تعليمي عام — تحذير: لا تفتح مزود الطاقة', 256, 292);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** لوحة اسم بطاقة الرسوميات — عامة */
export function gpuPlateTexture(): THREE.CanvasTexture | null {
  const key = 'gpu-plate';
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(512, 128);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  ctx.fillStyle = '#1b2129';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#e8eaed';
  ctx.textAlign = 'center';
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText('GX-8G', 256, 62);
  ctx.font = '26px sans-serif';
  ctx.fillStyle = '#8f99a5';
  ctx.fillText('8GB GDDR6   •   TRAINING UNIT', 256, 102);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** ملصق شريحة الذاكرة */
export function ramLabelTexture(): THREE.CanvasTexture | null {
  const key = 'ram-label';
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(256, 128);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  ctx.fillStyle = '#232b34';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#4a5560';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = '#e8eaed';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('DDR4 8GB', 128, 56);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#9aa3ad';
  ctx.fillText('288-PIN UDIMM', 128, 92);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** ملصق قرص M.2 */
export function m2LabelTexture(): THREE.CanvasTexture | null {
  const key = 'm2-label';
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(256, 96);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  ctx.fillStyle = '#2a323c';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#e8eaed';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('NVMe SSD', 128, 42);
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#9aa3ad';
  ctx.fillText('512GB  •  M.2 2280', 128, 74);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** شعار واجهة أمامية عام — "PC LAB" */
export function frontBadgeTexture(): THREE.CanvasTexture | null {
  const key = 'front-badge';
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = canvas2d(256, 64);
  if (!made) {
    cache.set(key, null);
    return null;
  }
  const [c, ctx] = made;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#5b6773';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px sans-serif';
  ctx.globalAlpha = 0.9;
  ctx.fillText('P C  L A B', 128, 44);
  const t = finish(c);
  cache.set(key, t);
  return t;
}
