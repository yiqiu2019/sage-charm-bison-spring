import * as THREE from "three";

// 城南 S2：苑囿林带 + 夯土矮墙。只加在 Z −250 以南，不改 S1 大道、堆场、田地。
// 坐标是规格系（+Z 北）。写入网格前走 wz。

const X0 = -150;
const X1 = 420;
const AVE_LO = 116;
const AVE_HI = 140;
const AVE_GAP_LO = 122;
const AVE_GAP_HI = 134;

function gauss(x, c, w) {
  const d = (x - c) / Math.max(w, 1e-5);
  return Math.exp(-d * d);
}

// 北缘：80–160 米波长的起伏。最北 −264，保证矮墙北皮仍在 −250 以南。
export function groveEdgeZ(x) {
  let z = -312;
  z += Math.sin(x * 0.044 + 0.35) * 18;
  z += Math.sin(x * 0.056 + 1.9) * 12;
  z += Math.sin(x * 0.0365 + 2.6) * 10;
  z += gauss(x, -95, 72) * 36;
  z += gauss(x, 5, 82) * -52;
  z += gauss(x, 150, 70) * 50;
  z += gauss(x, 288, 88) * -44;
  z += gauss(x, 405, 60) * 38;
  if (z > -264) z = -264;
  if (z < -405) z = -405;
  return z;
}

function southZ(x) {
  return -642 + Math.sin(x * 0.029 + 0.4) * 24 + Math.sin(x * 0.053 + 1.5) * 12;
}

function wallOff(x) {
  let o = 11.0 + 3.6 * (0.5 + 0.5 * Math.sin(x * 0.021 + 0.7));
  const maxO = -250.8 - 0.6 - groveEdgeZ(x);
  if (o > maxO) o = Math.max(10, maxO);
  if (o < 10) o = 10;
  return o;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function h2(ix, iz) {
  let a = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
  a = Math.imul(a ^ (a >>> 13), 1274126177);
  return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h2(x0, z0), b = h2(x0 + 1, z0), c = h2(x0, z0 + 1), d = h2(x0 + 1, z0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function clump(x, z) {
  return vnoise(x / 86, z / 74) * 0.62 + vnoise(x / 38 + 4.1, z / 34 - 2.4) * 0.38;
}

function smooth(a, b, t) {
  const k = Math.max(0, Math.min(1, (t - a) / Math.max(b - a, 1e-5)));
  return k * k * (3 - 2 * k);
}

function hash01(x, z, n) {
  const s = Math.sin(x * 127.1 + z * 311.7 + n * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const CELLS = {
  oak: [
    { uv: [0.0376, 0.66797, 0.21289, 0.98698], aspect: 0.733, h: [10, 16] },
    { uv: [0.28564, 0.66797, 0.46289, 0.98893], aspect: 0.736, h: [10, 16] },
    { uv: [0.53906, 0.66797, 0.70996, 0.97917], aspect: 0.732, h: [10, 16] },
    { uv: [0.77881, 0.66797, 0.9668, 0.97852], aspect: 0.807, h: [10, 16] },
  ],
  pine: [
    { uv: [0.04395, 0.33464, 0.20752, 0.6582], aspect: 0.674, h: [8, 14] },
    { uv: [0.29834, 0.33464, 0.45947, 0.6582], aspect: 0.664, h: [8, 14] },
  ],
  smoke: [
    { uv: [0.53418, 0.33464, 0.7168, 0.6556], aspect: 0.759, h: [4, 7] },
  ],
  bare: [
    { uv: [0.79297, 0.33464, 0.9585, 0.63281], aspect: 0.74, h: [9, 13] },
  ],
  bush: [
    { uv: [0.00879, 0.0, 0.23633, 0.15885], aspect: 1.91, h: [1.5, 3] },
    { uv: [0.30859, 0.0, 0.45801, 0.11263], aspect: 1.769, h: [1.5, 3] },
    { uv: [0.54199, 0.0, 0.71533, 0.11133], aspect: 2.076, h: [1.5, 3] },
    { uv: [0.78467, 0.0, 0.95801, 0.11133], aspect: 2.076, h: [1.5, 3] },
  ],
};

function rollSpecies(r) {
  if (r < 0.76) return "oak";
  if (r < 0.86) return "smoke";
  if (r < 0.98) return "pine";
  return "bare";
}

function planPlants(isPhone, groundY) {
  const dens = isPhone ? 0.5 : 1;
  const step = isPhone ? 6.2 : 3.65;
  const modelCap = isPhone ? 150 : 300;
  const boardCap = isPhone ? 3000 : 6000;
  const CELL = 5;
  const buckets = new Map();
  function tooClose(x, z, minD) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const rad = Math.ceil(minD / CELL) + 1;
    const min2 = minD * minD;
    for (let iz = cz - rad; iz <= cz + rad; iz++) {
      for (let ix = cx - rad; ix <= cx + rad; ix++) {
        const arr = buckets.get(ix + "," + iz);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const p = arr[k];
          const dx = p.x - x, dz = p.z - z;
          if (dx * dx + dz * dz < min2) return true;
        }
      }
    }
    return false;
  }
  function mark(x, z) {
    const key = (Math.floor(x / CELL)) + "," + (Math.floor(z / CELL));
    let a = buckets.get(key);
    if (!a) buckets.set(key, (a = []));
    a.push({ x, z });
  }

  const NAT = { t0: 83.7, t1: 71.7, t2: 28.3 };
  const plants = [];
  const speciesN = { oak: 0, smoke: 0, pine: 0, bare: 0, bush: 0, small: 0 };
  let northTree = -1e9, southTree = 1e9;

  function pushPlant(p) {
    if (!(p.y > 0.35 && p.y < 6)) return false;
    if (p.z > -250.05) return false;
    plants.push(p);
    mark(p.x, p.z);
    return true;
  }

  for (let x = X0; x <= X1; x += step) {
    for (let z = -252; z >= -690; z -= step) {
      const jx = x + (hash01(x, z, 1) - 0.5) * step * 0.9;
      const jz = z + (hash01(x, z, 2) - 0.5) * step * 0.9;
      if (jx < X0 || jx > X1) continue;
      if (jx > AVE_LO && jx < AVE_HI) continue;
      if (jz > -250.2) continue;
      const e = groveEdgeZ(jx);
      const s = southZ(jx);
      if (jz > e || jz < s) continue;
      const depth = e - jz;
      const feather = smooth(0, 48, jz - s);
      if (feather < 0.05) continue;
      const edge = depth < 20;
      const cl = clump(jx, jz);
      let gate;
      if (edge) gate = (0.62 + 0.28 * (1 - depth / 20)) * dens;
      else if (cl > 0.57) gate = 0.96 * dens * feather;
      else if (cl > 0.47) gate = 0.22 * dens * feather;
      else gate = 0.01 * dens * feather;
      if (hash01(jx, jz, 3) > gate) continue;
      const y = groundY(jx, jz);
      const rSp = hash01(jx, jz, 4);
      const rH = hash01(jx, jz, 5);
      const rK = hash01(jx, jz, 6);
      let sp, cell, h, kind = null, sc = 1;
      if (edge && rSp < 0.86) {
        sp = "bush";
        const list = CELLS.bush;
        const bi = rSp < 0.1 ? 3 : (rK * 3) | 0;
        cell = list[Math.min(list.length - 1, bi)];
        h = cell.h[0] + (cell.h[1] - cell.h[0]) * (0.35 + rH * 0.6);
        kind = "t2";
        sc = h / NAT.t2;
      } else if (edge) {
        sp = "small";
        cell = CELLS.oak[(rK * CELLS.oak.length) | 0];
        h = 5.6 + rH * 2.8;
        kind = "t1";
        sc = h / NAT.t1;
      } else {
        sp = rollSpecies(rSp);
        const list = CELLS[sp] || CELLS.oak;
        cell = list[(rK * list.length) | 0];
        h = cell.h[0] + (cell.h[1] - cell.h[0]) * (0.25 + rH * 0.75);
        kind = rK < 0.58 ? "t0" : "t1";
        sc = h / NAT[kind];
      }
      const minD = sp === "bush" ? 1.55 : Math.max(4.1, h * 0.32);
      if (tooClose(jx, jz, minD)) continue;
      pushPlant({
        x: jx, z: jz, y, h, w: Math.max(0.55, h * cell.aspect),
        uv: cell.uv, flip: hash01(jx, jz, 7) < 0.5 ? -1 : 1,
        yaw: hash01(jx, jz, 8) * Math.PI * 2,
        sp, kind, sc, edge, depth,
      });
    }
  }

  const edgeStep = isPhone ? 5.2 : 2.85;
  for (let x = X0; x <= X1; x += edgeStep) {
    const jx = x + (hash01(x, 1.7, 9) - 0.5) * 1.5;
    if (jx < X0 || jx > X1) continue;
    if (jx > AVE_LO && jx < AVE_HI) continue;
    const e = groveEdgeZ(jx);
    const depths = [1.6, 6.2, 11.4, 16.8];
    for (let di = 0; di < depths.length; di++) {
      if (isPhone && (di === 1 || di === 3)) continue;
      const depth = depths[di] + (hash01(jx, di, 10) - 0.5) * 1.6;
      const jz = e - depth;
      if (jz > -250.2 || jz < southZ(jx) + 8) continue;
      const y = groundY(jx, jz);
      const r = hash01(jx, jz, 12 + di);
      const small = di >= 2 && r > 0.84;
      let cell, h, kind, sc, sp;
      if (small) {
        sp = "small";
        cell = CELLS.oak[(r * 4) | 0];
        h = 5.8 + hash01(jx, jz, 13) * 2.4;
        kind = "t1";
        sc = h / NAT.t1;
      } else {
        sp = "bush";
        const bi = r < 0.12 ? 3 : (r * 3) | 0;
        cell = CELLS.bush[Math.min(3, bi)];
        h = cell.h[0] + (cell.h[1] - cell.h[0]) * (0.4 + hash01(jx, jz, 14) * 0.55);
        kind = "t2";
        sc = h / NAT.t2;
      }
      if (tooClose(jx, jz, small ? 3.4 : 1.55)) continue;
      pushPlant({
        x: jx, z: jz, y, h, w: Math.max(0.5, h * cell.aspect),
        uv: cell.uv, flip: r < 0.5 ? -1 : 1,
        yaw: hash01(jx, jz, 15) * Math.PI * 2,
        sp, kind, sc, edge: true, depth,
      });
    }
  }

  if (plants.length > boardCap) {
    const edge = [];
    const inner = [];
    for (const p of plants) (p.edge ? edge : inner).push(p);
    edge.sort((a, b) => hash01(a.x, a.z, 21) - hash01(b.x, b.z, 21));
    inner.sort((a, b) => hash01(a.x, a.z, 22) - hash01(b.x, b.z, 22));
    const edgeN = Math.min(edge.length, Math.floor(boardCap * 0.38));
    const room = boardCap - edgeN;
    plants.length = 0;
    for (let i = 0; i < edgeN; i++) plants.push(edge[i]);
    for (let i = 0; i < inner.length && plants.length < edgeN + room; i++) plants.push(inner[i]);
  }
  for (const p of plants) {
    speciesN[p.sp] = (speciesN[p.sp] || 0) + 1;
    if (p.z > northTree) northTree = p.z;
    if (p.z < southTree) southTree = p.z;
  }

  const treeRank = [];
  const bushRank = [];
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    if (!p.kind) continue;
    const dx = Math.abs(p.x - 128);
    if (!p.edge && p.kind !== "t2" && dx < 90) treeRank.push({ i, score: dx * 0.35 + p.depth * 0.2 });
    if (p.edge && p.depth < 22 && dx < 220) bushRank.push({ i, score: p.depth + dx * 0.03 });
  }
  treeRank.sort((a, b) => a.score - b.score);
  bushRank.sort((a, b) => a.score - b.score);
  const treeSlots = Math.min(treeRank.length, Math.floor(modelCap * 0.72));
  const bushSlots = Math.min(bushRank.length, modelCap - treeSlots);
  const chosen = new Set();
  for (let k = 0; k < treeSlots; k++) chosen.add(treeRank[k].i);
  for (let k = 0; k < bushSlots; k++) chosen.add(bushRank[k].i);
  for (const i of chosen) plants[i].model = 1;
  const modelN = chosen.size;

  const interior = { oak: 0, smoke: 0, pine: 0, bare: 0 };
  let interiorN = 0;
  for (const p of plants) {
    if (p.edge) continue;
    if (interior[p.sp] != null) {
      interior[p.sp]++;
      interiorN++;
    }
  }
  const pct = (k) => (interiorN ? +((interior[k] || 0) / interiorN).toFixed(3) : 0);
  return {
    plants,
    speciesN,
    interior,
    interiorN,
    oakPct: pct("oak"),
    smokePct: pct("smoke"),
    pinePct: pct("pine"),
    barePct: pct("bare"),
    northTree: northTree > -1e8 ? +northTree.toFixed(1) : null,
    southTree: southTree < 1e8 ? +southTree.toFixed(1) : null,
    models: modelN,
  };
}

function buildWall(ctx) {
  const { scene, groundY, wz, rammed } = ctx;
  const rng = mulberry32(0x6a11);
  const raw = [];
  for (let x = X0 - 4; x <= X1 + 4; x += 4) {
    raw.push({ x, z: groveEdgeZ(x) + wallOff(x) });
  }
  const stamp = [0];
  for (let i = 1; i < raw.length; i++) {
    stamp.push(stamp[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
  }
  const total = stamp[stamp.length - 1] || 1;
  function at(s) {
    if (s <= 0) return raw[0];
    if (s >= total) return raw[raw.length - 1];
    let lo = 0, hi = stamp.length - 1;
    while (lo < hi - 1) {
      const m = (lo + hi) >> 1;
      if (stamp[m] < s) lo = m;
      else hi = m;
    }
    const span = Math.max(stamp[hi] - stamp[lo], 1e-5);
    const t = (s - stamp[lo]) / span;
    return {
      x: raw[lo].x + (raw[hi].x - raw[lo].x) * t,
      z: raw[lo].z + (raw[hi].z - raw[lo].z) * t,
    };
  }
  let sAve0 = 0, sAve1 = 0, gotAve = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].x >= AVE_GAP_LO && raw[i].x <= AVE_GAP_HI) {
      if (!gotAve) { sAve0 = stamp[i]; gotAve = true; }
      sAve1 = stamp[i];
    }
  }
  if (!gotAve) {
    let best = 1e9, sA = total * 0.5;
    for (let i = 0; i < raw.length; i++) {
      const d = Math.abs(raw[i].x - 128);
      if (d < best) { best = d; sA = stamp[i]; }
    }
    sAve0 = sA - 6;
    sAve1 = sA + 6;
  }
  const gaps = [[Math.max(0, sAve0), Math.min(total, sAve1)]];
  let s = 70 + rng() * 40;
  while (s < total - 40) {
    const w = 4 + rng() * 2;
    const g0 = s, g1 = Math.min(total, s + w);
    const overlap = g1 > sAve0 - 8 && g0 < sAve1 + 8;
    if (!overlap) gaps.push([g0, g1]);
    s = g1 + 150 + rng() * 100;
  }
  gaps.sort((a, b) => a[0] - b[0]);
  const solids = [];
  let cursor = 0;
  for (const [g0, g1] of gaps) {
    if (g0 > cursor + 8) solids.push([cursor, g0]);
    cursor = Math.max(cursor, g1);
  }
  if (total > cursor + 8) solids.push([cursor, total]);

  const pos = [];
  const nrm = [];
  const idx = [];
  let northZ = -1e9;
  function pushV(p, n) {
    const i = pos.length / 3;
    if (p[2] > northZ) northZ = p[2];
    pos.push(p[0], p[1], wz(p[2]));
    nrm.push(n[0], n[1], -n[2]);
    return i;
  }
  function face(a, b, c, d, n) {
    const ia = pushV(a, n), ib = pushV(b, n), ic = pushV(c, n), id = pushV(d, n);
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = -(b[2] - a[2]);
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = -(c[2] - a[2]);
    const crx = aby * acz - abz * acy;
    const cry = abz * acx - abx * acz;
    const crz = abx * acy - aby * acx;
    const wn = [n[0], n[1], -n[2]];
    const flip = crx * wn[0] + cry * wn[1] + crz * wn[2] < 0;
    if (!flip) idx.push(ia, ib, ic, ia, ic, id);
    else idx.push(ia, id, ic, ia, ic, ib);
  }

  const H = 1.8, hb = 0.6, ht = 0.4;
  const segLens = [];
  function ringAt(x, z, dirx, dirz) {
    const px = -dirz, pz = dirx;
    let y = groundY(x, z);
    if (!(y > -2 && y < 20)) y = 1;
    const yy = y - 0.06;
    return {
      bl: [x + px * hb, yy, z + pz * hb],
      br: [x - px * hb, yy, z - pz * hb],
      tr: [x - px * ht, yy + H, z - pz * ht],
      tl: [x + px * ht, yy + H, z + pz * ht],
    };
  }
  for (const [a, b] of solids) {
    let u = a;
    while (u < b - 1) {
      let len = 30 + rng() * 50;
      const rest = b - u;
      if (rest <= 80) len = rest;
      else if (rest - len < 30) len = Math.max(30, rest - 30);
      if (len < 12) break;
      const s1 = Math.min(b, u + len);
      const A = at(u), B = at(s1);
      const dx = B.x - A.x, dz = B.z - A.z;
      const L = Math.hypot(dx, dz) || 1;
      const dirx = dx / L, dirz = dz / L;
      const nPost = Math.max(1, Math.round(L / 7));
      const rings = [];
      for (let i = 0; i <= nPost; i++) {
        const t = i / nPost;
        rings.push(ringAt(A.x + dx * t, A.z + dz * t, dirx, dirz));
      }
      for (let i = 0; i < rings.length - 1; i++) {
        const r0 = rings[i], r1 = rings[i + 1];
        const px = -dirz, pz = dirx;
        face(r0.bl, r0.tl, r1.tl, r1.bl, [px, 0, pz]);
        face(r0.br, r1.br, r1.tr, r0.tr, [-px, 0, -pz]);
        face(r0.tl, r0.tr, r1.tr, r1.tl, [0, 1, 0]);
      }
      const r0 = rings[0], rN = rings[rings.length - 1];
      face(r0.br, r0.bl, r0.tl, r0.tr, [-dirx, 0, -dirz]);
      face(rN.bl, rN.br, rN.tr, rN.tl, [dirx, 0, dirz]);
      segLens.push(+L.toFixed(1));
      u += len;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = rammed.clone();
  const prev = rammed.onBeforeCompile;
  mat.precision = "highp";
  mat.side = THREE.DoubleSide;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -2;
  mat.onBeforeCompile = (shader) => {
    if (prev) prev(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "diffuseColor.rgb = clamp(diffuseColor.rgb, vec3(0.04), vec3(0.82));",
      `diffuseColor.rgb = clamp(diffuseColor.rgb, vec3(0.04), vec3(0.82));
      {
        float ny = vNw.y;
        if (!(ny == ny)) ny = 0.0;
        float upG = smoothstep(0.72, 0.94, ny);
        vec3 grass = vec3(0.40, 0.38, 0.22);
        diffuseColor.rgb = mix(diffuseColor.rgb, grass, upG);
        float sC = diffuseColor.r + diffuseColor.g + diffuseColor.b;
        if (!(sC == sC)) diffuseColor.rgb = vec3(0.42, 0.36, 0.28);
        diffuseColor.rgb = clamp(diffuseColor.rgb, vec3(0.03), vec3(0.85));
      }`,
    );
  };
  mat.customProgramCacheKey = () => "grove-wall-s2b";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "groveWall";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  scene.add(mesh);
  const gapW = gaps.map((g) => +((g[1] - g[0]).toFixed(1)));
  return {
    segN: segLens.length,
    gaps: gaps.length,
    gapW,
    tris: (idx.length / 3) | 0,
    segLens,
    northFace: northZ > -1e8 ? +northZ.toFixed(1) : null,
    aveGap: +((sAve1 - sAve0).toFixed(1)),
  };
}

function loadBoards(ctx, plants) {
  const { scene, wz, isPhone } = ctx;
  if (!plants.length) return { meshes: 0, far0: 0, far1: 0 };
  const file = isPhone ? "hill_trees_1024.webp" : "hill_trees_2048.webp";
  const tex = new THREE.TextureLoader().load("/textures/hill_trees/" + file);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = isPhone ? 4 : 8;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const uvA = new Float32Array(plants.length * 4);
  const flipA = new Float32Array(plants.length);
  const farA = new Float32Array(plants.length);
  const dummy = new THREE.Object3D();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xffffff,
    alphaTest: 0.45,
    transparent: false,
    side: THREE.FrontSide,
    fog: true,
    toneMapped: true,
    depthWrite: true,
  });
  mat.precision = "highp";
  mat.alphaToCoverage = false;
  mat.customProgramCacheKey = () => "grove-billboard-s2b";
  const far0 = isPhone ? 100 : 155;
  const far1 = isPhone ? 140 : 200;
  const uTime = { value: 0 };
  const uTint = { value: new THREE.Color(1, 0.92, 0.8) };
  const tintDusk = new THREE.Color(1.0, 0.92, 0.80);
  const tintNight = new THREE.Color(0.20, 0.24, 0.36);
  const tintMist = new THREE.Color(0.86, 0.88, 0.90);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uTint = uTint;
    shader.uniforms.uFar0 = { value: far0 };
    shader.uniforms.uFar1 = { value: far1 };
    shader.uniforms.uWind = { value: new THREE.Vector2(1, 0.7) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec4 aUvRect;
attribute float aFlip;
attribute float aFar;
uniform float uTime;
uniform float uFar0;
uniform float uFar1;
uniform vec2 uWind;
varying vec2 vUvG;
varying float vKeep;`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>
{
  vec2 tuv = uv;
  if (aFlip < 0.0) tuv.x = 1.0 - tuv.x;
  vUvG = vec2(mix(aUvRect.x, aUvRect.z, tuv.x), mix(aUvRect.y, aUvRect.w, tuv.y));
}`)
      .replace("#include <project_vertex>", `vec4 mvPosition;
{
  vec3 iPos = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float iW = max(length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z)), 1e-5);
  float iH = max(length(vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z)), 1e-5);
  vec2 toCam = cameraPosition.xz - iPos.xz;
  float cd = length(toCam);
  if (!(cd == cd)) cd = 0.0;
  vec2 right = cd > 1e-4 ? vec2(toCam.y, -toCam.x) / max(cd, 1e-5) : vec2(1.0, 0.0);
  float hh = clamp(position.y, 0.0, 1.0);
  float wlen = length(uWind);
  vec2 wdir = wlen > 1e-5 ? uWind / wlen : vec2(1.0, 0.0);
  float phase = fract(sin(dot(iPos.xz, vec2(127.1, 311.7))) * 43758.5453);
  if (!(phase == phase)) phase = 0.0;
  float gust = 0.62 + 0.38 * sin(uTime * 0.23 + iPos.x * 0.011);
  gust *= 0.78 + 0.22 * sin(uTime * 0.09 + 1.4);
  float th = uTime * 1.15 + phase * 6.2831853;
  float wave = sin(th) * 0.7 + sin(th * 0.53 + phase) * 0.3;
  float sway = hh * hh * gust * wave * iH * 0.045;
  sway = clamp(sway, -iH * 0.1, iH * 0.1);
  if (!(sway == sway)) sway = 0.0;
  vec3 world = iPos;
  world.x += right.x * position.x * iW + wdir.x * sway;
  world.z += right.y * position.x * iW + wdir.y * sway;
  world.y += position.y * iH;
  float fade = smoothstep(uFar0, max(uFar1, uFar0 + 1.0), cd);
  vKeep = aFar > 0.5 ? fade : 1.0;
  if (!(vKeep == vKeep)) vKeep = 1.0;
  mvPosition = viewMatrix * modelMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float bias = fract(sin(dot(iPos.xz, vec2(19.19, 73.15))) * 43758.5453);
  if (!(bias == bias)) bias = 0.5;
  gl_Position.z += (bias - 0.5) * 0.0008 * gl_Position.w;
  if (!(gl_Position.x == gl_Position.x)) gl_Position = vec4(0.0, 0.0, -1.0, 1.0);
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 uTint;
varying vec2 vUvG;
varying float vKeep;`)
      .replace("#include <map_fragment>", `{
  vec2 uvS = clamp(vUvG, vec2(0.0), vec2(1.0));
  vec4 sampledDiffuseColor = texture2D(map, uvS);
  vec3 tint = clamp(uTint, vec3(0.0), vec3(1.6));
  sampledDiffuseColor.rgb = clamp(sampledDiffuseColor.rgb * tint, vec3(0.0), vec3(2.2));
  float a = sampledDiffuseColor.a;
  if (!(a == a) || a < 0.0) a = 0.0;
  if (a > 1.0) a = 1.0;
  sampledDiffuseColor.a = a;
  float sumC = sampledDiffuseColor.r + sampledDiffuseColor.g + sampledDiffuseColor.b;
  if (!(sumC == sumC)) sampledDiffuseColor.rgb = vec3(0.16, 0.12, 0.08);
  diffuseColor *= sampledDiffuseColor;
}`)
      .replace("#include <alphatest_fragment>", `
  if (vKeep < 0.995) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (!(dith == dith)) dith = 0.5;
    if (dith > max(vKeep, 0.0)) discard;
  }
  #include <alphatest_fragment>`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, plants.length);
  mesh.name = "groveBoard";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  plants.forEach((b, i) => {
    uvA[i * 4] = b.uv[0];
    uvA[i * 4 + 1] = b.uv[1];
    uvA[i * 4 + 2] = b.uv[2];
    uvA[i * 4 + 3] = b.uv[3];
    flipA[i] = b.flip;
    farA[i] = b.model ? 1 : 0;
    dummy.position.set(b.x, b.y - 0.3, wz(b.z));
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(Math.max(0.4, b.w), Math.max(0.4, b.h), 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  geo.setAttribute("aUvRect", new THREE.InstancedBufferAttribute(uvA, 4));
  geo.setAttribute("aFlip", new THREE.InstancedBufferAttribute(flipA, 1));
  geo.setAttribute("aFar", new THREE.InstancedBufferAttribute(farA, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  const prev = window.__tickGrove;
  window.__tickGrove = (camera) => {
    if (prev) prev(camera);
    const night = Math.max(0, Math.min(1, window.__night || 0));
    const mist = Math.max(0, Math.min(1, window.__mist || 0));
    uTint.value.copy(tintDusk).lerp(tintNight, night).lerp(tintMist, mist);
    uTime.value = performance.now() * 0.001;
  };
  return { meshes: 1, far0, far1 };
}

export function buildGrove(ctx) {
  const { isPhone, groundY } = ctx;
  const plan = planPlants(!!isPhone, groundY);
  const wall = buildWall(ctx);
  const boards = loadBoards(ctx, plan.plants);
  const models = [];
  for (const p of plan.plants) {
    if (!p.model) continue;
    models.push({
      x: p.x, z: p.z, y: p.y, yaw: p.yaw, s: p.sc, kind: p.kind, h: p.h,
    });
  }
  window.__grove = {
    models: models.length,
    boards: plan.plants.length,
    species: plan.speciesN,
    interior: plan.interior,
    interiorN: plan.interiorN,
    oakPct: plan.oakPct,
    smokePct: plan.smokePct,
    pinePct: plan.pinePct,
    barePct: plan.barePct,
    bush: plan.speciesN.bush || 0,
    wall,
    edgeAt128: +groveEdgeZ(128).toFixed(1),
    wallAt128: +(groveEdgeZ(128) + wallOff(128)).toFixed(1),
    northTree: plan.northTree,
    southTree: plan.southTree,
    boardMeshes: boards.meshes,
    far0: boards.far0,
    far1: boards.far1,
  };
  return { models };
}

export function attachGroveModels(opts) {
  const { scene, wz, isPhone, by, dressTree, models } = opts;
  if (!models || !models.length || !by || !dressTree) return 0;
  const far = isPhone ? 120 : 180;
  const reach = isPhone ? 155 : 210;
  const dummy = new THREE.Object3D();
  const groups = { t0: [], t1: [], t2: [] };
  for (const s of models) if (groups[s.kind]) groups[s.kind].push(s);
  const live = [];
  let meshes = 0;
  for (const kind of ["t0", "t1", "t2"]) {
    const spots = groups[kind];
    const prep = by[kind] && by[kind].lod1;
    if (!spots.length || !prep) continue;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const s of spots) {
      const zz = wz(s.z);
      const h = Math.max(1, prep.height * (s.s || 0.12));
      minX = Math.min(minX, s.x - 6);
      maxX = Math.max(maxX, s.x + 6);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y + h);
      minZ = Math.min(minZ, zz - 6);
      maxZ = Math.max(maxZ, zz + 6);
    }
    const sphere = new THREE.Sphere(
      new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5),
      Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + 4,
    );
    let parts = prep.parts.slice();
    if (parts.length > 2) {
      parts.sort((a, b) => {
        const ca = a.g.index ? a.g.index.count : a.g.attributes.position.count;
        const cb = b.g.index ? b.g.index.count : b.g.attributes.position.count;
        return cb - ca;
      });
      parts = parts.slice(0, 2);
    }
    for (const part of parts) {
      const geo = new THREE.BufferGeometry();
      for (const k in part.g.attributes) geo.setAttribute(k, part.g.attributes[k]);
      if (part.g.index) geo.setIndex(part.g.index);
      geo.boundingSphere = sphere.clone();
      const mat = dressTree(part.src, part.role, 0, far, prep.height, prep.radius);
      mat.precision = "highp";
      mat.transparent = false;
      mat.customProgramCacheKey = () => "grove-" + kind + "-" + part.role + "-s2b";
      const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
      mesh.name = "groveTree";
      mesh.count = spots.length;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.boundingSphere = sphere.clone();
      spots.forEach((s, i) => {
        dummy.position.set(s.x, s.y, wz(s.z));
        dummy.rotation.set(0, s.yaw || 0, 0);
        dummy.scale.setScalar(s.s > 0 ? s.s : 0.12);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      live.push({ mesh, spots });
      meshes++;
    }
  }
  const prev = window.__tickGrove;
  window.__tickGrove = (camera) => {
    if (prev) prev(camera);
    if (!camera) return;
    const cx = camera.position.x, cz = camera.position.z;
    let shown = 0;
    let nearD = 1e9;
    for (const rec of live) {
      let n = 0;
      for (const s of rec.spots) {
        const zz = wz(s.z);
        const d = Math.hypot(s.x - cx, zz - cz);
        if (d < nearD) nearD = d;
        if (d > reach) continue;
        dummy.position.set(s.x, s.y, zz);
        dummy.rotation.set(0, s.yaw || 0, 0);
        dummy.scale.setScalar(s.s > 0 ? s.s : 0.12);
        dummy.updateMatrix();
        rec.mesh.setMatrixAt(n, dummy.matrix);
        n++;
      }
      rec.mesh.count = n;
      rec.mesh.visible = n > 0;
      if (n) rec.mesh.instanceMatrix.needsUpdate = true;
      shown += n;
    }
    if (window.__grove) {
      window.__grove.shown = shown;
      window.__grove.nearD = nearD < 1e8 ? +nearD.toFixed(1) : null;
    }
  };
  if (window.__grove) {
    window.__grove.modelMeshes = meshes;
    window.__grove.modelKinds = {
      t0: groups.t0.length, t1: groups.t1.length, t2: groups.t2.length,
    };
    window.__grove.draws = meshes + (window.__grove.boardMeshes || 0) + 1;
  }
  return meshes;
}
