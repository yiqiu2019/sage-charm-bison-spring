import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { groveEdgeZ } from "./grove.js";
import { fieldBlockedNorth, westRoadDist } from "./north.js";

// 城外田野 O1：田块在地面遮罩里，树行 / 小路 / 东郊堆场是少量 InstancedMesh。

const CX = 175, CZ = 190;
const X0 = CX - 940, Z0 = CZ - 940, SPAN = 1880, N = 1280;
const BLOCK = 250;

const OAK = [
  [0.0376, 0.66797, 0.21289, 0.98698, 0.733],
  [0.28564, 0.66797, 0.46289, 0.98893, 0.736],
  [0.53906, 0.66797, 0.70996, 0.97917, 0.732],
];
const GRASS = [
  [0.083, 0.25, 0.5039, 0.9941, 0.681],
  [0.4053, 0.5933, 0.5039, 0.9941, 0.767],
  [0.7393, 0.9258, 0.5039, 0.9932, 0.762],
];
const SHRUB = [
  [0.0239, 0.3091, 0.0039, 0.4941, 1.163],
  [0.3706, 0.6284, 0.0039, 0.4941, 1.052],
  [0.7056, 0.9595, 0.0039, 0.4941, 1.036],
];

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function hypot(x, z) { return Math.hypot(x, z); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function oriOf(ix, iz) { return hash2(ix + 0.17, iz + 2.3) > 0.5 ? 1 : 0; }

function hillH(x, z) {
  const dx = x - CX, dz = z - CZ;
  const r = hypot(dx, dz) || 1;
  let az = Math.atan2(dx, dz) * 180 / Math.PI;
  if (az < 0) az += 360;
  if (az < 210 || az > 330 || r < 600 || r > 850) return 0;
  const u = (az - 210) / 120;
  const v = (r - 600) / 250;
  const eu = Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
  const ev = Math.sin(Math.PI * Math.max(0, Math.min(1, v)));
  const dome = Math.pow(eu, 0.85) * Math.pow(ev, 1.5);
  const nse = 0.5 + 0.5 * (
    Math.sin(az * 0.045 + 0.7) * 0.55
    + Math.sin(az * 0.11 + r * 0.008) * 0.25
    + Math.sin(r * 0.02 - 1.4) * 0.2
  );
  const sm = (a, b, t) => {
    const u2 = Math.max(0, Math.min(1, (t - a) / ((b - a) || 1)));
    return u2 * u2 * (3 - 2 * u2);
  };
  const fade = Math.max(1 - sm(-480, -400, x), 1 - sm(-250, -180, z), sm(480, 550, z));
  return Math.min(35, (9 + nse * 26) * dome) * fade;
}
function hillBlocked(x, z) {
  return hillH(x, z) > 0.55;
}
function hillFoot(x, z) {
  if (hillH(x, z) > 0.35) return false;
  const dx = x - CX, dz = z - CZ;
  const r = hypot(dx, dz) || 1;
  let az = Math.atan2(dx, dz) * 180 / Math.PI;
  if (az < 0) az += 360;
  if (az < 205 || az > 335) return false;
  return hillH(x + (dx / r) * 30, z + (dz / r) * 30) > 1.3;
}
function groveSouthZ(x) {
  return -642 + Math.sin(x * 0.029 + 0.4) * 24 + Math.sin(x * 0.053 + 1.5) * 12;
}

function yardOuter(v, x, z) {
  const ang = Math.atan2(z - v.z, x - v.x);
  return 52 + 8 * hash2(Math.cos(ang) * 3 + v.x * 0.02, Math.sin(ang) * 3 + v.z * 0.02);
}

const VILLAGES = [{ x: -142, z: 86 }, { x: -158, z: 332 }];

export function installFields(ctx) {
  const {
    scene, isPhone, groundY, polyEdgeDist, outerPoly, outsideLand, wz,
    treeSpots, south, groveModels,
  } = ctx;
  const sc = isPhone ? 0.7 : 1;
  const kept = treeSpots.length;
  const data = new Uint8Array(N * N * 4);
  const pix = SPAN / N;

  function setPx(c, r, cls, g, b) {
    if (c < 0 || r < 0 || c >= N || r >= N) return;
    const i = (r * N + c) * 4;
    data[i] = cls;
    data[i + 1] = g || 0;
    data[i + 2] = b == null ? 128 : b;
    data[i + 3] = 255;
  }
  function sampleCls(x, z) {
    const c = Math.floor((x - X0) / SPAN * N);
    const r = Math.floor((z - Z0) / SPAN * N);
    if (c < 0 || r < 0 || c >= N || r >= N) return 0;
    return data[(r * N + c) * 4];
  }
  function disk(x, z, rad, cls) {
    const c0 = Math.floor((x - rad - X0) / pix), c1 = Math.ceil((x + rad - X0) / pix);
    const r0 = Math.floor((z - rad - Z0) / pix), r1 = Math.ceil((z + rad - Z0) / pix);
    const r2 = rad * rad;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const px = X0 + (c + 0.5) * pix, pz = Z0 + (r + 0.5) * pix;
        if ((px - x) * (px - x) + (pz - z) * (pz - z) > r2) continue;
        const cur = (c >= 0 && r >= 0 && c < N && r < N) ? data[(r * N + c) * 4] : 0;
        if (cls === 64 && cur !== 255 && cur !== 180) continue;
        setPx(c, r, cls, 0, 128);
      }
    }
  }
  function rect(x0, x1, z0, z1, cls) {
    const c0 = Math.floor((Math.min(x0, x1) - X0) / pix), c1 = Math.ceil((Math.max(x0, x1) - X0) / pix);
    const r0 = Math.floor((Math.min(z0, z1) - Z0) / pix), r1 = Math.ceil((Math.max(z0, z1) - Z0) / pix);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) setPx(c, r, cls, 0, 128);
  }
  function stampSeg(ax, az, bx, bz, half, cls, protect) {
    const dx = bx - ax, dz = bz - az;
    const len = hypot(dx, dz) || 1;
    const tx = dx / len, tz = dz / len;
    const nx = -tz, nz = tx;
    const ang = Math.atan2(tz, tx);
    const gch = Math.round(((ang / (Math.PI * 2)) + 0.5) * 255);
    const minX = Math.min(ax, bx) - half, maxX = Math.max(ax, bx) + half;
    const minZ = Math.min(az, bz) - half, maxZ = Math.max(az, bz) + half;
    const c0 = Math.floor((minX - X0) / pix), c1 = Math.ceil((maxX - X0) / pix);
    const r0 = Math.floor((minZ - Z0) / pix), r1 = Math.ceil((maxZ - Z0) / pix);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const px = X0 + (c + 0.5) * pix, pz = Z0 + (r + 0.5) * pix;
        const vx = px - ax, vz = pz - az;
        const along = vx * tx + vz * tz;
        const across = vx * nx + vz * nz;
        if (along < -0.4 || along > len + 0.4 || Math.abs(across) > half) continue;
        if (protect && c >= 0 && r >= 0 && c < N && r < N) {
          const cur = data[(r * N + c) * 4];
          if (cur === 64 || cur === 230) continue;
        }
        const bch = clamp(Math.round((across / 4 + 0.5) * 255), 0, 255);
        setPx(c, r, cls, cls === 128 ? gch : 0, cls === 128 ? bch : 128);
      }
    }
  }

  function southOwned(x, z) {
    if (x >= -4 && x <= 268 && z <= -66 && z >= -512) return true;
    if (x >= 110 && x <= 150 && z <= -60 && z >= -730) return true;
    if (x > -160 && x < 430 && z < groveEdgeZ(x) + 6 && z > groveSouthZ(x) - 8) return true;
    return false;
  }
  function blocked(x, z) {
    if (hypot(x - CX, z - CZ) > 900) return true;
    if (!outsideLand(x, z)) return true;
    if (hillBlocked(x, z)) return true;
    if (fieldBlockedNorth(x, z)) return true;
    if (southOwned(x, z)) return true;
    if (polyEdgeDist(x, z, outerPoly) < 40) return true;
    return false;
  }
  function yardAt(x, z) {
    for (const v of VILLAGES) {
      const d = hypot(x - v.x, z - v.z);
      if (d < 30) return "core";
      if (d < yardOuter(v, x, z)) return "yard";
    }
    return "";
  }

  const step = 18;
  for (let z = Z0 + step * 0.5; z < Z0 + SPAN; z += step) {
    for (let x = X0 + step * 0.5; x < X0 + SPAN; x += step) {
      if (blocked(x, z)) continue;
      const yk = yardAt(x, z);
      const cls = yk === "core" ? 64 : yk === "yard" ? 180 : 255;
      rect(x - step * 0.5, x + step * 0.5, z - step * 0.5, z + step * 0.5, cls);
    }
  }

  const buildings = [
    { x: 98, z: -120, hx: 23, hz: 20 },
    { x: 97, z: -175, hx: 22, hz: 19 },
    { x: 160, z: -128, hx: 24, hz: 21 },
    { x: 152, z: -101, hx: 16, hz: 14 },
    { x: 190, z: -178, hx: 28, hz: 21 },
    { x: 70, z: -222, hx: 21, hz: 17 },
  ];
  const huts = [[-148, 74], [-132, 90], [-156, 96], [-128, 66], [-144, 110], [-168, 322], [-150, 338], [-174, 346], [-146, 312], [114, -208], [116, -218], [113, -228], [117, -238], [188, -78], [201, -92]];
  for (const b of buildings) rect(b.x - b.hx, b.x + b.hx, b.z - b.hz, b.z + b.hz, 64);
  for (const [x, z] of huts) disk(x, z, 10, 64);

  const occ = [];
  const grid = new Map();
  function addOcc(x, z) {
    occ.push({ x, z });
    const k = (Math.floor(x / 8)) + "," + (Math.floor(z / 8));
    let list = grid.get(k);
    if (!list) { list = []; grid.set(k, list); }
    list.push({ x, z });
  }
  function nearOcc(x, z, rad) {
    const n = Math.ceil(rad / 8);
    const ix = Math.floor(x / 8), iz = Math.floor(z / 8);
    const r2 = rad * rad;
    for (let a = -n; a <= n; a++) {
      for (let b = -n; b <= n; b++) {
        const list = grid.get((ix + a) + "," + (iz + b));
        if (!list) continue;
        for (const p of list) {
          const dx = p.x - x, dz = p.z - z;
          if (dx * dx + dz * dz < r2) return true;
        }
      }
    }
    return false;
  }
  for (const s of treeSpots) addOcc(s.x, s.z);
  for (const s of south.avenueGLB || []) addOcc(s.x, s.z);
  for (const s of south.boards || []) addOcc(s.x, s.z);
  for (const s of groveModels || []) addOcc(s.x, s.z);
  for (const p of occ) disk(p.x, p.z, 4, 64);

  function roadClear(pts, half) {
    for (let i = 0; i < pts.length - 1; i++) stampSeg(pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, half, 64);
  }
  roadClear([{ x: 128, z: -70 }, { x: 128, z: -720 }], 9);
  const westSeen = new Set();
  for (let z = 280; z <= 660; z += 18) {
    for (let x = -240; x <= 560; x += 18) {
      if (westRoadDist(x, z) >= 3.6) continue;
      const k = (Math.floor(x / 18)) + "," + (Math.floor(z / 18));
      if (westSeen.has(k)) continue;
      westSeen.add(k);
      if (sampleCls(x, z) !== 0) disk(x, z, 4.2, 64);
    }
  }

  const paths = [];
  function segClear(a, b) {
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (!outsideLand(x, z)) return false;
      if (polyEdgeDist(x, z, outerPoly) < 36) return false;
      if (fieldBlockedNorth(x, z) || hillBlocked(x, z)) return false;
    }
    return true;
  }
  function pushPath(pts) {
    let run = [];
    function flush() {
      if (run.length >= 2) {
        paths.push(run);
        for (let i = 0; i < run.length - 1; i++) {
          stampSeg(run[i].x, run[i].z, run[i + 1].x, run[i + 1].z, 1.5, 128, true);
        }
      }
      run = [];
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!run.length) { run.push(p); continue; }
      if (!segClear(run[run.length - 1], p)) flush();
      run.push(p);
    }
    flush();
  }
  function snapLong(x, z) {
    const ix = Math.floor(x / BLOCK), iz = Math.floor(z / BLOCK);
    const ori = oriOf(ix, iz);
    if (ori === 0) {
      const qy = clamp(Math.round((z - iz * BLOCK) / 20) * 20, 0, BLOCK);
      return { x, z: iz * BLOCK + qy };
    }
    const qy = clamp(Math.round((x - ix * BLOCK) / 20) * 20, 0, BLOCK);
    return { x: ix * BLOCK + qy, z };
  }
  function walkBaulk(ax, az, bx, bz) {
    const pts = [];
    let x = ax, z = az;
    pts.push(snapLong(x, z));
    x = pts[0].x; z = pts[0].z;
    for (let n = 0; n < 36; n++) {
      if (hypot(bx - x, bz - z) < 24) break;
      const ix = Math.floor(x / BLOCK), iz = Math.floor(z / BLOCK);
      const alongX = oriOf(ix, iz) === 0;
      const dx = bx - x, dz = bz - z;
      let nx = x, nz = z;
      if (alongX) {
        if (Math.abs(dx) > 10) nx = x + Math.sign(dx) * Math.min(Math.abs(dx), 80);
        else nz = z + Math.sign(dz || 1) * 20;
      } else if (Math.abs(dz) > 10) nz = z + Math.sign(dz) * Math.min(Math.abs(dz), 80);
      else nx = x + Math.sign(dx || 1) * 20;
      const s0 = snapLong(x, z);
      const s1 = snapLong(nx, nz);
      if (alongX && Math.abs(nx - x) > Math.abs(nz - z)) { nx = s1.x; nz = s0.z; }
      else if (!alongX && Math.abs(nz - z) >= Math.abs(nx - x)) { nz = s1.z; nx = s0.x; }
      else { nx = s1.x; nz = s1.z; }
      if (hypot(nx - x, nz - z) < 4) {
        nx = x + Math.sign(dx || 1) * 20;
        nz = z + Math.sign(dz || 1) * 20;
        const s2 = snapLong(nx, nz);
        nx = s2.x; nz = s2.z;
        if (hypot(nx - x, nz - z) < 4) break;
      }
      x = nx; z = nz;
      pts.push({ x, z });
    }
    pts.push(snapLong(bx, bz));
    return pts;
  }
  // 田埂上的土路：西两村之间、西南绕到南大道、东郊两堆场互连并北接堤道一带。
  pushPath(walkBaulk(-142, 70, -150, 300));
  pushPath(walkBaulk(-130, 40, -70, -40).concat(walkBaulk(-70, -40, 90, -78)));
  pushPath(walkBaulk(128, -70, 40, -90));

  let yard1 = { x: 470, z: 60 };
  let yard2 = { x: 500, z: 280 };
  function yardBad(x, z) {
    if (hillBlocked(x, z)) return true;
    for (const dx of [-20, 0, 20]) {
      for (const dz of [-14, 0, 14]) {
        const px = x + dx, pz = z + dz;
        if (!outsideLand(px, pz)) return true;
        if (fieldBlockedNorth(px, pz)) return true;
        if (polyEdgeDist(px, pz, outerPoly) < 48) return true;
      }
    }
    return false;
  }
  function nudge(y) {
    let x = y.x, z = y.z;
    for (let k = 0; k < 10 && yardBad(x, z); k++) x += 8;
    if (yardBad(x, z)) {
      x = y.x; z = y.z;
      for (let k = 0; k < 8 && yardBad(x, z); k++) z += 8;
    }
    return { x, z, from: y, shifted: x !== y.x || z !== y.z };
  }
  yard1 = nudge(yard1);
  yard2 = nudge(yard2);
  function yardPad(y) {
    rect(y.x - 20, y.x + 20, y.z - 14, y.z + 14, 230);
  }
  pushPath(walkBaulk(yard1.x - 28, yard1.z, yard1.x - 80, yard1.z));
  pushPath(walkBaulk(yard1.x + 6, yard1.z + 14, yard2.x, yard2.z - 20));
  pushPath(walkBaulk(yard2.x, yard2.z + 16, 470, 490));
  yardPad(yard1);
  yardPad(yard2);

  const rows = [];
  function canPlant(x, z) {
    if (hypot(x - CX, z - CZ) > 890) return false;
    if (blocked(x, z) && yardAt(x, z) !== "yard") return false;
    if (yardAt(x, z) === "core" || yardAt(x, z) === "yard") return false;
    if (hillBlocked(x, z) || hillFoot(x, z)) return false;
    const cls = sampleCls(x, z);
    if (cls !== 255) return false;
    if (westRoadDist(x, z) < 6) return false;
    return true;
  }
  const ix0 = Math.floor((CX - 860) / BLOCK), ix1 = Math.floor((CX + 860) / BLOCK);
  const iz0 = Math.floor((CZ - 860) / BLOCK), iz1 = Math.floor((CZ + 860) / BLOCK);
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const ori = oriOf(ix, iz);
      const lines = ori === 0 ? Math.floor(BLOCK / 20) : Math.floor(BLOCK / 20);
      for (let k = 1; k < lines; k++) {
        let x0, z0, x1, z1;
        if (ori === 0) {
          x0 = ix * BLOCK; x1 = x0 + BLOCK;
          z0 = z1 = iz * BLOCK + k * 20;
        } else {
          z0 = iz * BLOCK; z1 = z0 + BLOCK;
          x0 = x1 = ix * BLOCK + k * 20;
        }
        const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
        const rad = hypot(mx - CX, mz - CZ);
        if (rad < 120 || rad > 900) continue;
        let p = 0.2 + 0.55 * clamp((rad - 220) / 380, 0, 1);
        if (rad > 560) {
          const radial = Math.atan2(mx - CX, mz - CZ);
          const line = Math.atan2(x1 - x0, z1 - z0);
          const tang = Math.abs(Math.sin(line - radial));
          p = tang > 0.42 ? 0.94 : 0.12;
        }
        if (hash2(mx + 0.4, mz - 1.2) > p) continue;
        rows.push({ x0, z0, x1, z1, rad, h: hash2(mx, mz + 4) });
      }
    }
  }
  rows.sort((a, b) => b.rad - a.rad);
  const cap = isPhone ? 1500 : 3400;
  const nearCap = isPhone ? 220 : 480;
  let nearN = 0, farN = 0;
  const planted = [];
  for (const row of rows) {
    if (planted.length >= cap) break;
    const len = hypot(row.x1 - row.x0, row.z1 - row.z0) || 1;
    const tx = (row.x1 - row.x0) / len, tz = (row.z1 - row.z0) / len;
    const nx = -tz, nz = tx;
    const want = 5 + Math.floor(row.h * 11);
    let cursor = 6 + row.h * 4;
    let got = 0;
    let guard = 0;
    const local = [];
    while (got < want && cursor < len - 4 && guard < 28) {
      guard++;
      const gap = 8 + hash2(cursor, row.rad + guard) * 6;
      cursor += gap;
      if (hash2(cursor + 2, row.h) < 0.14) continue;
      const t = clamp(cursor / len, 0, 1);
      const j = (hash2(cursor, row.h + 3) - 0.5) * 2.4;
      const x = row.x0 + tx * cursor + nx * j;
      const z = row.z0 + tz * cursor + nz * j;
      if (!canPlant(x, z)) continue;
      if (nearOcc(x, z, 8)) { got++; continue; }
      const kind = hash2(x, z) < 0.55 ? "t0" : "t1";
      const spot = {
        x, z, y: groundY(x, z), kind,
        yaw: hash2(z, x) * Math.PI * 2,
        s: (kind === "t0" ? 0.13 : 0.14) * (0.9 + hash2(x + 1, z) * 0.2),
        far: row.rad > 520,
        model: polyEdgeDist(x, z, outerPoly) < 300,
      };
      local.push(spot);
      got++;
    }
    if (local.length < 5) continue;
    for (const s of local) addOcc(s.x, s.z);
    for (const s of local) {
      if (s.far) {
        if (farN >= cap - nearCap) continue;
        farN++;
      } else {
        if (nearN >= nearCap) continue;
        nearN++;
      }
      planted.push(s);
    }
  }

  const grassPts = [];
  const grassCap = isPhone ? 700 : 1400;
  for (let iz = iz0; iz <= iz1 && grassPts.length < grassCap; iz++) {
    for (let ix = ix0; ix <= ix1 && grassPts.length < grassCap; ix++) {
      const ori = oriOf(ix, iz);
      const lines = Math.floor(BLOCK / 20);
      for (let k = 1; k < lines && grassPts.length < grassCap; k += 2) {
        let x0, z0, x1, z1;
        if (ori === 0) {
          x0 = ix * BLOCK; x1 = x0 + BLOCK; z0 = z1 = iz * BLOCK + k * 20;
        } else {
          z0 = iz * BLOCK; z1 = z0 + BLOCK; x0 = x1 = ix * BLOCK + k * 20;
        }
        const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
        const ed = polyEdgeDist(mx, mz, outerPoly);
        if (ed < 42 || ed > 155) continue;
        if (hash2(mx, mz) > 0.55) continue;
        const len = hypot(x1 - x0, z1 - z0) || 1;
        for (let s = 5; s < len && grassPts.length < grassCap; s += isPhone ? 12 : 8) {
          const x = x0 + (x1 - x0) * (s / len);
          const z = z0 + (z1 - z0) * (s / len);
          const cls = sampleCls(x, z);
          if (cls !== 255 && cls !== 180) continue;
          grassPts.push({ x, z, y: groundY(x, z), h: hash2(x, z), shrub: false, far: 150 * sc });
        }
      }
    }
  }
  let shrubN = 0;
  const shrubCap = isPhone ? 260 : 640;
  for (let z = -220; z <= 720 && shrubN < shrubCap; z += 12) {
    for (let x = -640; x <= 40 && shrubN < shrubCap; x += 12) {
      if (!hillFoot(x, z)) continue;
      if (hash2(x * 0.7, z) > 0.82) continue;
      if (!outsideLand(x, z) || hillBlocked(x, z)) continue;
      if (polyEdgeDist(x, z, outerPoly) < 40) continue;
      const cls = sampleCls(x, z);
      if (cls === 128 || cls === 64 || cls === 230) continue;
      grassPts.push({
        x, z, y: groundY(x, z),
        h: 0.75 + hash2(z, x) * 0.55,
        shrub: true,
        far: 420 * sc,
      });
      shrubN++;
    }
  }

  const tex = new THREE.DataTexture(data, N, N);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  window.__fieldMaskTex = tex;
  window.__fieldGeo = { x0: X0, z0: Z0, invX: 1 / SPAN, invY: 1 / SPAN };
  const ground = scene.getObjectByName("outerGround");
  const fu = ground && ground.material && ground.material.userData.fieldUniforms;
  if (fu) {
    fu.uFieldMask.value = tex;
    fu.uField0.value.set(X0, Z0);
    fu.uFieldInv.value.set(1 / SPAN, 1 / SPAN);
  }

  const draws = [];
  const dummy = new THREE.Object3D();
  function track(mesh) { draws.push(mesh); scene.add(mesh); return mesh; }

  // 篱笆：一段 2 米，含柱与横杆。
  function fenceGeo() {
    const pos = [], idx = [];
    function box(x0, x1, y0, y1, z0, z1) {
      const b = pos.length / 3;
      const v = [
        [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
      ];
      for (const p of v) pos.push(p[0], p[1], p[2]);
      const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
      for (const f of faces) idx.push(b + f[0], b + f[1], b + f[2], b + f[0], b + f[2], b + f[3]);
    }
    box(-0.04, 0.04, 0, 1.1, -0.04, 0.04);
    box(1.96, 2.04, 0, 1.1, -0.04, 0.04);
    box(0, 2, 0.72, 0.8, -0.03, 0.03);
    box(0, 2, 0.38, 0.46, -0.03, 0.03);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x5c4334, roughness: 0.92, metalness: 0, side: THREE.FrontSide });
  fenceMat.precision = "highp";
  fenceMat.customProgramCacheKey = () => "field-fence-o1";
  const fenceSpots = [];
  function fenceYard(y, open) {
    const x0 = y.x - 20, x1 = y.x + 20, z0 = y.z - 14, z1 = y.z + 14;
    const segs = [];
    for (let x = x0; x < x1 - 0.1; x += 2) segs.push({ x, z: z1, yaw: 0, side: "n" });
    for (let x = x0; x < x1 - 0.1; x += 2) segs.push({ x, z: z0, yaw: Math.PI, side: "s" });
    for (let z = z0; z < z1 - 0.1; z += 2) segs.push({ x: x0, z, yaw: Math.PI / 2, side: "w" });
    for (let z = z0; z < z1 - 0.1; z += 2) segs.push({ x: x1, z, yaw: -Math.PI / 2, side: "e" });
    let skipped = 0;
    for (const s of segs) {
      if (s.side === open && skipped < 2 && Math.abs((open === "w" || open === "e" ? s.z - y.z : s.x - y.x)) < 3) {
        skipped++;
        continue;
      }
      fenceSpots.push(s);
    }
  }
  fenceYard(yard1, "w");
  fenceYard(yard2, "s");
  if (fenceSpots.length) {
    const mesh = new THREE.InstancedMesh(fenceGeo(), fenceMat, fenceSpots.length);
    mesh.name = "fieldFence";
    const dummy = new THREE.Object3D();
    fenceSpots.forEach((s, i) => {
      dummy.position.set(s.x, groundY(s.x, s.z), wz(s.z));
      dummy.rotation.set(0, s.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    track(mesh);
  }

  const farms = { granary_a: [], granary_b: [], heap_round: [] };
  const rngF = (function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })(0x0e17);
  function putFarm(kind, x, z, cx, cz, jit) {
    const yaw = Math.atan2(cx - x, -(cz - z)) + (rngF() - 0.5) * jit;
    const s = 0.9 + rngF() * 0.2;
    farms[kind].push({ x, z, y: groundY(x, z) + 0.02, yaw, s });
  }
  putFarm("granary_b", yard1.x + 12, yard1.z - 8, yard1.x, yard1.z, 0.4);
  putFarm("granary_a", yard1.x + 12.4, yard1.z, yard1.x, yard1.z, 0.4);
  putFarm("granary_b", yard1.x + 12, yard1.z + 8, yard1.x, yard1.z, 0.4);
  putFarm("granary_a", yard2.x + 11, yard2.z + 8, yard2.x, yard2.z, 0.45);
  putFarm("granary_b", yard2.x + 11.5, yard2.z - 1, yard2.x, yard2.z, 0.45);
  putFarm("granary_a", yard2.x + 11, yard2.z - 9, yard2.x, yard2.z, 0.45);
  const heaps = [
    [yard1.x - 6, yard1.z - 6], [yard1.x - 2, yard1.z + 5], [yard1.x - 8, yard1.z + 2], [yard1.x + 2, yard1.z - 4], [yard1.x - 1, yard1.z + 8],
    [yard2.x - 5, yard2.z + 4], [yard2.x - 8, yard2.z - 3], [yard2.x + 1, yard2.z + 6], [yard2.x - 2, yard2.z - 7],
  ];
  for (const [x, z] of heaps) {
    farms.heap_round.push({
      x, z, y: groundY(x, z) + 0.02,
      yaw: rngF() * Math.PI * 2,
      s: 0.9 + rngF() * 0.2,
    });
  }

  const info = {
    ready: false,
    keptOutskirts: kept,
    beforeTrees: kept + (south.avenueGLB || []).length + (south.boards || []).length + (groveModels || []).length,
    avenue: (south.avenueGLB || []).length,
    boards: (south.boards || []).length,
    grove: (groveModels || []).length,
    added: planted.length,
    models: planted.filter((s) => s.model).length,
    near: nearN,
    far: farN,
    grass: grassPts.length - shrubN,
    shrubs: shrubN,
    paths: paths.length,
    yards: [yard1, yard2],
    farms: { a: farms.granary_a.length, b: farms.granary_b.length, h: farms.heap_round.length },
    draws: 0,
  };
  window.__fields = info;

  const wind = new THREE.Vector2(1, 0.7);
  const uTime = { value: 0 };
  const farmLive = [];
  const treeLive = [];
  window.__tickFields = (time, camera) => {
    uTime.value = time || 0;
    const cam = (camera && camera.position) ? camera : window.__cam;
    if (camera && camera.position) window.__cam = camera;
    if (!cam || !cam.position) return;
    for (const rec of farmLive) {
      let n = 0;
      const attr = rec.mesh.geometry.getAttribute("aKeep");
      for (const s of rec.spots) {
        if (!s) continue;
        const d = Math.hypot(s.x - cam.position.x, wz(s.z) - cam.position.z);
        const w = rec.weight(d);
        if (w < 0.02) continue;
        dummy.position.set(s.x, s.y, wz(s.z));
        dummy.rotation.set(0, s.yaw, 0);
        dummy.scale.setScalar(s.s);
        dummy.updateMatrix();
        rec.mesh.setMatrixAt(n, dummy.matrix);
        if (attr) attr.setX(n, w);
        n++;
      }
      rec.mesh.count = n;
      rec.mesh.visible = n > 0;
      if (n) {
        rec.mesh.instanceMatrix.needsUpdate = true;
        if (attr) attr.needsUpdate = true;
      }
    }
    for (const rec of treeLive) {
      let n = 0;
      for (const s of rec.spots) {
        const d = Math.hypot(s.x - cam.position.x, wz(s.z) - cam.position.z);
        if (!(d >= 0) || d > rec.far) continue;
        dummy.position.set(s.x, s.y, wz(s.z));
        dummy.rotation.set(0, s.yaw, 0);
        dummy.scale.setScalar(s.s);
        dummy.updateMatrix();
        rec.mesh.setMatrixAt(n, dummy.matrix);
        n++;
      }
      rec.mesh.count = Math.max(n, 0);
      rec.mesh.visible = n > 0;
      if (n) rec.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  function floatAttr(attr) {
    if (!attr) return null;
    if (!attr.normalized && attr.array instanceof Float32Array) return attr.clone();
    const f = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) {
      for (let k = 0; k < attr.itemSize; k++) f[i * attr.itemSize + k] = attr.getComponent(i, k);
    }
    return new THREE.BufferAttribute(f, attr.itemSize);
  }
  function prepFarm(gltf) {
    let found = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh || found) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", floatAttr(o.geometry.getAttribute("position")));
      const nrm = floatAttr(o.geometry.getAttribute("normal"));
      if (nrm) g.setAttribute("normal", nrm);
      const uv = floatAttr(o.geometry.getAttribute("uv"));
      if (uv) g.setAttribute("uv", uv);
      if (o.geometry.index) g.setIndex(o.geometry.index.clone());
      g.applyMatrix4(o.matrixWorld);
      g.computeBoundingBox();
      const bb = g.boundingBox;
      g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      found = { geometry: g, material: src };
    });
    return found;
  }
  function dressFarm(src, key) {
    const mat = src.clone();
    mat.side = THREE.FrontSide;
    mat.shadowSide = THREE.FrontSide;
    mat.metalness = 0;
    mat.vertexColors = false;
    if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
    mat.precision = "highp";
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aKeep;\nvarying float vKeep;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vKeep = aKeep;\n  if (!(vKeep == vKeep)) vKeep = 1.0;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vKeep;\n")
        .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r && c.g == c.g && c.b == c.b)) diffuseColor.rgb = vec3(0.45, 0.38, 0.28);
  diffuseColor.rgb = clamp(diffuseColor.rgb, vec3(0.0), vec3(1.2));
}`)
        .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
{
  float k = vKeep;
  if (!(k == k)) k = 1.0;
  if (k < 0.996) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (!(dith == dith)) dith = 0.0;
    if (dith > k) discard;
  }
}`);
    };
    return mat;
  }

  function buildFarms() {
    const names = ["granary_a", "granary_b", "heap_round"];
    const lods = ["lod1", "lod2"];
    const jobs = [];
    for (const name of names) for (const lv of lods) {
      jobs.push(new Promise((resolve, reject) => {
        const rel = "models/" + name + "_" + lv + ".glb";
        const url = (window.__glb && window.__glb[rel]) || ("/" + rel);
        loader.load(url, (gltf) => resolve({ name, lv, prep: prepFarm(gltf) }), undefined, reject);
      }));
    }
    return Promise.all(jobs).then((list) => {
      const by = {};
      for (const it of list) {
        by[it.name] = by[it.name] || {};
        by[it.name][it.lv] = it.prep;
      }
      for (const name of names) {
        const spots = farms[name];
        if (!spots.length) continue;
        for (const lv of lods) {
          const prep = by[name] && by[name][lv];
          if (!prep) continue;
          const geo = prep.geometry.clone();
          const keep = new THREE.InstancedBufferAttribute(new Float32Array(spots.length), 1);
          keep.setUsage(THREE.DynamicDrawUsage);
          geo.setAttribute("aKeep", keep);
          const mat = dressFarm(prep.material, "field-farm-" + name + "-" + lv);
          const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
          mesh.name = "fieldFarm";
          mesh.count = spots.length;
          mesh.frustumCulled = false;
          spots.forEach((s, i) => {
            dummy.position.set(s.x, s.y, wz(s.z));
            dummy.rotation.set(0, s.yaw, 0);
            dummy.scale.setScalar(s.s);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            keep.setX(i, 1);
          });
          mesh.instanceMatrix.needsUpdate = true;
          keep.needsUpdate = true;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          track(mesh);
          const near = lv === "lod1" ? 0 : 200 * sc;
          const far = lv === "lod1" ? 200 * sc : 600 * sc;
          farmLive.push({
            mesh, spots,
            weight(d) {
              const a = near, b = far;
              const fade = 22 * sc;
              const inn = a <= 0 ? 1 : clamp((d - (a - fade)) / (fade * 2), 0, 1);
              const out = 1 - clamp((d - (b - fade)) / (fade * 2), 0, 1);
              return clamp(inn * out, 0, 1);
            },
          });
        }
      }
    });
  }

  function prepTree(gltf) {
    gltf.scene.updateMatrixWorld(true);
    const geos = { leaves: [], branches: [] };
    let srcL = null, srcB = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      const pos = floatAttr(g.getAttribute("position"));
      const nrm = floatAttr(g.getAttribute("normal"));
      const uv = floatAttr(g.getAttribute("uv"));
      if (pos) g.setAttribute("position", pos);
      if (nrm) g.setAttribute("normal", nrm);
      if (uv) g.setAttribute("uv", uv);
      if (g.index) g.setIndex(g.index.clone());
      g.applyMatrix4(o.matrixWorld);
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const role = src && src.name === "leaves" ? "leaves" : "branches";
      geos[role].push(g);
      if (role === "leaves") srcL = src; else srcB = src;
    });
    function merge(list) {
      if (!list.length) return null;
      const base = list.length === 1 ? list[0] : null;
      if (base) return base;
      const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
      let count = 0;
      for (const g of parts) count += g.getAttribute("position").count;
      const pos = new Float32Array(count * 3);
      const nrm = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      let o = 0;
      for (const g of parts) {
        const p = g.getAttribute("position"), n = g.getAttribute("normal"), u = g.getAttribute("uv");
        for (let i = 0; i < p.count; i++) {
          pos[(o + i) * 3] = p.getX(i); pos[(o + i) * 3 + 1] = p.getY(i); pos[(o + i) * 3 + 2] = p.getZ(i);
          if (n) { nrm[(o + i) * 3] = n.getX(i); nrm[(o + i) * 3 + 1] = n.getY(i); nrm[(o + i) * 3 + 2] = n.getZ(i); }
          else nrm[(o + i) * 3 + 1] = 1;
          if (u) { uv[(o + i) * 2] = u.getX(i); uv[(o + i) * 2 + 1] = u.getY(i); }
        }
        o += p.count;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      return g;
    }
    const out = [];
    let minY = Infinity, maxY = -Infinity, maxR = 1;
    for (const role of ["branches", "leaves"]) {
      const g = merge(geos[role]);
      if (!g) continue;
      g.computeBoundingBox();
      minY = Math.min(minY, g.boundingBox.min.y);
      maxY = Math.max(maxY, g.boundingBox.max.y);
      maxR = Math.max(maxR, Math.hypot(g.boundingBox.min.x, g.boundingBox.min.z), Math.hypot(g.boundingBox.max.x, g.boundingBox.max.z));
      out.push({ g, src: role === "leaves" ? srcL : srcB, role });
    }
    if (!isFinite(minY)) minY = 0;
    for (const p of out) p.g.translate(0, -minY, 0);
    return { parts: out, height: Math.max(1, maxY - minY), radius: maxR };
  }
  function dressTree(src, role, key, height) {
    const mat = src.clone();
    mat.side = THREE.DoubleSide;
    mat.shadowSide = THREE.DoubleSide;
    if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
    if (role === "leaves") {
      mat.vertexColors = true;
      mat.alphaTest = Math.max(mat.alphaTest || 0, 0.4);
      mat.side = THREE.DoubleSide;
    }
    mat.precision = "highp";
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uWind = { value: wind };
      shader.uniforms.uTreeH = { value: Math.max(height, 1) };
      shader.uniforms.uFar = { value: 300 * sc };
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
uniform float uTime;
uniform vec2 uWind;
uniform float uTreeH;
uniform float uFar;
varying float vKeep;`).replace("#include <begin_vertex>", `#include <begin_vertex>
  vKeep = 1.0;
#ifdef USE_INSTANCING
  vec3 root = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float hh = clamp(position.y / max(uTreeH, 1e-4), 0.0, 1.0);
  float wlen = max(length(uWind), 1e-5);
  vec2 wdir = uWind / wlen;
  float phase = fract(sin(dot(root.xz, vec2(127.1, 311.7))) * 43758.5453);
  if (!(phase == phase)) phase = 0.0;
  float th = uTime * 1.25 + phase * 6.2831853 - dot(root.xz, wdir) * 0.12;
  float wave = sin(th) * 0.7 + sin(th * 0.5 + phase) * 0.3;
  float sway = hh * hh * wave * 0.06 * uTreeH;
  if (sway == sway) { transformed.x += wdir.x * sway; transformed.z += wdir.y * sway; }
  float distR = distance(root.xz, cameraPosition.xz);
  float edge = max(uFar, 1.0);
  vKeep = 1.0 - smoothstep(edge - 28.0, edge + 28.0, distR);
#endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vKeep;\n")
        .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r && c.g == c.g && c.b == c.b)) diffuseColor.rgb = vec3(0.32, 0.34, 0.22);
  diffuseColor.rgb = clamp(diffuseColor.rgb, vec3(0.0), vec3(1.15));
}`)
        .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
{
  float k = vKeep;
  if (!(k == k)) k = 1.0;
  if (k < 0.992) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (dith > max(k, 0.0)) discard;
  }
}`);
    };
    return mat;
  }

  function buildTrees() {
    if (!planted.length) return Promise.resolve();
    const jobs = [];
    for (const name of ["t0", "t1"]) {
      jobs.push(new Promise((resolve, reject) => {
        const rel = "models/" + name + "_lod1.glb";
        const url = (window.__glb && window.__glb[rel]) || ("/" + rel);
        loader.load(url, (gltf) => resolve({ name, prep: prepTree(gltf) }), undefined, reject);
      }));
    }
    return Promise.all(jobs).then((list) => {
      const by = {};
      for (const it of list) by[it.name] = it.prep;
      let hAvg = 12;
      if (by.t0) hAvg = by.t0.height * 0.135;
      info.treeH = +hAvg.toFixed(2);
      for (const kind of ["t0", "t1"]) {
      const mine = planted.filter((s) => s.kind === kind && s.model);
        const prep = by[kind];
        if (!mine.length || !prep) continue;
        for (const part of prep.parts) {
          const mat = dressTree(part.src, part.role, "field-tree-" + kind + "-" + part.role, prep.height);
          const mesh = new THREE.InstancedMesh(part.g, mat, mine.length);
          mesh.name = "fieldTree";
          mesh.frustumCulled = false;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mine.forEach((s, i) => {
            dummy.position.set(s.x, s.y, wz(s.z));
            dummy.rotation.set(0, s.yaw, 0);
            dummy.scale.setScalar(s.s);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          });
          mesh.instanceMatrix.needsUpdate = true;
          track(mesh);
          treeLive.push({ mesh, spots: mine, far: 340 * sc });
        }
      }
      return hAvg;
    });
  }

  function buildBoards(hAvg) {
    if (!planted.length) return Promise.resolve();
    const file = isPhone ? "hill_trees_1024.webp" : "hill_trees_2048.webp";
    return new Promise((resolve) => {
      const map = new THREE.TextureLoader().load("/textures/hill_trees/" + file, () => resolve(map), undefined, () => resolve(map));
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      map.generateMipmaps = true;
    }).then((map) => {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.translate(0, 0.5, 0);
      const uvA = new Float32Array(planted.length * 4);
      const flipA = new Float32Array(planted.length);
      planted.forEach((s, i) => {
        const cell = OAK[i % OAK.length];
        uvA.set(cell.slice(0, 4), i * 4);
        flipA[i] = hash2(s.x, s.z) > 0.5 ? 1 : -1;
      });
      geo.setAttribute("aUvRect", new THREE.InstancedBufferAttribute(uvA, 4));
      geo.setAttribute("aFlip", new THREE.InstancedBufferAttribute(flipA, 1));
      const mat = new THREE.MeshBasicMaterial({
        map, color: 0xffffff, alphaTest: 0.45, side: THREE.DoubleSide, fog: true, toneMapped: true,
      });
      mat.precision = "highp";
      mat.customProgramCacheKey = () => "field-board-o1";
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uTime;
        shader.uniforms.uWind = { value: wind };
        shader.uniforms.uNear = { value: 300 * sc };
        shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute vec4 aUvRect;
attribute float aFlip;
uniform float uTime;
uniform vec2 uWind;
uniform float uNear;
varying float vKeep;
varying vec2 vUvG;`).replace("#include <uv_vertex>", `#include <uv_vertex>
{
  vec2 tuv = uv;
  if (aFlip < 0.0) tuv.x = 1.0 - tuv.x;
  vUvG = vec2(mix(aUvRect.x, aUvRect.z, tuv.x), mix(aUvRect.y, aUvRect.w, tuv.y));
}`).replace("#include <project_vertex>", `vec4 mvPosition;
{
  vec3 iPos = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float iW = max(length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z)), 1e-5);
  float iH = max(length(vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z)), 1e-5);
  vec2 toCam = cameraPosition.xz - iPos.xz;
  float cd = length(toCam);
  vec2 right = cd > 1e-4 ? vec2(toCam.y, -toCam.x) / max(cd, 1e-5) : vec2(1.0, 0.0);
  float hh = clamp(position.y, 0.0, 1.0);
  float wlen = max(length(uWind), 1e-5);
  vec2 wdir = uWind / wlen;
  float phase = fract(sin(dot(iPos.xz, vec2(127.1, 311.7))) * 43758.5453);
  if (!(phase == phase)) phase = 0.0;
  float sway = hh * hh * sin(uTime * 1.2 + phase * 6.0) * 0.35;
  vec3 p = iPos + vec3(right.x, 0.0, right.y) * position.x * iW + vec3(0.0, position.y * iH, 0.0);
  p.x += wdir.x * sway;
  p.z += wdir.y * sway;
  float distR = cd;
  float inn = smoothstep(uNear - 30.0, uNear + 30.0, distR);
  float outF = 1.0 - smoothstep(860.0, 980.0, distR);
  vKeep = clamp(inn * outF, 0.0, 1.0);
  mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}`);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vKeep;\nvarying vec2 vUvG;\n")
          .replace("#include <map_fragment>", `
{
  vec4 texel = texture2D(map, vUvG);
  if (!(texel.r == texel.r)) texel = vec4(0.3, 0.32, 0.22, 1.0);
  diffuseColor *= texel;
}`)
          .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
{
  float k = vKeep;
  if (!(k == k)) discard;
  if (k < 0.992) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (dith > k) discard;
  }
}`);
      };
      const mesh = new THREE.InstancedMesh(geo, mat, planted.length);
      mesh.name = "fieldBoard";
      mesh.frustumCulled = false;
      const h = Math.max(8, Math.min(16, hAvg || 12));
      planted.forEach((s, i) => {
        const cell = OAK[i % OAK.length];
        const width = h * cell[4] * (0.85 + hash2(s.z, s.x) * 0.3);
        dummy.position.set(s.x, s.y, wz(s.z));
        dummy.scale.set(width, h * (0.9 + hash2(s.x, s.z + 2) * 0.25), 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      track(mesh);
    });
  }

  function buildGrass() {
    if (!grassPts.length) return Promise.resolve();
    const file = isPhone ? "grass_shrub_1024.webp" : "grass_shrub_2048.webp";
    return new Promise((resolve) => {
      const map = new THREE.TextureLoader().load("/textures/" + file, () => resolve(map), undefined, () => resolve(map));
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    }).then((map) => {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.translate(0, 0.5, 0);
      const uvA = new Float32Array(grassPts.length * 4);
      const farA = new Float32Array(grassPts.length);
      grassPts.forEach((s, i) => {
        const cell = s.shrub ? SHRUB[i % SHRUB.length] : GRASS[i % GRASS.length];
        uvA.set(cell.slice(0, 4), i * 4);
        farA[i] = s.far || 150;
      });
      geo.setAttribute("aUvRect", new THREE.InstancedBufferAttribute(uvA, 4));
      geo.setAttribute("aFar", new THREE.InstancedBufferAttribute(farA, 1));
      const mat = new THREE.MeshBasicMaterial({
        map, alphaTest: 0.35, side: THREE.DoubleSide, fog: true, toneMapped: true, transparent: false,
      });
      mat.precision = "highp";
      mat.customProgramCacheKey = () => "field-grass-o1b";
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uTime;
        shader.uniforms.uWind = { value: wind };
        shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute vec4 aUvRect;
attribute float aFar;
uniform float uTime;
uniform vec2 uWind;
varying float vKeep;
varying vec2 vUvG;`).replace("#include <uv_vertex>", `#include <uv_vertex>
{
  vKeep = 1.0;
  vUvG = vec2(mix(aUvRect.x, aUvRect.z, uv.x), mix(aUvRect.y, aUvRect.w, uv.y));
}`).replace("#include <project_vertex>", `#include <project_vertex>
{
#ifdef USE_INSTANCING
  vec3 root = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float hh = clamp(position.y, 0.0, 1.0);
  float wlen = max(length(uWind), 1e-5);
  vec2 wdir = uWind / wlen;
  float phase = fract(sin(dot(root.xz, vec2(19.1, 47.7))) * 43758.5453);
  if (!(phase == phase)) phase = 0.0;
  float sway = hh * hh * sin(uTime * 1.4 + phase * 6.0) * 0.12;
  if (sway == sway) { transformed.x += wdir.x * sway; transformed.z += wdir.y * sway; }
  float distR = distance(root.xz, cameraPosition.xz);
  float lim = max(aFar, 1.0);
  if (!(lim == lim)) lim = 150.0;
  vKeep = 1.0 - smoothstep(lim - 24.0, lim + 10.0, distR);
#endif
}`);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vKeep;\nvarying vec2 vUvG;\n")
          .replace("#include <map_fragment>", `
{
  vec4 texel = texture2D(map, vUvG);
  if (!(texel.a == texel.a)) discard;
  diffuseColor *= texel;
}`)
          .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
{
  float k = vKeep;
  if (!(k == k) || k < 0.02) discard;
  if (k < 0.98) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (dith > k) discard;
  }
}`);
      };
      const mesh = new THREE.InstancedMesh(geo, mat, grassPts.length);
      mesh.name = "fieldGrass";
      mesh.frustumCulled = false;
      grassPts.forEach((s, i) => {
        const cell = s.shrub ? SHRUB[i % SHRUB.length] : GRASS[i % GRASS.length];
        const h = s.shrub ? s.h : 0.35 + s.h * 0.35;
        const w = h * cell[4];
        dummy.position.set(s.x, s.y, wz(s.z));
        dummy.rotation.set(0, hash2(s.x, s.z) * Math.PI, 0);
        dummy.scale.set(w, h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      track(mesh);
    });
  }

  Promise.all([buildFarms(), buildTrees().then((h) => buildBoards(h)), buildGrass()]).then(() => {
    info.draws = draws.length;
    info.ready = true;
    info.totalOutdoor = kept + info.avenue + info.boards + info.grove + planted.length;
  }).catch((err) => {
    info.ready = true;
    info.err = String(err && err.message ? err.message : err);
    window.__fieldErr = info.err;
    console.error(err);
  });

  return info;
}
