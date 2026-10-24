import { chromium } from "playwright";
import fs from "fs";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(60000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 50000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__cityReady));
  if (ok) break;
  await page.waitForTimeout(400);
}
const info = await page.evaluate(() => {
  const cam = window.__camera;
  // place camera like the bridge shot
  window.__debug.look(128, 4.2, -22, 128, 6.5, 2);
  const eye = window.__camera.position;
  const big = [];
  window.__scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const e = o.instanceMatrix.array;
    const n = o.count || 0;
    let best = null;
    for (let i = 0; i < n; i++) {
      const x = e[i * 16 + 12], y = e[i * 16 + 13], z = e[i * 16 + 14];
      const sy = Math.hypot(e[i * 16 + 4], e[i * 16 + 5], e[i * 16 + 6]);
      const sx = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
      const d = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
      const frac = Math.max(sx, sy) / Math.max(d, 0.5);
      if (!best || frac > best.frac) best = { frac, d, x, y, z, sx, sy, i };
    }
    if (best && best.frac > 0.2) {
      big.push({
        name: o.name || "?", n,
        frac: +best.frac.toFixed(3), d: +best.d.toFixed(1),
        sx: +best.sx.toFixed(2), sy: +best.sy.toFixed(2),
        x: +best.x.toFixed(1), y: +best.y.toFixed(1), z: +best.z.toFixed(1), i: best.i,
      });
    }
  });
  big.sort((a, b) => b.frac - a.frac);
  // also non-instanced large
  const meshes = [];
  window.__scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (!o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const bs = o.geometry.boundingSphere;
    if (!bs) return;
    o.updateWorldMatrix(true, false);
    const c = bs.center.clone().applyMatrix4(o.matrixWorld);
    const sc = new c.constructor();
    o.getWorldScale(sc);
    const r = bs.radius * Math.max(sc.x, sc.y, sc.z);
    const d = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z);
    const frac = (2 * r) / Math.max(d, 0.5);
    if (frac > 0.35 && r > 3 && d < 400) {
      meshes.push({ name: o.name || "?", frac: +frac.toFixed(2), r: +r.toFixed(1), d: +d.toFixed(1), x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: +c.z.toFixed(1) });
    }
  });
  meshes.sort((a, b) => b.frac - a.frac);
  return { eye: [+eye.x.toFixed(1), +eye.y.toFixed(1), +eye.z.toFixed(1)], big, meshes: meshes.slice(0, 20) };
});
console.log(JSON.stringify(info, null, 2));
fs.writeFileSync("/workspace/screenshots/gray-gate/big.json", JSON.stringify(info, null, 2));
await browser.close();
