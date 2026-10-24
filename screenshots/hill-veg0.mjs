import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/artifacts/hill-trees";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
console.log("GOTO");
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?veg=0", { waitUntil: "domcontentloaded", timeout: 90000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
    trees: window.__hillTrees || null,
  }));
  if (s.err) throw new Error(s.err);
  if (s.done && s.debug && s.trees && s.trees.pending === false) break;
  await page.waitForTimeout(1500);
}
await page.evaluate(() => {
  window.dispatchEvent(new Event("embark"));
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__hour("dusk", true);
  window.__debug.look(-36, 9, 80, -520, 20, 170);
  window.__paint && window.__paint();
});
const vis = await page.evaluate(() => {
  let hill = null, reeds = null;
  const scene = window.__scene;
  return { note: "named-later" };
});
await page.screenshot({ path: `${outDir}/after-veg0.png` });
console.log("SHOT veg0", JSON.stringify(vis), "ERRS", JSON.stringify(errs.slice(0, 4)));
await browser.close();
