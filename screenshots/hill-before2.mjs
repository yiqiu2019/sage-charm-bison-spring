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
console.log("GOTO");
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
  await page.waitForTimeout(1500);
}
console.log("LOADED", Date.now() - t0);
await page.evaluate(() => window.dispatchEvent(new Event("embark")));
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__hour("dusk", true);
});
async function shot(name, cam) {
  await page.evaluate((cam) => {
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint && window.__paint();
  }, cam);
  await page.waitForTimeout(120);
  const info = await page.evaluate(() => {
    window.__paint && window.__paint();
    return window.__cam();
  });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("SHOT", name, JSON.stringify(info));
}
await shot("before-west", [-36, 9, 80, -520, 20, 170]);
const bench = await page.evaluate(async () => {
  await window.__debug.bench(8);
  return window.__debug.bench(24);
});
console.log("BENCH", JSON.stringify(bench));
console.log("ERRS", JSON.stringify(errs.slice(0, 6)));
await browser.close();
