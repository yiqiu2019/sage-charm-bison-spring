import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 636 } });
page.setDefaultTimeout(180000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high&post=0", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 150000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__debug && window.__cityReady && window.__gateGuards && window.__gateGuards.ready));
  if (ok) break;
  await page.waitForTimeout(500);
}
const boot = await page.evaluate(() => ({
  err: window.__bootErr || null,
  guards: window.__gateGuards,
  city: !!(window.__cityReady),
}));
console.log("boot", JSON.stringify(boot).slice(0, 500));
await page.evaluate(() => {
  window.dispatchEvent(new Event("embark"));
  window.__freeze = true;
  window.__debug.look(178, 11.7, -52, 128, 10, -6);
  if (window.__tickCity) window.__tickCity(window.__camera);
  if (window.__paint) window.__paint();
});

const hits = await page.evaluate(() => {
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  const out = [];
  const v = new Float32Array(9);
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.visible) return;
    if (o.isInstancedMesh && o.count > 80) return;
    const g = o.geometry;
    const pos = g.getAttribute("position");
    if (!pos || pos.count > 20000) return;
    const idx = g.getIndex();
    const nTri = idx ? idx.count / 3 : pos.count / 3;
    if (nTri > 8000) return;
    o.updateWorldMatrix(true, false);
    const e = o.matrixWorld.elements;
    function wp(i, dst, o3) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      dst[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      dst[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      dst[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    const instN = o.isInstancedMesh ? o.count : 1;
    for (let inst = 0; inst < instN; inst++) {
      if (o.isInstancedMesh) {
        o.getMatrixAt(inst, o.matrixWorld);
        // matrixWorld is local instance; bake parent
        o.matrixWorld.premultiply(o.parent.matrixWorld);
      }
      const el = o.matrixWorld.elements;
      function wpi(i, dst, o3) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        dst[o3] = el[0] * x + el[4] * y + el[8] * z + el[12];
        dst[o3 + 1] = el[1] * x + el[5] * y + el[9] * z + el[13];
        dst[o3 + 2] = el[2] * x + el[6] * y + el[10] * z + el[14];
      }
      let reported = 0;
      for (let t = 0; t < nTri; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        wpi(i0, v, 0); wpi(i1, v, 3); wpi(i2, v, 6);
        let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
        for (let k = 0; k < 9; k += 3) {
          minX = Math.min(minX, v[k]); maxX = Math.max(maxX, v[k]);
          minY = Math.min(minY, v[k + 1]); maxY = Math.max(maxY, v[k + 1]);
          minZ = Math.min(minZ, v[k + 2]); maxZ = Math.max(maxZ, v[k + 2]);
        }
        const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
        if (Math.hypot(cx - 128, cz - 4) > 80) continue;
        if (dx < 8 && dy < 8 && dz < 8) continue;
        if (dx * dy < 40 && dx * dz < 40 && dy * dz < 40) continue;
        out.push({
          name: o.name || o.type,
          inst,
          dx: +dx.toFixed(2), dy: +dy.toFixed(2), dz: +dz.toFixed(2),
          at: [+cx.toFixed(1), +cy.toFixed(1), +cz.toFixed(1)],
          a2c: !!(o.material && o.material.alphaToCoverage),
          side: o.material && o.material.side,
          trans: !!(o.material && o.material.transparent),
        });
        if (++reported > 6) break;
      }
    }
  });
  return out;
});
fs.mkdirSync("/workspace/screenshots/gray-gate", { recursive: true });
fs.writeFileSync("/workspace/screenshots/gray-gate/tri2.json", JSON.stringify(hits, null, 1));
console.log("hits", hits.length);
const big = hits.filter((h) => h.dx > 12 && h.dy > 8);
console.log("tall wide", big.length);
for (const h of big.slice(0, 40)) console.log(JSON.stringify(h));
await browser.close();
