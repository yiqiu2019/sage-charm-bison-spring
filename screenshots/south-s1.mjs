import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/screenshots/south-s1";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|south/i.test(t)) errs.push(m.type() + " " + t.slice(0, 400));
});
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 500)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 170000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
    south: window.__south || null,
    trees: !!(window.__trees && window.__trees.count),
  }));
  console.log("boot", JSON.stringify(s).slice(0, 500), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.south && s.south.farmMeshes && s.south.treeMeshes && s.trees) { ready = true; break; }
  await page.waitForTimeout(2000);
}
console.log("ERRS", errs.slice(0, 12));
if (!ready) {
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
});
async function shot(name, look, hour) {
  const data = await page.evaluate(({ look, hour }) => {
    window.__freeze = true;
    if (hour && window.__hour) window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.8);
  }, { look, hour: hour || null });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}
const B = [138, 11.7, -58, 128, 10, -6];
const west = [40, 8, -16, 70, 1.2, -200];
const east = [220, 8, -16, 180, 1.2, -190];
const plaza = [128, 9, -78, 128, 1.4, -360];
const air = [150, 120, -140, 140, 0, -240];
await shot("dusk-b", B, "dusk");
await shot("dusk-west", west, "dusk");
await shot("dusk-east", east, "dusk");
await shot("dusk-plaza", plaza, "dusk");
await shot("mist-plaza", plaza, "mist");
await shot("night-plaza", plaza, "night");
await shot("air", air, "dusk");
await shot("yard-east", [168, 6, -150, 200, 1.5, -178], "dusk");
await shot("yard-west", [95, 6, -200, 62, 1.5, -224], "dusk");
const bench = await page.evaluate(async () => {
  window.__hour && window.__hour("dusk", true);
  window.__debug.look(128, 9, -78, 128, 1.4, -360);
  window.__paint();
  const b = await window.__debug.bench(8);
  window.__debug.look(128, 6.5, -78, 128, 2, -280);
  window.__paint();
  const b2 = await window.__debug.bench(8);
  const names = {};
  window.__scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || "";
    if (/south|avenue|yard/.test(n)) names[n] = (names[n] || 0) + 1;
  });
  return { bench: b, benchSame: b2, names, south: window.__south };
});
console.log("AFTER", JSON.stringify(bench));
await browser.close();
