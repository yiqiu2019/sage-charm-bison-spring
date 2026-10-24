import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/artifacts/wall-w1";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded", timeout: 90000 });
const t0 = Date.now();
while (Date.now() - t0 < 180000) {
  const s = await page.evaluate(() => ({ done: !!document.querySelector("#loader.done"), debug: !!window.__debug, err: window.__bootErr || null }));
  if (s.err) throw new Error(s.err);
  if (s.done && s.debug) break;
  await page.waitForTimeout(1500);
}
await page.evaluate(() => {
  const L = document.getElementById("loader");
  const b = L && L.querySelector(".enter");
  if (b) b.click();
  if (L) L.style.display = "none";
});
await page.waitForTimeout(400);
async function shot(name, hour, cam) {
  await page.evaluate(({ hour, cam }) => {
    window.__hour(hour, true);
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    if (window.__paint) window.__paint();
  }, { hour, cam });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("shot", name);
}
const east = [172, 3.4, -16, 160, 5.2, 1];
await shot("before-east", "dusk", east);
await shot("before-long", "dusk", [30, 7, -36, 240, 4.5, -1]);
const bench = await page.evaluate(async () => window.__debug.bench(24));
console.log("BENCH", JSON.stringify(bench));
console.log("ERRS", JSON.stringify(errs.slice(0, 8)));
await browser.close();
