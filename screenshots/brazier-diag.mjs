import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/brazier";
fs.mkdirSync(outDir, { recursive: true });
const tag = process.argv[2] || "before";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
page.on("console", (m) => {
  const t = m.text();
  if (/brazier|pick|error|Error|shader/i.test(t)) console.log("C", m.type(), t.slice(0, 400));
});
page.on("pageerror", (e) => console.log("PAGE", e.message));

await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&pick=1&grab=1", { waitUntil: "domcontentloaded", timeout: 90000 });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 200000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    err: window.__bootErr || null,
    debug: !!window.__debug,
    boat: window.__boatReady || null,
  }));
  console.log("boot", JSON.stringify({ done: s.done, err: s.err, debug: s.debug, brazierH: s.boat && s.boat.brazierH, n: s.boat && s.boat.braziers, shown: s.boat && s.boat.brazierShown }), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.boat && s.boat.brazierH) { ready = true; break; }
  await page.waitForTimeout(2500);
}
if (!ready) {
  console.log("NOT READY");
  await browser.close();
  process.exit(1);
}
await page.click("#loader .enter");
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
});

const diag = await page.evaluate(() => {
  const spots = [];
  let mesh = null;
  window.__scene.traverse((o) => {
    if (o.name === "brazierGlb") mesh = o;
  });
  const one = mesh && mesh.count > 0 ? (() => {
    const a = mesh.instanceMatrix.array;
    const x = a[12], y = a[13], z = a[14];
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const sy = Math.hypot(a[4], a[5], a[6]) || 1;
    return {
      world: { x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), specZ: +(-z).toFixed(2) },
      sy: +sy.toFixed(3),
      localH: +((bb.max.y - bb.min.y) * sy).toFixed(3),
      worldTop: +((y + bb.max.y * sy)).toFixed(3),
      worldBottom: +((y + bb.min.y * sy)).toFixed(3),
      visible: mesh.visible,
      frustumCulled: mesh.frustumCulled,
      count: mesh.count,
    };
  })() : null;
  const names = {};
  window.__scene.traverse((o) => {
    if (!o.isMesh) return;
    if (/brazier|bfire|flame|smoke/i.test(o.name || "")) names[o.name] = { visible: o.visible, culled: o.frustumCulled, count: o.count };
  });
  const lights = [];
  window.__scene.traverse((o) => {
    if (o.isPointLight || o.isSpotLight) lights.push({ type: o.type, y: +o.position.y.toFixed(2), intensity: o.intensity, visible: o.visible, dist: o.distance });
  });
  return { one, names, lights: lights.slice(0, 12), boat: window.__boatReady, diag: window.__brazierDiag || null };
});
console.log("DIAG", JSON.stringify(diag, null, 2));

async function shot(name, look, hour) {
  const data = await page.evaluate(({ look, hour }) => {
    window.__freeze = true;
    if (hour && window.__hour) window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    if (window.__pickAt) window.__pickAt(rect.left + rect.width * 0.5, rect.top + rect.height * 0.42);
    return { url: canvas.toDataURL("image/jpeg", 0.82), pick: window.__pickLast };
  }, { look, hour });
  fs.writeFileSync(`${outDir}/${tag}-${name}.jpg`, Buffer.from(data.url.split(",")[1], "base64"));
  console.log("shot", name, "pick", JSON.stringify(data.pick));
}

await shot("moat-dusk", [230, 7.2, -32, 260, 12.4, 3.6], "dusk");
await shot("moat-night", [230, 7.2, -32, 260, 12.4, 3.6], "night");
await shot("b-west-dusk", [78, 11.6, -46, 70, 12.2, 3.2], "dusk");
await shot("b-east-dusk", [210, 11.6, -46, 230, 12.2, 3.2], "dusk");
await shot("b-west-night", [78, 11.6, -46, 70, 12.2, 3.2], "night");
await shot("close-dusk", [260, 14.5, -3.2, 260, 11.9, 4.0], "dusk");

const bench = await page.evaluate(async () => {
  window.__hour("dusk", true);
  window.__debug.look(230, 7.2, -32, 260, 12.2, 3.6);
  window.__paint();
  return window.__debug.bench(10);
});
console.log("BENCH", tag, JSON.stringify(bench));
await browser.close();
