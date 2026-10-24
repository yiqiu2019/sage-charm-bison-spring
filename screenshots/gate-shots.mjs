import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/artifacts/gate";
fs.mkdirSync(outDir, { recursive: true });
const tag = process.argv[2] || "after";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|fade-missing/i.test(t)) errs.push(m.type() + " " + t.slice(0, 300));
});
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 400)));
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
  console.log("NOT READY", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  const b = document.getElementById("pickread");
  if (b) b.style.display = "none";
});
async function shot(name, look, hour) {
  await page.evaluate(({ look, hour }) => {
    if (hour && window.__hour) window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    if (window.__paint) window.__paint();
  }, { look, hour: hour || null });
  await page.waitForTimeout(hour ? 400 : 180);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 60000 });
  console.log("shot", name);
}
const bridge = [128, 4.6, -22, 128, 6.2, 4];
const gap = [122.6, 2.4, -2.5, 122.6, 4.2, 8];
if (tag === "before") {
  await shot("before-bridge", bridge);
  const pick = await page.evaluate(() => {
    const hits = [];
    for (const [x, y] of [[640, 340], [520, 400], [760, 400], [640, 250], [640, 500]]) {
      window.__pickAt(x, y);
      hits.push(window.__pickLast);
    }
    return hits;
  });
  console.log("PICK", JSON.stringify(pick));
} else {
  await shot("after-bridge", bridge);
  await shot("after-b108", [118, 11.7, -58, 128, 10, -6]);
  await shot("after-b128", [138, 11.7, -58, 128, 10, -6]);
  await shot("after-b148", [158, 11.7, -58, 128, 10, -6]);
  await shot("after-gap", gap);
  await shot("after-mist", bridge, "mist");
  await shot("after-night", bridge, "night");
  await page.evaluate(() => window.__hour && window.__hour("dusk", true));
  const bench = await page.evaluate(async () => {
    if (window.__paint) window.__paint();
    return window.__debug.bench(6);
  });
  console.log("BENCH", JSON.stringify(bench));
  await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?post=0&pick=1", { waitUntil: "domcontentloaded" });
  const t1 = Date.now();
  let ok = false;
  while (Date.now() - t1 < 180000) {
    const s = await page.evaluate(() => ({ done: !!document.querySelector("#loader.done"), debug: !!window.__debug, err: window.__bootErr || null }));
    console.log("boot2", JSON.stringify(s));
    if (s.err) break;
    if (s.done && s.debug) { ok = true; break; }
    await page.waitForTimeout(2000);
  }
  if (!ok) { console.log("post reload failed", errs.slice(0, 6)); await browser.close(); process.exit(1); }
  await page.evaluate(() => { const L = document.getElementById("loader"); if (L) L.style.display = "none"; });
  await shot("after-post0", bridge);
}
console.log("ERRS", JSON.stringify(errs.slice(0, 12)));
await browser.close();
