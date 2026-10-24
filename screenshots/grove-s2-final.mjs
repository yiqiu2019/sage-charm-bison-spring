import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/grove-s2";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|grove/i.test(t)) errs.push(m.type() + " " + t.slice(0, 400));
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
    trees: !!(window.__trees && window.__trees.count),
    grove: window.__grove || null,
  }));
  console.log("boot", JSON.stringify(s).slice(0, 500), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.trees && s.grove && s.grove.modelMeshes) { ready = true; break; }
  await page.waitForTimeout(2000);
}
fs.writeFileSync(outDir + "/final-errs.json", JSON.stringify(errs.slice(0, 30), null, 2));
if (!ready) {
  console.log("NOT READY", errs.slice(0, 8));
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
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.86);
  }, { look, hour: hour || null });
  fs.writeFileSync(`${outDir}/final-${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}

await shot("moat-s", [128, 6.2, -40, 128, 2.2, -520], "dusk");
await shot("moat-sw", [210, 7.4, -36, 20, 2.2, -420], "dusk");
await shot("b-south", [132, 8.4, -48, 128, 2.4, -520], "dusk");
await shot("avenue", [128, 3.2, -230, 128, 2.0, -560], "dusk");
await shot("mist", [128, 6.2, -40, 128, 2.2, -520], "mist");
await shot("night", [128, 6.2, -40, 128, 2.2, -520], "night");
await shot("air", [150, 400, -520, 150, 2, -400], "dusk");

const bench = await page.evaluate(async () => {
  window.__freeze = true;
  window.__hour && window.__hour("dusk", true);
  const names = {};
  window.__scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || "";
    if (/grove|southAve|autumnTree/.test(n)) names[n] = (names[n] || 0) + 1;
  });
  window.__debug.look(128, 6.2, -40, 128, 2.2, -520);
  window.__paint();
  const moatAfter = await window.__debug.bench(8);
  window.__debug.look(128, 3.2, -230, 128, 2.0, -560);
  window.__paint();
  const aveAfter = await window.__debug.bench(8);
  const groveObjs = [];
  window.__scene.traverse((o) => {
    if (o.name && o.name.indexOf("grove") === 0) {
      groveObjs.push(o);
      o.visible = false;
    }
  });
  window.__debug.look(128, 6.2, -40, 128, 2.2, -520);
  window.__paint();
  const moatBefore = await window.__debug.bench(8);
  window.__debug.look(128, 3.2, -230, 128, 2.0, -560);
  window.__paint();
  const aveBefore = await window.__debug.bench(8);
  for (const o of groveObjs) o.visible = true;
  return {
    moatAfter, aveAfter, moatBefore, aveBefore,
    names,
    grove: window.__grove || null,
  };
});
fs.writeFileSync(outDir + "/final-bench.json", JSON.stringify(bench, null, 2));
console.log(JSON.stringify(bench, null, 2).slice(0, 2500));
await browser.close();
