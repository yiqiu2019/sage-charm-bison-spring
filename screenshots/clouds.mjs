import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/clouds";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|THREE.WebGL/i.test(t)) errs.push(m.type() + " " + t.slice(0, 400));
});
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 500)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 180000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
    tex: !!(window.__cloudTex && window.__cloudTex.image && window.__cloudTex.image.width),
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.tex) { ready = true; break; }
  await page.waitForTimeout(2500);
}
console.log("ERRS", errs.slice(0, 8));
if (!ready) { await browser.close(); process.exit(1); }

await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  window.__hour("dusk", true);
  window.__debug.cloudOn(true);
  window.__debug.setTime(4);
});

const WEST = [210, 4.8, -20, -40, 22, -90];
const EAST = [60, 5.5, -30, 420, 28, 40];
const B = [138, 11.7, -58, 128, 10, -6];

async function shot(name, look, hour, cloudT) {
  const data = await page.evaluate(({ look, hour, cloudT }) => {
    window.__freeze = true;
    if (hour && window.__hour) window.__hour(hour, true);
    window.__debug.cloudOn(true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    if (cloudT != null) window.__debug.setTime(cloudT);
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.82);
  }, { look, hour, cloudT: cloudT == null ? 4 : cloudT });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}

await shot("dusk-west", WEST, "dusk", 4);
await shot("dusk-east", EAST, "dusk", 4);
await shot("dusk-b", B, "dusk", 4);
await shot("mist-west", WEST, "mist", 4);
await shot("night-west", WEST, "night", 4);
await shot("drift-0", WEST, "dusk", 1);
await shot("drift-30", WEST, "dusk", 31);
await shot("drift-120", WEST, "dusk", 121);
for (let i = 0; i < 4; i++) {
  const a = i * Math.PI / 2;
  const lx = 168 + Math.cos(a) * 240;
  const lz = -36 + Math.sin(a) * 240;
  await shot("yaw-" + i, [168, 9, -36, lx, 30, lz], "dusk", 12 + i * 3);
}

async function benchAt(look, on) {
  return page.evaluate(async ({ look, on }) => {
    window.__debug.cloudOn(on);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__debug.setTime(4);
    window.__hour("dusk", true);
    window.__paint();
    return window.__debug.bench(4);
  }, { look, on });
}
const offWest = await benchAt(WEST, false);
const onWest = await benchAt(WEST, true);
const offB = await benchAt(B, false);
const onB = await benchAt(B, true);
const meta = await page.evaluate(() => ({
  aniso: window.__cloudTex.anisotropy,
  cs: window.__cloudTex.colorSpace,
  w: window.__cloudTex.image.width,
  key: window.__skyMat.customProgramCacheKey(),
  prec: window.__skyMat.precision,
}));
const bench = { offWest, onWest, offB, onB, meta };
console.log("BENCH", JSON.stringify(bench));
fs.writeFileSync(outDir + "/bench.json", JSON.stringify({ bench, errs: errs.slice(0, 20) }, null, 2));
console.log("ERRS_FINAL", errs.slice(0, 12));
await browser.close();
