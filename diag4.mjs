import { chromium } from "playwright";

const exe = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__paint === "function" && window.__scene);
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  const THREE = window.THREE || null;
  const scene = window.__scene;
  const camera = window.__camera;
  const r = window.__renderer;
  r.shadowMap.enabled = false;
  r.setPixelRatio(1);
  r.setSize(1280, 640, false);

  function scan(look) {
    window.__debug.look(...look);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);
    const proj = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
    const v = new (camera.position.constructor)();
    const box = new (function () {})();
    const THREEBox = camera.constructor; // dummy
    const hits = [];
    const slabs = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      if (!bb) return;
      // world corners of local bbox, including instance? skip instanced for bbox of base geo
      const corners = [];
      const xs = [bb.min.x, bb.max.x], ys = [bb.min.y, bb.max.y], zs = [bb.min.z, bb.max.z];
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, ndcN = 0;
      const worldPts = [];
      for (const x of xs) for (const y of ys) for (const z of zs) {
        v.set(x, y, z).applyMatrix4(o.matrixWorld);
        worldPts.push(v.x, v.y, v.z);
        const e = proj.elements;
        const cx = v.x, cy = v.y, cz = v.z;
        const w = e[3] * cx + e[7] * cy + e[11] * cz + e[15];
        if (w <= 0.05) continue;
        const sx = (e[0] * cx + e[4] * cy + e[8] * cz + e[12]) / w;
        const sy = (e[1] * cx + e[5] * cy + e[9] * cz + e[13]) / w;
        ndcN++;
        if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
      }
      const dx = Math.abs(worldPts[0] - worldPts[3]) || 0;
      // extents from the 8 points
      let wx0 = 1e9, wx1 = -1e9, wy0 = 1e9, wy1 = -1e9, wz0 = 1e9, wz1 = -1e9;
      for (let i = 0; i < worldPts.length; i += 3) {
        wx0 = Math.min(wx0, worldPts[i]); wx1 = Math.max(wx1, worldPts[i]);
        wy0 = Math.min(wy0, worldPts[i + 1]); wy1 = Math.max(wy1, worldPts[i + 1]);
        wz0 = Math.min(wz0, worldPts[i + 2]); wz1 = Math.max(wz1, worldPts[i + 2]);
      }
      const sxw = wx1 - wx0, syw = wy1 - wy0, szw = wz1 - wz0;
      const dims = [sxw, syw, szw].sort((a, b) => a - b);
      const thin = dims[0] < 2 && dims[1] > 8 && dims[2] > 8;
      const screenW = ndcN ? (maxX - minX) : 0;
      const screenH = ndcN ? (maxY - minY) : 0;
      const area = Math.max(0, screenW) * Math.max(0, screenH);
      if (thin || area > 0.15) {
        const rec = {
          name: o.name || "",
          type: o.type,
          area: +area.toFixed(3),
          sw: +screenW.toFixed(2),
          sh: +screenH.toFixed(2),
          ndc: ndcN ? [+minX.toFixed(2), +minY.toFixed(2), +maxX.toFixed(2), +maxY.toFixed(2)] : null,
          size: [+sxw.toFixed(1), +syw.toFixed(1), +szw.toFixed(1)],
          pos: [+o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1)],
          inst: !!o.isInstancedMesh,
          count: o.isInstancedMesh ? o.count : 1,
          trans: !!(o.material && o.material.transparent),
          order: o.renderOrder,
        };
        if (thin) slabs.push(rec);
        if (area > 0.08) hits.push(rec);
      }
    });
    hits.sort((a, b) => b.area - a.area);
    return { slabs: slabs.slice(0, 40), hits: hits.slice(0, 25) };
  }

  // instance scales: any instance with two large axes
  const bigInst = [];
  scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const m = o.instanceMatrix;
    if (!m) return;
    const n = Math.min(o.count, 4000);
    let worst = null;
    for (let i = 0; i < n; i++) {
      const a = i * 16;
      const e = m.array;
      const sx = Math.hypot(e[a], e[a + 1], e[a + 2]);
      const sy = Math.hypot(e[a + 4], e[a + 5], e[a + 6]);
      const sz = Math.hypot(e[a + 8], e[a + 9], e[a + 10]);
      const dims = [sx, sy, sz].sort((p, q) => p - q);
      if (dims[1] > 15 && dims[2] > 15 && dims[0] < 3) {
        const px = e[a + 12], py = e[a + 13], pz = e[a + 14];
        const rec = { name: o.name, i, s: [+sx.toFixed(2), +sy.toFixed(2), +sz.toFixed(2)], p: [+px.toFixed(1), +py.toFixed(1), +pz.toFixed(1)] };
        if (!worst || dims[2] > worst.s[2]) worst = rec;
        if (bigInst.length < 30) bigInst.push(rec);
      }
    }
  });

  return {
    open: scan([188, 7.5, -34, 164, 2.4, -34]),
    south: scan([140, 6, -28, 128, 8, 2]),
    bigInst: bigInst.slice(0, 30),
  };
});

console.log(JSON.stringify(result, null, 2).slice(0, 20000));
await browser.close();
