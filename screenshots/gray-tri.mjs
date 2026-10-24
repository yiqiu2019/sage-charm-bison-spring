import { chromium } from "playwright";
import fs from "fs";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.setDefaultTimeout(90000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 55000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__cityReady));
  if (ok) break;
  await page.waitForTimeout(400);
}
const info = await page.evaluate(() => {
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  const hits = [];
  const v = new Float32Array(9);
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
    const g = o.geometry;
    const pos = g.getAttribute("position");
    if (!pos) return;
    const idx = g.index ? g.index.array : null;
    const nTri = idx ? idx.length / 3 : pos.count / 3;
    if (nTri > 80000) return;
    const e = o.matrixWorld.elements;
    const xf = (x, y, z, out, o3) => {
      out[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    };
    const step = nTri > 20000 ? 4 : 1;
    for (let t = 0; t < nTri; t += step) {
      const ia = idx ? idx[t * 3] : t * 3;
      const ib = idx ? idx[t * 3 + 1] : t * 3 + 1;
      const ic = idx ? idx[t * 3 + 2] : t * 3 + 2;
      xf(pos.getX(ia), pos.getY(ia), pos.getZ(ia), v, 0);
      xf(pos.getX(ib), pos.getY(ib), pos.getZ(ib), v, 3);
      xf(pos.getX(ic), pos.getY(ic), pos.getZ(ic), v, 6);
      const abx = v[3] - v[0], aby = v[4] - v[1], abz = v[5] - v[2];
      const acx = v[6] - v[0], acy = v[7] - v[1], acz = v[8] - v[2];
      const cx = aby * acz - abz * acy;
      const cy = abz * acx - abx * acz;
      const cz = abx * acy - aby * acx;
      const area = 0.5 * Math.hypot(cx, cy, cz);
      if (area < 40) continue;
      const mx = (v[0] + v[3] + v[6]) / 3;
      const my = (v[1] + v[4] + v[7]) / 3;
      const mz = (v[2] + v[5] + v[8]) / 3;
      // near south gate: world x 60-200, world z -20..40 (spec z -40..20), y -2..40
      if (mx < 40 || mx > 220 || mz < -30 || mz > 80 || my < -5 || my > 45) continue;
      const nlen = Math.hypot(cx, cy, cz) || 1;
      hits.push({
        name: o.name || o.type,
        area: +area.toFixed(1),
        c: [+mx.toFixed(1), +my.toFixed(1), +mz.toFixed(1)],
        n: [+(cx / nlen).toFixed(2), +(cy / nlen).toFixed(2), +(cz / nlen).toFixed(2)],
        span: [
          +Math.hypot(abx, aby, abz).toFixed(1),
          +Math.hypot(acx, acy, acz).toFixed(1),
        ],
      });
    }
  });
  hits.sort((a, b) => b.area - a.area);
  return { n: hits.length, hits: hits.slice(0, 40) };
});
fs.writeFileSync("/workspace/screenshots/gray-gate/tri.json", JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
await browser.close();
