import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(40000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 35000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__scene));
  if (ok) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(8000);
const out = await page.evaluate(() => {
  const scene = window.__scene;
  const hits = [];
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count) return;
    const e = o.instanceMatrix.array;
    let maxS = 0, n = 0;
    const near = [];
    for (let i = 0; i < o.count; i++) {
      const x = e[i * 16 + 12], y = e[i * 16 + 13], z = e[i * 16 + 14];
      const sx = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
      const sy = Math.hypot(e[i * 16 + 4], e[i * 16 + 5], e[i * 16 + 6]);
      const sz = Math.hypot(e[i * 16 + 8], e[i * 16 + 9], e[i * 16 + 10]);
      const s = Math.max(sx, sy, sz);
      if (s > maxS) maxS = s;
      const d = Math.hypot(x - 128, z);
      if (d < 120 && s > 4) {
        n++;
        if (near.length < 8) near.push({ i, x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), d: +d.toFixed(1), sx: +sx.toFixed(1), sy: +sy.toFixed(1), sz: +sz.toFixed(1) });
      }
    }
    if (near.length || /board|reed|guard|smoke|flag|pavilion|cityTree|grove|hill|field/i.test(o.name || "")) {
      hits.push({ name: o.name, vis: o.visible, count: o.count, maxS: +maxS.toFixed(1), near });
    }
  });
  return { stage: window.__stage, boot: window.__bootErr || null, hits };
});
console.log(JSON.stringify(out, null, 2).slice(0, 12000));
await browser.close();
