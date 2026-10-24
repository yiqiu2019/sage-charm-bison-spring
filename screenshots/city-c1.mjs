import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/city-c1";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|city /i.test(t)) errs.push(m.type() + " " + t.slice(0, 400));
});
page.on("pageerror", (e) => errs.push("PAGE " + String(e).slice(0, 500)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 90000) {
  const s = await page.evaluate(() => ({
    debug: !!window.__debug,
    err: window.__bootErr || null,
    ready: !!window.__cityReady,
    city: window.__city || null,
  }));
  console.log("boot", JSON.stringify(s).slice(0, 500), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.debug && s.ready) { ready = true; break; }
  await page.waitForTimeout(1500);
}
fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs.slice(0, 30), null, 2));
if (!ready) {
  console.log("NOT READY", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}

async function shot(name, look, hour) {
  const data = await page.evaluate(({ look, hour }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    if (hour && window.__hour) window.__hour(hour, true);
    window.__hideVeg = false;
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.82);
  }, { look, hour: hour || "dusk" });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}

const south60 = [60, 7.5, -36, 46, 9, 50];
const south200 = [200, 7.5, -32, 200, 9, 50];
const bseg = [138, 11.7, -58, 128, 12, 30];
const east = [396, 7.5, 120, 320, 8, 110];
const north = [190, 7.5, 430, 190, 8, 330];
const air = [175, 460, 30, 180, 0, 190];
await shot("dusk-s60", south60, "dusk");
await shot("dusk-s200", south200, "dusk");
await shot("dusk-b", bseg, "dusk");
await shot("dusk-east", east, "dusk");
await shot("dusk-north", north, "dusk");
await shot("mist", bseg, "mist");
await shot("night", bseg, "night");
await shot("air", air, "dusk");

const bench = await page.evaluate(async () => {
  window.__freeze = true;
  window.__hour && window.__hour("dusk", true);
  const root = window.__scene.getObjectByName("cityC1");
  window.__debug.look(60, 7.5, -36, 46, 9, 50);
  window.__paint();
  const shown = await window.__debug.bench(6);
  if (root) root.visible = false;
  const hidden = await window.__debug.bench(4);
  if (root) root.visible = true;
  window.__debug.look(175, 460, 30, 180, 0, 190);
  window.__paint();
  const airShown = await window.__debug.bench(4);
  if (root) root.visible = false;
  const airHidden = await window.__debug.bench(4);
  if (root) root.visible = true;
  window.__paint();
  let visible = 0;
  window.__scene.traverse((o) => {
    if (o.name === "cityTree" && o.visible && o.count !== 0) visible++;
  });
  return {
    shown, hidden,
    deltaCalls: shown.calls - hidden.calls,
    deltaTris: shown.tris - hidden.tris,
    air: {
      shown: airShown, hidden: airHidden,
      deltaCalls: airShown.calls - airHidden.calls,
      deltaTris: airShown.tris - airHidden.tris,
    },
    visible, city: window.__city,
  };
});
fs.writeFileSync(outDir + "/after.json", JSON.stringify(bench, null, 2));
console.log("AFTER", JSON.stringify(bench).slice(0, 1800));
await browser.close();
