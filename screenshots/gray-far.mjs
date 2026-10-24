import { chromium } from "playwright";
import fs from "fs";

const OUT = "/workspace/screenshots/gray-gate";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 50000) {
  const ok = await page.evaluate(() => !!(
    window.__paint && window.__gateGuards && window.__gateGuards.ready && window.__cityReady && window.__buildings && window.__buildings.ready
  ));
  if (ok) break;
  await page.waitForTimeout(400);
}
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  const hud = document.getElementById("hud");
  if (hud) hud.style.display = "none";
  window.__freeze = true;
  window.__hour("dusk", true);
  const scene = window.__scene;
  const rows = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || o.type;
    if (!/board|Board|hillTrees|cityTree|grove|reed|guard|pavilion|hall2|smoke|water|flag|door/i.test(n)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    rows.push({
      name: n, type: o.type, vis: o.visible, count: o.count, inst: !!o.isInstancedMesh,
      alphaTest: m && m.alphaTest, transparent: !!(m && m.transparent),
      map: !!(m && m.map), mapImg: m && m.map && m.map.image ? (m.map.image.width + "x" + m.map.image.height) : "",
      opacity: m && m.opacity, side: m && m.side,
    });
  });
  return { stage: window.__stage, city: window.__city, boot: window.__bootErr || null, buildings: window.__buildings, rows };
});

// The instance scan above is broken if THREE isn't global. Do it with the page's THREE via a second eval that uses camera math from instanceMatrix.
const scan = await page.evaluate(() => {
  const scene = window.__scene;
  const out = [];
  const m = { elements: new Float32Array(16) };
  // Matrix4-like
  function getM(mesh, i, el) {
    mesh.getMatrixAt(i, { elements: el, isMatrix4: true });
  }
  // three Matrix4 is required. Grab from an object's matrix.
  const proto = scene.matrix.constructor;
  const tmp = new proto();
  scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const n = o.name || "";
    if (!/board|Board|hillTrees|cityTree|grove|reed|pavilion|hall2|smoke|grass|flag|wflag/i.test(n)) return;
    let maxS = 0, closest = 1e9, closestP = null, shown = 0;
    const gateX = 128, gateZ = 0;
    const lim = Math.min(o.count || 0, 8000);
    for (let i = 0; i < lim; i++) {
      o.getMatrixAt(i, tmp);
      const e = tmp.elements;
      const x = e[12], y = e[13], z = e[14];
      const sx = Math.hypot(e[0], e[1], e[2]);
      const sy = Math.hypot(e[4], e[5], e[6]);
      const s = Math.max(sx, sy);
      if (s > maxS) maxS = s;
      const d = Math.hypot(x - gateX, z - gateZ);
      if (d < closest) { closest = d; closestP = { x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), sx: +sx.toFixed(2), sy: +sy.toFixed(2) }; }
      if (d < 220 && s > 4) shown++;
    }
    out.push({
      name: n, count: o.count, vis: o.visible, maxS: +maxS.toFixed(2),
      closest: +closest.toFixed(1), closestP, bigNear: shown,
    });
  });
  return out;
});

async function shot(name, look) {
  const r = await page.evaluate(async (look) => {
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    if (window.__tickGateGuards) window.__tickGateGuards(window.__camera);
    window.__paint();
    window.__paint();
    const city = window.__city ? { draws: window.__city.draws, spots: window.__city.spots } : null;
    const vis = [];
    window.__scene.traverse((o) => {
      if (!o.visible) return;
      const n = o.name || "";
      if (/cityTree|Board|board|hillTrees|groveBoard|pavilion|hall2/.test(n)) {
        vis.push(n + ":" + (o.count != null ? o.count : "m"));
      }
    });
    const url = document.querySelector("canvas").toDataURL("image/jpeg", 0.62);
    return { city, vis, url };
  }, look);
  const buf = Buffer.from(r.url.split(",")[1], "base64");
  fs.writeFileSync(`${OUT}/${name}.jpg`, buf);
  return { name, city: r.city, vis: r.vis, bytes: buf.length };
}

const shots = [];
const cams = [
  ["far200", [128, 7, -170, 128, 10, 10]],
  ["far120", [128, 6, -100, 128, 9, 0]],
  ["trees", [128, 5.5, -22, 128, 16, 30]],
  ["out", [128, 5, -6, 128, 4, -80]],
  ["near", [128, 5.2, -30, 128, 7, 2]],
];
for (const [n, c] of cams) shots.push(await shot(n, c));

fs.writeFileSync(`${OUT}/far-scan.json`, JSON.stringify({ errors, info, scan, shots }, null, 2));
console.log(JSON.stringify({ errors, boot: info.boot, city: info.city, scan, shots }, null, 2).slice(0, 14000));
await browser.close();
