import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/fix-dark";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(150000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|THREE.WebGL/i.test(t)) errs.push(m.type() + " " + t.slice(0, 400));
});
page.on("pageerror", (e) => errs.push("PAGE " + String(e).slice(0, 500)));
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
  console.log("boot", JSON.stringify(s).slice(0, 300), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.debug && s.city && s.terrace) { ready = true; break; }
  await page.waitForTimeout(1500);
}
if (!ready) {
  fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs.slice(0, 30), null, 2));
  console.log("NOT READY", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}

async function shot(name, boat, look, hour) {
  const data = await page.evaluate(async ({ boat, look, hour }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    window.__debug.pose(boat[0], boat[1], boat[2] || 0);
    if (window.__hour) window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    for (let i = 0; i < 5; i++) window.__paint();
    await new Promise((r) => requestAnimationFrame(r));
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.84);
  }, { boat, look, hour });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}

const cams = [
  ["s40", [40, -28, 0], [40, 7.7, -28, 48, 15, 36]],
  ["s200", [200, -28, 0], [200, 7.7, -28, 188, 18, 42]],
  ["west", [-28, 89, 0], [-28, 7.7, 89, 46, 20, 89]],
  ["north", [183, 408, 0], [183, 7.7, 408, 183, 22, 320]],
  ["east", [378, 180, 0], [378, 7.7, 180, 310, 15, 178]],
];
for (const [name, boat, look] of cams) await shot("dusk-" + name, boat, look, "dusk");
for (const [name, boat, look] of cams) await shot("night-" + name, boat, look, "night");
await shot("dusk-close", [-18, 116, 0], [-18, 10, 116, 32, 20, 116], "dusk");

const info = await page.evaluate(() => {
  const out = [];
  const root = window.__scene && window.__scene.getObjectByName("terraceC2");
  if (root) root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m) return;
    out.push({
      name: o.name, count: o.count == null ? null : o.count, side: m.side, shadowSide: m.shadowSide,
      vertexColors: !!m.vertexColors, metalness: m.metalness, cast: !!o.castShadow, recv: !!o.receiveShadow,
    });
  });
  const bias = {};
  window.__scene.traverse((o) => {
    if (o.isDirectionalLight && o.castShadow) {
      bias.bias = o.shadow.bias;
      bias.normalBias = o.shadow.normalBias;
    }
  });
  return { mats: out.filter((x) => /louge|wanglou|changdian|terrace/.test(x.name)), bias, errs: window.__bootErr || null };
});
fs.writeFileSync(outDir + "/info.json", JSON.stringify(info, null, 2));
fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs.slice(0, 40), null, 2));
console.log("INFO", JSON.stringify(info).slice(0, 2000));
console.log("ERRS", errs.slice(0, 6));
await browser.close();
