import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// 城北 N1：湖、芦苇荡、堤道。规格坐标，进网格时再取 -z。

const LAKE_X0 = 92;
const LAKE_X1 = 338;
const REED_UV = [
  { u0: 0.0029, u1: 0.2466, vb: 0.0059, vt: 0.6367, woh: 0.772 },
  { u0: 0.2529, u1: 0.4971, vb: 0.0059, vt: 0.6807, woh: 0.724 },
  { u0: 0.5029, u1: 0.7471, vb: 0.0059, vt: 0.5205, woh: 0.949 },
  { u0: 0.7529, u1: 0.9971, vb: 0.0059, vt: 0.6729, woh: 0.732 },
];
const GRASS_UV = [
  { u0: 0.083, u1: 0.25, vb: 0.5039, vt: 0.9941, woh: 0.681, kind: "grass" },
  { u0: 0.4053, u1: 0.5933, vb: 0.5039, vt: 0.9941, woh: 0.767, kind: "grass" },
  { u0: 0.7393, u1: 0.9258, vb: 0.5039, vt: 0.9932, woh: 0.762, kind: "grass" },
  { u0: 0.0239, u1: 0.3091, vb: 0.0039, vt: 0.4941, woh: 1.163, kind: "shrub" },
  { u0: 0.3706, u1: 0.6284, vb: 0.0039, vt: 0.4941, woh: 1.052, kind: "shrub" },
  { u0: 0.7056, u1: 0.9595, vb: 0.0039, vt: 0.4941, woh: 1.036, kind: "shrub" },
];
const GAPS = [[150, 172], [192, 222], [250, 272]];

let ready = false;
let builtPhone = false;
let northRoot = null;
let updateTrees = null;
const cullList = [];
let edgeSamples = [];
let ditchPts = [];
let cause = null;
let cross = { x: 470, z: 507, t: 0 };
let _inWater = () => false;
let _edgeDist = () => 99;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function slopeWidthAt(x, z) {
  const t = 0.5 + 0.5 * Math.sin(x * 0.019 + z * 0.014 + 0.6);
  return 4 + 6 * t;
}
function crestHeight(x, z) {
  const n = Math.sin(x * 0.021 + 0.3) * 0.62 + Math.sin(z * 0.017 - 0.8) * 0.38;
  return 0.8 + (n * 0.5 + 0.5) * 1.5;
}
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function lin(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
const COL = {
  wet: lin(0x6e6450),
  dry: lin(0x8a7a58),
  mud: lin(0x5a5144),
  road: lin(0x7e7058),
  rut: lin(0x655848),
  wood: lin(0x4a3226),
};

function waterEdgeZ(x) {
  const s = edgeSamples;
  if (!s.length) return 440;
  if (x <= s[0].x) return s[0].z;
  const last = s[s.length - 1];
  if (x >= last.x) return last.z;
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (s[m].x <= x) lo = m; else hi = m;
  }
  const t = (x - s[lo].x) / Math.max(1e-4, s[hi].x - s[lo].x);
  return s[lo].z + (s[hi].z - s[lo].z) * t;
}
function shoreGap(x) {
  const wob = 7 * Math.sin(x * 0.027 + 0.4) + 3 * Math.sin(x * 0.071 + 2.1);
  return clamp(49 + wob, 40, 60);
}
function southShoreZ(x) { return waterEdgeZ(x) + shoreGap(x); }
function northShoreZ(x) {
  const zs = southShoreZ(x);
  const u = clamp((x - LAKE_X0) / (LAKE_X1 - LAKE_X0), 0, 1);
  const taper = Math.sin(Math.PI * u);
  let w = 88 + 10 * Math.sin((x - 90) * 0.021);
  const pen = 24 * Math.exp(-((x - 168) * (x - 168)) / 520);
  const bay = 16 * Math.exp(-((x - 258) * (x - 258)) / 780);
  w = (w - pen + bay) * (0.62 + 0.38 * taper);
  return zs + w;
}
function fingerHit(x, z) {
  if (x > 148) return 2;
  const zs = southShoreZ(clamp(x, LAKE_X0, LAKE_X1));
  const zn = northShoreZ(clamp(x, LAKE_X0, LAKE_X1));
  const cz = zs + (zn - zs) * 0.58;
  return Math.hypot((x - 116) / 15, (z - cz) / 9);
}
function lakeSigned(x, z) {
  if (_inWater(x, z)) return -30;
  if (x < LAKE_X0 - 24 || x > LAKE_X1 + 24) return -30;
  const xc = clamp(x, LAKE_X0, LAKE_X1);
  const zs = southShoreZ(xc);
  const zn = northShoreZ(xc);
  let d = Math.min(z - zs, zn - z, x - LAKE_X0, LAKE_X1 - x);
  const finger = fingerHit(x, z);
  if (x < 150) d = Math.min(d, (finger - 1) * 9);
  return d;
}
function lakeInside(x, z) { return lakeSigned(x, z) > 0; }
function northBandW(x) {
  return 34 + 22 * (0.5 + 0.5 * Math.sin(x * 0.019 + 1.2));
}
function ditchDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < ditchPts.length - 1; i++) {
    const ax = ditchPts[i][0], az = ditchPts[i][1];
    const bx = ditchPts[i + 1][0], bz = ditchPts[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = clamp(t, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}
function causeQuery(x, z) {
  if (!cause) return null;
  const vx = x - cause.x0, vz = z - cause.z0;
  const t = vx * cause.fx + vz * cause.fz;
  if (t < cause.t0 - 1 || t > cause.t1 + 1) return null;
  const lateral = cause.fx * vz - cause.fz * vx;
  return { t, d: Math.abs(lateral), side: lateral };
}
function causeLift(x, z) {
  const c = causeQuery(x, z);
  if (!c) return 0;
  const nearCut = Math.abs(c.t - cross.t) < 4.8 && ditchDist(x, z) < 4.3;
  if (nearCut) return 0;
  const top = 3.5, slope = 4.2;
  let lift = c.d <= top ? 1 : 1 - clamp((c.d - top) / slope, 0, 1);
  if (lift <= 0) return 0;
  if (c.d > 0.85 && c.d < 1.35) lift -= 0.045;
  const rampIn = clamp((c.t - cause.t0) / 16, 0, 1);
  const rampOut = clamp((cause.t1 - c.t) / 36, 0, 1);
  return lift * rampIn * rampOut;
}
function baseY(x, z) {
  const d = _edgeDist(x, z);
  const sw = Math.max(0.8, slopeWidthAt(x, z));
  const ch = crestHeight(x, z);
  if (d >= sw) return ch;
  return ch * clamp(d / sw, 0, 1);
}
function landY(x, z) {
  let y = baseY(x, z);
  const ls = lakeSigned(x, z);
  if (ls > -2.4) {
    if (ls >= 0) {
      const t = clamp(ls / 8, 0, 1);
      const s = t * t * (3 - 2 * t);
      y = y * (1 - s) + 0.02 * s;
    } else {
      y -= 0.1 * (1 - clamp(-ls / 2.2, 0, 1));
    }
  }
  const dd = ditchDist(x, z);
  if (dd < 9 && ls < 1.2) {
    if (dd < 4) y = Math.min(y, 0.03);
    else {
      const t = clamp((dd - 4) / 5, 0, 1);
      const s = t * t * (3 - 2 * t);
      const cut = 0.03 + (baseY(x, z) - 0.03) * s;
      y = Math.min(y, cut);
    }
  }
  const lift = causeLift(x, z);
  if (lift > 0) y = baseY(x, z) + lift;
  else if (y > 0.45 && ls < -1.2) y += 0.04;
  if (!(y > -2 && y < 40)) y = 0.9;
  return y;
}
function vary(col, x, z) {
  const n = 0.5 + 0.5 * Math.sin(x * 0.02 + z * 0.015);
  const k = (0.94 + 0.12 * n) * (1 + (hash2(x * 0.37, z * 0.41) - 0.5) * 0.12);
  return [clamp(col[0] * k, 0, 1), clamp(col[1] * k, 0, 1), clamp(col[2] * k, 0, 1)];
}
function landCol(x, z) {
  const c = causeQuery(x, z);
  const lift = causeLift(x, z);
  if (c && lift > 0.72 && c.d < 3.6) {
    if (c.d > 0.85 && c.d < 1.35) return vary(COL.rut, x, z);
    return vary(COL.road, x, z);
  }
  const ls = lakeSigned(x, z);
  if (ls > -2.0 && ls < 0.45) return vary(COL.mud, x, z);
  const dd = ditchDist(x, z);
  if (dd < 5.8 && dd > 3.55 && z > southShoreZ(clamp(x, LAKE_X0, LAKE_X1)) - 8) return vary(COL.mud, x, z);
  const xc = clamp(x, LAKE_X0, LAKE_X1);
  if (z > northShoreZ(xc) + northBandW(xc) - 6 && ls < 0) return vary(COL.dry, x, z);
  if (x > LAKE_X1 + 28 && ls < 0 && ditchDist(x, z) > 8) return vary(COL.dry, x, z);
  return vary(COL.wet, x, z);
}
function inSouthGap(x, z) {
  if (z > southShoreZ(clamp(x, LAKE_X0, LAKE_X1)) - 0.5) return false;
  for (let i = 0; i < GAPS.length; i++) {
    if (x >= GAPS[i][0] && x <= GAPS[i][1]) return true;
  }
  return false;
}

export function prepareNorth(outerPoly, inWater, polyEdgeDist) {
  _inWater = inWater;
  _edgeDist = (x, z) => polyEdgeDist(x, z, outerPoly);
  edgeSamples = [];
  let minZ = 1e9, maxZ = -1e9, atMin = 0, atMax = 0;
  for (let x = 40; x <= 416; x += 2) {
    let zHi = null;
    for (let z = 400; z <= 530; z += 0.5) {
      if (inWater(x, z)) zHi = z;
    }
    if (zHi == null) continue;
    edgeSamples.push({ x, z: zHi });
    if (zHi < minZ) { minZ = zHi; atMin = x; }
    if (zHi > maxZ) { maxZ = zHi; atMax = x; }
  }
  const s2 = Math.SQRT1_2;
  let t0 = 0;
  const ox = 395, oz = 432;
  for (let t = 0; t <= 80; t += 1) {
    const x = ox + s2 * t, z = oz + s2 * t;
    if (!inWater(x, z) && _edgeDist(x, z) > slopeWidthAt(x, z) + 1) { t0 = t; break; }
  }
  const t1 = 520;
  cause = { x0: ox, z0: oz, fx: s2, fz: s2, t0, t1 };
  const x0 = 326;
  const zMouth = southShoreZ(x0) + 5;
  const cx = 470, cz = 507;
  cross = { x: cx, z: cz, t: (cx - ox) * s2 + (cz - oz) * s2 };
  ditchPts = [
    [x0, zMouth],
    [358, zMouth + 14],
    [402, zMouth - 2],
    [cx - 24 * s2, cz + 24 * s2],
    [cx, cz],
    [cx + 26 * s2, cz - 26 * s2],
    [cx + 62, cz - 4],
    [cx + 118, cz + 8],
  ];
  ready = true;
  const zS = [], zN = [];
  for (let x = LAKE_X0; x <= LAKE_X1; x += 8) {
    zS.push(southShoreZ(x));
    zN.push(northShoreZ(x));
  }
  const info = {
    ready: true,
    waterEdge: {
      min: +minZ.toFixed(1), max: +maxZ.toFixed(1),
      atMin, atMax,
      at200: +waterEdgeZ(200).toFixed(1),
      at140: +waterEdgeZ(140).toFixed(1),
      at330: +waterEdgeZ(330).toFixed(1),
      at395: +waterEdgeZ(395).toFixed(1),
    },
    gap: { at200: +shoreGap(200).toFixed(1), at140: +shoreGap(140).toFixed(1) },
    lakeZ: {
      southMin: +Math.min(...zS).toFixed(1),
      southMax: +Math.max(...zS).toFixed(1),
      northMin: +Math.min(...zN).toFixed(1),
      northMax: +Math.max(...zN).toFixed(1),
    },
    causewayStart: { x: +(ox + s2 * t0).toFixed(1), z: +(oz + s2 * t0).toFixed(1), t0 },
    specStartInWater: inWater(395, 432),
    cross: { x: cx, z: cz },
  };
  window.__northPrep = info;
  return info;
}

function ownsGround(x, z) {
  if (_inWater(x, z)) return false;
  const d = _edgeDist(x, z);
  const sw = Math.max(0.8, slopeWidthAt(x, z));
  if (d < sw * 0.92) return false;
  if (x >= 40 && x <= 430 && z >= 424 && z <= 640) return true;
  if (ditchDist(x, z) < 14 && z > 488 && x < 700 && z < 720) return true;
  const c = causeQuery(x, z);
  if (c && c.d < 16 && c.t > cause.t0 - 2 && c.t < cause.t1 + 4) return true;
  return false;
}
export function blocksNorthGround(x, z) {
  if (!ready) return false;
  return ownsGround(x, z);
}
export function blocksNorthTree(x, z) {
  if (!ready) return false;
  if (lakeSigned(x, z) > -1.5) return true;
  if (ditchDist(x, z) < 5.5 && z > 490) return true;
  const c = causeQuery(x, z);
  if (c && c.d < 6.5 && c.t > cause.t0 - 2 && c.t < cause.t1) return true;
  return false;
}

// 芦苇荡西缘：和 buildReeds 西侧条带用同一个 hash，避免田贴着芦苇。
export function reedWestEdge(z) {
  if (!ready) return null;
  const zs = southShoreZ(LAKE_X0);
  const zn = northShoreZ(LAKE_X0);
  if (z < zs - 6 || z > zn + 8) return null;
  const maxW = 10 + 18 * hash2(Math.floor(z / 7), 2);
  let edge = LAKE_X0 - maxW;
  for (let x = edge - 2; x <= LAKE_X0; x += 3) {
    if (lakeSigned(x, z) > 0) edge = Math.min(edge, x - 1);
  }
  return edge;
}
export function marshBandWidth(z) {
  return clamp(40 + 40 * hash2(Math.floor(z / 11), 4), 40, 80);
}
export function fieldBlockedNorth(x, z) {
  if (!ready) return false;
  if (lakeSigned(x, z) > -2) return true;
  if (ditchDist(x, z) < 8 && z > 470) return true;
  const c = causeQuery(x, z);
  if (c && c.d < 9 && c.t > cause.t0 - 4 && c.t < cause.t1) return true;
  const edge = reedWestEdge(z);
  if (edge != null) {
    const out = edge - x;
    if (out < marshBandWidth(z) + 0.5 && out > -6) return true;
  }
  if (x > LAKE_X0 - 36 && x < LAKE_X1 + 48) {
    const xc = clamp(x, LAKE_X0, LAKE_X1);
    const zs = southShoreZ(xc);
    const top = northShoreZ(xc) + northBandW(xc) + 2;
    if (z > zs - 8 && z < top) return true;
  }
  return false;
}
export function northSurfaceY(x, z) {
  if (!ready || !ownsGround(x, z)) return null;
  return landY(x, z);
}

let roadCache = null;
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((x - ax) * dx + (z - az) * dz) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}
export function westRoadPoints() {
  if (roadCache) return roadCache;
  if (!ready || !cause) return [];
  const raw = [];
  function push(x, z) {
    const last = raw[raw.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 10) return;
    raw.push({ x, z });
  }
  // 北侧西面村落东北角出发，贴着芦苇荡西缘的过渡带外侧往北，再折向堤道。
  push(-128, 362);
  push(-96, 400);
  push(-62, 442);
  for (let z = 468; z <= 620; z += 26) {
    const edge = reedWestEdge(z);
    if (edge == null) continue;
    push(edge - marshBandWidth(z) - 9, z);
  }
  const northOf = (x) => {
    const xc = clamp(x, LAKE_X0, LAKE_X1);
    return northShoreZ(xc) + northBandW(xc) + 18;
  };
  let zN = 620;
  for (const x of [80, 180, 280, 380]) zN = Math.max(zN, northOf(x));
  const lastW = raw[raw.length - 1];
  push(lastW.x + 24, zN);
  for (let x = Math.ceil(lastW.x / 70) * 70 + 70; x <= 520; x += 70) push(x, zN);
  const vx = raw[raw.length - 1].x - cause.x0;
  const vz = raw[raw.length - 1].z - cause.z0;
  let t = vx * cause.fx + vz * cause.fz;
  t = clamp(t, cause.t0 + 40, cause.t1 - 30);
  push(cause.x0 + cause.fx * t, cause.z0 + cause.fz * t);
  const out = [];
  let run = 0;
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i], b = raw[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const steps = Math.max(1, Math.round(len / 8));
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const x = a.x + (b.x - a.x) * u;
      const z = a.z + (b.z - a.z) * u;
      const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
      const wob = Math.sin(run * 0.04) * 1.5 + Math.sin(run * 0.013 + 0.7) * 0.8;
      out.push({ x: x - tz * wob, z: z + tx * wob });
      run += len / steps;
    }
  }
  out.push(raw[raw.length - 1]);
  roadCache = out;
  return out;
}
export function westRoadDist(x, z) {
  const pts = westRoadPoints();
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = segDist(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
    if (d < best) best = d;
  }
  return best;
}

function dressClamp(mat, key) {
  mat.precision = "highp";
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  float ok = float(c.r == c.r && c.g == c.g && c.b == c.b);
  diffuseColor.rgb = mix(vec3(0.32, 0.28, 0.20), clamp(c, vec3(0.0), vec3(1.0)), ok);
}`);
  };
  return mat;
}

function finishMesh(pos, col, idx, extra, mat, name) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (col) geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  if (extra) geo.setAttribute(extra.name, new THREE.Float32BufferAttribute(extra.arr, extra.size));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  let up = 0;
  const step = Math.max(1, Math.floor(nrm.count / 64));
  for (let i = 0; i < nrm.count; i += step) up += nrm.getY(i);
  if (up < 0 && geo.index) {
    const a = geo.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t;
    }
    geo.index.needsUpdate = true;
    geo.computeVertexNormals();
  }
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function buildLand(isPhone) {
  const step = isPhone ? 7 : 4;
  const x0 = 36, x1 = 780, z0 = 422, z1 = 840;
  const nx = Math.ceil((x1 - x0) / step);
  const nz = Math.ceil((z1 - z0) / step);
  const ids = new Int32Array((nx + 1) * (nz + 1));
  ids.fill(-1);
  const pos = [], col = [], idx = [];
  function emit(x, z) { return ownsGround(x, z); }
  function vid(i, j) {
    const k = j * (nx + 1) + i;
    if (ids[k] >= 0) return ids[k];
    const x = x0 + i * step;
    const z = z0 + j * step;
    const y = landY(x, z);
    const c = landCol(x, z);
    const id = pos.length / 3;
    pos.push(x, y, -z);
    col.push(c[0], c[1], c[2]);
    ids[k] = id;
    return id;
  }
  let quads = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * step;
      const cz = z0 + (j + 0.5) * step;
      if (!emit(cx, cz)) continue;
      if (_inWater(x0 + i * step, z0 + j * step)) continue;
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
      quads++;
    }
  }
  const mat = dressClamp(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.97, metalness: 0, vertexColors: true, side: THREE.DoubleSide,
  }), "north-land-n1");
  const mesh = finishMesh(pos, col, idx, null, mat, "northLand");
  mesh.receiveShadow = !isPhone;
  return { mesh, quads, verts: pos.length / 3 };
}

function buildWater(isPhone, waterUniforms) {
  const step = isPhone ? 5.5 : 3.2;
  const x0 = 80, x1 = 620, z0 = 460, z1 = 640;
  const nx = Math.ceil((x1 - x0) / step);
  const nz = Math.ceil((z1 - z0) / step);
  const ids = new Int32Array((nx + 1) * (nz + 1));
  ids.fill(-1);
  const pos = [], shore = [], idx = [];
  function wet(x, z) {
    if (_inWater(x, z)) return false;
    const ls = lakeSigned(x, z);
    if (ls > -0.4) return true;
    if (ditchDist(x, z) < 3.85 && z > southShoreZ(clamp(x, LAKE_X0, LAKE_X1)) - 2) return true;
    return false;
  }
  function shoreAt(x, z) {
    const ls = lakeSigned(x, z);
    if (ls > -0.4) return Math.max(ls, 0);
    return Math.max(0, 4 - ditchDist(x, z));
  }
  function vid(i, j) {
    const k = j * (nx + 1) + i;
    if (ids[k] >= 0) return ids[k];
    const x = x0 + i * step, z = z0 + j * step;
    const id = pos.length / 3;
    pos.push(x, 0.2, -z);
    shore.push(shoreAt(x, z));
    ids[k] = id;
    return id;
  }
  let quads = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * step, cz = z0 + (j + 0.5) * step;
      if (!wet(cx, cz)) continue;
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
      quads++;
    }
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x3c362e) },
      uShallow: { value: new THREE.Color(0x4a3f2e) },
      uTime: waterUniforms.uTime,
      uSunDir: waterUniforms.uSunDir,
      uSunColor: waterUniforms.uSunColor,
      uSky: waterUniforms.uSky,
      uFogColor: waterUniforms.uFogColor,
      uFogNear: waterUniforms.uFogNear,
      uFogFar: waterUniforms.uFogFar,
    },
    vertexShader: `
      uniform float uTime;
      attribute float aShore;
      varying vec3 vWorld;
      varying float vShore;
      void main() {
        vec3 p = position;
        float w = sin(position.x * 0.21 + uTime * 0.8) * 0.012
          + sin(position.z * 0.17 - uTime * 0.6 + 1.2) * 0.01;
        p.y += w;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vShore = aShore;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uShallow;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSky;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vWorld;
      varying float vShore;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p);
        float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
      }
      vec3 nSafe(vec3 v){ return v / max(length(v), 1e-5); }
      void main() {
        vec2 xz = vWorld.xz;
        float dhdx = cos(xz.x * 0.21 + uTime * 0.31) * 0.04;
        float dhdz = cos(xz.y * 0.17 - uTime * 0.27) * 0.035;
        vec3 N = nSafe(vec3(-dhdx, 1.0, -dhdz));
        vec3 V = nSafe(cameraPosition - vWorld);
        float ndv = clamp(dot(vec3(0.0, 1.0, 0.0), V), 0.0, 1.0);
        float fres = pow(max(1.0 - ndv, 0.0), 3.0);
        vec3 R = reflect(-V, N);
        float up = clamp(R.y, 0.0, 1.0);
        vec3 sky = uSky;
        vec3 refl = mix(sky, sky * vec3(0.78, 0.82, 0.92), up);
        float reflAmt = mix(0.08, 0.48, fres);
        vec3 col = mix(uColor, refl, reflAmt);
        vec3 L = nSafe(uSunDir);
        vec3 H = nSafe(L + V);
        float spec = min(pow(max(dot(N, H), 0.0), 48.0) * 0.03, 0.05);
        col += uSunColor * spec;
        float nse = noise(xz * 0.13);
        float shore = max(vShore + (nse - 0.5) * 1.1, 0.0);
        float shall = 1.0 - smoothstep(3.0, 6.0, shore);
        col = mix(col, uShallow, clamp(shall, 0.0, 1.0) * 0.82);
        col = max(col, vec3(0.06));
        float fogDepth = length(vWorld - cameraPosition);
        float fogFactor = smoothstep(uFogNear, max(uFogFar, uFogNear + 1.0), fogDepth) * 0.85;
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
        if (!(col.r == col.r) || !(col.g == col.g) || !(col.b == col.b)) col = vec3(0.12, 0.10, 0.08);
        gl_FragColor = vec4(clamp(col, vec3(0.0), vec3(1.5)), 1.0);
      }`,
  });
  mat.precision = "highp";
  mat.customProgramCacheKey = () => "north-water-n1";
  const mesh = finishMesh(pos, null, idx, { name: "aShore", arr: shore, size: 1 }, mat, "northWater");
  return { mesh, quads };
}

function buildBridge() {
  const pos = [], col = [], idx = [];
  const yaw = Math.PI / 4;
  const co = Math.cos(yaw), si = Math.sin(yaw);
  const yTop = baseY(cross.x, cross.z) + 1.0;
  function pushV(x, y, z) {
    const id = pos.length / 3;
    pos.push(x, y, -z);
    const k = 0.92 + hash2(x, z) * 0.1;
    col.push(COL.wood[0] * k, COL.wood[1] * k, COL.wood[2] * k);
    return id;
  }
  function local(lx, y, lz) {
    const x = cross.x + lx * co + lz * si;
    const z = cross.z - lx * si + lz * co;
    return [x, y, z];
  }
  function box(lxc, yc, lzc, sx, sy, sz) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const p = [];
    for (const syy of [-1, 1]) {
      for (const szz of [-1, 1]) {
        for (const sxx of [-1, 1]) {
          p.push(local(lxc + sxx * hx, yc + syy * hy, lzc + szz * hz));
        }
      }
    }
    const id = [];
    for (let i = 0; i < 8; i++) id.push(pushV(p[i][0], p[i][1], p[i][2]));
    const faces = [
      [0, 1, 2, 3],
      [4, 6, 5, 7],
      [0, 4, 1, 5],
      [2, 3, 6, 7],
      [0, 2, 4, 6],
      [1, 5, 3, 7],
    ];
    for (const f of faces) idx.push(id[f[0]], id[f[2]], id[f[1]], id[f[1]], id[f[2]], id[f[3]]);
  }
  const deckT = 0.22;
  const yBot = 0.02;
  const pierH = Math.max(0.5, (yTop - deckT) - yBot);
  box(0, yTop - deckT * 0.5, 0, 6, deckT, 11);
  box(0, yBot + pierH * 0.5, -4.35, 0.62, pierH, 0.5);
  box(0, yBot + pierH * 0.5, 4.35, 0.62, pierH, 0.5);
  for (const side of [-1, 1]) {
    for (let z = -5; z <= 5.01; z += 1.65) {
      box(side * 2.72, yTop + 0.28, z, 0.12, 0.62, 0.12);
    }
    box(side * 2.72, yTop + 0.56, 0, 0.1, 0.1, 10.2);
  }
  const mat = dressClamp(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true, side: THREE.DoubleSide,
  }), "north-wood-n1");
  return finishMesh(pos, col, idx, null, mat, "northBridge");
}

function cardGeo() {
  const g = new THREE.PlaneGeometry(1, 1, 1, 4);
  g.translate(0, 0.5, 0);
  return g;
}
function sphereOf(spots, yPad) {
  let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
  for (const s of spots) {
    const pz = -s.z;
    minX = Math.min(minX, s.x - 2); maxX = Math.max(maxX, s.x + 2);
    minY = Math.min(minY, s.y - 1); maxY = Math.max(maxY, s.y + yPad);
    minZ = Math.min(minZ, pz - 2); maxZ = Math.max(maxZ, pz + 2);
  }
  if (!spots.length) return new THREE.Sphere(new THREE.Vector3(), 1);
  return new THREE.Sphere(
    new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5),
    Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + 2,
  );
}
function placeInstances(mesh, spots, dummy) {
  spots.forEach((s, i) => {
    dummy.position.set(s.x, s.y, -s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(s.sx, s.sy, s.sz == null ? 1 : s.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (s.color && mesh.setColorAt) mesh.setColorAt(i, s.color);
  });
  mesh.count = spots.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function binChunks(spots, maxMeshes) {
  const map = new Map();
  for (const s of spots) {
    const ix = Math.floor(s.x / 60);
    const iz = Math.floor(s.z / 60);
    const key = ix + "_" + iz;
    let b = map.get(key);
    if (!b) {
      b = { spots: [], cx: 0, cz: 0 };
      map.set(key, b);
    }
    b.spots.push(s);
  }
  let entries = [...map.values()];
  for (const e of entries) {
    let sx = 0, sz = 0;
    for (const p of e.spots) { sx += p.x; sz += p.z; }
    e.cx = sx / e.spots.length;
    e.cz = sz / e.spots.length;
  }
  while (entries.length > maxMeshes) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const d = (entries[i].cx - entries[j].cx) ** 2 + (entries[i].cz - entries[j].cz) ** 2;
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    const a = entries[bi], b = entries[bj];
    const merged = a.spots.concat(b.spots);
    const cx = (a.cx * a.spots.length + b.cx * b.spots.length) / merged.length;
    const cz = (a.cz * a.spots.length + b.cz * b.spots.length) / merged.length;
    entries = entries.filter((_, i) => i !== bi && i !== bj);
    entries.push({ spots: merged, cx, cz });
  }
  return { bins: map.size, groups: entries };
}
function commitCards(root, spots, mat, name, maxMeshes, hideDist) {
  const dummy = new THREE.Object3D();
  const packed = binChunks(spots, maxMeshes);
  const meshes = [];
  for (const g of packed.groups) {
    const list = g.spots;
    const geo = cardGeo();
    const n = list.length;
    const uvRect = new Float32Array(n * 4);
    const keepA = new Float32Array(n);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    const color = new THREE.Color();
    list.forEach((s, i) => {
      uvRect[i * 4] = s.u0;
      uvRect[i * 4 + 1] = s.vb;
      uvRect[i * 4 + 2] = s.u1;
      uvRect[i * 4 + 3] = s.vt;
      keepA[i] = s.keep;
      if (s.cr != null) {
        color.setRGB(s.cr, s.cg, s.cb);
        s.color = color.clone();
      }
    });
    geo.setAttribute("aUvRect", new THREE.InstancedBufferAttribute(uvRect, 4));
    geo.setAttribute("aKeep", new THREE.InstancedBufferAttribute(keepA, 1));
    placeInstances(mesh, list, dummy);
    geo.boundingSphere = sphereOf(list, 4);
    root.add(mesh);
    meshes.push(mesh);
    const sp = geo.boundingSphere;
    cullList.push({
      mesh, hide: hideDist,
      cx: sp.center.x, cz: -sp.center.z, r: sp.radius,
    });
  }
  return { bins: packed.bins, meshes: meshes.length, cards: spots.length };
}

function buildReeds(root, isPhone, reedTex, plantTime) {
  const rng = mulberry32(0x51ee);
  const spots = [];
  const step = isPhone ? 4.6 : 3.6;
  const phoneSkip = isPhone ? 0.5 : 1;
  function pushClump(x, z, tall, south) {
    if (rng() > phoneSkip) return;
    const c = causeQuery(x, z);
    if (c && c.d < 3.8 && causeLift(x, z) > 0.4) return;
    if (ditchDist(x, z) < 4.6) return;
    if (_inWater(x, z)) return;
    const atlas = REED_UV[(rng() * REED_UV.length) | 0];
    const mirror = rng() < 0.5;
    const h = south ? 3.35 + rng() * 1.05
      : (tall ? 2.5 : 2.05) + rng() * (tall ? 1.15 : 0.85);
    const nCard = 2;
    const yaw0 = rng() * Math.PI * 2;
    const keep0 = rng();
    for (let p = 0; p < nCard; p++) {
      const keep = p === 0 ? (keep0 < 0.25 ? 500 : keep0 < 0.5 ? 350 : 200) : 200;
      spots.push({
        x, z, y: landY(x, z) - 0.05,
        yaw: yaw0 + p * (0.9 + rng() * 0.4),
        sx: Math.max(0.35, h * atlas.woh),
        sy: h,
        u0: mirror ? atlas.u1 : atlas.u0,
        u1: mirror ? atlas.u0 : atlas.u1,
        vb: atlas.vb, vt: atlas.vt,
        keep,
        cr: clamp(0.9 + rng() * 0.18, 0, 1),
        cg: clamp(0.9 + rng() * 0.16, 0, 1),
        cb: clamp(0.86 + rng() * 0.16, 0, 1),
      });
    }
  }
  for (let x = 70; x <= 400; x += step) {
    for (let z = 430; z <= 640; z += step) {
      const jx = x + (rng() - 0.5) * step * 0.7;
      const jz = z + (rng() - 0.5) * step * 0.7;
      if (inSouthGap(jx, jz)) continue;
      const ls = lakeSigned(jx, jz);
      const xc = clamp(jx, LAKE_X0, LAKE_X1);
      const zs = southShoreZ(xc);
      const zn = northShoreZ(xc);
      let place = false;
      let tall = false;
      let south = false;
      if (ls > 0.45 && ls < 2.15 && rng() < 0.07) {
        place = true;
      } else if (ls <= 0.35 && jx > LAKE_X0 - 32 && jx < LAKE_X1 + 36) {
        const southOf = zs - jz;
        const northOf = jz - zn;
        const westOf = LAKE_X0 - jx;
        const eastOf = jx - LAKE_X1;
        const southW = 11 + 8 * hash2(Math.floor(jx / 6), 11);
        const edgeZ = waterEdgeZ(xc) + slopeWidthAt(jx, jz) + 0.5;
        if (southOf > 0.3 && southOf < southW && jz > edgeZ && jx > LAKE_X0 - 2 && jx < LAKE_X1 + 2) {
          place = rng() < 0.92;
          south = true;
        } else if (southOf >= southW && jz > edgeZ && southOf < shoreGap(xc) - 0.8 && jx > LAKE_X0 + 1 && jx < LAKE_X1 - 1) {
          place = rng() < 0.35;
          south = true;
        } else if (northOf > 0 && northOf < northBandW(xc)) {
          place = rng() < 0.8;
          tall = true;
        } else if (westOf > 0 && westOf < 10 + 18 * hash2(Math.floor(jz / 7), 2) && jz > zs - 6 && jz < zn + 8) {
          place = rng() < 0.5;
        } else if (eastOf > 0 && eastOf < 10 + 16 * hash2(Math.floor(jz / 7), 5) && jz > zs - 6 && jz < zn + 10 && ditchDist(jx, jz) > 5.5) {
          place = rng() < 0.44;
        }
      }
      if (place) pushClump(jx, jz, tall, south);
    }
  }
  const mat = new THREE.MeshStandardMaterial({
    map: reedTex, color: 0xffffff, roughness: 0.92, metalness: 0,
    alphaTest: 0.4, side: THREE.DoubleSide,
  });
  if (!isPhone) mat.alphaToCoverage = true;
  mat.precision = "highp";
  mat.customProgramCacheKey = () => "north-reed-n1";
  const distScale = { value: isPhone ? 0.7 : 1 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = plantTime;
    shader.uniforms.uWind = { value: new THREE.Vector2(1, 0.7) };
    shader.uniforms.uDistScale = distScale;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec4 aUvRect;
attribute float aKeep;
uniform float uTime;
uniform vec2 uWind;
uniform float uDistScale;`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = ( mapTransform * vec3( mix(aUvRect.x, aUvRect.z, uv.x), mix(aUvRect.y, aUvRect.w, uv.y), 1.0 ) ).xy;
#endif`)
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
  float hh = clamp(position.y, 0.0, 1.0);
  float plume = smoothstep(0.58, 0.78, hh);
  float bend = hh * hh * (1.0 + plume);
  float phase = fract(sin(dot(root.xz, vec2(127.1, 311.7))) * 43758.5453) * 6.2831853;
  float gust = 0.38 + 0.62 * pow(max(sin(uTime * 0.23 + root.x * 0.011 + root.z * 0.008), 0.0), 0.5);
  gust *= 0.55 + 0.45 * sin(uTime * 0.09 + 1.4);
  float wlen = max(length(uWind), 1e-4);
  vec2 wdir = uWind / wlen;
  float th = uTime * 1.35 + phase - dot(root.xz, wdir) * 0.35;
  float wave = sin(th) * 0.72 + sin(th * 0.57 + phase) * 0.28;
  float sway = bend * gust * wave * 0.22;
  vec3 woff = vec3(wdir.x, 0.0, wdir.y) * sway;
  transformed.x += dot(woff, ax) / max(sx, 1e-4);
  transformed.y += dot(woff, ay) / max(sy, 1e-4);
  transformed.z += dot(woff, az) / max(sz, 1e-4);
  float distR = distance(root.xz, cameraPosition.xz);
  float scaleD = max(uDistScale, 1e-3);
  float edge = max(aKeep, 0.0) * scaleD;
  float band = 30.0 * scaleD;
  float keep = 1.0 - smoothstep(max(edge - band, 0.0), edge + band, distR);
  transformed *= clamp(keep, 0.0, 1.0);
#endif`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r)) c = vec3(0.25, 0.22, 0.14);
  diffuseColor.rgb = clamp(c, vec3(0.0), vec3(1.2));
}`);
  };
  const packed = commitCards(root, spots, mat, "northReed", 2, 500);
  return { cards: spots.length, bins: packed.bins, meshes: packed.meshes };
}

function buildGrass(root, isPhone, grassTex, plantTime) {
  const rng = mulberry32(0x6a11);
  const spots = [];
  const step = isPhone ? 4.8 : 3.3;
  const scaleD = isPhone ? 0.7 : 1;
  for (let x = 60; x <= 420; x += step) {
    for (let z = 500; z <= 640; z += step) {
      if (isPhone && rng() < 0.5) continue;
      const jx = x + (rng() - 0.5) * step;
      const jz = z + (rng() - 0.5) * step;
      if (lakeSigned(jx, jz) > -1) continue;
      if (_inWater(jx, jz)) continue;
      if (ditchDist(jx, jz) < 5) continue;
      const c = causeQuery(jx, jz);
      if (c && c.d < 4.2) continue;
      const xc = clamp(jx, LAKE_X0, LAKE_X1);
      const outer = northShoreZ(xc) + northBandW(xc);
      const dry = jz > outer - 4 || jx < LAKE_X0 - 18 || jx > LAKE_X1 + 22;
      if (!dry) continue;
      if (jz < waterEdgeZ(clamp(jx, 40, 410)) + 18) continue;
      const shrub = rng() < 0.22;
      const atlas = shrub ? GRASS_UV[3 + ((rng() * 3) | 0)] : GRASS_UV[(rng() * 3) | 0];
      const mirror = rng() < 0.5;
      const h = shrub ? 0.7 + rng() * 0.55 : 0.35 + rng() * 0.35;
      const far = shrub ? (rng() < 0.5 ? 200 : 400) : (rng() < 0.5 ? 120 : 250);
      spots.push({
        x: jx, z: jz, y: landY(jx, jz) - 0.02,
        yaw: rng() * Math.PI * 2,
        sx: Math.max(0.2, h * atlas.woh * (shrub ? 1.15 : 1)),
        sy: h,
        u0: mirror ? atlas.u1 : atlas.u0,
        u1: mirror ? atlas.u0 : atlas.u1,
        vb: atlas.vb, vt: atlas.vt,
        keep: far * scaleD,
        color: new THREE.Color(0.9 + rng() * 0.15, 0.88 + rng() * 0.14, 0.75 + rng() * 0.12),
        shrub,
      });
    }
  }
  // 芦苇荡西缘往外 40–80 米：湿草滩和零星灌丛，和田块隔开。
  {
    const rngF = mulberry32(0x17c3);
    const stepF = isPhone ? 3.6 : 2.3;
    for (let z = 450; z <= 640; z += stepF) {
      const edge = reedWestEdge(z);
      if (edge == null) continue;
      const band = marshBandWidth(z);
      for (let x = edge - band + 1; x <= edge - 1.5; x += stepF) {
        if (isPhone && rngF() < 0.5) continue;
        const jx = x + (rngF() - 0.5) * stepF * 0.65;
        const jz = z + (rngF() - 0.5) * stepF * 0.65;
        const out = edge - jx;
        if (out < 0.6 || out > band + 0.4) continue;
        if (lakeSigned(jx, jz) > -0.2) continue;
        if (_inWater(jx, jz)) continue;
        if (westRoadDist(jx, jz) < 2.6) continue;
        const u = out / Math.max(band, 1);
        const shrub = rngF() < 0.04 + 0.1 * u;
        const atlas = shrub ? GRASS_UV[3 + ((rngF() * 3) | 0)] : GRASS_UV[(rngF() * 3) | 0];
        const mirror = rngF() < 0.5;
        const h = shrub ? 0.9 + rngF() * 0.55 : 0.85 + (1 - u) * 0.55 + rngF() * 0.35;
        const far = shrub ? 340 : 260;
        spots.push({
          x: jx, z: jz, y: landY(jx, jz) + 0.02,
          yaw: rngF() * Math.PI * 2,
          sx: Math.max(0.35, h * atlas.woh * (shrub ? 1.2 : 1.35)),
          sy: h,
          u0: mirror ? atlas.u1 : atlas.u0,
          u1: mirror ? atlas.u0 : atlas.u1,
          vb: atlas.vb, vt: atlas.vt,
          keep: far * scaleD,
          color: new THREE.Color(0.72 + rngF() * 0.1, 0.78 + rngF() * 0.1, 0.52 + rngF() * 0.08),
          shrub,
        });
      }
    }
  }
  const mat = new THREE.MeshStandardMaterial({
    map: grassTex, color: 0xffffff, roughness: 0.94, metalness: 0,
    alphaTest: 0.4, side: THREE.DoubleSide,
  });
  if (!isPhone) mat.alphaToCoverage = true;
  mat.precision = "highp";
  mat.customProgramCacheKey = () => "north-veg-n1";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = plantTime;
    shader.uniforms.uWind = { value: new THREE.Vector2(1, 0.7) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec4 aUvRect;
attribute float aKeep;
varying vec2 vUvG;
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
  vec3 ax = i0 / sx; vec3 ay = i1 / sy; vec3 az = i2 / sz;
  vec3 root = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float hh = clamp(position.y, 0.0, 1.0);
  float phase = fract(sin(dot(root.xz, vec2(127.1, 311.7))) * 43758.5453) * 6.2831853;
  float gust = 0.38 + 0.62 * pow(max(sin(uTime * 0.23 + root.x * 0.011 + root.z * 0.008), 0.0), 0.5);
  float wlen = max(length(uWind), 1e-4);
  vec2 wdir = uWind / wlen;
  float th = uTime * 1.6 + phase - dot(root.xz, wdir) * 0.25;
  float wave = sin(th) * 0.7 + sin(th * 0.53 + phase) * 0.3;
  vec3 woff = vec3(wdir.x, 0.0, wdir.y) * hh * hh * gust * wave * 0.16;
  transformed.x += dot(woff, ax) / max(sx, 1e-4);
  transformed.z += dot(woff, az) / max(sz, 1e-4);
  float distC = distance(root.xz, cameraPosition.xz);
  float edge = max(aKeep, 1.0);
  float fade = 1.0 - smoothstep(max(edge - 28.0, 0.0), edge + 28.0, distC);
  transformed *= clamp(fade, 0.0, 1.0);
#endif`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>
  vUvG = vec2(mix(aUvRect.x, aUvRect.z, uv.x), mix(aUvRect.y, aUvRect.w, uv.y));
#ifdef USE_MAP
  vMapUv = vUvG;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vUvG;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r)) c = vec3(0.35, 0.32, 0.2);
  diffuseColor.rgb = clamp(c, vec3(0.0), vec3(1.2));
}`);
  };
  const packed = commitCards(root, spots, mat, "northGrass", 1, 400);
  let shrubs = 0;
  for (const s of spots) if (s.shrub) shrubs++;
  return { n: spots.length, shrubs, grass: spots.length - shrubs, bins: packed.bins, meshes: packed.meshes };
}

function buildTrees(root, isPhone, plantTime) {
  const rng = mulberry32(0xb17);
  const spots = [];
  const s2 = Math.SQRT1_2;
  let station = 0;
  for (let t = cause.t0 + 6; t < cause.t1 - 20; t += 10) {
    const cx = cause.x0 + cause.fx * t;
    const cz = cause.z0 + cause.fz * t;
    const sides = [[1, station % 2 === 0 ? "t1" : "t0"], [-1, station % 2 === 0 ? "t0" : "t1"]];
    sides.forEach(([side, kind], si) => {
      if (isPhone && ((station + si) % 2 === 1)) return;
      const ox = side * 5.3 * cause.fz;
      const oz = side * 5.3 * -cause.fx;
      const x = cx + ox, z = cz + oz;
      if (_inWater(x, z) || lakeSigned(x, z) > 0 || ditchDist(x, z) < 5) return;
      const sc = 0.9 + rng() * 0.2;
      const base = kind === "t0" ? 0.13 : 0.14;
      spots.push({
        kind, x, z, y: landY(x, z),
        yaw: rng() * Math.PI * 2,
        s: base * sc,
      });
    });
    station++;
  }
  const scatter = [
    [108, 10, "t1"], [154, 18, "t1"], [214, 8, "t1"], [268, 16, "t1"], [312, 12, "t1"], [96, 14, "t1"],
    [128, 22, "t2"], [246, 18, "t2"], [78, 12, "t2"],
  ];
  scatter.forEach(([x, out, kind], i) => {
    if (isPhone && i % 2 === 1) return;
    const xc = clamp(x, LAKE_X0, LAKE_X1);
    const z = (x < LAKE_X0 ? northShoreZ(LAKE_X0) : northShoreZ(xc)) + northBandW(xc) + out;
    if (_inWater(x, z) || lakeInside(x, z)) return;
    const sc = 0.9 + rng() * 0.2;
    const base = kind === "t0" ? 0.13 : kind === "t1" ? 0.14 : 0.12;
    spots.push({ kind, x, z, y: landY(x, z), yaw: rng() * Math.PI * 2, s: base * sc });
  });
  const dk = isPhone ? 0.7 : 1;
  const lods = [
    ["lod0", 0, 60 * dk],
    ["lod1", 60 * dk, 200 * dk],
    ["lod2", 200 * dk, 600 * dk],
  ];
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const jobs = [];
  for (const kind of ["t0", "t1", "t2"]) {
    for (const [lv] of lods) {
      const rel = "models/" + kind + "_" + lv + ".glb";
      jobs.push(new Promise((resolve, reject) => {
        const url = (window.__glb && window.__glb[rel]) || ("/" + rel);
        loader.load(url, (gltf) => resolve({ kind, lv, gltf }), undefined, reject);
      }));
    }
  }
  return Promise.all(jobs).then((list) => {
    const by = {};
    for (const it of list) {
      const parts = [];
      it.gltf.scene.updateMatrixWorld(true);
      it.gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        const src = Array.isArray(o.material) ? o.material[0] : o.material;
        const role = src && src.name === "leaves" ? "leaves" : "branches";
        parts.push({ g, src, role });
      });
      let minY = Infinity, maxY = -Infinity;
      for (const p of parts) {
        p.g.computeBoundingBox();
        minY = Math.min(minY, p.g.boundingBox.min.y);
        maxY = Math.max(maxY, p.g.boundingBox.max.y);
      }
      if (isFinite(minY)) for (const p of parts) p.g.translate(0, -minY, 0);
      by[it.kind] = by[it.kind] || {};
      by[it.kind][it.lv] = { parts, height: Math.max(1, maxY - minY) };
    }
    const sphere = sphereOf(spots.map((s) => ({ x: s.x, y: s.y, z: s.z })), 18);
    let meshes = 0;
    const dummy = new THREE.Object3D();
    function dress(src, near, far, role, treeH) {
      const mat = src.clone();
      mat.side = THREE.DoubleSide;
      if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
      if (role === "leaves") {
        mat.alphaTest = Math.max(mat.alphaTest || 0, 0.45);
        if (!isPhone) mat.alphaToCoverage = true;
      }
      mat.precision = "highp";
      mat.customProgramCacheKey = () => "north-tree-n1-" + role + "-" + near + "-" + far;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = plantTime;
        shader.uniforms.uNear = { value: near };
        shader.uniforms.uFar = { value: far };
        shader.uniforms.uAmp = { value: role === "leaves" ? 0.07 : 0.012 };
        shader.uniforms.uTreeH = { value: Math.max(treeH, 1) };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uAmp;
uniform float uTreeH;
varying float vKeep;`)
          .replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 root = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float hh = clamp(position.y / max(uTreeH, 1e-4), 0.0, 1.0);
  float phase = fract(sin(dot(root.xz, vec2(127.1, 311.7))) * 43758.5453);
  vec2 wdir = vec2(0.819, 0.574);
  float gust = 0.4 + 0.6 * pow(max(sin(uTime * 0.23 + root.x * 0.01), 0.0), 0.5);
  float th = uTime * 1.2 + phase * 6.2831853;
  float sway = hh * hh * gust * sin(th) * uAmp * max(uTreeH, 1.0);
  transformed.x += wdir.x * sway;
  transformed.z += wdir.y * sway;
  float distR = distance(root.xz, cameraPosition.xz);
  float lo = uNear <= 0.5 ? 1.0 : smoothstep(uNear - 18.0, uNear + 18.0, distR);
  float hi = 1.0 - smoothstep(max(uFar - 24.0, 0.0), uFar + 24.0, distR);
  vKeep = clamp(lo * hi, 0.0, 1.0);
#else
  vKeep = 1.0;
#endif`);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>
varying float vKeep;`)
          .replace("#include <color_fragment>", `#include <color_fragment>
{
  if (vKeep < 0.995) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (dith > max(vKeep, 0.0)) discard;
  }
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r)) c = vec3(0.25, 0.2, 0.12);
  diffuseColor.rgb = clamp(c, vec3(0.0), vec3(1.2));
}`);
      };
      return mat;
    }
    const buckets = [];
    for (const kind of ["t0", "t1", "t2"]) {
      const mine = spots.filter((s) => s.kind === kind);
      if (!mine.length || !by[kind]) continue;
      for (const [lv, near, far] of lods) {
        const prep = by[kind][lv];
        if (!prep) continue;
        for (const part of prep.parts) {
          const geo = part.g.clone();
          geo.boundingSphere = sphere.clone();
          const mat = dress(part.src, near, far, part.role, prep.height);
          const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
          mesh.name = "northTree";
          mesh.castShadow = !isPhone && lv === "lod0" && part.role !== "leaves";
          mesh.receiveShadow = false;
          mesh.frustumCulled = true;
          mesh.count = 0;
          mesh.visible = false;
          root.add(mesh);
          buckets.push({ mesh, spots: mine, near, far, lv, kind, role: part.role });
          meshes++;
        }
      }
    }
    updateTrees = (cam) => {
      const cx = cam.position.x, cz = -cam.position.z;
      let shown = 0;
      for (const b of buckets) {
        const list = [];
        for (const s of b.spots) {
          const d = Math.hypot(s.x - cx, s.z - cz);
          if (d >= b.near - 26 && d <= b.far + 26) list.push(s);
        }
        b.mesh.count = list.length;
        b.mesh.visible = list.length > 0;
        if (!list.length) continue;
        shown++;
        list.forEach((s, i) => {
          dummy.position.set(s.x, s.y, -s.z);
          dummy.rotation.set(0, s.yaw, 0);
          dummy.scale.setScalar(s.s);
          dummy.updateMatrix();
          b.mesh.setMatrixAt(i, dummy.matrix);
        });
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.geometry.boundingSphere = sphereOf(list.map((s) => ({ x: s.x, y: s.y, z: s.z })), 14);
      }
      return shown;
    };
    window.__northTrees = { spots: spots.length, meshes, kinds: spots.reduce((m, s) => { m[s.kind] = (m[s.kind] || 0) + 1; return m; }, {}) };
    if (window.__north) window.__north.trees = window.__northTrees;
    if (window.__camera) updateTrees(window.__camera);
    return meshes;
  });
}

const shaderTimeHolders = [];

export function tickNorth(cam) {
  if (!cam || !cam.position) return;
  if (updateTrees) updateTrees(cam);
  const x = cam.position.x;
  const z = -cam.position.z;
  const k = builtPhone ? 0.7 : 1;
  for (const c of cullList) {
    const d = Math.hypot(c.cx - x, c.cz - z);
    c.mesh.visible = d < c.hide * k + c.r + 36;
  }
  if (window.__north && northRoot) {
    let draws = 0;
    northRoot.traverse((o) => {
      if (o.isMesh && o.visible && o.count !== 0) draws++;
    });
    window.__north.draws = draws;
  }
}

export function appendNorthWater(pos, foam, idx, shore, isPhone) {
  if (!ready) return { quads: 0 };
  const step = isPhone ? 5.5 : 3.2;
  const x0 = 80, x1 = 640, z0 = 458, z1 = 660;
  const nx = Math.ceil((x1 - x0) / step);
  const nz = Math.ceil((z1 - z0) / step);
  const ids = new Int32Array((nx + 1) * (nz + 1));
  ids.fill(-1);
  function shoreAt(x, z) {
    const ls = lakeSigned(x, z);
    if (ls > -0.2) return Math.max(ls, 0);
    const dd = ditchDist(x, z);
    if (dd < 4.05 && z > southShoreZ(clamp(x, LAKE_X0, LAKE_X1)) - 6) return Math.max(0, 4.05 - dd);
    return -1;
  }
  function vid(i, j) {
    const k = j * (nx + 1) + i;
    if (ids[k] >= 0) return ids[k];
    const x = x0 + i * step, z = z0 + j * step;
    const id = pos.length / 3;
    pos.push(x, z, 0.2);
    foam.push(0);
    shore.push(Math.max(0, shoreAt(x, z)));
    ids[k] = id;
    return id;
  }
  let quads = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * step, cz = z0 + (j + 0.5) * step;
      if (_inWater(cx, cz)) continue;
      if (shoreAt(cx, cz) < -0.05) continue;
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1);
      idx.push(a, b, c, a, c, d);
      quads++;
    }
  }
  return { quads, verts: pos.length / 3 };
}

export function buildNorth(ctx) {
  const { scene, isPhone, reedTex, grassTex, plantTime, outerPoly, inWater, polyEdgeDist } = ctx;
  if (!ready) prepareNorth(outerPoly, inWater, polyEdgeDist);
  builtPhone = !!isPhone;
  const root = new THREE.Group();
  root.name = "northN1";
  northRoot = root;
  scene.add(root);
  const land = buildLand(isPhone);
  root.add(land.mesh);
  const bridge = buildBridge();
  root.add(bridge);
  const reeds = buildReeds(root, isPhone, reedTex, plantTime);
  const grass = buildGrass(root, isPhone, grassTex, plantTime);
  const treeP = buildTrees(root, isPhone, plantTime).catch((err) => {
    window.__bootErr = "north trees " + (err && err.message ? err.message : err);
    console.error(err);
    return 0;
  });
  const info = {
    prep: window.__northPrep,
    landQuads: land.quads,
    landVerts: land.verts,
    waterQuads: window.__lakeWater ? window.__lakeWater.quads : 0,
    reeds: reeds.cards,
    reedBins: reeds.bins,
    reedMeshes: reeds.meshes,
    grass: grass.grass,
    shrubs: grass.shrubs,
    grassBins: grass.bins,
    grassMeshes: grass.meshes,
    drawsSync: 2 + reeds.meshes + grass.meshes,
    reflection: "shared-moat-planar",
  };
  window.__north = info;
  window.__tickNorth = tickNorth;
  treeP.then((n) => {
    info.treeMeshes = n;
    if (window.__camera) tickNorth(window.__camera);
    let draws = 0;
    root.traverse((o) => {
      if (o.isMesh && o.visible && o.count !== 0) draws++;
    });
    info.draws = draws;
    window.__northReady = true;
  });
  return info;
}
