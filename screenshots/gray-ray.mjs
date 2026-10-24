import { chromium } from "playwright";
import fs from "fs";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 636 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(90000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 55000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__debug && window.__cityReady && window.__buildings && window.__buildings.ready));
  if (ok) break;
  await page.waitForTimeout(400);
}
const info = await page.evaluate(async () => {
  const L = document.getElementById("loader"); if (L) L.style.display = "none";
  window.dispatchEvent(new Event("embark"));
  window.__hour("dusk", true);
  // bridge head-on, similar to image-16
  window.__debug.look(128, 4.2, -28, 128, 8, 2);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__paint();
  const THREE = window.__scene.constructor; // not THREE
  const cam = window.__camera;
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  // no-normal meshes
  const noN = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const n = o.geometry.getAttribute("normal");
    if (n) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const sz = bb.getSize(new bb.min.constructor());
    noN.push({
      name: o.name || o.type,
      count: o.isInstancedMesh ? o.count : 1,
      vis: o.visible,
      sz: [+sz.x.toFixed(2), +sz.y.toFixed(2), +sz.z.toFixed(2)],
      mat: o.material && (o.material.name || o.material.type),
    });
  });
  // ray grid
  const rays = [];
  const RC = cam.raycaster ? null : null;
  // use existing __hit
  const grid = [];
  for (let ny = 0.7; ny >= -0.7; ny -= 0.2) {
    const row = [];
    for (let nx = -0.8; nx <= 0.8; nx += 0.2) {
      const h = window.__hit(nx, ny);
      row.push(h[0] ? h[0].name + "@" + h[0].d : "-");
    }
    grid.push(row.join(" "));
  }
  // project instance centers that land as large screen quads: any mesh with a plane-like bbox
  const planes = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const s = g.boundingBox.getSize(new g.boundingBox.min.constructor());
    const thin = Math.min(s.x, s.y, s.z);
    const big = Math.max(s.x, s.y, s.z);
    if (big < 8 || thin > 1.5) return;
    o.updateWorldMatrix(true, false);
    const c = g.boundingBox.getCenter(new s.constructor()).applyMatrix4(o.matrixWorld);
    const d = c.distanceTo(cam.position);
    planes.push({
      name: o.name || "?",
      s: [+s.x.toFixed(1), +s.y.toFixed(1), +s.z.toFixed(1)],
      c: [+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)],
      d: +d.toFixed(1),
      vis: o.visible,
      inst: !!o.isInstancedMesh,
      n: o.isInstancedMesh ? o.count : 1,
    });
  });
  planes.sort((a, b) => a.d - b.d);
  return {
    buildings: window.__buildings,
    guards: window.__gateGuards,
    cam: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    noN: noN.slice(0, 40),
    noNcount: noN.length,
    planes: planes.slice(0, 25),
    grid,
  };
});
fs.writeFileSync("/workspace/screenshots/gray-gate/ray.json", JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2).slice(0, 8000));
await browser.close();
