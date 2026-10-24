import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/artifacts/gate";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 240)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&pick=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 180000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug) { ready = true; break; }
  await page.waitForTimeout(2000);
}
if (!ready) {
  console.log("NOT READY", errs.slice(0, 6));
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  const b = document.getElementById("pickread");
  if (b) b.style.display = "none";
});
const bench = await page.evaluate(async () => window.__debug.bench(24));
console.log("BENCH", JSON.stringify(bench));
async function shot(name, look) {
  await page.evaluate((look) => {
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    if (window.__paint) window.__paint();
  }, look);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("shot", name);
}
await shot("before-bridge", [128, 4.6, -22, 128, 6.2, 4]);
const pick = await page.evaluate(() => {
  const hits = [];
  const pts = [[640, 360], [560, 400], [720, 390], [640, 280], [640, 470]];
  for (const [x, y] of pts) {
    window.__pickAt(x, y);
    hits.push(window.__pickLast);
  }
  return hits;
});
console.log("PICK", JSON.stringify(pick));
await browser.close();
