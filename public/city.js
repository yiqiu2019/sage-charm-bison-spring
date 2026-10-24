import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { terraceKeepOut } from "./terraces.js";

// 城内 C1。规格坐标，进网格时再取 -z。只种三城墙内。

const GROUND_Y = 0.8;
// 台体/建筑占地外扩 8 米（轴对齐）。台阶单独记，三槐例外。
const BLOCKS = [
  { name: "longtai", x0: 103, x1: 161, z0: 47, z1: 109 },
  { name: "stair", x0: 119, x1: 146, z0: 34.2, z1: 63 },
  { name: "hall2", x0: 109, x1: 147, z0: 100, z1: 136 },
  { name: "hall3", x0: 107, x1: 141, z0: 132, z1: 164 },
  { name: "watch1", x0: 261, x1: 295, z0: 53, z1: 87 },
  { name: "watch2", x0: 261, x1: 295, z0: 95, z1: 129 },
  { name: "parade", x0: 252, x1: 310, z0: 48, z1: 142 },
  { name: "cornerSW", x0: -13, x1: 17, z0: -13, z1: 17 },
  { name: "cornerWN", x0: -13, x1: 17, z0: 203, z1: 233 },
  { name: "cornerNW", x0: 77, x1: 107, z0: 363, z1: 393 },
  { name: "cornerNE", x0: 333, x1: 363, z0: 363, z1: 393 },
  { name: "cornerSE", x0: 333, x1: 363, z0: -13, z1: 17 },
];
const RECTS = {
  W: [15, 205, 15, 205],
  E: [235, 335, 15, 205],
  N: [105, 335, 235, 365],
};

// 手摆的组：组内约 8–15 米，相邻组约 30–60 米。deep 是城心零星。
const RAW = [
  { city: "W", g: "ws1", x: 74, z: 44 },
  { city: "W", g: "ws1", x: 84, z: 52 },
  { city: "W", g: "ws1", x: 92, z: 40 },
  { city: "W", g: "ws1", x: 80, z: 36 },
  { city: "W", g: "sop", x: 120, z: 36, sop: 1, h: 18.4 },
  { city: "W", g: "sop", x: 132, z: 36, sop: 1, h: 19.1 },
  { city: "W", g: "sop", x: 144, z: 36, sop: 1, h: 20 },
  { city: "W", g: "ws3", x: 48, z: 148 },
  { city: "W", g: "ws3", x: 58, z: 156 },
  { city: "W", g: "ws3", x: 64, z: 144 },
  { city: "W", g: "ws3", x: 52, z: 138 },
  { city: "W", g: "ww1", x: 86, z: 78 },
  { city: "W", g: "ww1", x: 96, z: 86 },
  { city: "W", g: "ww1", x: 90, z: 70 },
  { city: "W", g: "ww1", x: 92, z: 94 },
  { city: "W", g: "ww2", x: 78, z: 142 },
  { city: "W", g: "ww2", x: 88, z: 150 },
  { city: "W", g: "ww2", x: 82, z: 134 },
  { city: "W", g: "ww2", x: 84, z: 158 },
  { city: "W", g: "ww3", x: 24, z: 170 },
  { city: "W", g: "ww3", x: 36, z: 170 },
  { city: "W", g: "ww3", x: 30, z: 164 },
  { city: "W", g: "ww3", x: 30, z: 178 },
  { city: "W", g: "deep", x: 160, z: 166 },
  { city: "W", g: "deep", x: 172, z: 156 },
  { city: "E", g: "es1", x: 246, z: 28 },
  { city: "E", g: "es1", x: 256, z: 36 },
  { city: "E", g: "es1", x: 264, z: 26 },
  { city: "E", g: "es2", x: 300, z: 28 },
  { city: "E", g: "es2", x: 310, z: 38 },
  { city: "E", g: "es2", x: 318, z: 26 },
  { city: "E", g: "ee1", x: 298, z: 166 },
  { city: "E", g: "ee1", x: 308, z: 174 },
  { city: "E", g: "ee1", x: 302, z: 158 },
  { city: "E", g: "ee2", x: 314, z: 132 },
  { city: "E", g: "ee2", x: 324, z: 140 },
  { city: "E", g: "ee2", x: 318, z: 148 },
  { city: "N", g: "nn1", x: 112, z: 336 },
  { city: "N", g: "nn1", x: 122, z: 344 },
  { city: "N", g: "nn1", x: 118, z: 328 },
  { city: "N", g: "nn2", x: 176, z: 300 },
  { city: "N", g: "nn2", x: 186, z: 308 },
  { city: "N", g: "nn2", x: 182, z: 294 },
  { city: "N", g: "nn3", x: 242, z: 346 },
  { city: "N", g: "nn3", x: 252, z: 354 },
  { city: "N", g: "nn3", x: 256, z: 342 },
  { city: "N", g: "nn4", x: 300, z: 346 },
  { city: "N", g: "nn4", x: 310, z: 354 },
  { city: "N", g: "nn4", x: 314, z: 342 },
  { city: "N", g: "nw", x: 118, z: 274 },
  { city: "N", g: "nw", x: 128, z: 282 },
  { city: "N", g: "nw", x: 120, z: 290 },
  { city: "N", g: "ne", x: 314, z: 268 },
  { city: "N", g: "ne", x: 324, z: 278 },
  { city: "N", g: "ne", x: 316, z: 284 },
];

function fract(v) {
  return v - Math.floor(v);
}
function heightOf(t, i) {
  if (t.h) return t.h;
  const u = fract(Math.sin(i * 91.7 + t.x * 0.17) * 43758.5453);
  return 15 + u * 5;
}
function kindOf(t, i) {
  if (t.sop) return "t0";
  const u = fract(Math.sin(i * 12.9898 + t.z * 0.13) * 43758.5453);
  return u < 0.24 ? "t1" : "t0";
}
function yawOf(t) {
  return fract(Math.sin(t.x * 12.1 + t.z * 4.7) * 12345.678) * Math.PI * 2;
}
function faceDist(city, x, z) {
  if (city === "W") return [x - 9, z - 9];
  if (city === "E") return [341 - x, z - 9];
  return [371 - z, x - 99, 341 - x];
}

function clearTerrace(x, z) {
  let px = x, pz = z;
  for (let n = 0; n < 14; n++) {
    let hit = null;
    for (const b of terraceKeepOut) {
      if (px >= b.x0 && px <= b.x1 && pz >= b.z0 && pz <= b.z1) { hit = b; break; }
    }
    if (!hit) break;
    const ax = hit.ax || 0, az = hit.az || 0;
    px += (ax === 0 && az === 0 ? 1 : ax) * 5;
    pz += (ax === 0 && az === 0 ? -1 : az) * 5;
  }
  return [px, pz];
}
function planSpots(isPhone) {
  const spots = [];
  const violations = [];
  RAW.forEach((t, i) => {
    if (isPhone && !t.sop && (i % 2 === 1)) return;
    let x = t.x, z = t.z;
    if (!t.sop) {
      const moved = clearTerrace(x, z);
      x = moved[0]; z = moved[1];
    }
    const rect = RECTS[t.city];
    if (x < rect[0] || x > rect[1] || z < rect[2] || z > rect[3]) violations.push("rect " + t.g);
    const faces = faceDist(t.city, x, z);
    if (faces.some((d) => d < 6)) violations.push("wall " + t.g);
    if (t.g !== "deep" && !faces.some((d) => d >= 15 && d <= 80)) violations.push("band " + t.g);
    for (const b of BLOCKS) {
      if (t.sop && b.name === "stair") continue;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) violations.push(b.name + " " + t.g);
    }
    spots.push({
      city: t.city,
      g: t.g,
      sop: !!t.sop,
      kind: kindOf(t, i),
      x, z,
      y: GROUND_Y,
      h: heightOf(t, i),
      yaw: yawOf(t),
      bin: Math.floor(x / 60) + "_" + Math.floor(z / 60),
    });
  });
  return { spots, violations };
}

function sphereOf(list) {
  let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
  for (const s of list) {
    const pz = -s.z;
    minX = Math.min(minX, s.x - 10);
    maxX = Math.max(maxX, s.x + 10);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y + s.h + 2);
    minZ = Math.min(minZ, pz - 10);
    maxZ = Math.max(maxZ, pz + 10);
  }
  if (!list.length) return new THREE.Sphere(new THREE.Vector3(), 1);
  return new THREE.Sphere(
    new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5),
    Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + 2,
  );
}

function packAttr(geo, name, item) {
  const src = geo.attributes[name];
  const n = geo.attributes.position.count;
  const out = new Float32Array(n * item);
  if (!src) {
    if (name === "normal") {
      for (let i = 0; i < n; i++) out[i * 3 + 1] = 1;
    } else if (name === "color") {
      out.fill(1);
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    out[i * item] = src.getX(i);
    if (item > 1) out[i * item + 1] = src.getY(i);
    if (item > 2) out[i * item + 2] = src.getZ(i);
  }
  return out;
}

function mergeParts(parts) {
  const geos = [];
  let count = 0;
  for (const p of parts) {
    let g = p.g.index ? p.g.toNonIndexed() : p.g;
    count += g.attributes.position.count;
    geos.push({ g, leaf: p.role === "leaves" ? 1 : 0 });
  }
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  const role = new Float32Array(count);
  let o = 0;
  for (const p of geos) {
    const n = p.g.attributes.position.count;
    pos.set(packAttr(p.g, "position", 3), o * 3);
    nrm.set(packAttr(p.g, "normal", 3), o * 3);
    uv.set(packAttr(p.g, "uv", 2), o * 2);
    col.set(packAttr(p.g, "color", 3), o * 3);
    role.fill(p.leaf, o, o + n);
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aRole", new THREE.BufferAttribute(role, 1));
  return geo;
}

let updateCity = null;

function dressMerged(leafMat, barkMap, near, far, treeH, key) {
  const mat = leafMat.clone();
  mat.side = THREE.DoubleSide;
  mat.vertexColors = true;
  mat.alphaTest = Math.max(mat.alphaTest || 0, 0.45);
  mat.transparent = false;
  if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
  if (!mat.alphaToCoverage && key.indexOf("phone") < 0) mat.alphaToCoverage = true;
  mat.precision = "highp";
  mat.customProgramCacheKey = () => key;
  if (barkMap) barkMap.updateMatrix();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBark = { value: barkMap };
    shader.uniforms.uBarkMat = { value: barkMap ? barkMap.matrix : new THREE.Matrix3() };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uNear = { value: near };
    shader.uniforms.uFar = { value: far };
    shader.uniforms.uTreeH = { value: Math.max(treeH, 1) };
    shader.uniforms.uAmpLeaf = { value: 0.07 * Math.max(treeH, 1) };
    shader.uniforms.uAmpBranch = { value: 0.012 * Math.max(treeH, 1) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute float aRole;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uTreeH;
uniform float uAmpLeaf;
uniform float uAmpBranch;
varying float vRole;
varying float vKeep;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vRole = aRole;
#ifdef USE_INSTANCING
  vec3 root = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float hh = clamp(position.y / max(uTreeH, 1e-4), 0.0, 1.0);
  float phase = fract(sin(dot(root.xz, vec2(127.1, 311.7))) * 43758.5453);
  vec2 wdir = vec2(0.819, 0.574);
  float gust = 0.4 + 0.6 * pow(max(sin(uTime * 0.23 + root.x * 0.01), 0.0), 0.5);
  float th = uTime * 1.2 + phase * 6.2831853;
  float amp = mix(uAmpBranch, uAmpLeaf, step(0.5, aRole));
  float sway = hh * hh * gust * sin(th) * amp;
  transformed.x += wdir.x * sway;
  transformed.z += wdir.y * sway;
  if (transformed.x != transformed.x || transformed.y != transformed.y || transformed.z != transformed.z) transformed = position;
  float distR = distance(root.xz, cameraPosition.xz);
  float lo = uNear <= 0.5 ? 1.0 : smoothstep(uNear - 16.0, uNear + 16.0, distR);
  float hi = 1.0 - smoothstep(max(uFar - 20.0, 0.0), uFar + 20.0, distR);
  vKeep = clamp(lo * hi, 0.0, 1.0);
#else
  vKeep = 1.0;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D uBark;
uniform mat3 uBarkMat;
varying float vRole;
varying float vKeep;`)
      .replace(
        "vec4 sampledDiffuseColor = texture2D( map, vMapUv );",
        `vec2 barkUv = (uBarkMat * vec3(vUv, 1.0)).xy;
  vec4 barkTex = texture2D(uBark, barkUv);
  vec4 leafTex = texture2D(map, vMapUv);
  vec4 sampledDiffuseColor = mix(vec4(barkTex.rgb, 1.0), leafTex, step(0.5, vRole));`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  if (vKeep < 0.995) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (dith > max(vKeep, 0.0)) discard;
  }
  vec3 c = diffuseColor.rgb;
  if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.35, 0.28, 0.16);
  diffuseColor.rgb = clamp(c, vec3(0.0), vec3(1.2));
}`);
    mat.userData.shader = shader;
  };
  return mat;
}

function dressBoard(src, near, far, treeH, key, isPhone) {
  const mat = src.clone();
  mat.side = THREE.DoubleSide;
  mat.alphaTest = Math.max(mat.alphaTest || 0, 0.45);
  mat.transparent = false;
  if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
  if (!isPhone) mat.alphaToCoverage = true;
  mat.precision = "highp";
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uNear = { value: near };
    shader.uniforms.uFar = { value: far };
    shader.uniforms.uTreeH = { value: Math.max(treeH, 1) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uTreeH;
varying float vKeep;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 root = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float hh = clamp(position.y / max(uTreeH, 1e-4), 0.0, 1.0);
  float phase = fract(sin(dot(root.xz, vec2(127.1, 311.7))) * 43758.5453);
  vec2 wdir = vec2(0.819, 0.574);
  float gust = 0.4 + 0.6 * pow(max(sin(uTime * 0.23 + root.x * 0.01), 0.0), 0.5);
  float sway = hh * hh * gust * sin(uTime * 1.2 + phase * 6.2831853) * 0.04 * max(uTreeH, 1.0);
  transformed.x += wdir.x * sway;
  transformed.z += wdir.y * sway;
  if (transformed.x != transformed.x || transformed.y != transformed.y || transformed.z != transformed.z) transformed = position;
  float distR = distance(root.xz, cameraPosition.xz);
  float lo = uNear <= 0.5 ? 1.0 : smoothstep(uNear - 16.0, uNear + 16.0, distR);
  float hi = 1.0 - smoothstep(max(uFar - 20.0, 0.0), uFar + 20.0, distR);
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
  if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.35, 0.28, 0.16);
  diffuseColor.rgb = clamp(c, vec3(0.0), vec3(1.2));
}`);
    mat.userData.shader = shader;
  };
  return mat;
}

function floatAttr(attr, item) {
  const f = new Float32Array(attr.count * item);
  for (let i = 0; i < attr.count; i++) {
    f[i * item] = attr.getX(i);
    if (item > 1) f[i * item + 1] = attr.getY(i);
    if (item > 2) f[i * item + 2] = attr.getZ(i);
  }
  return new THREE.BufferAttribute(f, item);
}
function bakeMesh(o) {
  const g = o.geometry.clone();
  o.updateWorldMatrix(true, false);
  for (const name of ["position", "normal"]) {
    const a = g.attributes[name];
    if (a && (a.normalized || !(a.array instanceof Float32Array))) g.setAttribute(name, floatAttr(a, 3));
  }
  g.applyMatrix4(o.matrixWorld);
  return g;
}

export function buildCity(ctx) {
  const { scene, isPhone, plantTime } = ctx;
  const planned = planSpots(!!isPhone);
  const spots = planned.spots;
  const root = new THREE.Group();
  root.name = "cityC1";
  scene.add(root);
  const dk = isPhone ? 0.7 : 1;
  const lods = [
    ["lod0", 0, 60 * dk],
    ["lod1", 60 * dk, 200 * dk],
    ["lod2", 200 * dk, 600 * dk],
  ];
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const jobs = [];
  for (const kind of ["t0", "t1"]) {
    for (const [lv] of lods) {
      const rel = "models/" + kind + "_" + lv + ".glb";
      jobs.push(new Promise((resolve, reject) => {
        const url = (window.__glb && window.__glb[rel]) || ("/" + rel);
        loader.load(url, (gltf) => resolve({ kind, lv, gltf }), undefined, reject);
      }));
    }
  }
  const bins = new Set(spots.map((s) => s.bin));
  const kinds = { t0: 0, t1: 0 };
  const cities = { W: 0, E: 0, N: 0 };
  for (const s of spots) {
    kinds[s.kind]++;
    cities[s.city]++;
  }
  window.__city = {
    spots: spots.length,
    kinds,
    cities,
    bins: bins.size,
    phone: !!isPhone,
    raw: RAW.length,
    blocked: BLOCKS.length,
    violations: planned.violations,
  };

  return Promise.all(jobs).then((list) => {
    const by = {};
    for (const it of list) {
      const parts = [];
      it.gltf.scene.updateMatrixWorld(true);
      it.gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = bakeMesh(o);
        const src = Array.isArray(o.material) ? o.material[0] : o.material;
        const role = src && src.name === "leaves" ? "leaves" : (src && src.name === "billboard" ? "billboard" : "branches");
        parts.push({ g, src, role });
      });
      let minY = Infinity, maxY = -Infinity, maxR = 0;
      for (const p of parts) {
        p.g.computeBoundingBox();
        minY = Math.min(minY, p.g.boundingBox.min.y);
        maxY = Math.max(maxY, p.g.boundingBox.max.y);
        const pos = p.g.attributes.position;
        for (let i = 0; i < pos.count; i += 8) {
          maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)));
        }
      }
      if (isFinite(minY)) {
        for (const p of parts) p.g.translate(0, -minY, 0);
      }
      const height = Math.max(1, maxY - minY);
      by[it.kind] = by[it.kind] || {};
      by[it.kind][it.lv] = { parts, height, crown: maxR };
    }
    const dummy = new THREE.Object3D();
    const buckets = [];
    const modelH = {};
    for (const kind of ["t0", "t1"]) {
      const mine = spots.filter((s) => s.kind === kind);
      if (!mine.length || !by[kind]) continue;
      modelH[kind] = by[kind].lod0 ? +by[kind].lod0.height.toFixed(2) : 0;
      for (const [lv, near, far] of lods) {
        const prep = by[kind][lv];
        if (!prep) continue;
        const phoneTag = isPhone ? "-p" : "";
        let geo, mat;
        if (lv === "lod2") {
          const part = prep.parts[0];
          geo = part.g.clone();
          if (geo.index) geo = geo.toNonIndexed();
          mat = dressBoard(part.src, near, far, prep.height, "city-tree-" + kind + "-lod2" + phoneTag, isPhone);
        } else {
          const leaf = prep.parts.find((p) => p.role === "leaves") || prep.parts[0];
          const bark = prep.parts.find((p) => p.role === "branches") || prep.parts[0];
          geo = mergeParts(prep.parts);
          mat = dressMerged(
            leaf.src,
            bark.src && bark.src.map,
            near, far, prep.height,
            "city-tree-" + kind + "-" + lv + phoneTag,
          );
          if (isPhone) mat.alphaToCoverage = false;
        }
        geo.computeBoundingSphere();
        const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mine.length));
        mesh.name = "cityTree";
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = true;
        mesh.castShadow = !isPhone && lv === "lod0";
        mesh.receiveShadow = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        root.add(mesh);
        buckets.push({ mesh, spots: mine, near, far, kind, lv, mat });
      }
    }
    updateCity = (cam) => {
      if (!cam) return 0;
      const cx = cam.position.x, cz = -cam.position.z;
      const t = plantTime ? plantTime.value : 0;
      let shown = 0;
      for (const b of buckets) {
        if (b.mat.userData.shader) b.mat.userData.shader.uniforms.uTime.value = t;
        const list = [];
        for (const s of b.spots) {
          const d = Math.hypot(s.x - cx, s.z - cz);
          if (d >= b.near - 18 && d <= b.far + 18) list.push(s);
        }
        b.mesh.count = list.length;
        b.mesh.visible = list.length > 0;
        if (!list.length) continue;
        shown++;
        const scaleH = (by[b.kind][b.lv] || by[b.kind].lod0).height;
        list.forEach((s, i) => {
          dummy.position.set(s.x, s.y, -s.z);
          dummy.rotation.set(0, s.yaw, 0);
          dummy.scale.setScalar(s.h / Math.max(scaleH, 1e-4));
          dummy.updateMatrix();
          b.mesh.setMatrixAt(i, dummy.matrix);
        });
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.computeBoundingSphere();
      }
      return shown;
    };
    window.__tickCity = (cam) => {
      const n = updateCity ? updateCity(cam) : 0;
      if (window.__city) window.__city.draws = n;
    };
    window.__city.modelH = modelH;
    window.__city.crown = {
      t0: by.t0 && by.t0.lod0 ? +by.t0.lod0.crown.toFixed(2) : 0,
      t1: by.t1 && by.t1.lod0 ? +by.t1.lod0.crown.toFixed(2) : 0,
    };
    window.__city.meshes = buckets.length;
    window.__cityReady = true;
    if (window.__camera) window.__tickCity(window.__camera);
    return buckets.length;
  }).catch((err) => {
    window.__bootErr = "city " + String(err && err.stack || err);
    console.error(err);
  });
}