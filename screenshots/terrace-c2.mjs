import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/terrace-c2";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(150000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|terrace /i.test(t)) errs.push(m.type() + " " + t.slice(0, 500));
});
page.on("pageerror", (e) => errs.push("PAGE " + String(e).slice(0, 700)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 120000) {
  const s = await page.evaluate(() => ({
    debug: !!window.__debug,
    err: window.__bootErr || null,
    city: !!(window.__city && window.__cityReady),
    terrace: window.__terraceReady || false,
    stage: window.__stage || null,
  }));
  console.log("boot", JSON.stringify(s).slice(0, 400), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.debug && s.city && s.terrace) { ready = true; break; }
  await page.waitForTimeout(1500);
}
if (!ready) {
  fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs.slice(0, 40), null, 2));
  console.log("NOT READY", errs.slice(0, 10));
  await browser.close();
  process.exit(1);
}

async function shot(name, look, hour) {
  const data = await page.evaluate(async ({ look, hour }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    if (hour && window.__hour) window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    for (let i = 0; i < 3; i++) window.__paint();
    await new Promise((r) => requestAnimationFrame(r));
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.84);
  }, { look, hour: hour || "dusk" });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}

const shots = [
  ["dusk-s40", [40, 7.7, -28, 48, 15, 36], "dusk"],
  ["dusk-s200", [200, 7.7, -28, 188, 18, 42], "dusk"],
  ["dusk-west", [-28, 7.7, 89, 46, 20, 89], "dusk"],
  ["dusk-north", [183, 7.7, 408, 183, 22, 320], "dusk"],
  ["dusk-east", [378, 7.7, 180, 310, 15, 178], "dusk"],
  ["dusk-b", [138, 11.5, -58, 128, 14, 24], "dusk"],
  ["night-west", [-24, 8.2, 62, 40, 16, 64], "night"],
  ["mist-north", [183, 7.7, 408, 183, 20, 325], "mist"],
  ["air", [175, 310, 70, 175, 0, 200], "dusk"],
];
for (const [name, look, hour] of shots) await shot(name, look, hour);

const bench = await page.evaluate(async () => {
  window.__freeze = true;
  window.__hour && window.__hour("dusk", true);
  const root = window.__scene.getObjectByName("terraceC2");
  window.__debug.look(-28, 7.7, 89, 46, 20, 89);
  for (let i = 0; i < 2; i++) window.__paint();
  const shown = await window.__debug.bench(8);
  if (root) root.visible = false;
  const hidden = await window.__debug.bench(6);
  if (root) root.visible = true;
  window.__debug.look(175, 310, 70, 175, 0, 200);
  for (let i = 0; i < 2; i++) window.__paint();
  const airShown = await window.__debug.bench(6);
  if (root) root.visible = false;
  const airHidden = await window.__debug.bench(4);
  if (root) root.visible = true;
  const names = [];
  let terraceCallsBound = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const on = o.visible && (o.count == null || o.count > 0);
    names.push({ name: o.name, count: o.count == null ? null : o.count, visible: !!o.visible, on });
    if (on) terraceCallsBound++;
  });
  return {
    west: { shown, hidden, deltaCalls: shown.calls - hidden.calls, deltaTris: shown.tris - hidden.tris },
    air: { shown: airShown, hidden: airHidden, deltaCalls: airShown.calls - airHidden.calls, deltaTris: airShown.tris - airHidden.tris },
    terraceCallsBound,
    names,
    terrace: window.__terrace,
    city: window.__city,
  };
});
fs.writeFileSync(outDir + "/bench.json", JSON.stringify(bench, null, 2));
fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs.slice(0, 40), null, 2));
console.log("BENCH", JSON.stringify({
  west: bench.west, air: bench.air, bound: bench.terraceCallsBound,
  galleries: bench.terrace && bench.terrace.galleries,
  violations: bench.city && bench.city.violations,
  rows: bench.terrace && bench.terrace.rows && bench.terrace.rows.map((r) => ({ id: r.id, kind: r.kind, plat: r.plat, wallDist: r.wallDist, top: r.top, need: r.need, exposed: r.exposed, x: r.x, z: r.z })),
}, null, 2).slice(0, 4000));
console.log("ERRS", errs.slice(0, 8));
await browser.close();
