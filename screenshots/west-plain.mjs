import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/west-plain";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 500)));
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader/i.test(t)) errs.push(m.type() + " " + t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let info = null;
while (Date.now() - t0 < 90000) {
  info = await page.evaluate(() => ({
    err: window.__bootErr || null,
    stage: window.__stage || null,
    west: window.__westPlain || null,
    north: !!window.__northReady,
    grass: window.__north ? window.__north.grass : null,
    shrubs: window.__north ? window.__north.shrubs : null,
  }));
  if (info.err) break;
  if (info.west && info.north) break;
  await page.waitForTimeout(1000);
}
console.log("boot", JSON.stringify(info), Math.round((Date.now() - t0) / 1000) + "s");
console.log("errs", errs.slice(0, 6));
if (!info || !info.west) {
  await browser.close();
  process.exit(1);
}
const shots = [
  ["west-plain", -90, 32, 150, -340, 6, 170],
  ["nw-village", -70, 28, 280, -150, 2, 380],
  ["wet-band", -30, 14, 500, 50, 2, 540],
  ["road-north", 200, 28, 560, 400, 3, 650],
  ["yard", -100, 14, 60, -148, 1, 100],
  ["road-close", -24, 3.2, 478, -8, 1.2, 492],
  ["air", -180, 120, 200, -80, 0, 420],
];
for (const [name, px, py, pz, lx, ly, lz] of shots) {
  const data = await page.evaluate(async (cam) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    if (window.__hour) window.__hour("dusk", true);
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint();
    const url = document.querySelector("canvas").toDataURL("image/jpeg", 0.8);
    return url;
  }, [px, py, pz, lx, ly, lz]);
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name);
}
fs.writeFileSync(outDir + "/info.json", JSON.stringify({ info, errs }, null, 2));
await browser.close();
