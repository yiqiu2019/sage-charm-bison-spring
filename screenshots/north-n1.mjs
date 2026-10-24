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
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|north /i.test(t)) errs.push(m.type() + " " + t.slice(0, 500));
});
page.on("pageerror", (e) => errs.push("PAGE " + String(e).slice(0, 800)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 180000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
    north: window.__north || null,
    ready: !!window.__northReady,
    stage: window.__stage || null,
  }));
  console.log("boot", JSON.stringify(s).slice(0, 700), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.north && s.ready) { ready = true; break; }
  await page.waitForTimeout(2000);
}
fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs.slice(0, 40), null, 2));
if (!ready) {
  console.log("NOT READY", errs.slice(0, 10));
  await browser.close();
  process.exit(1);
}

async function shot(name, look, hour, extra) {
  const data = await page.evaluate(({ look, hour, extra }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    if (hour && window.__hour) window.__hour(hour, true);
    window.__hideVeg = extra === "veg0";
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    window.__hideVeg = false;
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.82);
  }, { look, hour: hour || "dusk", extra: extra || "" });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}

const north = [200, 6.4, 400, 210, 2.2, 560];
const ne = [355, 7.2, 400, 470, 3.2, 530];
const air = [230, 420, 400, 240, 0, 560];
await shot("dusk-north", north, "dusk");
await shot("dusk-ne", ne, "dusk");
await shot("dusk-air", air, "dusk");
await shot("mist", north, "mist");
await shot("night", north, "night");
await shot("veg0", air, "dusk", "veg0");

const bench = await page.evaluate(async () => {
  window.__freeze = true;
  window.__hour && window.__hour("dusk", true);
  window.__debug.look(200, 6.4, 400, 210, 2.2, 560);
  window.__paint();
  const root = window.__scene.getObjectByName("northN1");
  const shown = await window.__debug.bench(8);
  if (root) root.visible = false;
  const hidden = await window.__debug.bench(6);
  if (root) root.visible = true;
  window.__debug.look(355, 7.2, 400, 470, 3.2, 530);
  window.__paint();
  const neShown = await window.__debug.bench(6);
  if (root) root.visible = false;
  const neHidden = await window.__debug.bench(4);
  if (root) root.visible = true;
  window.__debug.look(230, 420, 400, 240, 0, 560);
  window.__paint();
  const airShown = await window.__debug.bench(4);
  if (root) root.visible = false;
  const airHidden = await window.__debug.bench(4);
  if (root) root.visible = true;
  window.__paint();
  const names = {};
  let visibleNorth = 0;
  window.__scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || "";
    if (/^north/.test(n)) {
      names[n] = (names[n] || 0) + 1;
      if (o.visible && o.count !== 0) visibleNorth++;
    }
  });
  return {
    shown, hidden, deltaCalls: shown.calls - hidden.calls, deltaTris: shown.tris - hidden.tris,
    ne: { shown: neShown, hidden: neHidden, deltaCalls: neShown.calls - neHidden.calls, deltaTris: neShown.tris - neHidden.tris },
    air: { shown: airShown, hidden: airHidden, deltaCalls: airShown.calls - airHidden.calls, deltaTris: airShown.tris - airHidden.tris },
    visibleNorth, names, north: window.__north, trees: window.__northTrees, prep: window.__northPrep,
  };
});
fs.writeFileSync(outDir + "/after.json", JSON.stringify(bench, null, 2));
console.log("AFTER", JSON.stringify(bench).slice(0, 2000));
await browser.close();
