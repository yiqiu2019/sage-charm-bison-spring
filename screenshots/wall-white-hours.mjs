import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/wall-white";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&post=0", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
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
});
await page.waitForTimeout(300);

async function shot(name, hour) {
  await page.evaluate((hour) => {
    window.__hour(hour, true);
    window.__debug.look(46, 3.6, -16, 52, 2.4, -2);
    if (window.__paint) window.__paint();
  }, hour);
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png` });
  const st = await page.evaluate(() => window.__hourName || null);
  console.log("shot", name, "hourFlag", st);
}
await shot("post0", "dusk");
await shot("mist", "mist");
await shot("night", "night");
console.log("ERRS", JSON.stringify(errs.slice(0, 6)));
await browser.close();
