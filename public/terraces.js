import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// 城内 C2 台榭。规格坐标，进网格时再取 -z。正面朝护城河，yaw：南 0、西 -π/2、北 π、东 π/2。

const DIM = {
  louge: { w: 19.4, h: 12.5, d: 13.4 },
  wanglou: { w: 10.4, h: 16, d: 10.4 },
  changdian: { w: 26, h: 8, d: 13.5 },
};
const PAD = 4;
const ITEMS = [
  { id: "ws-dian", kind: "changdian", scale: 1.02, yaw: 0, plat: 10.2, cx: 48, cz: 23.89, wallDist: 17, ramp: "N", wall: "西城南墙" },
  { id: "ws-lou", kind: "louge", scale: 0.96, yaw: 0, plat: 12.4, cx: 188, cz: 34.43, wallDist: 28, ramp: "N", wall: "西城南墙" },
  { id: "ww-wang", kind: "wanglou", scale: 1.05, yaw: -Math.PI / 2, plat: 13.5, cx: 37.46, cz: 62, wallDist: 32, ramp: "E", wall: "西城西墙" },
  { id: "ww-lou", kind: "louge", scale: 0.94, yaw: -Math.PI / 2, plat: 12, cx: 28.3, cz: 116, wallDist: 22, ramp: "E", wall: "西城西墙" },
  { id: "wn-lou", kind: "louge", scale: 1, yaw: Math.PI / 2, plat: 13.2, cx: 58, cz: 184.3, wallDist: 26, ramp: "S", wall: "西城北墙", turned: true },
  { id: "nw-wang", kind: "wanglou", scale: 1, yaw: -Math.PI / 2, plat: 13.2, cx: 131.2, cz: 308, wallDist: 36, ramp: "E", wall: "北城西墙" },
  { id: "nn-dian", kind: "changdian", scale: 1.06, yaw: Math.PI, plat: 9.6, cx: 152, cz: 354.85, wallDist: 18, ramp: "S", wall: "北城北墙" },
  { id: "nn-wang", kind: "wanglou", scale: 1.08, yaw: Math.PI, plat: 14.2, cx: 214, cz: 326.38, wallDist: 48, ramp: "S", wall: "北城北墙" },
  { id: "ee-lou", kind: "louge", scale: 0.92, yaw: Math.PI / 2, plat: 11.6, cx: 319.84, cz: 33.4, wallDist: 24, ramp: "W", wall: "东城东墙" },
  { id: "ee-dian", kind: "changdian", scale: 1, yaw: Math.PI / 2, plat: 10.5, cx: 327.25, cz: 178, wallDist: 16, ramp: "W", wall: "东城东墙" },
];

function needH(x) {
  return 7.7 + 4.4 * (32 + x) / 32;
}
function aabbOf(it, pad) {
  const hw = DIM[it.kind].w * it.scale * 0.5;
  const hd = DIM[it.kind].d * it.scale * 0.5;
  const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const lx of [-hw, hw]) {
    for (const lz of [-hd, hd]) {
      const x = it.cx + lx * c + lz * s;
      const z = it.cz - (-lx * s + lz * c);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
  }
  return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}
function rampRect(it, box) {
  const run = (it.plat - 0.8) * 2.15;
  const w = 2.4;
  if (it.ramp === "N") return { x0: it.cx - w, x1: it.cx + w, z0: box.z1, z1: box.z1 + run };
  if (it.ramp === "S") return { x0: it.cx - w, x1: it.cx + w, z0: box.z0 - run, z1: box.z0 };
  if (it.ramp === "E") return { x0: box.x1, x1: box.x1 + run, z0: it.cz - w, z1: it.cz + w };
  return { x0: box.x0 - run, x1: box.x0, z0: it.cz - w, z1: it.cz + w };
}
function inflate(r, m) {
  return { x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m };
}
function buildPlan() {
  const rows = ITEMS.map((it) => {
    const box = aabbOf(it, PAD);
    const bld = aabbOf(it, 0);
    const rampBox = rampRect(it, box);
    const top = it.plat + DIM[it.kind].h * it.scale;
    const need = needH(it.wallDist);
    return { ...it, box, bld, rampBox, top, need, exposed: top - need };
  });
  const byId = {};
  rows.forEach((r) => { byId[r.id] = r; });
  const galleries = [
    { id: "g-west", a: byId["ww-wang"], b: byId["ww-lou"], p0: { x: 33, z: byId["ww-wang"].box.z1, y: byId["ww-wang"].plat }, p1: { x: 33, z: byId["ww-lou"].box.z0, y: byId["ww-lou"].plat } },
    { id: "g-north", a: byId["nn-dian"], b: byId["nn-wang"], p0: { x: byId["nn-dian"].box.x1, z: byId["nn-dian"].cz, y: byId["nn-dian"].plat }, p1: { x: byId["nn-wang"].box.x0, z: byId["nn-wang"].cz, y: byId["nn-wang"].plat } },
  ];
  const nw = byId["nw-wang"], nd = byId["nn-dian"];
  const xa = Math.max(nw.box.x0, nd.box.x0) + 1.55;
  const xb = Math.min(nw.box.x1, nd.box.x1) - 1.55;
  if (xb > xa + 0.2) {
    const gx = (xa + xb) * 0.5;
    galleries.push({ id: "g-corner", a: nw, b: nd, p0: { x: gx, z: nw.box.z1, y: nw.plat }, p1: { x: gx, z: nd.box.z0, y: nd.plat } });
  }
  const blocks = [];
  for (const r of rows) {
    const ax = r.ramp === "E" ? 1 : r.ramp === "W" ? -1 : 0;
    const az = r.ramp === "N" ? 1 : r.ramp === "S" ? -1 : 0;
    blocks.push({ ...inflate(r.box, 9), ax, az, name: r.id });
    blocks.push({ ...inflate(r.rampBox, 9), ax, az, name: r.id + "-ramp" });
  }
  for (const g of galleries) {
    const x0 = Math.min(g.p0.x, g.p1.x) - 11, x1 = Math.max(g.p0.x, g.p1.x) + 11;
    const z0 = Math.min(g.p0.z, g.p1.z) - 11, z1 = Math.max(g.p0.z, g.p1.z) + 11;
    blocks.push({ x0, x1, z0, z1, ax: 0, az: -1, name: g.id });
    g.len = Math.hypot(g.p1.x - g.p0.x, g.p1.z - g.p0.z);
  }
  return { rows, galleries, blocks };
}
const PLAN = buildPlan();
export const terraceKeepOut = PLAN.blocks;

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function paintBox(g, fn) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), -p.getZ(i));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
function boxGeom(x, y, z, sx, sy, sz, segx, segy, segz) {
  const g = new THREE.BoxGeometry(sx, sy, sz, segx || 1, segy || 1, segz || 1);
  g.translate(x, y + sy * 0.5, -z);
  return g;
}
function plasterColor(x, y, z, rect) {
  let r = 0.910, g = 0.875, b = 0.800;
  const macro = noise(x * 0.035, z * 0.035) * 0.55 + noise(x * 0.012 + 4, z * 0.012) * 0.45;
  const k = 0.88 + 0.18 * macro;
  r *= k; g *= k; b *= k;
  const streak = noise(x * 0.55 + z * 0.55, y * 0.08);
  if (streak > 0.72) {
    const s = (streak - 0.72) / 0.28;
    r *= 1 - 0.22 * s; g *= 1 - 0.18 * s; b *= 1 - 0.12 * s;
  }
  const foot = 1 - clamp((y - 2.0) / 1.6, 0, 1);
  r = r * (1 - foot) + 0.62 * foot;
  g = g * (1 - foot) + 0.56 * foot;
  b = b * (1 - foot) + 0.46 * foot;
  const peel = noise(x * 0.17 + 2.2, y * 0.21 + z * 0.05);
  if (peel > 0.78) {
    const s = clamp((peel - 0.78) / 0.18, 0, 1);
    r = r * (1 - s) + 0.659 * s;
    g = g * (1 - s) + 0.596 * s;
    b = b * (1 - s) + 0.478 * s;
  }
  const dxe = Math.min(x - rect.x0, rect.x1 - x);
  const dze = Math.min(z - rect.z0, rect.z1 - z);
  const wear = 1 - clamp((dxe + dze) / 0.85, 0, 1);
  r *= 1 - 0.12 * wear; g *= 1 - 0.1 * wear; b *= 1 - 0.08 * wear;
  if (y > 6.3 && y < 7.5) {
    const u = clamp((y - 6.3) / 0.25, 0, 1) * clamp((7.5 - y) / 0.25, 0, 1);
    const fade = 0.45 + 0.55 * noise(x * 0.11 + 8, z * 0.11);
    const chip = noise(x * 0.37, y * 1.7 + z * 0.2) > 0.82 ? 0.25 : 1;
    const s = u * fade * chip;
    r = r * (1 - s) + 0.557 * s;
    g = g * (1 - s) + 0.165 * s;
    b = b * (1 - s) + 0.125 * s;
  }
  return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
}
function earthColor(x, y, z) {
  const band = 0.92 + 0.1 * hash(Math.floor(y / 0.48), 3.3);
  const n = 0.94 + 0.1 * noise(x * 0.08, z * 0.08);
  return [clamp(0.659 * band * n, 0, 1), clamp(0.596 * band * n, 0, 1), clamp(0.478 * band * n, 0, 1)];
}
function wedge(x0, x1, z0, z1, y0, y1, alongZ) {
  const g = new THREE.BufferGeometry();
  const yb = 0.82;
  let a, b, c, d;
  if (alongZ) {
    a = [x0, y0, z0]; b = [x1, y0, z0]; c = [x0, y1, z1]; d = [x1, y1, z1];
  } else {
    a = [x0, y0, z0]; b = [x0, y0, z1]; c = [x1, y1, z0]; d = [x1, y1, z1];
  }
  const e = [a[0], yb, a[2]], f = [b[0], yb, b[2]], h = [c[0], yb, c[2]], i = [d[0], yb, d[2]];
  const P = [a, b, d, a, d, c, e, h, f, f, h, i, a, c, e, e, c, h, b, f, d, d, f, i, a, e, b, b, e, f, c, d, h, h, d, i];
  const pos = new Float32Array(P.length * 3);
  P.forEach((p, n) => { pos[n * 3] = p[0]; pos[n * 3 + 1] = p[1]; pos[n * 3 + 2] = -p[2]; });
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const uv = new Float32Array(P.length * 2);
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

function mergeAll(list) {
  const conv = list.map((g) => {
    const o = g.index ? g.toNonIndexed() : g;
    if (!o.getAttribute("uv")) {
      o.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(o.getAttribute("position").count * 2), 2));
    }
    return o;
  });
  const g = mergeGeometries(conv, false);
  g.computeBoundingSphere();
  return g;
}

function safeMat(color, rough, key, vertex) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: 0, vertexColors: !!vertex, side: THREE.DoubleSide,
  });
  mat.precision = "highp";
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  float ok = float(c.r == c.r && c.g == c.g && c.b == c.b);
  diffuseColor.rgb = mix(vec3(0.55, 0.50, 0.42), clamp(c, vec3(0.0), vec3(1.2)), ok);
}`);
  };
  return mat;
}

function roofBay() {
  const g = new THREE.BufferGeometry();
  const yR = 1.05, yE = 0.28, xE = 2.15, z0 = -2, z1 = 2;
  const pts = [
    [-xE, yE, z0], [0, yR, z0], [0, yR, z1], [-xE, yE, z1],
    [xE, yE, z0], [0, yR, z0], [0, yR, z1], [xE, yE, z1],
    [-xE, yE, z0], [-xE, yE - 0.08, z0], [-xE, yE - 0.08, z1], [-xE, yE, z1],
    [xE, yE, z1], [xE, yE - 0.08, z1], [xE, yE - 0.08, z0], [xE, yE, z0],
  ];
  const idx = [];
  for (let f = 0; f < 4; f++) {
    const o = f * 4;
    idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  const pos = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function basisMatrix(x, y, z, dx, dy, dz) {
  const fwd = new THREE.Vector3(dx, dy, -dz);
  const fl = Math.max(1e-5, fwd.length());
  fwd.multiplyScalar(1 / fl);
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(fwd, up);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  side.normalize();
  const realUp = new THREE.Vector3().crossVectors(side, fwd).normalize();
  const m = new THREE.Matrix4().makeBasis(side, realUp, fwd);
  m.setPosition(x, y, -z);
  return m;
}

export function buildTerraces(ctx) {
  const { scene, isPhone, shadow, flagTex } = ctx;
  const root = new THREE.Group();
  root.name = "terraceC2";
  root.layers.set(1);
  scene.add(root);
  const { rows, galleries } = PLAN;
  const plasterG = [];
  const earthG = [];
  const woodG = [];
  for (const r of rows) {
    const b = r.box;
    const sx = b.x1 - b.x0, sz = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) * 0.5, cz = (b.z0 + b.z1) * 0.5;
    const base = boxGeom(cx, 0.82, cz, sx + 0.64, 1.2, sz + 0.64);
    paintBox(base, (x, y, z) => earthColor(x, y, z));
    earthG.push(base);
    const shaftH = Math.max(0.4, r.plat - 2.02);
    const shaft = boxGeom(cx, 2.02, cz, sx, shaftH, sz, 4, 8, 4);
    paintBox(shaft, (x, y, z) => plasterColor(x, y, z, b));
    plasterG.push(shaft);
    const eave = boxGeom(cx, r.plat - 0.28, cz, sx + 0.8, 0.28, sz + 0.8, 4, 1, 4);
    paintBox(eave, (x, y, z) => plasterColor(x, y, z, inflate(b, 0.4)));
    plasterG.push(eave);
    const rm = r.rampBox;
    let wedgeG;
    if (r.ramp === "N" || r.ramp === "S") {
      const zLo = Math.min(rm.z0, rm.z1), zHi = Math.max(rm.z0, rm.z1);
      wedgeG = r.ramp === "N"
        ? wedge(rm.x0, rm.x1, zLo, zHi, r.plat, 0.86, true)
        : wedge(rm.x0, rm.x1, zHi, zLo, r.plat, 0.86, true);
    } else {
      wedgeG = wedge(r.ramp === "E" ? rm.x0 : rm.x1, r.ramp === "E" ? rm.x1 : rm.x0, rm.z0, rm.z1, r.plat, 0.86, false);
    }
    paintBox(wedgeG, (x, y, z) => earthColor(x, y, z));
    earthG.push(wedgeG);
    const stepR = 1.45;
    for (let x = b.x0 + 0.6; x < b.x1 - 0.2; x += stepR) {
      woodG.push(boxGeom(x, r.plat - 0.42, b.z0 - 0.15, 0.12, 0.16, 0.42));
      woodG.push(boxGeom(x, r.plat - 0.42, b.z1 + 0.15, 0.12, 0.16, 0.42));
    }
    for (let z = b.z0 + 0.6; z < b.z1 - 0.2; z += stepR) {
      woodG.push(boxGeom(b.x0 - 0.15, r.plat - 0.42, z, 0.42, 0.16, 0.12));
      woodG.push(boxGeom(b.x1 + 0.15, r.plat - 0.42, z, 0.42, 0.16, 0.12));
    }
    const openings = (edge) => {
      const gaps = [];
      if (edge === "S" && r.ramp === "S") gaps.push([r.cx - 2.6, r.cx + 2.6]);
      if (edge === "N" && r.ramp === "N") gaps.push([r.cx - 2.6, r.cx + 2.6]);
      if (edge === "W" && r.ramp === "W") gaps.push([r.cz - 2.6, r.cz + 2.6]);
      if (edge === "E" && r.ramp === "E") gaps.push([r.cz - 2.6, r.cz + 2.6]);
      for (const g of galleries) {
        for (const p of [g.p0, g.p1]) {
          if (Math.abs(p.y - r.plat) > 0.5) continue;
          if (edge === "N" && Math.abs(p.z - b.z1) < 1.2) gaps.push([p.x - 1.9, p.x + 1.9]);
          if (edge === "S" && Math.abs(p.z - b.z0) < 1.2) gaps.push([p.x - 1.9, p.x + 1.9]);
          if (edge === "E" && Math.abs(p.x - b.x1) < 1.2) gaps.push([p.z - 1.9, p.z + 1.9]);
          if (edge === "W" && Math.abs(p.x - b.x0) < 1.2) gaps.push([p.z - 1.9, p.z + 1.9]);
        }
      }
      return gaps;
    };
    const hit = (gaps, v) => gaps.some(([a, c]) => v > a && v < c);
    const gapN = openings("N"), gapS = openings("S"), gapE = openings("E"), gapW = openings("W");
    const rail = (x, z, edge) => {
      const gaps = edge === "N" ? gapN : edge === "S" ? gapS : edge === "E" ? gapE : gapW;
      const v = edge === "N" || edge === "S" ? x : z;
      if (hit(gaps, v)) return;
      woodG.push(boxGeom(x, r.plat, z, 0.12, 0.86, 0.12));
    };
    for (let x = b.x0 + 0.3; x <= b.x1 - 0.2; x += 1.7) {
      rail(x, b.z0 + 0.28, "S");
      rail(x, b.z1 - 0.28, "N");
    }
    for (let z = b.z0 + 1.6; z <= b.z1 - 1.4; z += 1.7) {
      rail(b.x0 + 0.28, z, "W");
      rail(b.x1 - 0.28, z, "E");
    }
    const spans = (a, c, gaps) => {
      const cuts = [a, c];
      for (const [g0, g1] of gaps) {
        const u0 = Math.max(a, g0), u1 = Math.min(c, g1);
        if (u1 > u0) cuts.push(u0, u1);
      }
      const pts = [...new Set(cuts.map((v) => +v.toFixed(3)))].sort((p, q) => p - q);
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        if (pts[i + 1] - pts[i] < 0.35) continue;
        const mid = (pts[i] + pts[i + 1]) * 0.5;
        if (!hit(gaps, mid)) out.push([pts[i], pts[i + 1]]);
      }
      return out;
    };
    const barX = (z, edge) => {
      const gaps = edge === "N" ? gapN : gapS;
      for (const [x0, x1] of spans(b.x0 + 0.4, b.x1 - 0.4, gaps)) {
        const xm = (x0 + x1) * 0.5, w = x1 - x0;
        woodG.push(boxGeom(xm, r.plat + 0.42, z, w, 0.07, 0.08));
        woodG.push(boxGeom(xm, r.plat + 0.78, z, w, 0.07, 0.08));
      }
    };
    const barZ = (x, edge) => {
      const gaps = edge === "W" ? gapW : gapE;
      for (const [z0, z1] of spans(b.z0 + 0.4, b.z1 - 0.4, gaps)) {
        const zm = (z0 + z1) * 0.5, d = z1 - z0;
        woodG.push(boxGeom(x, r.plat + 0.42, zm, 0.08, 0.07, d));
        woodG.push(boxGeom(x, r.plat + 0.78, zm, 0.08, 0.07, d));
      }
    };
    barX(b.z0 + 0.28, "S");
    barX(b.z1 - 0.28, "N");
    barZ(b.x0 + 0.28, "W");
    barZ(b.x1 - 0.28, "E");
  }
  const plaster = mergeAll(plasterG);
  const earth = mergeAll(earthG);
  const wood = mergeAll(woodG);
  const mp = new THREE.Mesh(plaster, safeMat(0xffffff, 0.94, "terrace-plaster-c2", true));
  const me = new THREE.Mesh(earth, safeMat(0xffffff, 0.96, "terrace-earth-c2", true));
  const mw = new THREE.Mesh(wood, safeMat(0x4a3226, 0.92, "terrace-wood-c2", false));
  mp.name = "terracePlaster"; me.name = "terraceEarth"; mw.name = "terraceWood";
  mp.castShadow = me.castShadow = mw.castShadow = false;
  mp.receiveShadow = me.receiveShadow = mw.receiveShadow = shadow;
  root.add(mp, me, mw);

  const columnGeo = new THREE.CylinderGeometry(0.2, 0.24, 1, 6);
  columnGeo.translate(0, 0.5, 0);
  const deckGeo = new THREE.BoxGeometry(3, 0.22, 1);
  const railGeo = new THREE.BoxGeometry(1, 1, 1);
  railGeo.translate(0, 0.5, 0);
  const cols = [], decks = [], rails = [], roofs = [];
  const insidePlat = (x, z) => rows.some((r) => x > r.box.x0 + 0.4 && x < r.box.x1 - 0.4 && z > r.box.z0 + 0.4 && z < r.box.z1 - 0.4);
  for (const g of galleries) {
    const dx = g.p1.x - g.p0.x, dz = g.p1.z - g.p0.z, dy = g.p1.y - g.p0.y;
    const len = Math.max(1, Math.hypot(dx, dz));
    const n = Math.max(1, Math.round(len / 4));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) * 0.5;
      const seg = len / n;
      const x = g.p0.x + dx * tm, z = g.p0.z + dz * tm, y = g.p0.y + dy * tm;
      decks.push(basisMatrix(x, y - 0.11, z, dx, dy, dz).scale(new THREE.Vector3(1, 1, seg)));
      roofs.push(basisMatrix(x, y + 0.92, z, dx, dy, dz).scale(new THREE.Vector3(1, 1, seg / 4)));
      if (i === 0) continue;
      const xc = g.p0.x + dx * t0, zc = g.p0.z + dz * t0, yc = g.p0.y + dy * t0;
      if (insidePlat(xc, zc)) continue;
      const fl = Math.max(1e-5, Math.hypot(dx, dz));
      const sx = dz / fl, sz = -dx / fl;
      for (const s of [-1.35, 1.35]) {
        const px = xc + sx * s, pz = zc + sz * s;
        const h = Math.max(0.6, yc + 1.2 - 0.82);
        const m = new THREE.Matrix4().makeTranslation(px, 0.82, -pz);
        m.multiply(new THREE.Matrix4().makeScale(1, h, 1));
        cols.push(m);
      }
      for (const s of [-1.48, 1.48]) {
        const px = xc + sx * s, pz = zc + sz * s;
        const pm = new THREE.Matrix4().makeTranslation(px, y, -pz);
        pm.multiply(new THREE.Matrix4().makeScale(0.1, 0.9, 0.1));
        rails.push(pm);
      }
    }
    const fl = Math.max(1e-5, Math.hypot(dx, dz));
    const sx = dz / fl, sz = -dx / fl;
    for (const s of [-1.48, 1.48]) {
      const mx = (g.p0.x + g.p1.x) * 0.5 + sx * s;
      const mz = (g.p0.z + g.p1.z) * 0.5 + sz * s;
      const my = (g.p0.y + g.p1.y) * 0.5;
      rails.push(basisMatrix(mx, my + 0.42, mz, dx, dy * 0.15, dz).scale(new THREE.Vector3(0.08, 0.08, len)));
      rails.push(basisMatrix(mx, my + 0.82, mz, dx, dy * 0.15, dz).scale(new THREE.Vector3(0.08, 0.08, len)));
    }
  }
  function inst(geo, mat, mats, name) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
    mesh.name = name;
    mesh.count = mats.length;
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = shadow;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  }
  const colMat = safeMat(0x9e2b1f, 0.78, "terrace-column-c2", false);
  const deckMat = safeMat(0x4a3226, 0.9, "terrace-deck-c2", false);
  const roofMat = safeMat(0x5e6468, 0.95, "terrace-roof-c2", false);
  inst(columnGeo, colMat, cols, "terraceColumn");
  inst(deckGeo, deckMat, decks, "terraceDeck");
  inst(railGeo, deckMat, rails, "terraceRail");
  inst(roofBay(), roofMat, roofs, "terraceRoof");

  const flagMat = new THREE.MeshStandardMaterial({
    map: flagTex, alphaTest: 0.4, side: THREE.DoubleSide, shadowSide: THREE.FrontSide, roughness: 0.9, metalness: 0,
  });
  flagMat.precision = "highp";
  flagMat.customProgramCacheKey = () => "terrace-flag-c2";
  flagMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: new THREE.Vector2(1, 0.7) };
    flagMat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
uniform float uTime;
uniform vec2 uWind;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 i0 = vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z);
  vec3 i1 = vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z);
  vec3 i2 = vec3(instanceMatrix[2].x, instanceMatrix[2].y, instanceMatrix[2].z);
  float sx = max(length(i0), 1e-4);
  float sy = max(length(i1), 1e-4);
  float sz = max(length(i2), 1e-4);
  vec3 ax = i0 / sx;
  vec3 ay = i1 / sy;
  vec3 az = i2 / sz;
  vec3 root = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float down = clamp(-position.y, 0.0, 1.0);
  float phase = fract(sin(dot(root.xz, vec2(127.1, 311.7))) * 43758.5453) * 6.2831853;
  float wlen = max(length(uWind), 1e-4);
  vec2 wdir = uWind / wlen;
  float th = uTime * 1.15 + phase - dot(root.xz, wdir) * 0.85 - down * 3.0;
  float wave = sin(th) * 0.62 + sin(th * 0.55 + phase) * 0.28;
  float gust = 0.4 + 0.6 * pow(max(sin(uTime * 0.23 + root.x * 0.01), 0.0), 0.5);
  vec3 woff = vec3(wdir.x, 0.0, wdir.y) * down * gust * wave * 0.85;
  transformed.x += dot(woff, ax) / sx;
  transformed.y += dot(woff, ay) / sy;
  transformed.z += dot(woff, az) / sz;
#endif`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r)) c = vec3(0.45, 0.12, 0.08);
  diffuseColor.rgb = clamp(c, vec3(0.0), vec3(1.2));
}`);
  };
  const flagGeo = new THREE.PlaneGeometry(1, 1, isPhone ? 4 : 8, isPhone ? 8 : 16);
  flagGeo.translate(0, -0.5, 0.15);
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 1, 6);
  poleGeo.translate(0, 0.5, 0);
  const flags = [];
  const poles = [];
  const dummy = new THREE.Object3D();
  for (const r of rows) {
    if (r.kind !== "wanglou") continue;
    const yaw = r.yaw;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const lx = 1.6, lz = 2.2;
    const x = r.cx + lx * c + lz * s;
    const z = r.cz + lx * s - lz * c;
    const yb = r.plat + (r.top - r.plat) * 0.7;
    dummy.position.set(x, yb, -z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 6.4, 1);
    dummy.updateMatrix();
    poles.push(dummy.matrix.clone());
    dummy.position.set(x, yb + 6.4, -z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1.45, 1.45 * (1536 / 448), 1);
    dummy.updateMatrix();
    flags.push(dummy.matrix.clone());
  }
  const flagMesh = inst(flagGeo, flagMat, flags, "terraceFlag");
  inst(poleGeo, safeMat(0x4a3226, 0.9, "terrace-pole-c2", false), poles, "terracePole");

  const brazierSpots = [];
  rows.forEach((r, i) => {
    const n = r.kind === "wanglou" ? 1 : 2;
    const b = r.box;
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0.68 : 0.3 + k * 0.4;
      let x = b.x0 + (b.x1 - b.x0) * u;
      let z = b.z0 + (b.z1 - b.z0) * u;
      if (r.ramp === "N" || r.ramp === "S") z = r.ramp === "N" ? b.z0 + 2.2 : b.z1 - 2.2;
      else x = r.ramp === "E" ? b.x0 + 2.2 : b.x1 - 2.2;
      if (Math.abs(x - r.cx) < 1.2 && Math.abs(z - r.cz) < 1.2) x += 2.4;
      brazierSpots.push({ x, z, y: r.plat });
    }
    if (i === 0) void n;
  });

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const levelNames = ["lod0", "lod1", "lod2"];
  const wanted = isPhone ? [1, 2] : [0, 1, 2];
  function prep(gltf) {
    const geos = [];
    let mat = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      for (const name of ["position", "normal"]) {
        const a = g.attributes[name];
        if (a && !(a.array instanceof Float32Array)) {
          const f = new Float32Array(a.count * a.itemSize);
          for (let i = 0; i < a.count; i++) {
            f[i * a.itemSize] = a.getX(i);
            if (a.itemSize > 1) f[i * a.itemSize + 1] = a.getY(i);
            if (a.itemSize > 2) f[i * a.itemSize + 2] = a.getZ(i);
          }
          g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
        }
      }
      g.applyMatrix4(o.matrixWorld);
      geos.push(g);
      if (!mat) mat = Array.isArray(o.material) ? o.material[0] : o.material;
    });
    const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    g.computeBoundingBox();
    return { geometry: g, material: mat, size: g.boundingBox.getSize(new THREE.Vector3()) };
  }
  function dressLod(src, key, hasColor) {
    const mat = src.clone();
    mat.side = THREE.FrontSide;
    mat.shadowSide = THREE.FrontSide;
    mat.metalness = 0;
    mat.vertexColors = !!hasColor;
    if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
    mat.precision = "highp";
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
attribute float aKeep;
varying float vKeep;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
  vKeep = aKeep;
  if (!(vKeep == vKeep)) vKeep = 1.0;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
varying float vKeep;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
{
  float k = vKeep;
  if (!(k == k)) k = 1.0;
  float mag = abs(k);
  if (mag <= 0.004) discard;
  if (mag < 0.996) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (!(dith == dith)) dith = 0.0;
    if (k >= 0.0) {
      if (dith > mag) discard;
    } else if (dith < (1.0 - mag)) {
      discard;
    }
  }
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.45, 0.38, 0.28);
  diffuseColor.rgb = clamp(c, vec3(0.0), vec3(1.2));
}`);
    };
    return mat;
  }
  const kinds = ["louge", "wanglou", "changdian"];
  const buckets = [];
  const loadLevel = (name, li) => new Promise((resolve, reject) => {
    loader.load("/models/" + name + "_" + levelNames[li] + ".glb", resolve, undefined, reject);
  }).then(prep);

  const brazierP = new Promise((resolve, reject) => {
    loader.load("/models/brazier_web.glb", resolve, undefined, reject);
  }).then((gltf) => {
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    const geo = src.geometry.clone();
    geo.applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const bh = Math.max(1e-4, bb.max.y - bb.min.y);
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.scale(0.9 / bh, 0.9 / bh, 0.9 / bh);
    const mat = (Array.isArray(src.material) ? src.material[0] : src.material).clone();
    if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
    mat.precision = "highp";
    mat.customProgramCacheKey = () => "terrace-brazier-c2";
    const mesh = new THREE.InstancedMesh(geo, mat, brazierSpots.length);
    mesh.name = "terraceBrazier";
    mesh.count = brazierSpots.length;
    brazierSpots.forEach((p, i) => {
      dummy.position.set(p.x, p.y, -p.z);
      dummy.rotation.set(0, p.x * 0.2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = shadow;
    mesh.frustumCulled = false;
    root.add(mesh);
    const flameGeo = new THREE.SphereGeometry(0.22, 6, 5);
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 0.8, roughness: 0.45,
    });
    flameMat.precision = "highp";
    flameMat.customProgramCacheKey = () => "terrace-brazier-flame-c2";
    flameMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      {
        float emax = max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b));
        if (!(emax < 6.0)) totalEmissiveRadiance = vec3(0.0);
        else totalEmissiveRadiance = min(totalEmissiveRadiance, vec3(3.5));
      }`);
    };
    const flames = new THREE.InstancedMesh(flameGeo, flameMat, brazierSpots.length);
    flames.name = "terraceFlame";
    flames.count = brazierSpots.length;
    flames.frustumCulled = false;
    flames.castShadow = false;
    root.add(flames);
    return { flames, flameMat };
  });

  const buildingP = Promise.all(kinds.map((name) => Promise.all(wanted.map((li) => loadLevel(name, li))).then((levels) => {
    const spots = rows.filter((r) => r.kind === name);
    const meshes = [null, null, null];
    wanted.forEach((li, i) => {
      const hasColor = !!levels[i].geometry.getAttribute("color");
      const mat = dressLod(levels[i].material, "terrace-" + name + "-" + levelNames[li] + (isPhone ? "-p" : "") + "-front", hasColor);
      const keep = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, spots.length)), 1);
      keep.setUsage(THREE.DynamicDrawUsage);
      levels[i].geometry.setAttribute("aKeep", keep);
      const m = new THREE.InstancedMesh(levels[i].geometry, mat, Math.max(1, spots.length));
      m.name = "terrace" + name + levelNames[li];
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = !!shadow;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(m);
      meshes[li] = m;
    });
    const matrices = spots.map((sp) => {
      dummy.position.set(sp.cx, sp.plat, -sp.cz);
      dummy.rotation.set(0, sp.yaw, 0);
      dummy.scale.setScalar(sp.scale);
      dummy.updateMatrix();
      return { m: dummy.matrix.clone(), sp, lod: null, pend: null, fade: 1 };
    });
    buckets.push({ name, meshes, matrices, wanted });
    return { name, size: [+levels[0].size.x.toFixed(2), +levels[0].size.y.toFixed(2), +levels[0].size.z.toFixed(2)] };
  })));

  let flameState = null;
  let terraceClock = performance.now();
  function pickBuildingLod(dist, prev) {
    if (!(dist >= 0)) return prev == null ? (isPhone ? 1 : 0) : prev;
    const a = 150, b = 500, h = 16;
    if (isPhone) {
      if (prev === 2) return dist < b - h ? 1 : 2;
      return dist > b + h ? 2 : 1;
    }
    if (prev == null) return dist < a ? 0 : dist < b ? 1 : 2;
    if (prev === 0) return dist > a + h ? 1 : 0;
    if (prev === 2) return dist < b - h ? 1 : 2;
    if (dist < a - h) return 0;
    if (dist > b + h) return 2;
    return 1;
  }
  function advanceBuilding(it, dist, dt) {
    const target = pickBuildingLod(dist, it.lod);
    if (it.lod == null) {
      it.lod = target;
      it.pend = null;
      it.fade = 1;
      return;
    }
    if (it.pend == null) {
      if (target !== it.lod) {
        it.pend = target;
        it.fade = 0;
      }
      return;
    }
    if (target === it.lod) {
      it.pend = null;
      it.fade = 1;
      return;
    }
    it.fade += dt / 0.42;
    if (!(it.fade >= 0)) it.fade = 0;
    if (it.fade >= 1) {
      it.lod = it.pend;
      it.pend = null;
      it.fade = 1;
    }
  }
  window.__tickTerrace = (cam) => {
    root.traverse((o) => { if (!o.layers.isEnabled(1) || o.layers.mask !== 2) o.layers.set(1); });
    if (cam) cam.layers.enable(1);
    if (flagMat.userData.shader) flagMat.userData.shader.uniforms.uTime.value = performance.now() * 0.001;
    if (!cam) return;
    const now = performance.now();
    let dt = (now - terraceClock) / 1000;
    terraceClock = now;
    if (!(dt > 0)) dt = 0.016;
    else if (dt > 0.1) dt = 0.1;
    const c = cam.position;
    for (const b of buckets) {
      const lists = [[], [], []];
      for (const it of b.matrices) {
        const e = it.m.elements;
        const dist = Math.hypot(e[12] - c.x, e[13] - c.y, e[14] - c.z);
        advanceBuilding(it, dist, dt);
        if (it.pend == null) {
          lists[it.lod].push({ it, keep: 1 });
        } else {
          const outK = 1 - it.fade;
          if (outK > 0.02) lists[it.lod].push({ it, keep: outK });
          if (it.fade > 0.02) lists[it.pend].push({ it, keep: -it.fade });
        }
      }
      b.meshes.forEach((m, li) => {
        if (!m) return;
        const list = lists[li];
        m.count = list.length;
        m.visible = list.length > 0;
        const attr = m.geometry.getAttribute("aKeep");
        list.forEach((row, i) => {
          m.setMatrixAt(i, row.it.m);
          if (attr) attr.setX(i, row.keep);
        });
        if (list.length) {
          m.instanceMatrix.needsUpdate = true;
          if (attr) attr.needsUpdate = true;
        }
      });
    }
    if (flameState) {
      const sc = window.__brazierAmt > 0.04 ? 0.35 + window.__brazierAmt * 0.9 : 0;
      flameState.flameMat.emissiveIntensity = Math.min(2.8, Math.max(0, (window.__brazierAmt || 0) * 2.2));
      brazierSpots.forEach((p, i) => {
        dummy.position.set(p.x, p.y + 0.72, -p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        flameState.flames.setMatrixAt(i, dummy.matrix);
      });
      flameState.flames.instanceMatrix.needsUpdate = true;
      flameState.flames.visible = sc > 0.02;
    }
  };

  Promise.all([buildingP, brazierP]).then(([info, flames]) => {
    flameState = flames;
    const draws = [];
    root.traverse((o) => { if (o.isMesh) draws.push(o.name); });
    window.__terrace = {
      ready: true,
      phone: !!isPhone,
      rows: rows.map((r) => ({
        id: r.id, kind: r.kind, wall: r.wall, x: +r.cx.toFixed(1), z: +r.cz.toFixed(1),
        yaw: +r.yaw.toFixed(3), scale: r.scale, plat: r.plat, wallDist: r.wallDist,
        top: +r.top.toFixed(2), need: +r.need.toFixed(2), exposed: +r.exposed.toFixed(2),
        turned: !!r.turned,
        box: { x0: +r.box.x0.toFixed(1), x1: +r.box.x1.toFixed(1), z0: +r.box.z0.toFixed(1), z1: +r.box.z1.toFixed(1) },
      })),
      galleries: galleries.map((g) => ({ id: g.id, len: +g.len.toFixed(1), y0: g.p0.y, y1: g.p1.y })),
      braziers: brazierSpots.length,
      flags: flags.length,
      sizes: info,
      meshNames: draws,
      keep: terraceKeepOut.length,
    };
    window.__terraceReady = true;
  }).catch((err) => {
    window.__bootErr = "terrace " + (err && err.message ? err.message : err);
    console.error(err);
  });
  window.__terrace = {
    ready: false,
    rows: rows.map((r) => ({
      id: r.id, kind: r.kind, wall: r.wall, x: +r.cx.toFixed(1), z: +r.cz.toFixed(1),
      plat: r.plat, wallDist: r.wallDist, top: +r.top.toFixed(2), need: +r.need.toFixed(2),
      exposed: +r.exposed.toFixed(2), turned: !!r.turned,
    })),
    galleries: galleries.map((g) => ({ id: g.id, len: +g.len.toFixed(1) })),
  };
}
