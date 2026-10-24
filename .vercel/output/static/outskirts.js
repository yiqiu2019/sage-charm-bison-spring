import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export function bootOutskirts(ctx) {
  const {
    scene, isPhone, groundY, polyEdgeDist, outerPoly, outsideLand, wz,
    dress, DEG, mulberry32, plantMat,
    rammed, rammedDark, roofMat, doorMat, woodMat, texPlaster, texRed,
  } = ctx;

  const root = new THREE.Group();
  root.name = "outskirts";
  scene.add(root);

  const plaster = new THREE.MeshStandardMaterial({ color: 0xe8dfcc, roughness: 0.92, metalness: 0 });
  dress(plaster, texPlaster, 0.55, 0.35, false, false, false);
  const redMat = new THREE.MeshStandardMaterial({ color: 0x9e2b1f, roughness: 1, metalness: 0 });
  dress(redMat, texRed, 0.7, 0, true, false, true);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, metalness: 0.45, roughness: 0.52 });
  const dirt = new THREE.MeshStandardMaterial({ color: 0x8d6b45, roughness: 0.96, metalness: 0 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xc6a15a, roughness: 0.94, metalness: 0 });
  const thatch = new THREE.MeshStandardMaterial({ color: 0xb49762, roughness: 0.95, metalness: 0 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x6a4632, roughness: 0.88, metalness: 0 });
  const matMat = new THREE.MeshStandardMaterial({ color: 0xcbb892, roughness: 0.95, metalness: 0 });
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0x6e5840, roughness: 0.8, metalness: 0.05 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a675f, roughness: 0.92, metalness: 0 });
  const smokeU = { uTime: { value: 0 }, uOpacity: { value: 0.22 } };
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: smokeU,
    vertexShader: `
      uniform float uTime;
      attribute float aPhase;
      attribute float aH;
      varying float vH;
      void main() {
        vec3 p = position;
        float h = clamp(position.y / max(aH, 0.001), 0.0, 1.0);
        vH = h;
        float w = h * h * aH * 0.22;
        p.x += sin(uTime * 0.32 + aPhase + position.y * 0.45) * w + h * h * aH * 0.18;
        p.z += cos(uTime * 0.24 + aPhase * 1.3) * w * 0.55;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying float vH;
      void main() {
        float a = uOpacity * smoothstep(1.0, 0.12, vH) * smoothstep(0.0, 0.05, vH);
        gl_FragColor = vec4(0.78, 0.76, 0.72, a);
      }`,
  });

  function box(parent, mat, x, y, z, sx, sy, sz) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function gableGeo(length, depth, rise) {
    const L = length / 2, D = depth / 2, H = rise;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([
      -L, 0, -D, L, 0, -D, L, 0, D, -L, 0, D, -L, H, 0, L, H, 0,
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex([
      0, 5, 1, 0, 4, 5,
      2, 4, 3, 2, 5, 4,
      3, 4, 0,
      1, 5, 2,
    ]);
    geo.computeVertexNormals();
    return geo;
  }
  function addCap(parent, x, y, z, length, depth, rise, alongZ, mat) {
    const m = new THREE.Mesh(gableGeo(length, depth, rise), mat || roofMat);
    if (alongZ) m.rotation.y = Math.PI / 2;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function segBox(parent, mat, x, y, z, sx, sy, sz) {
    if (sx < 0.15 || sz < 0.15) return;
    box(parent, mat, x, y, z, sx, sy, sz);
  }

  function addWallX(g, z, x0, x1) {
    const len = Math.abs(x1 - x0);
    if (len < 0.2) return;
    const x = (x0 + x1) / 2;
    segBox(g, rammed, x, 0.3, z, len, 0.6, 0.8);
    segBox(g, plaster, x, 1.9, z, len, 2.6, 0.72);
    addCap(g, x, 3.2, z, len + 0.3, 1.28, 0.46, false);
  }
  function addWallZ(g, x, z0, z1) {
    const len = Math.abs(z1 - z0);
    if (len < 0.2) return;
    const z = (z0 + z1) / 2;
    segBox(g, rammed, x, 0.3, z, 0.8, 0.6, len);
    segBox(g, plaster, x, 1.9, z, 0.72, 2.6, len);
    addCap(g, x, 3.2, z, len + 0.3, 1.28, 0.46, true);
  }

  function addWing(g, cx, cz, len, dep, face) {
    const back = cx - face * (dep / 2 - 0.12);
    const front = cx + face * (dep / 2 - 0.16);
    segBox(g, rammed, back, 0.3, cz, 0.34, 0.6, len);
    segBox(g, plaster, back, 1.75, cz, 0.28, 2.9, len);
    segBox(g, plaster, cx, 1.55, cz - len / 2, dep, 3.1, 0.22);
    segBox(g, plaster, cx, 1.55, cz + len / 2, dep, 3.1, 0.22);
    const n = Math.max(3, Math.round(len / 3.1));
    for (let i = 0; i < n; i++) {
      const z = cz - len / 2 + 0.55 + ((len - 1.1) * i) / (n - 1);
      box(g, redMat, front, 1.7, z, 0.26, 3.4, 0.26);
    }
    addCap(g, cx, 3.5, cz, len + 0.8, dep + 0.9, 1.5, true);
    box(g, matMat, cx - face * 0.15, 0.035, cz, dep * 0.46, 0.05, len * 0.42);
    box(g, woodMat, cx + face * 0.15, 0.2, cz + len * 0.12, 0.62, 0.32, 1.05);
  }

  const hallAnchors = [];
  const yards = [
    { name: "yardA", cx: 98, cz: -120, hx: 17, hz: 14, rot: Math.PI / 2, mirror: false, wings: [14.2, 13.1], tree: [13.4, -9.2], seed: 11 },
    { name: "yardB", cx: 97, cz: -175, hx: 16.3, hz: 13.4, rot: Math.PI / 2, mirror: true, wings: [15.1, 12.2], tree: [11.6, -5.4], seed: 29 },
    { name: "yardC", cx: 160, cz: -128, hx: 18, hz: 14.6, rot: -Math.PI / 2, mirror: false, wings: [13.3, 14.8], tree: [-7.2, 5.5], seed: 47, annex: true },
  ];

  const yardTrees = [];

  function localToSpec(rot, cx, cz, lx, lz) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const wx = lx * c + lz * s;
    const wzl = -lx * s + lz * c;
    return [cx + wx, cz - wzl];
  }

  function addCourtyard(cfg) {
    const g = new THREE.Group();
    g.name = cfg.name;
    let yMax = 0.8;
    for (const lx of [-cfg.hx, 0, cfg.hx]) {
      for (const lz of [-cfg.hz, 0, cfg.hz]) {
        const [sx, sz] = localToSpec(cfg.rot, cfg.cx, cfg.cz, lx, lz);
        yMax = Math.max(yMax, groundY(sx, sz));
      }
    }
    g.position.set(cfg.cx, yMax, wz(cfg.cz));
    g.rotation.y = cfg.rot;
    const mx = cfg.mirror ? -1 : 1;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(cfg.hx * 2 + 0.4, 0.4, cfg.hz * 2 + 0.4), dirt);
    pad.position.y = -0.14;
    g.add(pad);
    const { hx, hz } = cfg;
    const gate = 3.15;
    addWallX(g, hz, -hx, -gate / 2 - 0.15);
    addWallX(g, hz, gate / 2 + 0.15, hx);
    addWallX(g, -hz, -hx, hx);
    addWallZ(g, hx, -hz + 0.35, hz - 0.35);
    addWallZ(g, -hx, -hz + 0.35, hz - 0.35);
    const gh = new THREE.Group();
    gh.position.set(0, 0, hz + 0.15);
    g.add(gh);
    box(gh, rammed, 0, 0.3, 0, 7.1, 0.6, 4.3);
    box(gh, plaster, -3.35, 2.05, 0, 0.4, 3.5, 4.15);
    box(gh, plaster, 3.35, 2.05, 0, 0.4, 3.5, 4.15);
    box(gh, plaster, 0, 3.55, 0, 6.7, 0.45, 4.15);
    addCap(gh, 0, 3.85, 0, 7.6, 4.7, 1.65, false);
    box(gh, doorMat, -0.62, 1.55, 2.12, 1.15, 2.7, 0.1);
    box(gh, doorMat, 0.62, 1.55, 2.12, 1.15, 2.7, 0.1);
    for (const sx of [-0.62, 0.62]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.032, 6, 10), bronze);
      ring.position.set(sx + (sx < 0 ? 0.28 : -0.28), 1.55, 2.2);
      gh.add(ring);
    }
    box(g, redMat, -1.35, 1.7, hz - 0.7, 0.28, 3.4, 0.28);
    box(g, redMat, 1.35, 1.7, hz - 0.7, 0.28, 3.4, 0.28);
    addWing(g, mx * (hx - 3.15), -0.2, cfg.wings[0], 5.05, -mx);
    addWing(g, -mx * (hx - 3.15), -1.3, cfg.wings[1], 4.85, mx);
    const rng = mulberry32(cfg.seed);
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0, -hz + 6.15);
    anchor.scale.setScalar(14.3 * (0.9 + rng() * 0.2));
    g.add(anchor);
    hallAnchors.push(anchor);
    const [tx, tz] = localToSpec(cfg.rot, cfg.cx, cfg.cz, mx * cfg.tree[0], cfg.tree[1]);
    yardTrees.push({ x: tx, z: tz, y: yMax });
    box(g, matMat, 0, 0.04, -hz + 11.4, 2.2, 0.05, 1.3);
    box(g, woodMat, 0.4, 0.2, -hz + 11.2, 0.7, 0.32, 1.15);
    root.add(g);
    return g;
  }

  for (const y of yards) addCourtyard(y);

  const barrackAnchor = new THREE.Object3D();
  barrackAnchor.position.set(151.5, groundY(151.5, -101), wz(-101));
  barrackAnchor.rotation.y = 0.18;
  scene.add(barrackAnchor);
  (function annex() {
    const g = new THREE.Group();
    g.position.set(152, groundY(152, -101), wz(-101));
    const hw = 8, hd = 6;
    box(g, dirt, 0, -0.1, 0, hw * 2, 0.3, hd * 2);
    addWallX(g, hd, -hw, hw);
    addWallX(g, -hd, -hw, -1.4);
    addWallX(g, -hd, 1.4, hw);
    addWallZ(g, hw, -hd + 0.3, hd - 0.3);
    addWallZ(g, -hw, -hd + 0.3, hd - 0.3);
    root.add(g);
  })();

  (function roadAndPosts() {
    const z0 = -73, z1 = -400, step = 8;
    const n = Math.ceil((z0 - z1) / step);
    const pos = [], idx = [];
    const rpos = [], ridx = [];
    function yAt(z) {
      const gy = groundY(128, z) + 0.035;
      if (z > -84) {
        const t = Math.max(0, Math.min(1, (z + 84) / 11));
        return gy * (1 - t) + 0.82 * t;
      }
      return gy;
    }
    for (let i = 0; i <= n; i++) {
      const z = Math.max(z1, z0 - i * step);
      const y = yAt(z);
      pos.push(124, y, wz(z), 132, y, wz(z));
      const yr = y + 0.012;
      rpos.push(127.05, yr, wz(z), 127.42, yr, wz(z), 128.58, yr, wz(z), 128.95, yr, wz(z));
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
      const ra = i * 4;
      ridx.push(ra, ra + 4, ra + 1, ra + 1, ra + 4, ra + 5);
      ridx.push(ra + 2, ra + 6, ra + 3, ra + 3, ra + 6, ra + 7);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, rammed);
    mesh.name = "avenue";
    root.add(mesh);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rpos, 3));
    rg.setIndex(ridx);
    rg.computeVertexNormals();
    root.add(new THREE.Mesh(rg, rammedDark));
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.2, 5);
    postGeo.translate(0, 0.6, 0);
    for (let z = -102; z >= -400; z -= 30) {
      for (const x of [122.35, 133.65]) {
        if (polyEdgeDist(x, z, outerPoly) < 20) continue;
        const p = new THREE.Mesh(postGeo, woodMat);
        p.position.set(x, groundY(x, z), wz(z));
        root.add(p);
      }
    }
  })();

  function stripeTex(paint) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const img = g.createImageData(128, 128);
    paint(img.data, 128);
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  const milletMap = stripeTex((d, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const col = Math.sin(x * 0.85) * 0.5 + 0.5;
      const v = 150 + col * 55 + (hash2(x, y) - 0.5) * 18;
      const i = (y * n + x) * 4;
      d[i] = Math.min(255, v + 30); d[i + 1] = Math.min(255, v * 0.78); d[i + 2] = v * 0.32; d[i + 3] = 255;
    }
  });
  const stubbleMap = stripeTex((d, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const line = Math.pow(Math.sin(y * 0.9), 8) * 28;
      const v = 150 + line + (hash2(x, y * 0.3) - 0.5) * 16;
      const i = (y * n + x) * 4;
      d[i] = v + 10; d[i + 1] = v * 0.78; d[i + 2] = v * 0.45; d[i + 3] = 255;
    }
  });
  const fallowMap = stripeTex((d, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const blot = Math.sin(x * 0.08) * Math.sin(y * 0.07) * 16;
      const v = 128 + blot + (hash2(x * 0.4, y * 0.4) - 0.5) * 20;
      const i = (y * n + x) * 4;
      d[i] = v + 8; d[i + 1] = v; d[i + 2] = v - 6; d[i + 3] = 255;
    }
  });
  const milletMat = new THREE.MeshStandardMaterial({ map: milletMap, roughness: 0.95, metalness: 0 });
  const stubbleMat = new THREE.MeshStandardMaterial({ map: stubbleMap, roughness: 0.96, metalness: 0 });
  const fallowMat = new THREE.MeshStandardMaterial({ map: fallowMap, roughness: 0.97, metalness: 0 });
  const fieldKind = { millet: milletMat, stubble: stubbleMat, fallow: fallowMat };

  (function fields() {
    const rng = mulberry32(77);
    const buckets = { millet: [], stubble: [], fallow: [], path: [] };
    let xEast = -70;
    while (xEast > -400) {
      const cw = 32 + rng() * 24;
      let zSouth = -200;
      const x0 = xEast - cw;
      while (zSouth < 460) {
        const ch = 30 + rng() * 26;
        const z0 = zSouth;
        const z1 = zSouth + ch;
        zSouth = z1;
        const cx = (x0 + xEast) / 2, cz = (z0 + z1) / 2;
        if (Math.hypot(cx + 140, cz - 80) < 28 || Math.hypot(cx + 160, cz - 330) < 26) continue;
        const corners = [[x0, z0], [xEast, z0], [xEast, z1], [x0, z1]];
        if (corners.some(([px, pz]) => !outsideLand(px, pz) || polyEdgeDist(px, pz, outerPoly) < 20)) continue;
        const inset = 0.85;
        const fx0 = x0 + inset, fx1 = xEast - inset, fz0 = z0 + inset, fz1 = z1 - inset;
        const nse = Math.sin(cx * 0.02 + 0.4) * Math.cos(cz * 0.017 - 0.2);
        const kind = nse > 0.28 ? "millet" : nse > -0.05 ? "stubble" : nse > -0.38 ? "fallow" : "mulberry";
        const pathPack = buckets._path || (buckets._path = { pos: [], uv: [], idx: [] });
        const segs = 3;
        const build = (xa, xb, za, zb, lift, into) => {
          const row = segs + 1;
          const base = into.pos.length / 3;
          for (let j = 0; j <= segs; j++) {
            for (let i = 0; i <= segs; i++) {
              const x = xa + ((xb - xa) * i) / segs;
              const z = za + ((zb - za) * j) / segs;
              const xx = x + Math.sin(z * 0.047) * 2.8;
              const zz = z + Math.sin(x * 0.041) * 2.8;
              into.pos.push(xx, groundY(xx, zz) + lift, wz(zz));
              into.uv.push((x - xa) / 5, (z - za) / 5);
            }
          }
          for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
            const a = base + j * row + i;
            into.idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
          }
        };
        if (hash2(cx + 4.2, cz) > 0.34) build(x0, xEast, z0, z0 + 1.5, 0.025, pathPack);
        if (hash2(cx, cz) > 0.38) build(xEast - 1.5, xEast, z0, z1, 0.02, pathPack);
        if (kind === "mulberry") {
          const fall = buckets._fallow || (buckets._fallow = { pos: [], uv: [], idx: [] });
          build(fx0, fx1, fz0, fz1, 0.04, fall);
        } else {
          const key = "_" + kind;
          if (!buckets[key]) buckets[key] = { pos: [], uv: [], idx: [] };
          build(fx0, fx1, fz0, fz1, 0.05, buckets[key]);
        }
      }
      xEast -= cw;
    }
    function commit(pack, mat, name) {
      if (!pack || !pack.pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pack.pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(pack.uv, 2));
      geo.setIndex(pack.idx);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      root.add(m);
    }
    commit(buckets._millet, milletMat, "millet");
    commit(buckets._stubble, stubbleMat, "stubble");
    commit(buckets._fallow, fallowMat, "fallow");
    commit(buckets._path, dirt, "paths");
  })();

  function shadoof(x, z) {
    const y = groundY(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, wz(z));
    box(g, woodMat, 0, 1.7, 0, 0.22, 3.4, 0.22);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.16, 0.16), woodMat);
    beam.position.y = 3.35;
    beam.rotation.z = -0.28;
    g.add(beam);
    const end = (s) => {
      const ang = -0.28;
      return [Math.cos(ang) * s, 3.35 + Math.sin(ang) * s];
    };
    const [bx, by] = end(-2.5);
    const [sx, sy] = end(2.35);
    box(g, bucketMat, bx, by - 0.7, 0, 0.38, 0.32, 0.38);
    box(g, woodMat, bx, by - 0.32, 0, 0.04, 0.7, 0.04);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stoneMat);
    rock.position.set(sx, sy, 0);
    g.add(rock);
    root.add(g);
  }
  function hay(x, z, s) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 1.5 * s, 7), straw);
    m.position.set(x, groundY(x, z) + 0.75 * s, wz(z));
    root.add(m);
  }
  function fence(x, z, len, yaw) {
    const g = new THREE.Group();
    g.position.set(x, groundY(x, z), wz(z));
    g.rotation.y = yaw;
    const n = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i < n; i++) {
      box(g, woodMat, -len / 2 + (len * i) / (n - 1), 0.45, 0, 0.08, 0.9, 0.08);
    }
    box(g, woodMat, 0, 0.72, 0, len, 0.06, 0.06);
    box(g, woodMat, 0, 0.38, 0, len, 0.05, 0.05);
    root.add(g);
  }
  shadoof(-134, 86);
  shadoof(-156, 336);
  hay(-150, 70, 1);
  hay(-126, 98, 0.8);
  hay(-144, 104, 1.15);
  hay(-172, 318, 1);
  hay(-148, 348, 0.85);
  fence(-118, 92, 7.5, 0.4);
  fence(-126, 78, 5.5, -0.6);
  fence(-174, 348, 6.5, 0.2);
  fence(-142, 318, 4.5, 1.1);

  const shedMat = thatch;
  function shed(x, z, yaw) {
    const g = new THREE.Group();
    g.position.set(x, groundY(x, z), wz(z));
    g.rotation.y = yaw;
    for (const [px, pz] of [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]]) {
      box(g, woodMat, px, 0.85, pz, 0.1, 1.7, 0.1);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.8), shedMat);
    roof.position.set(0, 1.85, 0.15);
    roof.rotation.x = -0.32;
    g.add(roof);
    root.add(g);
  }
  function pots(x, z) {
    const rng = mulberry32(Math.floor(x * 10 + z));
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16 + rng() * 0.08, 0.14, 0.32 + rng() * 0.12, 6), potMat);
      p.position.set(x + (rng() - 0.5) * 0.8, groundY(x, z) + 0.18, wz(z + (rng() - 0.5) * 0.6));
      root.add(p);
    }
  }
  const shopSpots = [
    [114, -208], [116, -218], [113, -228], [117, -238],
  ];
  for (const [x, z] of shopSpots) {
    shed(x + 3.3, z, 0.15);
    pots(x + 2.2, z + 1.3);
  }
  const dockSpots = [[188, -78], [201, -92]];
  pots(193, -84);
  (function net() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g2 = c.getContext("2d");
    g2.strokeStyle = "rgba(236,230,216,0.95)";
    g2.lineWidth = 2;
    for (let i = 4; i < 128; i += 10) {
      g2.beginPath(); g2.moveTo(i, 0); g2.lineTo(i, 128); g2.stroke();
      g2.beginPath(); g2.moveTo(0, i); g2.lineTo(128, i); g2.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), mat);
    plane.position.set(195.5, groundY(195, -86) + 1.5, wz(-86));
    plane.rotation.y = Math.PI;
    root.add(plane);
    for (const x of [193.7, 197.3]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5), woodMat);
      pole.position.set(x, groundY(x, -86) + 1.2, wz(-86));
      root.add(pole);
    }
  })();

  function addSmoke(x, z, y, phase, h = 7, w = 1.15) {
    const geo = new THREE.PlaneGeometry(w, h, 1, 8);
    geo.translate(0, h * 0.5, 0);
    const n = geo.attributes.position.count;
    const phaseA = new Float32Array(n);
    const heightA = new Float32Array(n);
    phaseA.fill(phase);
    heightA.fill(h);
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phaseA, 1));
    geo.setAttribute("aH", new THREE.BufferAttribute(heightA, 1));
    const a = new THREE.Mesh(geo, smokeMat);
    const b = new THREE.Mesh(geo, smokeMat);
    b.rotation.y = Math.PI / 2;
    a.frustumCulled = b.frustumCulled = false;
    a.position.set(x, y, wz(z));
    b.position.set(x, y, wz(z));
    root.add(a, b);
  }
  const smokeHuts = [
    [-148, 74], [-156, 96], [-168, 322], [-150, 338],
  ];
  for (let i = 0; i < smokeHuts.length; i++) {
    const [x, z] = smokeHuts[i];
    addSmoke(x, z, groundY(x, z) + 3.5, i * 1.7);
  }

  const batches = [];
  const dummy = new THREE.Object3D();
  function lodOf(dist) {
    if (isPhone) return dist < 80 ? 0 : dist < 220 ? 1 : -1;
    if (dist < 60) return 0;
    if (dist < 150) return 1;
    if (dist < 260) return 2;
    return -1;
  }
  function addBatch(levels, entries, animated) {
    const meshes = levels.map((lv) => {
      if (!lv) return null;
      const m = new THREE.InstancedMesh(lv.geometry, lv.material, Math.max(1, entries.length));
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.name = "envInst";
      root.add(m);
      return m;
    });
    batches.push({ meshes, entries, animated });
  }
  function tint(rng) {
    const j = () => 0.92 + rng() * 0.16;
    return new THREE.Color().setRGB(j(), j(), j());
  }

  const hutEntries = [];
  const rngH = mulberry32(5);
  function pushHut(x, z, yaw) {
    const s = 5.8 * (0.9 + rngH() * 0.2);
    hutEntries.push({
      x, y: groundY(x, z), z, yaw, sx: s, sy: s, sz: s,
      color: tint(rngH), wx: x, wz: wz(z),
    });
  }
  for (const [x, z] of shopSpots) pushHut(x, z, Math.PI / 2 + (z % 7) * 0.01);
  for (const [x, z] of dockSpots) pushHut(x, z, -Math.PI / 2);
  const v1 = [[-148, 74], [-132, 90], [-156, 96], [-128, 66], [-144, 110]];
  const v2 = [[-168, 322], [-150, 338], [-174, 346], [-146, 312]];
  for (const group of [v1, v2]) {
    const cx = group.reduce((s, p) => s + p[0], 0) / group.length;
    const cz = group.reduce((s, p) => s + p[1], 0) / group.length;
    group.forEach(([x, z]) => {
      pushHut(x, z, Math.atan2(cx - x, z - cz) + (hash2(x, z) - 0.5) * 0.5);
    });
  }

  const cowEntries = [];
  const rngC = mulberry32(9);
  const cows = [[-118, 54], [-168, 114], [-100, 98], [-190, 292], [-142, 362], [-208, 206]];
  cows.forEach(([x, z]) => {
    const s = 2.1 * (0.9 + rngC() * 0.2);
    cowEntries.push({
      x, y: groundY(x, z), z, yaw: rngC() * Math.PI * 2, sx: s, sy: s, sz: s,
      color: tint(rngC), wx: x, wz: wz(z),
    });
  });

  const guardA = [], guardB = [];
  const rngG = mulberry32(13);
  const guardDefs = [
    { x: 120.3, y: 0.8, z: -9, yaw: 0, mirror: true },
    { x: 135.7, y: 0.8, z: -9, yaw: 0, mirror: false },
    { x: 119, y: 0.8, z: -76, yaw: 0, mirror: true, skip: true }, // 原西侧卫兵位，只消耗随机序列，改由军官占据
    { x: 137, y: 0.8, z: -76, yaw: 0, mirror: false },
    { x: 96, y: 10.8, z: 3.5, yaw: 0, mirror: true },
    { x: 160, y: 10.8, z: 3.5, yaw: 0, mirror: false },
  ];
  for (const g of guardDefs) {
    const y = g.y == null ? Math.max(0.8, groundY(g.x, g.z)) : g.y;
    const s = 2.15 * (0.95 + rngG() * 0.1);
    const e = {
      x: g.x, y, z: g.z, yaw: g.yaw + (rngG() - 0.5) * 16 * DEG, sx: s, sy: s, sz: s,
      color: tint(rngG), wx: g.x, wz: wz(g.z),
      phase: rngG() * Math.PI * 2,
      freq: (Math.PI * 2) / (3.15 + rngG() * 0.85),
    };
    if (g.skip) continue;
    (g.mirror ? guardB : guardA).push(e);
  }
  // 桥南头西侧军官：面朝南，身体略转向东侧桥面。不镜像，呼吸周期相位与卫兵错开。
  const officer = [{
    x: 119, y: 0.8, z: -76, yaw: 0.2, sx: 1.55, sy: 1.55, sz: 1.55,
    color: tint(mulberry32(29)), wx: 119, wz: wz(-76),
    phase: 2.15,
    freq: (Math.PI * 2) / 4.8,
  }];

  const treeTime = { value: 0 };
  const treeChunks = [];
  const treeSpots = [];
  const rngT = mulberry32(0x71ee);
  function pushTree(kind, x, z, baseScale, yOverride) {
    if (x > 440 && x < 590 && z > -55 && z < 170) return false;
    if (!outsideLand(x, z)) return false;
    if (polyEdgeDist(x, z, outerPoly) < 6) return false;
    for (let i = 0; i < treeSpots.length; i++) {
      const o = treeSpots[i];
      if (Math.hypot(o.x - x, o.z - z) < 3.2) return false;
    }
    treeSpots.push({
      kind, x, z,
      y: yOverride != null ? yOverride : groundY(x, z),
      yaw: rngT() * Math.PI * 2,
      s: baseScale * (0.85 + rngT() * 0.3),
    });
    return true;
  }
  for (const p of yardTrees) pushTree("t0", p.x, p.z, 0.13, p.y);
  function villageTrees(cx, cz, nBig, nShrub) {
    for (let i = 0; i < nBig; i++) {
      const ang = rngT() * Math.PI * 2;
      const rad = 12 + rngT() * 16;
      const kind = rngT() < 0.5 ? "t0" : "t1";
      pushTree(kind, cx + Math.cos(ang) * rad, cz + Math.sin(ang) * rad, kind === "t0" ? 0.13 : 0.14);
    }
    for (let i = 0; i < nShrub; i++) {
      const ang = rngT() * Math.PI * 2;
      const rad = 8 + rngT() * 18;
      pushTree("t2", cx + Math.cos(ang) * rad, cz + Math.sin(ang) * rad, 0.12 + rngT() * 0.04);
    }
  }
  function grove(cx, cz, rows, cols) {
    const gap = 5.2 + rngT() * 0.8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = cx + (c - (cols - 1) / 2) * gap + (rngT() - 0.5) * 1.2;
        const z = cz + (r - (rows - 1) / 2) * gap + (rngT() - 0.5) * 1.2 + (c % 2) * 0.9;
        pushTree("t2", x, z, 4 / 28.3);
      }
    }
  }
  if (isPhone) {
    villageTrees(-142, 86, 2, 2);
    villageTrees(-158, 332, 2, 1);
    grove(-210, 46, 4, 3);
    grove(-230, 300, 4, 3);
  } else {
    villageTrees(-142, 86, 3, 3);
    villageTrees(-158, 332, 3, 3);
    grove(-208, 40, 5, 4);
    grove(-232, 296, 5, 4);
  }
  let fieldGot = 0;
  const fieldWant = isPhone ? 8 : 18;
  for (let i = 0; i < 120 && fieldGot < fieldWant; i++) {
    const x = -95 - rngT() * 270;
    const z = -170 + rngT() * 580;
    if (Math.hypot(x + 142, z - 86) < 34 || Math.hypot(x + 158, z - 332) < 32) continue;
    if (Math.hypot(x + 208, z - 40) < 30 || Math.hypot(x + 232, z - 296) < 30) continue;
    if (polyEdgeDist(x, z, outerPoly) < 26) continue;
    const kind = rngT() < 0.55 ? "t1" : "t2";
    if (pushTree(kind, x, z, kind === "t1" ? 0.14 : 0.12 + rngT() * 0.04)) fieldGot++;
  }
  function bankOut(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    let ox = dz / len, oz = -dx / len;
    const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
    if (!outsideLand(mx + ox * 3, mz + oz * 3)) { ox = -ox; oz = -oz; }
    return { ux: dx / len, uz: dz / len, ox, oz, len };
  }
  function nearBridge(x, z) {
    const cz = Math.max(-80, Math.min(-6, z));
    if (Math.hypot(x - 128, z - cz) < 40) return true;
    if (Math.hypot(x - 170, z + 17) < 40) return true;
    if (Math.hypot(x - 194, z + 85) < 40) return true;
    return false;
  }
  let bankGot = 0;
  const bankWant = isPhone ? 22 : 48;
  const bankWhy = { edge: 0, bridge: 0, dist: 0, push: 0, ok: 0 };
  let walked = 0;
  let nextAt = 24 + rngT() * 20;
  for (let i = 0; i < outerPoly.length && bankGot < bankWant; i++) {
    const a = outerPoly[i], b = outerPoly[(i + 1) % outerPoly.length];
    const e = bankOut(a[0], a[1], b[0], b[1]);
    if (e.len < 0.4) continue;
    for (let s = 0; s < e.len && bankGot < bankWant; s += 3) {
      walked += 3;
      if (walked < nextAt) continue;
      const ex = a[0] + e.ux * Math.min(s, e.len);
      const ez = a[1] + e.uz * Math.min(s, e.len);
      const north = ez > 340;
      if (north && rngT() > 0.3) { nextAt = walked + 50 + rngT() * 40; continue; }
      const nCl = north ? 1 : 2 + (rngT() * 2 | 0);
      let placed = 0;
      for (let k = 0; k < nCl && bankGot < bankWant; k++) {
        const along = (rngT() - 0.5) * 8;
        const dist = 8 + rngT() * 22;
        const px = ex + e.ux * along + e.ox * dist;
        const pz = ez + e.uz * along + e.oz * dist;
        if (nearBridge(px, pz)) { bankWhy.bridge++; continue; }
        const ed = polyEdgeDist(px, pz, outerPoly);
        if (ed < 8 || ed > 30) { bankWhy.dist++; continue; }
        const kind = !north && rngT() < 0.16 ? "t0" : "t1";
        if (pushTree(kind, px, pz, kind === "t0" ? 0.13 : 0.14)) { bankGot++; placed++; bankWhy.ok++; }
        else bankWhy.push++;
      }
      nextAt = walked + (placed ? 40 + rngT() * 80 : 18);
    }
  }

  function tick(time, camera) {
    treeTime.value = time;
    smokeU.uTime.value = time;
    const night = window.__night || 0;
    smokeU.uOpacity.value = 0.24 * (1 - night * 0.62);
    if (!camera) return;
    const cx = camera.position.x, cz = camera.position.z;
    for (const ch of treeChunks) {
      const d = Math.hypot(cx - ch.cx, cz - ch.cz);
      for (const part of ch.parts) {
        const show = d < part.far + 20 + ch.rad && (part.near <= 0 || d > part.near - 20 - ch.rad);
        if (part.mesh.visible !== show) part.mesh.visible = show;
      }
    }
    for (const b of batches) {
      const buckets = b.meshes.map(() => []);
      for (const e of b.entries) {
        const li = lodOf(Math.hypot(e.wx - cx, e.wz - cz));
        if (li >= 0 && buckets[li]) buckets[li].push(e);
      }
      b.meshes.forEach((mesh, li) => {
        if (!mesh) return;
        const list = buckets[li] || [];
        mesh.count = list.length;
        list.forEach((e, i) => {
          if (e.matrix && !b.animated) mesh.setMatrixAt(i, e.matrix);
          else {
            const pitch = b.animated ? Math.sin(time * e.freq + e.phase) * 0.6 * DEG : 0;
            dummy.position.set(e.x, e.y, wz(e.z));
            dummy.rotation.set(pitch, e.yaw, 0, "YXZ");
            dummy.scale.set(e.sx, e.sy, e.sz);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          }
          if (e.color) mesh.setColorAt(i, e.color);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    }
  }
  window.__tickOutskirts = tick;

  const shoreNotes = [];
  function shore(name, x, z) {
    const d = polyEdgeDist(x, z, outerPoly);
    if (d < 19.5 || !outsideLand(x, z)) shoreNotes.push({ name, x: +x.toFixed(1), z: +z.toFixed(1), d: +d.toFixed(1) });
  }
  for (const e of hutEntries) shore("hut", e.x, e.z);
  for (const e of cowEntries) shore("cow", e.x, e.z);
  for (const y of yards) shore(y.name, y.cx, y.cz);
  shore("annex", 152, -101);
  shore("road", 128, -120);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const names = ["hut", "hall", "barrack", "cow", "guard", "guard2"];
  const files = isPhone ? ["lod1", "lod2"] : ["lod0", "lod1", "lod2"];
  const jobs = [];
  for (const name of names) for (const lv of files) jobs.push(loadOne(name, lv));

  function loadOne(name, lv) {
    return new Promise((resolve, reject) => {
      const rel = "models/" + name + "_" + lv + ".glb";
      const url = (window.__glb && window.__glb[rel]) || ("/" + rel);
      loader.load(url, resolve, undefined, reject);
    }).then((gltf) => ({ name, lv, prep: prepMesh(gltf) }));
  }
  function prepMesh(gltf) {
    let found = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh || found) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      g.computeBoundingBox();
      const bb = g.boundingBox;
      g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      g.computeBoundingBox();
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const mat = src.clone();
      mat.side = THREE.DoubleSide;
      if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
      if (g.getAttribute("color")) mat.vertexColors = true;
      for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap"]) {
        if (mat[k]) mat[k].anisotropy = 8;
      }
      found = { geometry: g, material: mat, size: g.boundingBox.getSize(new THREE.Vector3()) };
    });
    return found;
  }
  function mirrorLevel(lv) {
    const g = lv.geometry.clone();
    g.scale(-1, 1, 1);
    g.computeVertexNormals();
    return { geometry: g, material: lv.material, size: lv.size };
  }

  Promise.all(jobs).then((list) => {
    const by = {};
    for (const it of list) {
      by[it.name] = by[it.name] || [];
      by[it.name].push(it);
    }
    function levels(name) {
      return files.map((lv) => by[name].find((it) => it.lv === lv).prep);
    }
    scene.updateMatrixWorld(true);
    const hallLv = levels("hall");
    const hallEntries = hallAnchors.map((a) => {
      const wp = new THREE.Vector3();
      a.updateWorldMatrix(true, true);
      a.getWorldPosition(wp);
      const rng = mulberry32(Math.floor(wp.x * 10 + wp.z));
      return { matrix: a.matrixWorld.clone(), color: tint(rng), wx: wp.x, wz: wp.z };
    });
    addBatch(hallLv, hallEntries, false);
    const hutLv = levels("hut");
    addBatch(hutLv, hutEntries, false);
    const cowLv = levels("cow");
    addBatch(cowLv, cowEntries, false);
    const guardLv = levels("guard");
    const spear = 2.4 / Math.max(0.2, guardLv[0].size.y);
    for (const e of guardA.concat(guardB)) {
      const jitter = e.sy / 2.15;
      const s = spear * jitter;
      e.sx = e.sy = e.sz = s;
    }
    addBatch(guardLv, guardA, true);
    addBatch(guardLv.map(mirrorLevel), guardB, true);
    const guard2Lv = levels("guard2");
    addBatch(guard2Lv, officer, true);
    const bar = levels("barrack")[0];
    const rawX = Math.max(0.2, bar.size.x);
    const jitter = 0.94 + mulberry32(3)() * 0.12;
    barrackAnchor.scale.set((8 / rawX) * jitter, 17.6 * jitter, 17.6 * jitter);
    barrackAnchor.updateWorldMatrix(true, true);
    const bp = new THREE.Vector3();
    barrackAnchor.getWorldPosition(bp);
    addBatch(levels("barrack"), [{
      matrix: barrackAnchor.matrixWorld.clone(),
      color: tint(mulberry32(4)),
      wx: bp.x, wz: bp.z,
    }], false);
    const sizeOf = (name) => {
      const p = levels(name)[0];
      return [+p.size.x.toFixed(3), +p.size.y.toFixed(3), +p.size.z.toFixed(3)];
    };
    window.__outskirts = {
      ready: true,
      phone: isPhone,
      huts: hutEntries.length,
      cows: cowEntries.length,
      guards: guardA.length + guardB.length,
      officers: officer.length,
      halls: hallEntries.length,
      trees: treeSpots.length,
      shore: shoreNotes,
      posts: guardA.concat(guardB).map((e) => ({
        kind: "guard", x: e.x, y: e.y, z: e.z, yaw: +e.yaw.toFixed(3), s: +e.sy.toFixed(3),
        phase: +e.phase.toFixed(3), period: +(Math.PI * 2 / e.freq).toFixed(2),
      })).concat(officer.map((e) => ({
        kind: "officer", x: e.x, y: e.y, z: e.z, yaw: e.yaw, s: e.sy,
        phase: e.phase, period: +(Math.PI * 2 / e.freq).toFixed(2),
      }))),
      raw: { hut: sizeOf("hut"), hall: sizeOf("hall"), barrack: sizeOf("barrack"), cow: sizeOf("cow"), guard: sizeOf("guard"), guard2: sizeOf("guard2") },
      guard2h: +((guard2Lv[0].size.y) * 1.55).toFixed(3),
    };
    tick(0, null);
  }).catch((err) => {
    window.__bootErr = "outskirts " + (err && err.message ? err.message : err);
    console.error(err);
  });

  window.__outskirts = { ready: false };

  const treeLods = isPhone
    ? [["lod1", 0, 50], ["lod2", 50, 400]]
    : [["lod0", 0, 60], ["lod1", 60, 200], ["lod2", 200, 600]];
  const treeNames = ["t0", "t1", "t2"];
  const treeJobs = [];
  for (const name of treeNames) for (const [lv] of treeLods) treeJobs.push(loadTree(name, lv));
  function loadTree(name, lv) {
    return new Promise((resolve, reject) => {
      const rel = "models/" + name + "_" + lv + ".glb";
      const url = (window.__glb && window.__glb[rel]) || ("/" + rel);
      loader.load(url, resolve, undefined, reject);
    }).then((gltf) => ({ name, lv, prep: prepTree(gltf) }));
  }
  function prepTree(gltf) {
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      const floatAttr = (attr) => {
        if (!attr) return null;
        if (attr.array instanceof Float32Array && !attr.normalized) return attr;
        const item = attr.itemSize;
        const f = new Float32Array(attr.count * item);
        for (let i = 0; i < attr.count; i++) {
          if (item >= 1) f[i * item] = attr.getX(i);
          if (item >= 2) f[i * item + 1] = attr.getY(i);
          if (item >= 3) f[i * item + 2] = attr.getZ(i);
          if (item >= 4) f[i * item + 3] = attr.getW(i);
        }
        return new THREE.BufferAttribute(f, item);
      };
      const posF = floatAttr(g.getAttribute("position"));
      const nrmF = floatAttr(g.getAttribute("normal"));
      if (posF) g.setAttribute("position", posF);
      if (nrmF) g.setAttribute("normal", nrmF);
      g.applyMatrix4(o.matrixWorld);
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const role = src && src.name === "leaves" ? "leaves" : "branches";
      parts.push({ g, src, role, sx: +o.matrixWorld.elements[0].toFixed(3), sy: +o.matrixWorld.elements[5].toFixed(3) });
    });
    let minY = Infinity, maxY = -Infinity, maxR = 1;
    for (const p of parts) {
      p.g.computeBoundingBox();
      const bb = p.g.boundingBox;
      minY = Math.min(minY, bb.min.y);
      maxY = Math.max(maxY, bb.max.y);
      maxR = Math.max(maxR, Math.hypot(bb.min.x, bb.min.z), Math.hypot(bb.max.x, bb.max.z), Math.hypot(bb.min.x, bb.max.z), Math.hypot(bb.max.x, bb.min.z));
    }
    if (!isFinite(minY)) minY = 0;
    for (const p of parts) p.g.translate(0, -minY, 0);
    return { parts, height: Math.max(1, maxY - minY), radius: maxR };
  }
  function dressTree(src, role, near, far, treeH, treeR) {
    const mat = src.clone();
    mat.side = THREE.DoubleSide;
    if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
    if (role === "leaves") {
      mat.vertexColors = true;
      mat.alphaTest = Math.max(mat.alphaTest || 0, 0.45);
      if (!isPhone) mat.alphaToCoverage = true;
    }
    const amp = role === "leaves" ? 0.085 : 0.012;
    mat.customProgramCacheKey = () => "autree-" + role + "-" + near + "-" + far + (isPhone ? "p" : "d");
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = treeTime;
      shader.uniforms.uWind = { value: new THREE.Vector2(1, 0.7) };
      shader.uniforms.uNear = { value: near };
      shader.uniforms.uFar = { value: far };
      shader.uniforms.uTreeH = { value: Math.max(treeH, 1) };
      shader.uniforms.uTreeR = { value: Math.max(treeR, 1) };
      shader.uniforms.uAmp = { value: amp };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
uniform float uTime;
uniform vec2 uWind;
uniform float uNear;
uniform float uFar;
uniform float uTreeH;
uniform float uTreeR;
uniform float uAmp;
varying float vKeep;`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 root = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float hh = clamp(position.y / max(uTreeH, 1e-4), 0.0, 1.0);
  float radN = clamp(length(position.xz) / max(uTreeR, 1e-4), 0.0, 1.25);
  float phase = fract(sin(dot(root.xz, vec2(127.1, 311.7))) * 43758.5453);
  float wlen = max(length(uWind), 1e-4);
  vec2 wdir = uWind / wlen;
  float gust = 0.38 + 0.62 * pow(max(sin(uTime * 0.23 + root.x * 0.011 + root.z * 0.008), 0.0), 0.5);
  float th = uTime * 1.25 + phase * 6.2831853 - dot(root.xz, wdir) * 0.12;
  float wave = sin(th) * 0.72 + sin(th * 0.57 + phase) * 0.28;
  float bend = hh * hh * (uAmp > 0.03 ? (0.3 + 0.7 * radN) : 0.55);
  float sway = bend * gust * wave * uAmp * uTreeH;
  transformed.x += wdir.x * sway;
  transformed.z += wdir.y * sway;
  float distR = distance(root.xz, cameraPosition.xz);
  float band = 20.0;
  float lo = uNear <= 0.5 ? 1.0 : smoothstep(uNear - band, uNear + band, distR);
  float hi = 1.0 - smoothstep(max(uFar - band, 0.0), uFar + band, distR);
  vKeep = clamp(lo * hi, 0.0, 1.0);
#else
  vKeep = 1.0;
#endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
varying float vKeep;`)
        .replace("#include <alphatest_fragment>", `
  if (vKeep < 0.995) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (dith > max(vKeep, 0.0)) discard;
  }
  #include <alphatest_fragment>`);
    };
    return mat;
  }
  function shellGeo(base, sphere) {
    const g = new THREE.BufferGeometry();
    for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
    if (base.index) g.setIndex(base.index);
    g.boundingSphere = sphere;
    return g;
  }
  Promise.all(treeJobs).then((list) => {
    const by = {};
    for (const it of list) {
      by[it.name] = by[it.name] || {};
      by[it.name][it.lv] = it.prep;
    }
    const buckets = new Map();
    for (const s of treeSpots) {
      const key = (Math.floor(s.x / 60)) + "_" + (Math.floor(s.z / 60));
      let listS = buckets.get(key);
      if (!listS) { listS = []; buckets.set(key, listS); }
      listS.push(s);
    }
    const dummyT = new THREE.Object3D();
    let meshes = 0;
    for (const spots of buckets.values()) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const s of spots) {
        const pz = wz(s.z);
        const prep0 = by[s.kind] && by[s.kind][treeLods[0][0]];
        const h = (prep0 ? prep0.height : 80) * s.s;
        if (s.x - 2 < minX) minX = s.x - 2;
        if (s.x + 2 > maxX) maxX = s.x + 2;
        if (s.y - 1 < minY) minY = s.y - 1;
        if (s.y + h > maxY) maxY = s.y + h;
        if (pz - 2 < minZ) minZ = pz - 2;
        if (pz + 2 > maxZ) maxZ = pz + 2;
      }
      const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
      const rad = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + 1;
      const sphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.max(rad, 2));
      const chunk = { cx, cz, rad, parts: [] };
      const kinds = ["t0", "t1", "t2"];
      for (const kind of kinds) {
        const mine = spots.filter((s) => s.kind === kind);
        if (!mine.length || !by[kind]) continue;
        for (const [lv, near, far] of treeLods) {
          const prep = by[kind][lv];
          if (!prep) continue;
          for (const part of prep.parts) {
            const geo = shellGeo(part.g, sphere);
            const mat = dressTree(part.src, part.role, near, far, prep.height, prep.radius);
            const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
            mesh.name = "autumnTree";
            mesh.count = mine.length;
            mesh.frustumCulled = true;
            mesh.castShadow = !isPhone && lv === "lod0";
            mesh.receiveShadow = false;
            mine.forEach((s, i) => {
              dummyT.position.set(s.x, s.y, wz(s.z));
              dummyT.rotation.set(0, s.yaw, 0);
              dummyT.scale.set(s.s, s.s, s.s);
              dummyT.updateMatrix();
              mesh.setMatrixAt(i, dummyT.matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            scene.add(mesh);
            chunk.parts.push({ mesh, near, far });
            meshes++;
          }
        }
      }
      treeChunks.push(chunk);
    }
    const kinds = { t0: 0, t1: 0, t2: 0 };
    for (const s of treeSpots) kinds[s.kind]++;
    const sample = by.t0 && by.t0[treeLods[0][0]];
    window.__trees = {
      count: treeSpots.length,
      kinds,
      chunks: treeChunks.length,
      meshes,
      phone: isPhone,
      height: sample ? +sample.height.toFixed(2) : 0,
      scales: sample ? sample.parts.map((p) => [p.role, p.sx, p.sy]) : [],
      bank: bankGot,
      field: fieldGot,
      bankWhy,
    };
    if (window.__plants) window.__plants.trees = treeSpots.length;
  }).catch((err) => {
    window.__bootErr = "trees " + (err && err.message ? err.message : err);
    console.error(err);
  });
}
