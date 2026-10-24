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
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("DBGMAT")) console.log(t.slice(0, 2000));
  if (/error|Error|shader|NaN/i.test(t) && !t.startsWith("DBGMAT")) errs.push(m.type() + " " + t.slice(0, 240));
});
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 240)));

async function boot(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
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
  await page.waitForTimeout(400);
}

async function shot(name, hour) {
  await page.evaluate((hour) => {
    if (hour) {
      const b = document.querySelector(`#hours button[data-hour="${hour}"]`);
      if (b) b.click();
    }
    window.__debug.look(46, 3.6, -16, 52, 2.4, -2);
    if (window.__paint) window.__paint();
  }, hour || null);
  await page.waitForTimeout(hour ? 2200 : 400);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("shot", name);
}

await boot("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&dbg=mat");
await shot("dusk", "dusk");
await shot("mist", "mist");
await shot("night", "night");
console.log("ERRS", JSON.stringify(errs.slice(0, 8)));
await boot("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&post=0");
await shot("post0", "dusk");
console.log("ERRS2", JSON.stringify(errs.slice(0, 8)));
await browser.close();
