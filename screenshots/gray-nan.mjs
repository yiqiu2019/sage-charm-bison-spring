import { chromium } from "playwright";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.setDefaultTimeout(120000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__cityReady && window.__reeds));
  if (ok) break;
  await page.waitForTimeout(400);
}
await page.evaluate(() => { window.dispatchEvent(new Event("embark")); window.__freeze = true; });
const info = await page.evaluate(() => {
  window.__debug.look(178, 11.7, -52, 128, 10, -6);
  if (window.__tickCity) window.__tickCity(window.__camera);
  if (window.__tickSouth) window.__tickSouth(window.__camera);
  if (window.__tickGrove) window.__tickGrove(window.__camera);
  if (window.__paint) window.__paint();
  const bad = [];
  const big = [];
  window.__scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const n = o.count || 0;
    const M = o.matrixWorld.clone();
    let nan = 0, inf = 0, huge = 0;
    const samples = [];
    for (let i = 0; i < n; i++) {
      o.getMatrixAt(i, M);
      const e = M.elements;
      let nN = false, nI = false;
      for (let k = 0; k < 16; k++) {
        if (e[k] !== e[k]) nN = true;
        else if (!Number.isFinite(e[k])) nI = true;
      }
      if (nN) nan++;
      if (nI) inf++;
      const sx = Math.hypot(e[0], e[1], e[2]);
      const sy = Math.hypot(e[4], e[5], e[6]);
      const sz = Math.hypot(e[8], e[9], e[10]);
      if (sx > 30 || sy > 30 || sz > 40) {
        huge++;
        if (samples.length < 6) samples.push({ i, s: [+sx.toFixed(1), +sy.toFixed(1), +sz.toFixed(1)], p: [+e[12].toFixed(1), +e[13].toFixed(1), +e[14].toFixed(1)] });
      }
    }
    if (nan || inf || huge) bad.push({ name: o.name || "?", n, nan, inf, huge, samples, a2c: !!(o.material && o.material.alphaToCoverage) });
    else if ((o.material && o.material.alphaToCoverage) && n > 0) big.push({ name: o.name || "?", n, a2c: true });
  });
  // also non-instanced alphaToCoverage
  const mats = [];
  window.__scene.traverse((o) => {
    if (!o.material || o.isInstancedMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (m && m.alphaToCoverage) mats.push(o.name || o.type);
  });
  return { bad, a2cInst: big, a2cMesh: mats.slice(0, 30), reeds: window.__reeds, city: window.__city && window.__city.draws };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
