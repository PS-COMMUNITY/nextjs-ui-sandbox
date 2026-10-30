/**
 * V6-A measurement tool (dev-only, not part of the app bundle).
 * Dumps GLB node hierarchy + mesh bounds for the parts we must align:
 * motherboard (PCIe x16 slot, DIMM slots, socket), gpu (fingers/rotors),
 * case (rear expansion openings), cooler/psu/fan (rotor axes).
 * Usage: bun scripts/measure-glb.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';

const meshopt = await import('meshoptimizer');
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization, KHRTextureBasisu])
  .registerDependencies({
    'meshopt.decoder': meshopt.MeshoptDecoder,
    'meshopt.encoder': meshopt.MeshoptEncoder,
  });
const FILES = [
  ['motherboard', 'public/models/parts/motherboard.glb'],
  ['gpu', 'public/models/parts/gpu.glb'],
  ['case', 'public/models/parts/case.glb'],
  ['cooler', 'public/models/parts/cooler.glb'],
  ['psu', 'public/models/parts/psu.glb'],
  ['fan', 'public/models/parts/fan.glb'],
  ['ram', 'public/models/parts/ram.glb'],
];

function nodeBounds(node) {
  const mesh = typeof node.getMesh === "function" ? node.getMesh() : null;
  if (!mesh) return null;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.listPrimitives()) {
    const acc = prim.getAttribute('POSITION');
    if (!acc) continue;
    let amin, amax;
    try {
      const arr = acc.getArray();
      const count = acc.getCount();
      const es = acc.getElementSize();
      if (!arr || !count || !es) continue;
      amin = [Infinity, Infinity, Infinity]; amax = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < 3; j++) {
          const v = arr[i * es + j];
          if (Number.isNaN(v)) continue;
          if (v < amin[j]) amin[j] = v;
          if (v > amax[j]) amax[j] = v;
        }
      }
    } catch { continue; }
    if (!amin || !amax || amin[0] === Infinity) continue;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], amin[i]);
      max[i] = Math.max(max[i], amax[i]);
    }
  }
  if (min[0] === Infinity) return null;
  return { min, max };
}

function applyMat(m, v) {
  const [a, b, c, d] = m;
  const out = [0, 0, 0];
  for (let row = 0; row < 3; row++) {
    out[row] = a[row] * v[0] + b[row] * v[1] + c[row] * v[2] + d[row];
  }
  return out;
}

function boundsOfSubtree(node) {
  const list = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    const b = nodeBounds(n);
    if (b) {
      const m = n.getWorldMatrix();
      const corners = [];
      for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) corners.push([x, y, z]);
      const pts = corners.map((c) => applyMat(m, c));
      list.push({
        min: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.min(...pts.map((p) => p[2]))],
        max: [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[2]))],
      });
    }
    for (const child of n.listChildren()) stack.push(child);
  }
  if (!list.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const bb of list) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], bb.min[i]);
      max[i] = Math.max(max[i], bb.max[i]);
    }
  }
  return { min, max };
}

const fmt = (b) => b ? `min=[${b.min.map((v) => v.toFixed(4)).join(', ')}] max=[${b.max.map((v) => v.toFixed(4)).join(', ')}] size=[${b.max.map((v, i) => (v - b.min[i]).toFixed(4)).join(', ')}]` : 'null';

for (const [label, path] of FILES) {
  console.log(`\n=================== ${label} (${path}) ===================`);
  let doc;
  try {
    doc = await io.read(path);
  } catch (e) {
    console.log('READ FAIL:', String(e));
    continue;
  }
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const total = boundsOfSubtree(scene);
  console.log('TOTAL:', fmt(total));
  const walk = (node, depth) => {
    const name = node.getName() || '(unnamed)';
    const b = boundsOfSubtree(node);
    const own = node.getMesh() ? fmt(b) : '';
    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    const tr = t && (t[0] || t[1] || t[2]) ? ` T=[${t.map((v) => v.toFixed(3)).join(',')}]` : '';
    const rr = r && (Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]) > 0.001) ? ` R=[${r.map((v) => v.toFixed(3)).join(',')}]` : '';
    const ss = s && (s[0] !== 1 || s[1] !== 1 || s[2] !== 1) ? ` S=[${s.join(',')}]` : '';
    if (node.getMesh() || name !== '(unnamed)') {
      console.log(`${'  '.repeat(depth)}${name}${tr}${rr}${ss} ${own}`);
    }
    for (const c of node.listChildren()) walk(c, depth + 1);
  };
  for (const child of scene.listChildren()) walk(child, 0);
}
