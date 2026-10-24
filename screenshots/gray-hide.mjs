import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__gateGuards && window.__gateGuards.ready && window.__south && window.__south.boardMeshes));
  if (ok) break;
  await page.waitForTimeout(400);
}
await page.waitForTimeout(4000);
console.log("boot", Math.round((Date.now() - t0) / 1000));

const result = await page.evaluate(async () => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  const hud = document.getElementById("hud");
  if (hud) hud.style.display = "none";
  window.__freeze = true;
  window.__hour("dusk", true);
  const scene = window.__scene;
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  function grab() {
    window.__paint();
    const w = canvas.width, h = canvas.height;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return { w, h, buf };
  }
  function diffBox(a, b) {
    const { w, h, buf } = a;
    let minX = w, minY = h, maxX = -1, maxY = -1, n = 0, sum = 0;
    const step = 2;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const d = Math.abs(buf[i] - b.buf[i]) + Math.abs(buf[i + 1] - b.buf[i + 1]) + Math.abs(buf[i + 2] - b.buf[i + 2]);
        if (d > 30) {
          n++;
          sum += d;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { n, mean: n ? +(sum / n).toFixed(1) : 0, box: n ? [minX, minY, maxX, maxY] : null, w, h };
  }
  function setVis(pred, on) {
    const touched = [];
    scene.traverse((o) => {
      if (pred(o)) {
        touched.push([o, o.visible]);
        o.visible = on;
      }
    });
    return () => { for (const [o, v] of touched) o.visible = v; };
  }
  // closest billboards
  const closest = {};
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const m = new o.matrixWorld.constructor();
    const p = new o.position.constructor();
    const q = new o.quaternion.constructor();
    const s = new o.scale.constructor();
    let best = null;
    let nan = 0;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      m.decompose(p, q, s);
      if (!isFinite(s.x) || !isFinite(s.y) || !isFinite(p.x)) { nan++; continue; }
      p.applyMatrix4(o.matrixWorld);
      const d = Math.hypot(p.x - 128, p.z - 0);
      if (!best || d < best.d) best = { d: +d.toFixed(1), x: +p.x.toFixed(1), z: +(-p.z).toFixed(1), y: +p.y.toFixed(1), sx: +s.x.toFixed(2), sy: +s.y.toFixed(2) };
    }
    if (best) closest[o.name || o.geometry.type] = { n: o.count, nan, best };
  });
  const cams = {
    front: [128, 6.2, -36, 128, 7, 1],
    low: [128, 3.9, -15, 128, 4.6, 2],
  };
  const groups = {
    boards: (o) => /board|hillTrees/i.test(o.name || ""),
    city: (o) => o.name === "cityTree",
    guards: (o) => o.name === "guardGe" || o.name === "guardSword",
    water: (o) => o.name === "water" || o.name === "northWater",
    reeds: (o) => o.name === "reed" || o.name === "reedGlb",
    flags: (o) => o.name === "wflag",
    doors: (o) => o.name === "gateDoor" || o.name === "gatePushou",
    smoke: (o) => o.name === "brazierSmoke",
  };
  const out = { closest };
  for (const [ck, cam] of Object.entries(cams)) {
    window.__debug.look(...cam);
    window.__post.enabled = true;
    const base = grab();
    window.__post.enabled = false;
    const post0 = grab();
    window.__post.enabled = true;
    out[ck] = { post0: diffBox(base, post0) };
    for (const [gk, pred] of Object.entries(groups)) {
      const restore = setVis(pred, false);
      const shot = grab();
      restore();
      out[ck][gk] = diffBox(base, shot);
    }
  }
  return out;
});
fs.writeFileSync("/workspace/screenshots/gray-gate/hide.json", JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1).slice(0, 8000));
await browser.close();
