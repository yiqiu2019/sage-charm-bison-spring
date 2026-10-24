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
page.on("pageerror", (e) => errs.push(e.message.slice(0, 240)));
page.on("console", (msg) => {
  const t = msg.text();
  if (/shader|WebGL|error/i.test(t)) logs.push(t.slice(0, 240));
});
console.log("GOTO");
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1", { waitUntil: "domcontentloaded", timeout: 90000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
    trees: window.__hillTrees || null,
  }));
  if (s.err) throw new Error(s.err);
  if (s.done && s.debug && s.trees && s.trees.pending === false) {
    console.log("READY", JSON.stringify({ n: s.trees.total, e: s.trees.error || null }));
    break;
  }
  await page.waitForTimeout(1500);
}
await page.evaluate(() => {
  window.dispatchEvent(new Event("embark"));
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__hour("dusk", true);
});
async function shot(name, cam, hour) {
  const info = await page.evaluate(({ cam, hour }) => {
    if (hour) window.__hour(hour, true);
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint && window.__paint();
    return window.__cam();
  }, { cam, hour: hour || null });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("SHOT", name, JSON.stringify(info));
}
await shot("after-south", [20, 14, -48, -420, 22, -240], "dusk");
await shot("after-b", [138, 12.5, -58, 128, 10, -6], "dusk");
await shot("after-close", [-250, 28, 120, -480, 12, 180], "dusk");
await shot("after-oblique", [-160, 380, -20, -480, 18, 200], "dusk");
await shot("after-mist", [-36, 9, 80, -520, 20, 170], "mist");
await shot("after-night", [-36, 9, 80, -520, 20, 170], "night");
await page.evaluate(() => {
  window.__hour("dusk", true);
  window.__debug.look(-36, 9, 80, -520, 20, 170);
});
const bench = await page.evaluate(async () => {
  await window.__debug.bench(4);
  return window.__debug.bench(12);
});
console.log("BENCH", JSON.stringify(bench));
console.log("ERRS", JSON.stringify(errs.slice(0, 6)));
console.log("LOGS", JSON.stringify(logs.slice(0, 8)));
await browser.close();
console.log("DONE1");
