import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/artifacts/hill-trees";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 240)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1", { waitUntil: "domcontentloaded", timeout: 90000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
  }));
  if (s.err) throw new Error(s.err);
  if (s.done && s.debug) break;
  await page.waitForTimeout(2000);
}
await page.click("#loader .enter");
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__hour("dusk", true);
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.__debug.look(-18, 7.5, 110, -480, 16, 180);
  window.__paint && window.__paint();
});
await page.waitForTimeout(200);
await page.evaluate(() => window.__paint && window.__paint());
await page.screenshot({ path: `${outDir}/before-west.png` });
const bench = await page.evaluate(async () => window.__debug.bench(30));
const info = await page.evaluate(() => ({
  fog: window.__sceneFog ? null : null,
  hills: !!document.querySelector,
}));
console.log("BENCH", JSON.stringify(bench));
console.log("ERRS", JSON.stringify(errs.slice(0, 8)));
await browser.close();
