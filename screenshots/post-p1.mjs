import { chromium } from "playwright";
import fs from "fs";

const phase = process.argv[2] || "before";
const outDir = `/workspace/screenshots/post-p1/${phase}`;
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  ["south", [60, 5.2, -40, 60, 6.5, 28]],
  ["b", [138, 11.7, -58, 128, 10, -6]],
  ["north", [200, 6.2, 408, 210, 2.2, 560]],
  ["east", [378, 5.4, 160, 560, 3.2, 155]],
];
const hours = ["dusk", "mist", "night"];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 500)));
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader/i.test(t) && !/favicon/i.test(t)) errs.push(m.type() + " " + t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let boot = null;
while (Date.now() - t0 < 90000) {
  boot = await page.evaluate(() => ({
    err: window.__bootErr || null,
    paint: typeof window.__paint === "function",
    guards: window.__gateGuards || null,
  }));
  if (boot.err) break;
  if (boot.paint && boot.guards && boot.guards.ready) break;
  await page.waitForTimeout(500);
}
console.log("boot", JSON.stringify(boot), Math.round((Date.now() - t0) / 1000) + "s");
if (!boot || !boot.paint) {
  console.log("errs", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}

async function shot(name, cam, hour) {
  const data = await page.evaluate(async ({ cam, hour }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    if (window.__hour) window.__hour(hour, true);
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint();
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.82);
  }, { cam, hour });
  fs.writeFileSync(`${outDir}/${hour}-${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", hour, name);
}

for (const hour of hours) {
  for (const [name, cam] of shots) await shot(name, cam, hour);
}

const bench = await page.evaluate(async () => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  if (window.__hour) window.__hour("dusk", true);
  window.__debug.look(138, 11.7, -58, 128, 10, -6);
  const b = await window.__debug.bench(8);
  return {
    bench: b,
    exposure: window.__renderer ? window.__renderer.toneMappingExposure : null,
    tone: window.__renderer ? window.__renderer.toneMapping : null,
    post: window.__postInfo || null,
    fog: window.__scene && window.__scene.fog ? { c: window.__scene.fog.color.getHexString(), n: window.__scene.fog.near, f: window.__scene.fog.far } : null,
  };
});
fs.writeFileSync(`${outDir}/bench.json`, JSON.stringify({ bench, errs: errs.slice(0, 12) }, null, 2));
console.log("bench", JSON.stringify(bench));
console.log("errs", errs.slice(0, 6));
await browser.close();
