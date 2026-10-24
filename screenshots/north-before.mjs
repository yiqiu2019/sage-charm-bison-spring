import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/north-n1";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 400)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
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
const info = await page.evaluate(() => {
  const names = {};
  window.__scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || "mesh";
    names[n] = (names[n] || 0) + 1;
  });
  return {
    names,
    reeds: window.__reeds ? { clumps: window.__reeds.clumps, chunks: window.__reeds.chunks, regions: window.__reeds.regions } : null,
    trees: window.__trees || null,
    bank: window.__bank || null,
  };
});
fs.writeFileSync(outDir + "/before-info.json", JSON.stringify(info, null, 2));
console.log("INFO", JSON.stringify(info).slice(0, 800));
const bench = await page.evaluate(async () => {
  window.__freeze = true;
  if (window.__hour) window.__hour("dusk", true);
  window.__debug.look(200, 6.5, 408, 200, 2.2, 560);
  window.__paint();
  return window.__debug.bench(8);
});
console.log("BEFORE", JSON.stringify(bench));
fs.writeFileSync(outDir + "/before-bench.json", JSON.stringify(bench));
const data = await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  if (window.__hour) window.__hour("dusk", true);
  window.__debug.look(200, 6.5, 408, 200, 2.2, 560);
  window.__paint();
  return document.querySelector("canvas").toDataURL("image/jpeg", 0.8);
});
fs.writeFileSync(outDir + "/before-north.jpg", Buffer.from(data.split(",")[1], "base64"));
console.log("shot", data.length);
await browser.close();
