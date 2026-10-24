import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 636 } });
page.setDefaultTimeout(180000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 150000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__debug && window.__cityReady && window.__gateGuards && window.__gateGuards.ready));
  if (ok) break;
  await page.waitForTimeout(400);
}
await page.evaluate(() => {
  window.dispatchEvent(new Event("embark"));
  window.__freeze = true;
  window.__debug.look(160, 6, -30, 128, 8, 2);
  if (window.__tickCity) window.__tickCity(window.__camera);
  if (window.__tickSouth) window.__tickSouth(window.__camera);
  if (window.__tickGrove) window.__tickGrove(window.__camera);
  if (window.__tickNorth) window.__tickNorth(window.__camera);
  if (window.__paint) window.__paint();
});
const rows = await page.evaluate(() => {
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  const out = [];
  const M = new window.__camera.matrixWorld.constructor();
  const p = new window.__camera.position.constructor();
  const q = new window.__camera.quaternion.constructor();
  const s = new window.__camera.position.constructor();
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.visible || !o.count) return;
    const n = o.count;
    let near = 0, big = 0;
    const samples = [];
    for (let i = 0; i < n; i++) {
      o.getMatrixAt(i, M);
      M.decompose(p, q, s);
      // instance matrix is local to mesh; mesh is usually identity
      p.applyMatrix4(o.matrixWorld);
      const dx = p.x - 128, dz = p.z - 4;
      const d = Math.hypot(dx, dz);
      const sm = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
      if (d < 90) near++;
      if (d < 120 && sm > 6) {
        big++;
        if (samples.length < 8) samples.push({
          i, d: +d.toFixed(1),
          p: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)],
          s: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)],
        });
      }
    }
    if (near || big) out.push({
      name: o.name || "",
      n, near, big,
      a2c: !!(o.material && o.material.alphaToCoverage),
      trans: !!(o.material && o.material.transparent),
      opacity: o.material && o.material.opacity,
      samples,
    });
  });
  return out;
});
fs.writeFileSync("/workspace/screenshots/gray-gate/inst.json", JSON.stringify(rows, null, 1));
console.log("groups", rows.length);
for (const r of rows) {
  console.log(`${r.name} n=${r.n} near=${r.near} big=${r.big} a2c=${r.a2c} op=${r.opacity}`);
  for (const s of r.samples) console.log("   ", JSON.stringify(s));
}
await browser.close();
