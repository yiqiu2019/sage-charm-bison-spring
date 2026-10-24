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
const logs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 300)));
page.on("console", (msg) => {
  const t = msg.text();
  if (/error|shader|hill tree|WebGL/i.test(t)) logs.push(t.slice(0, 300));
});
async function boot(url) {
  console.log("GOTO", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const s = await page.evaluate(() => ({
      done: !!document.querySelector("#loader.done"),
      debug: !!window.__debug,
      err: window.__bootErr || null,
      trees: window.__hillTrees || null,
    }));
    if (s.err) throw new Error(s.err);
    if (s.done && s.debug && s.trees && s.trees.pending === false) return s.trees;
    await page.waitForTimeout(1500);
  }
  throw new Error("boot timeout");
}
async function prep(hour) {
  await page.evaluate((hour) => {
    window.dispatchEvent(new Event("embark"));
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__hour(hour || "dusk", true);
  }, hour);
}
async function shot(name, cam, hour) {
  await page.evaluate(({ cam, hour }) => {
    if (hour) window.__hour(hour, true);
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint && window.__paint();
  }, { cam, hour: hour || null });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("SHOT", name);
}
const trees = await boot("http://127.0.0.1:8080/zhaowangcheng.html?fps=1");
console.log("TREES", JSON.stringify(trees));
await prep("dusk");
const west = [-36, 9, 80, -520, 20, 170];
await shot("after-west", west, "dusk");
await shot("after-south", [48, 9, -30, -360, 18, -210], "dusk");
await shot("after-b", [138, 12.5, -58, 128, 10, -6], "dusk");
await shot("after-close", [-250, 24, 130, -470, 14, 175], "dusk");
await shot("after-oblique", [-200, 340, 10, -470, 16, 190], "dusk");
await shot("after-mist", west, "mist");
await shot("after-night", west, "night");
const bench = await page.evaluate(async () => {
  window.__hour("dusk", true);
  window.__debug.look(-36, 9, 80, -520, 20, 170);
  await window.__debug.bench(6);
  await window.__debug.bench(8);
  return window.__debug.bench(20);
});
console.log("BENCH", JSON.stringify(bench));
const trees0 = await boot("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&veg=0");
console.log("VEG0", JSON.stringify({ total: trees0.total, err: trees0.error || null }));
await prep("dusk");
await shot("after-veg0", west, "dusk");
console.log("ERRS", JSON.stringify(errs.slice(0, 8)));
console.log("LOGS", JSON.stringify(logs.slice(0, 12)));
await browser.close();
