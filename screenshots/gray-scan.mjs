import { chromium } from "playwright";
import fs from "fs";

const out = "/workspace/screenshots/gray-gate";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 100000) {
  const b = await page.evaluate(() => !!(window.__paint && window.__gateGuards && window.__gateGuards.ready && window.__reeds && window.__city));
  if (b) break;
  await page.waitForTimeout(400);
}
await page.waitForTimeout(8000);
console.log("boot", Math.round((Date.now() - t0) / 1000));

const report = await page.evaluate(async () => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  const hud = document.getElementById("hud");
  if (hud) hud.style.display = "none";
  window.__freeze = true;
  if (window.__hour) window.__hour("dusk", true);
  const scene = window.__scene;
  const cam = window.__camera;
  const THREE = cam.constructor;
  // names present
  const names = {};
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || o.geometry.type;
    names[n] = (names[n] || 0) + 1;
  });
  function scan(label, camSpec) {
    window.__debug.look(camSpec[0], camSpec[1], camSpec[2], camSpec[3], camSpec[4], camSpec[5]);
    window.__paint();
    window.__paint();
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const w = canvas.width, h = canvas.height;
    const cols = 16, rows = 9;
    const cells = [];
    const pix = new Uint8Array(4);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const nx = (i + 0.5) / cols * 2 - 1;
        const ny = 1 - (j + 0.5) / rows * 2;
        const x = Math.floor((i + 0.5) / cols * w);
        const y = Math.floor(h - (j + 0.5) / rows * h);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pix);
        const hits = window.__hit(nx, ny);
        const h0 = hits[0];
        cells.push({
          i, j,
          rgb: [pix[0], pix[1], pix[2]],
          hit: h0 ? h0.name + "@" + h0.d + " y" + h0.y : "-",
        });
      }
    }
    return { label, w, h, cells };
  }
  const views = [
    ["b", [138, 11.7, -58, 128, 10, -6]],
    ["front", [128, 4.8, -22, 128, 5.5, 1]],
    ["water", [152, 2.2, -30, 128, 4.5, 0]],
    ["out", [122.5, 2.4, 6, 122.5, 2.2, -16]],
  ];
  const scans = views.map((v) => scan(v[0], v[1]));
  // billboard-like instance positions near gate
  const near = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const n = o.name || "";
    if (!/board|hill|cityTree|reed|flag|smoke|guard|field|grove|south/i.test(n)) return;
    const m = new o.matrixWorld.constructor();
    const p = new o.position.constructor();
    const q = new o.quaternion.constructor();
    const s = new o.scale.constructor();
    let shown = 0;
    for (let i = 0; i < o.count && shown < 6; i++) {
      o.getMatrixAt(i, m);
      m.decompose(p, q, s);
      p.applyMatrix4(o.matrixWorld);
      const sz = -p.z;
      const sm = Math.max(Math.abs(s.x), Math.abs(s.y));
      if (p.x > 90 && p.x < 180 && sz > -120 && sz < 30 && sm > 1.2) {
        near.push({ n, x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +sz.toFixed(1), sx: +s.x.toFixed(2), sy: +s.y.toFixed(2) });
        shown++;
      }
    }
  });
  let refl = null;
  const water = scene.getObjectByName("water");
  if (water && water.getRenderTarget) {
    window.__debug.look(152, 2.2, -30, 128, 4.5, 0);
    window.__paint();
    const rt = water.getRenderTarget();
    const rw = rt.width, rh = rt.height;
    const buf = new Uint8Array(rw * rh * 4);
    const renderer = window.__renderer || null;
    refl = { rw, rh, hasRenderer: !!renderer };
  }
  return { names, scans, near, refl, stage: window.__stage, south: window.__south, hill: window.__hillTrees && window.__hillTrees.total };
});

function fmt(scan) {
  const { cells } = scan;
  const cols = 16;
  let s = scan.label + "\n";
  for (let j = 0; j < 9; j++) {
    let row = "";
    for (let i = 0; i < cols; i++) {
      const c = cells[j * cols + i];
      const [r, g, b] = c.rgb;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const mark = sat < 16 && (r + g + b) / 3 > 40 ? "#" : ".";
      row += mark;
    }
    s += row + "\n";
  }
  // gray cells with hits
  const gray = cells.filter((c) => {
    const [r, g, b] = c.rgb;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    return sat < 16 && (r + g + b) / 3 > 50;
  });
  const hits = {};
  for (const c of gray) hits[c.hit] = (hits[c.hit] || 0) + 1;
  s += "grayHits " + JSON.stringify(hits) + "\n";
  return s;
}
let text = "names " + JSON.stringify(report.names) + "\nnear " + JSON.stringify(report.near) + "\nhill " + report.hill + " south " + JSON.stringify(report.south) + "\nrefl " + JSON.stringify(report.refl) + "\n";
for (const sc of report.scans) text += fmt(sc) + "\n";
fs.writeFileSync(out + "/scan.txt", text);
console.log(text);
await browser.close();
