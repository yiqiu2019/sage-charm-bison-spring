import { chromium } from "playwright";
import fs from "fs";
const OUT = "/workspace/screenshots/gray-gate";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(60000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 50000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__debug && window.__cityReady));
  if (ok) break;
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const L = document.getElementById("loader"); if (L) L.style.display = "none";
  const hud = document.getElementById("hud"); if (hud) hud.style.display = "none";
  window.dispatchEvent(new Event("embark"));
  window.__hour("dusk", true);
});
await page.waitForTimeout(400);

const census = await page.evaluate(() => {
  const THREE = window.__scene.constructor;
  // THREE is not the namespace; use camera's constructor chain via object types
  const scene = window.__scene;
  const cam = window.__camera;
  const big = [];
  scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    const m0 = mats[0];
    const flags = m0 ? {
      tr: !!m0.transparent, dw: m0.depthWrite !== false, dt: m0.depthTest !== false,
      at: m0.alphaTest || 0, op: m0.opacity, atc: !!m0.alphaToCoverage,
      key: m0.customProgramCacheKey ? m0.customProgramCacheKey() : "",
      type: m0.type,
    } : null;
    if (o.isInstancedMesh) {
      const n = o.count || 0;
      let near = null;
      const gate = { x: 128, z: 0 };
      for (let i = 0; i < n; i++) {
        const e = o.instanceMatrix.array;
        const x = e[i * 16 + 12], y = e[i * 16 + 13], z = e[i * 16 + 14];
        const sx = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
        const sy = Math.hypot(e[i * 16 + 4], e[i * 16 + 5], e[i * 16 + 6]);
        const d = Math.hypot(x - gate.x, z - gate.z);
        if (!near || d < near.d) near = { d: +d.toFixed(1), x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), sx: +sx.toFixed(2), sy: +sy.toFixed(2) };
        if (d < 120 && Math.max(sx, sy) > 6) {
          big.push({ name: o.name || "(mesh)", i, d: +d.toFixed(1), x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), sx: +sx.toFixed(2), sy: +sy.toFixed(2), flags });
        }
      }
      if (near && (near.d < 250 || (flags && (flags.tr || flags.atc || !flags.dt)))) {
        big.push({ name: (o.name || "(mesh)") + "#closest", n, near, flags });
      }
    } else {
      o.updateWorldMatrix(true, false);
      const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      if (!p) return;
      // world bbox from geometry * matrix is heavy; use bounding sphere if present
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere;
      if (!bs) return;
      const c = bs.center.clone().applyMatrix4(o.matrixWorld);
      const s = o.getWorldScale(new c.constructor(1, 1, 1));
      const r = bs.radius * Math.max(s.x, s.y, s.z);
      const d = Math.hypot(c.x - 128, c.z - 0);
      if (r > 8 && d < 200) big.push({ name: o.name || "(mesh)", d: +d.toFixed(1), r: +r.toFixed(1), x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: +c.z.toFixed(1), flags });
      else if (flags && (flags.tr || !flags.dt || flags.atc) && d < 300) big.push({ name: (o.name || "(mesh)") + "#odd", d: +d.toFixed(1), r: +r.toFixed(1), x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: +c.z.toFixed(1), flags });
    }
  });
  return { n: big.length, big: big.slice(0, 80), cam: [cam.position.x, cam.position.y, cam.position.z] };
});
fs.writeFileSync(OUT + "/sq-census.json", JSON.stringify(census, null, 2));
console.log("census", census.n);

async function shot(name, look) {
  await page.evaluate((look) => {
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
  }, look);
  await page.waitForTimeout(120);
  const url = await page.evaluate(() => {
    window.__paint();
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.6);
  });
  const buf = Buffer.from(url.split(",")[1], "base64");
  fs.writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(name, buf.length);
}

const cams = [
  ["sq-west", [50, 4, -28, 140, 6, -6]],
  ["sq-sw", [80, 3.5, -45, 128, 7, 0]],
  ["sq-bridge", [128, 4.2, -22, 128, 6.5, 2]],
  ["sq-side", [100, 3.2, -16, 140, 5, -4]],
  ["sq-loww", [60, 2.8, -12, 150, 5, -6]],
];
for (const [n, c] of cams) await shot(n, c);
await browser.close();
