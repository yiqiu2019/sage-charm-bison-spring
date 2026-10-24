import { chromium } from "playwright";
import fs from "fs";
const tag = process.argv[2] || "before";
const outDir = "/workspace/screenshots/grove-s2";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|grove/i.test(t)) errs.push(m.type() + " " + t.slice(0, 300));
});
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 400)));
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
  console.log("boot", JSON.stringify(s).slice(0, 400), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.trees && (tag === "bench" || (s.grove && s.grove.modelMeshes))) { ready = true; break; }
  await page.waitForTimeout(2000);
}
fs.writeFileSync(outDir + "/" + tag + "-errs.json", JSON.stringify(errs.slice(0, 20), null, 2));
if (!ready) {
  console.log("NOT READY", errs.slice(0, 6));
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
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.82);
  }, { look, hour: hour || null });
  fs.writeFileSync(`${outDir}/${tag}-${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}
const shots = tag !== "bench";
if (shots) {
  await shot("moat-s", [128, 6.2, -40, 128, 2.2, -420], "dusk");
  await shot("moat-sw", [210, 7.2, -36, 40, 2, -320], "dusk");
  await shot("b-south", [138, 8.2, -50, 120, 2, -460], "dusk");
  await shot("avenue", [128, 3.4, -175, 128, 2.4, -460], "dusk");
  await shot("mist", [128, 6.2, -40, 128, 2.2, -420], "mist");
  await shot("night", [128, 6.2, -40, 128, 2.2, -420], "night");
  await shot("air", [180, 240, -160, 140, 0, -460], "dusk");
}
const bench = await page.evaluate(async () => {
  window.__freeze = true;
  window.__hour && window.__hour("dusk", true);
  window.__debug.look(128, 6.2, -40, 128, 2.2, -420);
  window.__paint();
  const moat = await window.__debug.bench(6);
  window.__debug.look(128, 3.4, -175, 128, 2.4, -460);
  window.__paint();
  const ave = await window.__debug.bench(6);
  const names = {};
  window.__scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || "";
    if (/grove|southAve|autumnTree/.test(n)) names[n] = (names[n] || 0) + 1;
  });
  const flags = [];
  window.__scene.traverse((o) => {
    if (o.name && o.name.indexOf("grove") === 0) flags.push([o.name, !!o.castShadow, o.count || 0]);
  });
  return { moat, ave, names, grove: window.__grove || null, flags };
});
fs.writeFileSync(outDir + "/" + tag + "-bench.json", JSON.stringify(bench, null, 2));
console.log(tag.toUpperCase(), JSON.stringify(bench));
await browser.close();
