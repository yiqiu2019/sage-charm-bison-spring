import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/plain-band";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|plain/i.test(t)) errs.push(m.type() + " " + t.slice(0, 500));
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
    plain: window.__plainBand || null,
    bd: window.__backdrop ? window.__backdrop.stats : null,
  }));
  console.log("boot", JSON.stringify(s).slice(0, 700), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.plain) { ready = true; break; }
  await page.waitForTimeout(2000);
}
fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs.slice(0, 40), null, 2));
if (!ready) {
  console.log("NOT READY", errs.slice(0, 10));
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
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}

await shot("dusk-se-e", [400, 7.2, -18, 1100, 3.2, -18], "dusk");
await shot("dusk-se-se", [400, 7.2, -18, 860, 2.6, -520], "dusk");
await shot("dusk-s", [128, 6.4, -48, 128, 2.4, -900], "dusk");
await shot("dusk-e", [410, 6.8, 170, 1200, 2.8, 170], "dusk");
await shot("mist-s", [128, 6.4, -48, 128, 2.4, -900], "mist");
await shot("night-e", [410, 6.8, 170, 1200, 2.8, 170], "night");

const headings = [0, 10, 20, 45, 90, 135, 165, 175, 190, 210, 225, 250, 270, 315, 345];
for (const az of headings) {
  const rad = az * Math.PI / 180;
  const lx = 175 + Math.sin(rad) * 900;
  const lz = 190 + Math.cos(rad) * 900;
  await shot("sweep-" + String(az).padStart(3, "0"), [175, 42, 190, lx, 6, lz], "dusk");
}
fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs.slice(0, 40), null, 2));
console.log("errs", errs.length);
await browser.close();
