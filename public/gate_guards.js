import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// 南城门外两名卫兵。模型文件不改；缩放、朝向、材质都在加载后设置。
// 规格坐标。朝南（世界 +Z）为正面朝外、朝木桥。

const GUARDS = [
  { file: "guard_ge.glb", name: "guardGe", x: 120.3, z: -2.5, yaw: 10 },
  { file: "guard_sword.glb", name: "guardSword", x: 135.7, z: -2.5, yaw: -10 },
];

function smoothstep(a, b, t) {
  const k = Math.max(0, Math.min(1, (t - a) / Math.max(b - a, 1e-5)));
  return k * k * (3 - 2 * k);
}

function measureBody(mesh) {
  const pos = mesh.geometry.getAttribute("position");
  const q = mesh.quaternion;
  const v = new mesh.position.constructor(0, 0, 0);
  const xs = new Float32Array(pos.count);
  const ys = new Float32Array(pos.count);
  const zs = new Float32Array(pos.count);
  let minY = Infinity;
  let maxY = -Infinity;
  let sx = 0;
  let sz = 0;
  let nAxis = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyQuaternion(q);
    xs[i] = v.x;
    ys[i] = v.y;
    zs[i] = v.z;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.y > 0.35 && v.y < 0.7) {
      sx += v.x;
      sz += v.z;
      nAxis++;
    }
  }
  const cx = nAxis ? sx / nAxis : 0;
  const cz = nAxis ? sz / nAxis : 0;
  const slices = 56;
  const span = Math.max(maxY - minY, 1e-4);
  let head = null;
  for (let s = slices - 1; s >= 0; s--) {
    const y0 = minY + span * s / slices;
    const y1 = minY + span * (s + 1) / slices;
    let n = 0;
    let core = 0;
    let minX = 1e9;
    let maxX = -1e9;
    let minZ = 1e9;
    let maxZ = -1e9;
    for (let i = 0; i < pos.count; i++) {
      if (ys[i] < y0 || ys[i] >= y1) continue;
      n++;
      if (xs[i] < minX) minX = xs[i];
      if (xs[i] > maxX) maxX = xs[i];
      if (zs[i] < minZ) minZ = zs[i];
      if (zs[i] > maxZ) maxZ = zs[i];
      const dx = xs[i] - cx;
      const dz = zs[i] - cz;
      if (dx * dx + dz * dz < 0.12 * 0.12) core++;
    }
    const wide = Math.max(maxX - minX, maxZ - minZ);
    // 戈的横刃很宽，冠顶和戈杆很细。头顶取还连着头的最后一层。
    if (n < 25 || core < 50 || wide > 0.32 || wide < 0.06) continue;
    head = y1;
    break;
  }
  if (!(head > 0)) head = maxY;
  return { minY, maxY, head };
}

function dress(mat, key) {
  mat.side = 0; // THREE.FrontSide
  mat.shadowSide = 0;
  if (mat.specularIntensity !== undefined) mat.specularIntensity = 0.5;
  mat.precision = "highp";
  mat.customProgramCacheKey = () => key;
  for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap]) {
    if (t) t.anisotropy = 4;
  }
  const uKeep = { value: 1 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uKeep = uKeep;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uKeep;\nvarying float vKeep;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
  vKeep = uKeep;
  if (!(vKeep == vKeep)) vKeep = 1.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vKeep;\n")
      .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
{
  float k = vKeep;
  if (!(k == k)) k = 1.0;
  k = clamp(k, 0.0, 1.0);
  if (k < 0.992) {
    float dith = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (!(dith == dith)) dith = 0.0;
    if (dith > k) discard;
  }
}`);
  };
  mat.needsUpdate = true;
  return uKeep;
}

export function bootGateGuards(ctx) {
  const { THREE, scene, isPhone, wz } = ctx;
  const info = { ready: false, skipped: null, guards: [] };
  window.__gateGuards = info;
  if (isPhone || /standalone/i.test(location.pathname || "")) {
    info.ready = true;
    info.skipped = isPhone ? "phone" : "standalone";
    return info;
  }
  const keeps = [];
  const loader = new GLTFLoader();
  let left = GUARDS.length;
  function done() {
    left--;
    if (left <= 0) info.ready = true;
  }
  for (const spec of GUARDS) {
    const url = "/models/" + spec.file;
    loader.load(url, (gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => {
        if (o.isMesh && !mesh) mesh = o;
      });
      if (!mesh) {
        info.err = spec.name + " no mesh";
        done();
        return;
      }
      const body = measureBody(mesh);
      const scale = 1.72 / Math.max(body.head - body.minY, 1e-3);
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const uKeep = dress(src, "gate-guard-" + spec.name);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      const root = new THREE.Group();
      root.name = spec.name;
      root.position.set(spec.x, 0.8 - body.minY * scale, wz(spec.z));
      root.rotation.y = spec.yaw * Math.PI / 180;
      gltf.scene.scale.setScalar(scale);
      root.add(gltf.scene);
      scene.add(root);
      keeps.push({
        root, uKeep, x: spec.x, z: spec.z,
      });
      info.guards.push({
        name: spec.name,
        x: spec.x,
        z: spec.z,
        yaw: spec.yaw,
        scale: +scale.toFixed(3),
        head: +((body.head - body.minY) * scale).toFixed(3),
        rawHead: +body.head.toFixed(3),
        rawTop: +body.maxY.toFixed(3),
        minY: +body.minY.toFixed(4),
      });
      done();
    }, undefined, (err) => {
      info.err = spec.name + " " + (err && err.message ? err.message : err);
      done();
    });
  }
  window.__tickGateGuards = (camera) => {
    if (!camera || !camera.position) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (const g of keeps) {
      const d = Math.hypot(g.x - cx, wz(g.z) - cz);
      const k = 1 - smoothstep(150, 176, d);
      g.uKeep.value = k;
      g.root.visible = k > 0.03;
    }
  };
  return info;
}
