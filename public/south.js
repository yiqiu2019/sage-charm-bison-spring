import * as THREE from "three";

// 城南 S1：桥南广场、大道、支路、堆场、长条田。坐标是规格系，网格里再 wz。

const EAST = { cx: 190, cz: -178, hx: 22.5, hz: 15 };
const WEST = { cx: 70, cz: -222, hx: 15, hz: 11 };

const southLive = [];
let southFarmClock = performance.now();
let southFarmFrame = 0;

function pickFarm(dist, prev, phone) {
  if (!(dist >= 0)) return prev || null;
  const h = 10;
  if (phone) return dist < 180 ? "lod1" : null;
  if (prev === "lod1") {
    if (dist < 60 - h) return "lod0";
    if (dist > 252) return null;
    return "lod1";
  }
  if (prev === "lod0") {
    if (dist > 60 + h) return dist > 252 ? null : "lod1";
    return "lod0";
  }
  if (dist < 60) return "lod0";
  if (dist < 240) return "lod1";
  return null;
}
function advanceFarm(s, dist, dt, phone) {
  const target = pickFarm(dist, s._lod, phone);
  if (s._lod == null) {
    s._lod = target;
    s._pend = null;
    s._fade = 1;
    return;
  }
  if (target == null) {
    s._lod = null;
    s._pend = null;
    s._fade = 1;
    return;
  }
  if (s._pend == null) {
    if (target !== s._lod) {
      s._pend = target;
      s._fade = 0;
    }
    return;
  }
  if (target === s._lod) {
    s._pend = null;
    s._fade = 1;
    return;
  }
  s._fade += dt / 0.42;
  if (!(s._fade >= 0)) s._fade = 0;
  if (s._fade >= 1) {
    s._lod = s._pend;
    s._pend = null;
    s._fade = 1;
  }
}
const southDummy = new THREE.Object3D();
const southTint = new THREE.Color();

function watchLod(mesh, spots, near, far, wz, colored) {
  mesh.userData.southLod = { spots, near, far, wz, colored: !!colored };
  southLive.push(mesh);
}

function tickSouth(camera) {
  if (!camera) return;
  const now = performance.now();
  let dt = (now - southFarmClock) / 1000;
  southFarmClock = now;
  if (!(dt > 0)) dt = 0.016;
  else if (dt > 0.1) dt = 0.1;
  southFarmFrame++;
  const cx = camera.position.x;
  const cz = camera.position.z;
  const pad = 12;
  for (const mesh of southLive) {
    const rec = mesh.userData.southLod;
    if (!rec) continue;
    if (rec.farm) {
      let n = 0;
      const attr = mesh.geometry.getAttribute("aKeep");
      for (const s of rec.spots) {
        const d = Math.hypot(s.x - cx, rec.wz(s.z) - cz);
        if (s._ff !== southFarmFrame) {
          s._ff = southFarmFrame;
          advanceFarm(s, d, dt, rec.phone);
        }
        const pushes = [];
        if (s._lod === rec.lv && (s._pend == null || (1 - s._fade) > 0.02)) {
          pushes.push(s._pend == null ? 1 : (1 - s._fade));
        }
        if (s._pend === rec.lv && s._fade > 0.02) pushes.push(-s._fade);
        for (const keep of pushes) {
          southDummy.position.set(s.x, s.y, rec.wz(s.z));
          southDummy.rotation.set(0, s.yaw || 0, 0);
          southDummy.scale.setScalar(s.s);
          southDummy.updateMatrix();
          mesh.setMatrixAt(n, southDummy.matrix);
          if (attr) attr.setX(n, keep);
          const t = s.tint == null ? 1 : s.tint;
          southTint.setRGB(t, t, t);
          mesh.setColorAt(n, southTint);
          n++;
        }
      }
      mesh.count = n;
      mesh.visible = n > 0;
      if (n) {
        mesh.instanceMatrix.needsUpdate = true;
        if (attr) attr.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      continue;
    }
    let n = 0;
    for (const s of rec.spots) {
      const d = Math.hypot(s.x - cx, rec.wz(s.z) - cz);
      if (d < rec.near - pad || d > rec.far + pad) continue;
      southDummy.position.set(s.x, s.y, rec.wz(s.z));
      southDummy.rotation.set(0, s.yaw || 0, 0);
      southDummy.scale.setScalar(s.s);
      southDummy.updateMatrix();
      mesh.setMatrixAt(n, southDummy.matrix);
      if (rec.colored) {
        const t = s.tint == null ? 1 : s.tint;
        southTint.setRGB(t, t, t);
        mesh.setColorAt(n, southTint);
      }
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) mesh.instanceMatrix.needsUpdate = true;
    if (rec.colored && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
window.__tickSouth = tickSouth;

function slopeWidthAt(x, z) {
  const t = 0.5 + 0.5 * Math.sin(x * 0.019 + z * 0.014 + 0.6);
  return 4 + 6 * t;
}
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function lin(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
const COL = {
  road: lin(0x7e7058),
  rut: lin(0x655848),
  shoulder: lin(0x8a8658),
  ridge: lin(0x746656),
  sheet: lin(0x6a5d4c),
  millet: lin(0x9a8c6a),
  rice: lin(0x8f8466),
  plow: lin(0x6e5b44),
  wood: lin(0x4a3226),
  wattle: lin(0x5c4334),
  grass: lin(0x6d7344),
  puddle: lin(0x2f2a24),
  puddleEdge: lin(0x4a3f2e),
};

function inPlaza(x, z) {
  if (z > -72.95 || z < -104) return false;
  const x0 = 113 + Math.sin(z * 0.62) * 2.15 + Math.sin(z * 1.71 + 0.4) * 0.85;
  const x1 = 143 + Math.sin(z * 0.55 + 1.1) * 2.05 + Math.sin(z * 1.48) * 0.75;
  const zS = -95 + Math.sin(x * 0.47) * 2.35 + Math.sin(x * 1.33 + 0.7) * 1.05;
  return z >= zS && x >= x0 && x <= x1;
}

export function blocksSouthTree(x, z) {
  if (z > -68 || z < -720 || x < -2 || x > 262) return false;
  if (x > 117.2 && x < 138.8 && z < -96) return true;
  if (Math.abs(x - EAST.cx) < EAST.hx + 1.2 && Math.abs(z - EAST.cz) < EAST.hz + 1.2) return true;
  if (Math.abs(x - WEST.cx) < WEST.hx + 1.2 && Math.abs(z - WEST.cz) < WEST.hz + 1.2) return true;
  return false;
}

function dressClamp(mat, key) {
  mat.precision = "highp";
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  float ok = float(c.r == c.r && c.g == c.g && c.b == c.b);
  diffuseColor.rgb = mix(vec3(0.42, 0.36, 0.28), clamp(c, vec3(0.0), vec3(1.2)), ok);
}`);
  };
  return mat;
}

function GeoBuf() {
  this.pos = [];
  this.col = [];
  this.uv = [];
  this.idx = [];
}
GeoBuf.prototype.push = function (x, y, z, col, u, v) {
  const i = this.pos.length / 3;
  this.pos.push(x, y, z);
  this.col.push(col[0], col[1], col[2]);
  this.uv.push(u || 0, v || 0);
  return i;
};
GeoBuf.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); };
GeoBuf.prototype.quad = function (a, b, c, d) {
  this.idx.push(a, c, b, b, c, d);
};
GeoBuf.prototype.mesh = function (mat, name) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
  if (this.uv.length) geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
  const index = new Uint32Array(this.idx);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  return mesh;
};

export function buildSouth(ctx) {
  const { root, isPhone, groundY, polyEdgeDist, outerPoly, outsideLand, wz, mulberry32 } = ctx;
  const rng = mulberry32(0x51a1);
  const land = new GeoBuf();
  const fields = new GeoBuf();
  const puddles = new GeoBuf();

  function yAt(x, z, lift) {
    let y = groundY(x, z) + lift;
    if (!(y > -5 && y < 40)) y = 0.9;
    return y;
  }
  function onLand(x, z) {
    return outsideLand(x, z) && polyEdgeDist(x, z, outerPoly) >= slopeWidthAt(x, z) + 0.4;
  }
  function rutTint(x) {
    const bands = [[126.15, 126.55], [127.05, 127.45], [128.55, 128.95], [129.45, 129.85]];
    for (const [a, b] of bands) if (x >= a && x <= b) return true;
    return false;
  }
  function roadCol(x) {
    if (x < 123 || x > 133) return COL.shoulder;
    if (rutTint(x)) return COL.rut;
    return COL.road;
  }
  function roadLift(x) {
    return rutTint(x) ? 0.055 : 0.085;
  }

  let sheetQuads = 0;
  const step = 8;
  for (let x0 = 0; x0 < 260; x0 += step) {
    for (let zN = -73; zN > -500; zN -= step) {
      const x1 = Math.min(260, x0 + step);
      const zS = Math.max(-500, zN - step);
      const cx = (x0 + x1) * 0.5, cz = (zN + zS) * 0.5;
      if (!onLand(cx, cz)) continue;
      if (inPlaza(cx, cz) || inPlaza(x0, zN) || inPlaza(x1, zN) || inPlaza(x0, zS) || inPlaza(x1, zS)) continue;
      const row = [];
      const zs = [zN, zS], xs = [x0, x1];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        row.push(land.push(xs[i], yAt(xs[i], zs[j], 0.02), wz(zs[j]), COL.sheet, xs[i] / 4, zs[j] / 4));
      }
      land.quad(row[0], row[1], row[2], row[3]);
      sheetQuads++;
    }
  }

  let plazaQuads = 0;
  const ps = 2.5;
  for (let x = 108; x < 150; x += ps) {
    for (let z = -73; z > -104; z -= ps) {
      const cx = x + ps * 0.5, cz = z - ps * 0.5;
      if (!inPlaza(cx, cz)) continue;
      if (!outsideLand(cx, cz)) continue;
      const corners = [[x, z], [x + ps, z], [x + ps, z - ps], [x, z - ps]];
      const ids = corners.map(([px, pz]) => land.push(px, yAt(px, pz, 0.09), wz(pz), COL.road, px / 4, pz / 4));
      land.quad(ids[0], ids[1], ids[3], ids[2]);
      plazaQuads++;
    }
  }

  const xs = [121, 123, 125.9, 126.15, 126.55, 126.9, 127.05, 127.45, 127.8, 128.2, 128.55, 128.95, 129.2, 129.45, 129.85, 130.15, 133, 135];
  const z0 = -96, z1 = -700;
  const nz = Math.ceil((z0 - z1) / 8);
  const cols = xs.length;
  const base = [];
  for (let j = 0; j <= nz; j++) {
    const z = Math.max(z1, z0 - j * 8);
    for (let i = 0; i < cols; i++) {
      const x = xs[i];
      base.push(land.push(x, yAt(x, z, roadLift(x)), wz(z), roadCol(x), x / 4, z / 4));
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      land.quad(base[a], base[a + 1], base[a + cols], base[a + cols + 1]);
    }
  }

  function strip(xA, xB, zA, zB, lift) {
    const xa = Math.min(xA, xB), xb = Math.max(xA, xB);
    const zn = Math.max(zA, zB), zs = Math.min(zA, zB);
    const id = [
      land.push(xa, yAt(xa, zn, lift), wz(zn), COL.road, xa / 4, zn / 4),
      land.push(xb, yAt(xb, zn, lift), wz(zn), COL.road, xb / 4, zn / 4),
      land.push(xa, yAt(xa, zs, lift), wz(zs), COL.road, xa / 4, zs / 4),
      land.push(xb, yAt(xb, zs, lift), wz(zs), COL.road, xb / 4, zs / 4),
    ];
    land.quad(id[0], id[1], id[2], id[3]);
  }
  strip(114.2, 123.2, -117.5, -122.5, 0.09);
  strip(133, EAST.cx - EAST.hx, EAST.cz - 2, EAST.cz + 2, 0.09);
  strip(WEST.cx + WEST.hx, 123, WEST.cz - 2, WEST.cz + 2, 0.09);

  function yardPad(yard) {
    const x0 = yard.cx - yard.hx + 0.6, x1 = yard.cx + yard.hx - 0.6;
    const zN = yard.cz + yard.hz - 0.6, zS = yard.cz - yard.hz + 0.6;
    const nx = 6, nz = 4;
    const ids = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx;
        const z = zN + (zS - zN) * j / nz;
        ids.push(land.push(x, yAt(x, z, 0.11), wz(z), COL.road, x / 3, z / 3));
      }
    }
    const row = nx + 1;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * row + i;
      land.quad(ids[a], ids[a + 1], ids[a + row], ids[a + row + 1]);
    }
  }
  yardPad(EAST);
  yardPad(WEST);

  function solid(x0, x1, y0, y1, z0, z1, col) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const f = (pts) => {
      const ids = pts.map(([x, y, z]) => land.push(x, y, wz(z), col, x, z));
      land.quad(ids[0], ids[1], ids[3], ids[2]);
    };
    f([[xa, yb, za], [xb, yb, za], [xb, yb, zb], [xa, yb, zb]]);
    f([[xa, ya, zb], [xb, ya, zb], [xb, ya, za], [xa, ya, za]]);
    f([[xb, ya, za], [xb, yb, za], [xb, yb, zb], [xb, ya, zb]]);
    f([[xa, ya, zb], [xa, yb, zb], [xa, yb, za], [xa, ya, za]]);
    f([[xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb]]);
    f([[xb, ya, za], [xa, ya, za], [xa, yb, za], [xb, yb, za]]);
  }

  function fenceYard(yard, openSide) {
    const x0 = yard.cx - yard.hx, x1 = yard.cx + yard.hx;
    const z0 = yard.cz - yard.hz, z1 = yard.cz + yard.hz;
    const gate = 2.5;
    const walls = [
      { axis: "x", z: z1, a: x0, b: x1, open: openSide === "n" },
      { axis: "x", z: z0, a: x0, b: x1, open: openSide === "s" },
      { axis: "z", x: x0, a: z0, b: z1, open: openSide === "w" },
      { axis: "z", x: x1, a: z0, b: z1, open: openSide === "e" },
    ];
    for (const w of walls) {
      const len = Math.abs(w.b - w.a);
      const n = Math.max(2, Math.round(len / 1.7));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = w.a + (w.b - w.a) * t;
        const along = w.axis === "x" ? p : w.x;
        const cross = w.axis === "x" ? w.z : p;
        const specX = w.axis === "x" ? along : cross;
        const specZ = w.axis === "x" ? cross : along;
        if (w.open && Math.abs((w.axis === "x" ? specX : specZ) - (w.axis === "x" ? yard.cx : yard.cz)) < gate) continue;
        const gy = groundY(specX, specZ);
        const tall = w.open && Math.abs((w.axis === "x" ? specX : specZ) - (w.axis === "x" ? yard.cx : yard.cz)) < gate + 1.2;
        const h = tall ? 1.28 : 1.1;
        solid(specX - 0.07, specX + 0.07, gy, gy + h, specZ - 0.07, specZ + 0.07, COL.wood);
      }
      const rails = 3;
      for (let r = 0; r < rails; r++) {
        const parts = w.open ? [[w.a, (w.axis === "x" ? yard.cx : yard.cz) - gate], [(w.axis === "x" ? yard.cx : yard.cz) + gate, w.b]] : [[w.a, w.b]];
        for (const [s0, s1] of parts) {
          if (s1 - s0 < 0.4 && w.a < w.b) continue;
          if (Math.abs(s1 - s0) < 0.4) continue;
          const segs = Math.max(1, Math.round(Math.abs(s1 - s0) / 1.7));
          for (let i = 0; i < segs; i++) {
            const u0 = s0 + (s1 - s0) * i / segs;
            const u1 = s0 + (s1 - s0) * (i + 1) / segs;
            const mid = (u0 + u1) * 0.5;
            const specX = w.axis === "x" ? mid : w.x;
            const specZ = w.axis === "x" ? w.z : mid;
            const gy = groundY(specX, specZ);
            const hy = gy + 0.32 + r * 0.28;
            if (w.axis === "x") solid(Math.min(u0, u1), Math.max(u0, u1), hy, hy + 0.05, w.z - 0.04, w.z + 0.04, COL.wattle);
            else solid(w.x - 0.04, w.x + 0.04, hy, hy + 0.05, Math.min(u0, u1), Math.max(u0, u1), COL.wattle);
          }
        }
      }
    }
  }
  fenceYard(EAST, "w");
  fenceYard(WEST, "e");

  function blocked(x, z) {
    if (x < 0 || x > 260 || z > -73 || z < -500) return true;
    if (!onLand(x, z)) return true;
    if (inPlaza(x, z)) return true;
    if (x >= 120.5 && x <= 135.5 && z <= -92) return true;
    if (x >= 113 && x <= 124.5 && z <= -116.6 && z >= -123.4) return true;
    if (x >= 132.2 && x <= EAST.cx - EAST.hx + 1 && z <= EAST.cz + 2.4 && z >= EAST.cz - 2.4) return true;
    if (x >= WEST.cx + WEST.hx - 1 && x <= 124 && z <= WEST.cz + 2.4 && z >= WEST.cz - 2.4) return true;
    if (Math.abs(x - EAST.cx) <= EAST.hx + 0.8 && Math.abs(z - EAST.cz) <= EAST.hz + 0.8) return true;
    if (Math.abs(x - WEST.cx) <= WEST.hx + 0.8 && Math.abs(z - WEST.cz) <= WEST.hz + 0.8) return true;
    if (x >= 82 && x <= 118 && z <= -98 && z >= -144) return true;
    if (x >= 80 && x <= 118 && z <= -152 && z >= -200) return true;
    if (x >= 140 && x <= 180 && z <= -102 && z >= -154) return true;
    if (x >= 140 && x <= 172 && z <= -84 && z >= -120) return true;
    if (x >= 108 && x <= 124 && z <= -200 && z >= -250) return true;
    if (x >= 178 && x <= 214 && z <= -68 && z >= -110) return true;
    return false;
  }

  const kinds = [COL.millet, COL.rice, COL.plow];
  let plots = [0, 0, 0];
  let ridgeN = 0;
  const xPitch = 20.8, zPitch = 60.8;
  const colsN = Math.ceil(260 / xPitch);
  const rowsN = Math.ceil((500 - 74) / zPitch);
  const alive = [];
  for (let ix = 0; ix < colsN; ix++) {
    for (let iz = 0; iz < rowsN; iz++) {
      const x0 = ix * xPitch, x1 = Math.min(260, x0 + 20);
      const zN = -74 - iz * zPitch;
      const zS = zN - 60;
      if (zS < -500 || x1 - x0 < 8) continue;
      const h = hash2(ix * 2.2 + 0.3, iz * 3.7);
      const kind = h < 0.333 ? 0 : h < 0.666 ? 1 : 2;
      const br = 0.94 + hash2(ix + 4, iz + 11) * 0.12;
      const col = kinds[kind].map((c) => c * br);
      const sx = 4, sz = 6;
      let kept = 0;
      for (let j = 0; j < sz; j++) {
        for (let i = 0; i < sx; i++) {
          const xa = x0 + (x1 - x0) * i / sx;
          const xb = x0 + (x1 - x0) * (i + 1) / sx;
          const za = zN + (zS - zN) * j / sz;
          const zb = zN + (zS - zN) * (j + 1) / sz;
          if (blocked((xa + xb) * 0.5, (za + zb) * 0.5)) continue;
          const id = [
            fields.push(xa, yAt(xa, za, 0.05), wz(za), col, xa / 6.0, za / 6.0),
            fields.push(xb, yAt(xb, za, 0.05), wz(za), col, xb / 6.0, za / 6.0),
            fields.push(xa, yAt(xa, zb, 0.05), wz(zb), col, xa / 6.0, zb / 6.0),
            fields.push(xb, yAt(xb, zb, 0.05), wz(zb), col, xb / 6.0, zb / 6.0),
          ];
          fields.quad(id[0], id[1], id[2], id[3]);
          kept++;
        }
      }
      if (!kept) continue;
      plots[kind]++;
      alive.push({ ix, iz, x0, x1, zN, zS, kind });
      if (kind === 1) {
        const nP = hash2(ix, iz) > 0.72 ? 2 : 1;
        for (let p = 0; p < nP; p++) {
          const px = x0 + 3 + hash2(ix + p, iz) * Math.max(2, (x1 - x0) - 6);
          const pz = zS + 4 + hash2(iz + 2, ix + p * 5) * Math.max(4, (zN - zS) - 8);
          if (blocked(px, pz)) continue;
          addPuddle(px, pz, 0.7 + hash2(px, pz) * 0.8, 1.1 + hash2(pz, px) * 1.1);
        }
      }
    }
  }

  function addPuddle(x, z, rx, rz) {
    const y = yAt(x, z, 0.075);
    const n = 8;
    const c = puddles.push(x, y, wz(z), COL.puddle, 0.5, 0.5);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push(puddles.push(x + Math.cos(a) * rx, y, wz(z + Math.sin(a) * rz), COL.puddleEdge, 0, 0));
    }
    for (let i = 0; i < n; i++) puddles.tri(c, ring[i], ring[(i + 1) % n]);
  }

  function ridgeX(xa, xb, z) {
    const segs = Math.max(1, Math.round(Math.abs(xb - xa) / 6));
    for (let i = 0; i < segs; i++) {
      const a = xa + (xb - xa) * i / segs;
      const b = xa + (xb - xa) * (i + 1) / segs;
      const mid = (a + b) * 0.5;
      if (blocked(mid, z) && blocked(mid, z + 0.2)) continue;
      if (!onLand(mid, z)) continue;
      const y = groundY(mid, z);
      solid(Math.min(a, b), Math.max(a, b), y + 0.02, y + 0.32, z - 0.4, z + 0.4, COL.ridge);
      ridgeN++;
      if ((isPhone && i % 3) || (!isPhone && i % 2)) continue;
      blade(mid, z, y + 0.32);
    }
  }
  function ridgeZ(za, zb, x) {
    const segs = Math.max(1, Math.round(Math.abs(zb - za) / 6));
    for (let i = 0; i < segs; i++) {
      const a = za + (zb - za) * i / segs;
      const b = za + (zb - za) * (i + 1) / segs;
      const mid = (a + b) * 0.5;
      if (blocked(x, mid)) continue;
      if (!onLand(x, mid)) continue;
      const y = groundY(x, mid);
      solid(x - 0.4, x + 0.4, y + 0.02, y + 0.32, Math.min(a, b), Math.max(a, b), COL.ridge);
      ridgeN++;
      if ((isPhone && i % 3) || (!isPhone && i % 2)) continue;
      blade(x, mid, y + 0.32);
    }
  }
  function blade(x, z, y) {
    const h = 0.18 + hash2(x, z) * 0.16;
    const yaw = hash2(z, x) * Math.PI;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const dx = c * 0.12, dz = s * 0.12;
    const a = land.push(x - dx, y, wz(z - dz), COL.grass, 0, 0);
    const b = land.push(x + dx, y, wz(z + dz), COL.grass, 1, 0);
    const c1 = land.push(x - dx, y + h, wz(z - dz), COL.grass, 0, 1);
    const d = land.push(x + dx, y + h, wz(z + dz), COL.grass, 1, 1);
    land.quad(a, b, c1, d);
  }
  for (const p of alive) {
    ridgeX(p.x0, p.x1, p.zS);
    ridgeZ(p.zS, p.zN, p.x1);
  }

  const earthMat = dressClamp(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.97, metalness: 0, vertexColors: true, side: THREE.DoubleSide,
  }), "south-earth-s1");
  const fieldTex = furrowTex();
  const fieldMat = dressClamp(new THREE.MeshStandardMaterial({
    color: 0xffffff, map: fieldTex, roughness: 0.98, metalness: 0, vertexColors: true, side: THREE.DoubleSide,
  }), "south-field-s1");
  fieldMat.polygonOffset = true;
  fieldMat.polygonOffsetFactor = -1;
  fieldMat.polygonOffsetUnits = -2;
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide,
  });
  puddleMat.precision = "highp";
  puddleMat.customProgramCacheKey = () => "south-puddle-s1";
  puddleMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r)) diffuseColor.rgb = vec3(0.18, 0.16, 0.14);
  diffuseColor.rgb = clamp(diffuseColor.rgb, vec3(0.0), vec3(0.45));
}`)
      .replace("#include <opaque_fragment>", `
  reflectedLight.directSpecular = vec3(0.0);
  reflectedLight.indirectSpecular = vec3(0.0);
  #include <opaque_fragment>`);
  };

  const landMesh = land.mesh(earthMat, "southLand");
  const fieldMesh = fields.pos.length ? fields.mesh(fieldMat, "southFields") : null;
  const puddleMesh = puddles.pos.length ? puddles.mesh(puddleMat, "southPuddles") : null;
  root.add(landMesh);
  if (fieldMesh) root.add(fieldMesh);
  if (puddleMesh) root.add(puddleMesh);

  const avenueGLB = [];
  const boards = [];
  const stepT = 10;
  let station = 0;
  for (let z = -105; z >= -695; z -= stepT) {
    const pair = [
      [120, station % 2 === 0 ? "t0" : "t1"],
      [136, station % 2 === 0 ? "t1" : "t0"],
    ];
    pair.forEach(([x, kind], side) => {
      if (isPhone && ((station + side) % 2 === 1)) return;
      if (!outsideLand(x, z)) return;
      if (polyEdgeDist(x, z, outerPoly) < 8) return;
      const sc = 0.9 + rng() * 0.2;
      const base = kind === "t0" ? 0.13 : 0.14;
      const yaw = rng() * Math.PI * 2;
      const y = groundY(x, z);
      if (z < -400) boards.push({ x, z, y, yaw, sc, kind });
      else avenueGLB.push({ x, z, y, yaw, s: base * sc, kind });
    });
    station++;
  }

  const farmSpots = { granary_a: [], granary_b: [], heap_round: [] };
  const rngF = mulberry32(0x5a11);
  function putFarm(kind, x, z, cx, cz, jit) {
    const dx = cx - x, dz = cz - z;
    const yaw = Math.atan2(dx, -dz) + (rngF() - 0.5) * jit;
    const s = 0.9 + rngF() * 0.2;
    farmSpots[kind].push({ x, z, y: groundY(x, z) + 0.12, yaw, s, tint: 0.94 + rngF() * 0.12 });
  }
  putFarm("granary_b", EAST.cx + 16.2, EAST.cz - 10.2, EAST.cx, EAST.cz, 0.5);
  putFarm("granary_a", EAST.cx + 16.6, EAST.cz - 3.2, EAST.cx, EAST.cz, 0.5);
  putFarm("granary_b", EAST.cx + 16.2, EAST.cz + 4.2, EAST.cx, EAST.cz, 0.5);
  putFarm("granary_a", EAST.cx + 16.6, EAST.cz + 10.4, EAST.cx, EAST.cz, 0.5);
  const heapsE = [[178, -190], [176, -166], [186, -191], [200, -166], [182, -172]];
  for (const [x, z] of heapsE) {
    farmSpots.heap_round.push({
      x, z, y: groundY(x, z) + 0.12,
      yaw: rngF() * Math.PI * 2,
      s: 0.9 + rngF() * 0.2,
      tint: 0.94 + rngF() * 0.12,
    });
  }
  putFarm("granary_a", WEST.cx - 9.2, WEST.cz - 5.2, WEST.cx, WEST.cz, 0.5);
  putFarm("granary_a", WEST.cx - 9.2, WEST.cz + 5.0, WEST.cx, WEST.cz, 0.5);
  const heapsW = [[76, -230], [78, -214], [64, -214]];
  for (const [x, z] of heapsW) {
    farmSpots.heap_round.push({
      x, z, y: groundY(x, z) + 0.12,
      yaw: rngF() * Math.PI * 2,
      s: 0.9 + rngF() * 0.2,
      tint: 0.94 + rngF() * 0.12,
    });
  }

  const oakCells = [
    { uv: [0.0376, 0.66797, 0.21289, 0.98698], aspect: 0.733 },
    { uv: [0.28564, 0.66797, 0.46289, 0.98893], aspect: 0.736 },
    { uv: [0.53906, 0.66797, 0.70996, 0.97917], aspect: 0.732 },
  ];
  boards.forEach((b, i) => {
    const cell = oakCells[i % oakCells.length];
    const h = (10.2 + (i % 3) * 0.6) * b.sc;
    b.h = h;
    b.w = h * cell.aspect;
    b.uv = cell.uv;
    b.flip = i % 2 === 0 ? 1 : -1;
  });

  window.__south = {
    east: EAST, west: WEST,
    plazaQuads, sheetQuads, plots, ridgeN,
    trees: avenueGLB.length, boards: boards.length,
    farms: {
      a: farmSpots.granary_a.length,
      b: farmSpots.granary_b.length,
      h: farmSpots.heap_round.length,
    },
  };
  return { avenueGLB, farmSpots, boards };
}

function furrowTex() {
  const n = 64;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fur = 0.5 + 0.5 * Math.sin((x / n) * Math.PI * 8.0);
      const grit = hash2(x, y * 0.4);
      let v = 232 - fur * 14 + (grit - 0.5) * 6;
      v = Math.max(0, Math.min(255, v));
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

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
  mat.customProgramCacheKey = () => key + "-front";
  for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap"]) {
    if (mat[k]) mat[k].anisotropy = 8;
  }
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
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r && c.g == c.g && c.b == c.b)) diffuseColor.rgb = vec3(0.45, 0.38, 0.28);
  diffuseColor.rgb = clamp(diffuseColor.rgb, vec3(0.0), vec3(1.35));
}`)
      .replace("#include <alphatest_fragment>", `
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
  #include <alphatest_fragment>`);
  };
  return mat;
}

export function loadFarms(loader, farmSpots, ctx) {
  const { scene, wz, isPhone } = ctx;
  const names = ["granary_a", "granary_b", "heap_round"];
  const lods = isPhone ? [["lod1", 0, 168]] : [["lod0", 0, 60], ["lod1", 60, 240]];
  const jobs = [];
  for (const name of names) for (const [lv] of lods) {
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
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let meshes = 0;
    for (const name of names) {
      const spots = farmSpots[name] || [];
      if (!spots.length || !by[name]) continue;
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const s of spots) {
        const pz = wz(s.z);
        minX = Math.min(minX, s.x - 4); maxX = Math.max(maxX, s.x + 4);
        minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y + 6);
        minZ = Math.min(minZ, pz - 4); maxZ = Math.max(maxZ, pz + 4);
      }
      const sphere = new THREE.Sphere(
        new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5),
        Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + 2,
      );
      for (const [lv, near, far] of lods) {
        const prep = by[name][lv];
        if (!prep) continue;
        const geo = prep.geometry.clone();
        geo.boundingSphere = sphere.clone();
        const keep = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, spots.length)), 1);
        keep.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute("aKeep", keep);
        const mat = dressFarm(prep.material, "south-farm-" + name + "-" + lv + "-s1");
        const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
        mesh.name = "southFarm";
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = true;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.boundingSphere = sphere.clone();
        spots.forEach((s, i) => {
          dummy.position.set(s.x, s.y, wz(s.z));
          dummy.rotation.set(0, s.yaw, 0);
          dummy.scale.setScalar(s.s);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          color.setRGB(s.tint, s.tint, s.tint);
          mesh.setColorAt(i, color);
          keep.setX(i, 1);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        scene.add(mesh);
        watchLod(mesh, spots, near, far, wz, true);
        mesh.userData.southLod.farm = true;
        mesh.userData.southLod.lv = lv;
        mesh.userData.southLod.phone = !!isPhone;
        meshes++;
      }
    }
    if (window.__south) window.__south.farmMeshes = meshes;
    return meshes;
  });
}

export function makeAvenueTrees(opts) {
  const { scene, wz, spots, by, aveLods, dressTree, isPhone } = opts;
  if (!spots.length) return 0;
  const dummy = new THREE.Object3D();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const s of spots) {
    const pz = wz(s.z);
    minX = Math.min(minX, s.x - 3); maxX = Math.max(maxX, s.x + 3);
    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y + 16);
    minZ = Math.min(minZ, pz - 3); maxZ = Math.max(maxZ, pz + 3);
  }
  const sphere = new THREE.Sphere(
    new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5),
    Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + 4,
  );
  let meshes = 0;
  for (const kind of ["t0", "t1"]) {
    const mine = spots.filter((s) => s.kind === kind);
    if (!mine.length || !by[kind]) continue;
    for (const [lv, near, far] of aveLods) {
      const prep = by[kind][lv];
      if (!prep) continue;
      for (const part of prep.parts) {
        const geo = new THREE.BufferGeometry();
        for (const k in part.g.attributes) geo.setAttribute(k, part.g.attributes[k]);
        if (part.g.index) geo.setIndex(part.g.index);
        geo.boundingSphere = sphere.clone();
        const mat = dressTree(part.src, part.role, near, far, prep.height, prep.radius);
        const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
        mesh.name = "southAveTree";
        mesh.count = mine.length;
        mesh.frustumCulled = true;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.boundingSphere = sphere.clone();
        mine.forEach((s, i) => {
          dummy.position.set(s.x, s.y, wz(s.z));
          dummy.rotation.set(0, s.yaw, 0);
          dummy.scale.setScalar(s.s);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
        watchLod(mesh, mine, near, far, wz, false);
        meshes++;
      }
    }
  }
  if (window.__south) window.__south.treeMeshes = meshes;
  return meshes;
}

export function loadBoards(boards, ctx) {
  const { scene, wz, isPhone } = ctx;
  if (!boards.length) return Promise.resolve(0);
  const url = "/textures/hill_trees/hill_trees.json";
  return fetch(url).then((r) => r.json()).then((json) => {
    const file = isPhone ? json.atlas.file_low : json.atlas.file_high;
    const tex = new THREE.TextureLoader().load("/textures/hill_trees/" + file);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const uvA = new Float32Array(boards.length * 4);
    const flipA = new Float32Array(boards.length);
    const dummy = new THREE.Object3D();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: 0xffffff, alphaTest: 0.35, transparent: false,
      side: THREE.DoubleSide, fog: true, toneMapped: true,
    });
    mat.precision = "highp";
    mat.customProgramCacheKey = () => "south-ave-billboard-s1";
    const far0 = isPhone ? 360 : 520;
    const far1 = isPhone ? 460 : 640;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFar0 = { value: far0 };
      shader.uniforms.uFar1 = { value: far1 };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
attribute vec4 aUvRect;
attribute float aFlip;
uniform float uFar0;
uniform float uFar1;
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
  vec2 right = cd > 1e-4 ? vec2(toCam.y, -toCam.x) / cd : vec2(1.0, 0.0);
  float distR = cd;
  float lo = smoothstep(30.0, 80.0, distR);
  float hi = 1.0 - smoothstep(uFar0, max(uFar1, uFar0 + 1.0), distR);
  vKeep = clamp(lo * hi, 0.0, 1.0);
  vec3 world = iPos;
  world.x += right.x * position.x * iW;
  world.z += right.y * position.x * iW;
  world.y += position.y * iH;
  mvPosition = viewMatrix * modelMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
varying vec2 vUvG;
varying float vKeep;`)
        .replace("#include <map_fragment>", `{
  vec4 sampledDiffuseColor = texture2D(map, clamp(vUvG, 0.0, 1.0));
  float a = sampledDiffuseColor.a;
  if (!(a == a) || a < 0.0) a = 0.0;
  if (a > 1.0) a = 1.0;
  sampledDiffuseColor.a = a;
  float sumC = sampledDiffuseColor.r + sampledDiffuseColor.g + sampledDiffuseColor.b;
  if (!(sumC == sumC)) sampledDiffuseColor.rgb = vec3(0.05);
  sampledDiffuseColor.rgb = clamp(sampledDiffuseColor.rgb, vec3(0.0), vec3(2.0));
  diffuseColor *= sampledDiffuseColor;
}`)
        .replace("#include <alphatest_fragment>", `
  if (vKeep < 0.995) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (dith > max(vKeep, 0.0)) discard;
  }
  #include <alphatest_fragment>`);
    };
    const mesh = new THREE.InstancedMesh(geo, mat, boards.length);
    mesh.name = "southAveBoard";
    boards.forEach((b, i) => {
      uvA[i * 4] = b.uv[0]; uvA[i * 4 + 1] = b.uv[1]; uvA[i * 4 + 2] = b.uv[2]; uvA[i * 4 + 3] = b.uv[3];
      flipA[i] = b.flip;
      dummy.position.set(b.x, b.y, wz(b.z));
      dummy.scale.set(Math.max(0.4, b.w), Math.max(0.4, b.h), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    geo.setAttribute("aUvRect", new THREE.InstancedBufferAttribute(uvA, 4));
    geo.setAttribute("aFlip", new THREE.InstancedBufferAttribute(flipA, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    if (window.__south) window.__south.boardMeshes = 1;
    return 1;
  }).catch((err) => {
    if (window.__south) window.__south.boardErr = String(err && err.message || err);
    console.error(err);
    return 0;
  });
}
