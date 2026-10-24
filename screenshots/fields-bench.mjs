import { chromium } from "playwright";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let f = null;
while (Date.now() - t0 < 90000) {
  f = await page.evaluate(() => window.__fields);
  if (f && f.ready && f.treeH) break;
  await page.waitForTimeout(500);
}
const out = await page.evaluate(async () => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  window.__hour("dusk", true);
  window.__debug.look(392, 9, 90, 560, 3, 80);
  const after = await window.__debug.bench(24);
  const hidden = [];
  window.__scene.traverse((o) => {
    if (/^field/.test(o.name || "")) { hidden.push(o); o.visible = false; }
  });
  const before = await window.__debug.bench(24);
  for (const o of hidden) o.visible = true;
  return { before, after, fields: window.__fields };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
