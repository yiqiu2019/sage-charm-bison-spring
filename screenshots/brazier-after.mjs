import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/brazier";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
page.on("console", (m) => {
  const t = m.text();
  if (/brazier|pick|error|Error|shader/i.test(t)) console.log("C", m.type(), t.slice(0, 500));
});
page.on("pageerror", (e) => console.log("PAGE", e.message));

await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&pick=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 200000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    err: window.__bootErr || null,
    debug: !!window.__debug,
    h: window.__boatReady && window.__boatReady.brazierH,
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.h) break;
  await page.waitForTimeout(2000);
}
await page.click("#loader .enter");
await page.evaluate(() => { const L = document.getElementById("loader"); if (L) L.style.display = "none"; });

const diag = await page.evaluate(() => {
  let mesh = null;
  window.__scene.traverse((o) => { if (o.name === "brazierGlb") mesh = o; });
  const a = mesh && mesh.instanceMatrix.array;
  const one = mesh && a ? {
    world: { x: +a[12].toFixed(2), y: +a[13].toFixed(2), z: +a[14].toFixed(2) },
    visible: mesh.visible,
    frustumCulled: mesh.frustumCulled,
    count: mesh.count,
  } : null;
  return { one, diag: window.__brazierDiag, boat: window.__boatReady };
});
console.log("DIAG", JSON.stringify(diag));

async function shot(name, look, hour) {
  const data = await page.evaluate(({ look, hour }) => {
    window.__freeze = true;
    window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    if (window.__pickAt) window.__pickAt(rect.left + rect.width * 0.5, rect.top + rect.height * 0.48);
    return { url: canvas.toDataURL("image/jpeg", 0.84), pick: window.__pickLast };
  }, { look, hour });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.url.split(",")[1], "base64"));
  console.log("shot", name, JSON.stringify(data.pick));
}

await shot("fix-moat-dusk", [200, 7.5, -40, 240, 12.8, 3.2], "dusk");
await shot("fix-moat-night", [200, 7.5, -40, 240, 12.8, 3.2], "night");
await shot("fix-b-dusk", [128, 12.0, -52, 128, 11.2, -2], "dusk");
await shot("fix-b-night", [128, 12.0, -52, 128, 11.2, -2], "night");
await shot("fix-b-west-dusk", [78, 11.6, -46, 62, 12.6, 3.4], "dusk");
await shot("fix-b-east-night", [210, 11.6, -46, 220, 12.8, 3.4], "night");
await shot("fix-close", [60, 13.15, 7.4, 60, 12.55, 3.4], "dusk");
await shot("fix-close-night", [52, 13.3, 5.0, 62, 12.7, 3.6], "night");

const bench = await page.evaluate(async () => {
  window.__hour("dusk", true);
  window.__debug.look(168, 7.5, -54, 140, 8, -20);
  window.__paint();
  return window.__debug.bench(12);
});
console.log("AFTER", JSON.stringify(bench));
await browser.close();
