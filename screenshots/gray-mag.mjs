import { chromium } from "playwright";
import fs from "fs";
const OUT = "/workspace/screenshots/gray-gate";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(50000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 45000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__cityReady && window.__gateGuards && window.__gateGuards.ready));
  if (ok) break;
  await page.waitForTimeout(300);
}
await page.waitForTimeout(2000);

async function grab(name, fn) {
  const url = await page.evaluate(fn);
  const buf = Buffer.from(url.split(",")[1], "base64");
  fs.writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(name, buf.length);
}

const boot = `(() => {
  const L = document.getElementById("loader"); if (L) L.style.display = "none";
  const hud = document.getElementById("hud"); if (hud) hud.style.display = "none";
  window.__freeze = true;
})()`;

await page.evaluate(boot + `; window.__hour("dusk", true); window.__debug.look(128, 5.2, -26, 128, 6.4, 2);`);
await grab("mag-dusk", () => { window.__paint(); window.__paint(); return document.querySelector("canvas").toDataURL("image/jpeg", 0.6); });

await page.evaluate(boot + `; window.__hour("night", true); window.__debug.look(128, 5.2, -26, 128, 6.4, 2);`);
await grab("mag-night", () => { window.__paint(); window.__paint(); return document.querySelector("canvas").toDataURL("image/jpeg", 0.6); });

await page.evaluate(boot + `; window.__hour("dusk", true); window.__debug.look(128, 5.2, -26, 128, 6.4, 2);`);
const tagged = await page.evaluate(() => {
  const scene = window.__scene;
  const names = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m0 = mats[0];
    if (!m0) return;
    const n = o.name || "";
    const billboard = /board|Board|hillTrees|cityTree|groveBoard|groveTree/.test(n);
    const odd = m0.transparent || m0.depthWrite === false || m0.depthTest === false || (m0.alphaTest > 0 && billboard);
    if (!odd && !billboard) return;
    for (const m of mats) {
      if (!m || !m.color) continue;
      m.color.set(0xff00aa);
      if (m.emissive) m.emissive.set(0xff00aa);
      if ("map" in m) m.map = null;
      m.transparent = false;
      m.opacity = 1;
      m.alphaTest = 0;
      m.depthWrite = true;
      m.needsUpdate = true;
    }
    names.push(n + ":" + (o.count != null ? o.count : "m"));
  });
  window.__post.enabled = false;
  window.__paint();
  window.__paint();
  return { names, url: document.querySelector("canvas").toDataURL("image/jpeg", 0.55) };
});
fs.writeFileSync(`${OUT}/mag-pink.jpg`, Buffer.from(tagged.url.split(",")[1], "base64"));
fs.writeFileSync(`${OUT}/mag-names.json`, JSON.stringify(tagged.names, null, 2));
console.log("pink names", tagged.names.length);
await browser.close();
