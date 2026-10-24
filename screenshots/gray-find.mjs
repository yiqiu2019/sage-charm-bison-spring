import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/gray-gate";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high&pick=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let boot = null;
while (Date.now() - t0 < 90000) {
  boot = await page.evaluate(() => ({
    err: window.__bootErr || null,
    paint: typeof window.__paint === "function",
    guards: window.__gateGuards && window.__gateGuards.ready,
  }));
  if (boot.err || (boot.paint && boot.guards)) break;
  await page.waitForTimeout(400);
}
console.log("boot", JSON.stringify(boot), Math.round((Date.now() - t0) / 1000) + "s", errs.slice(0, 4));

const report = await page.evaluate(async () => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  if (window.__hour) window.__hour("dusk", true);
  window.__debug.look(128, 4.2, -28, 128, 5.5, 2);
  window.__paint();
  const THREE = window.__scene.constructor;
  // THREE is Scene constructor, not the namespace. Use camera and vectors from objects.
  const scene = window.__scene;
  const cam = window.__camera;
  scene.updateMatrixWorld(true);
  const camPos = cam.position.clone();
  const facing = [];
  const tmpN = new cam.position.constructor();
  const tmpP = new cam.position.constructor();
  const q = new cam.quaternion.constructor();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!o.isInstancedMesh) {
      o.getWorldPosition(tmpP);
      o.getWorldQuaternion(q);
      tmpN.set(0, 0, 1).applyQuaternion(q);
      const to = tmpP.clone().sub(camPos);
      const dist = to.length();
      if (dist < 1 || dist > 80) return;
      to.multiplyScalar(1 / dist);
      const face = Math.abs(tmpN.dot(to));
      if (face < 0.85) return;
      if (tmpP.x < 90 || tmpP.x > 170) return;
      facing.push({
        name: o.name || o.geometry.type,
        mat: mat && (mat.name || mat.type),
        key: mat && mat.customProgramCacheKey ? String(mat.customProgramCacheKey()) : "",
        trans: !!(mat && mat.transparent),
        alpha: mat && mat.alphaTest || 0,
        dist: +dist.toFixed(1),
        face: +face.toFixed(2),
        x: +tmpP.x.toFixed(1), y: +tmpP.y.toFixed(1), specZ: +(-tmpP.z).toFixed(1),
      });
      return;
    }
    const e = o.instanceMatrix.array;
    const n = Math.min(o.count, 4000);
    let hits = 0;
    const samples = [];
    for (let i = 0; i < n; i++) {
      const x = e[i * 16 + 12], y = e[i * 16 + 13], z = e[i * 16 + 14];
      if (x < 90 || x > 170 || z < -15 || z > 90) continue;
      const dx = x - camPos.x, dy = y - camPos.y, dz = z - camPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1 || dist > 60) continue;
      // instance Y axis or Z axis facing camera? use column 2 (local +Z) as normal
      let nx = e[i * 16 + 8], ny = e[i * 16 + 9], nz = e[i * 16 + 10];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const face = Math.abs((nx * dx + ny * dy + nz * dz) / dist);
      const sx = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
      const sy = Math.hypot(e[i * 16 + 4], e[i * 16 + 5], e[i * 16 + 6]);
      if (face < 0.82 && sy < 6) continue;
      hits++;
      if (samples.length < 6) samples.push({
        i, x: +x.toFixed(1), y: +y.toFixed(1), specZ: +(-z).toFixed(1),
        sx: +sx.toFixed(2), sy: +sy.toFixed(2), face: +face.toFixed(2), dist: +dist.toFixed(1),
      });
    }
    if (hits) facing.push({
      name: o.name || "inst",
      mat: mat && (mat.name || mat.type),
      key: mat && mat.customProgramCacheKey ? String(mat.customProgramCacheKey()) : "",
      trans: !!(mat && mat.transparent),
      count: o.count, hits, samples,
    });
  });
  // mist state
  const mist = [];
  scene.traverse((o) => {
    if (!o.material || !o.material.uniforms || !o.material.uniforms.uOpacity) return;
    if (o.geometry && o.geometry.type === "PlaneGeometry") {
      mist.push({
        name: o.name, y: +o.position.y.toFixed(2),
        rot: [+o.rotation.x.toFixed(3), +o.rotation.y.toFixed(3), +o.rotation.z.toFixed(3)],
        op: o.material.uniforms.uOpacity.value,
        vis: o.visible,
        params: o.geometry.parameters,
      });
    }
  });
  const center = window.__hit(0, 0);
  const grid = [];
  for (const y of [-0.2, 0, 0.25]) for (const x of [-0.35, 0, 0.35]) {
    grid.push({ x, y, hits: window.__hit(x, y) });
  }
  return { facing: facing.slice(0, 40), mist, center, grid, post: window.__postInfo };
});
fs.writeFileSync(outDir + "/find.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2).slice(0, 8000));
await browser.close();
