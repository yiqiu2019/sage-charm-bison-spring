import { chromium } from "playwright";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 636 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(20000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(() => window.__scene && window.__camera && window.__debug, { timeout: 90000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(async () => {
  const scene = window.__scene;
  const cam = window.__camera;
  const M4 = cam.projectionMatrix.constructor;
  const V3 = cam.position.constructor;
  window.dispatchEvent(new Event("embark"));
  window.__freeze = true;
  if (window.__hour) window.__hour("dusk", true);
  window.__debug.look(140, 4.5, -22, 128, 6, 2);
  if (window.__paint) window.__paint();
  cam.updateMatrixWorld(true);
  const proj = new M4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const v = new V3();
  const W = 1280, H = 636;
  function screenOfWorld(x, y, z) {
    v.set(x, y, z).applyMatrix4(proj);
    if (v.z < -1.2 || v.z > 1.2) return null;
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
  }
  const hits = [];
  scene.traverse((o) => {
    if (!o.visible || !o.isMesh || !o.geometry) return;
    const geo = o.geometry;
    if (!geo.boundingBox) { try { geo.computeBoundingBox(); } catch (e) { return; } }
    const bb = geo.boundingBox;
    if (!bb) return;
    o.updateWorldMatrix(true, false);
    // instanced: sample matrices near gate
    if (o.isInstancedMesh) {
      const n = o.count || 0;
      const mat = new M4();
      const step = Math.max(1, Math.floor(n / 500));
      for (let i = 0; i < n; i += step) {
        o.getMatrixAt(i, mat);
        const px = mat.elements[12], py = mat.elements[13], pz = mat.elements[14];
        // world scale approx
        const sx = Math.hypot(mat.elements[0], mat.elements[1], mat.elements[2]);
        const sy = Math.hypot(mat.elements[4], mat.elements[5], mat.elements[6]);
        const sz = Math.hypot(mat.elements[8], mat.elements[9], mat.elements[10]);
        // only near south gate world
        if (px < 60 || px > 220 || pz < -30 || pz > 80) continue;
        if (sy < 8 && sx < 8) continue;
        const s = screenOfWorld(px, py + sy * 0.5, pz);
        if (!s) continue;
        const dist = Math.hypot(px - cam.position.x, (py) - cam.position.y, pz - cam.position.z);
        const pixH = sy / Math.max(dist, 0.5) * (H / 2) / Math.tan(cam.fov * Math.PI / 360);
        if (pixH < 200 && sx / Math.max(dist, 0.5) * (H / 2) / Math.tan(cam.fov * Math.PI / 360) < 200) continue;
        hits.push({ kind: "inst", name: o.name, i, px: +px.toFixed(1), py: +py.toFixed(1), pz: +pz.toFixed(1), sx: +sx.toFixed(2), sy: +sy.toFixed(2), sz: +sz.toFixed(2), pixH: +pixH.toFixed(0), dist: +dist.toFixed(1) });
      }
      return;
    }
    const corners = [];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      v.set(x, y, z).applyMatrix4(o.matrixWorld);
      corners.push(v.clone());
    }
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, n = 0;
    for (const c of corners) {
      const s = screenOfWorld(c.x, c.y, c.z);
      if (!s) continue;
      n++;
      if (s[0] < minX) minX = s[0]; if (s[0] > maxX) maxX = s[0];
      if (s[1] < minY) minY = s[1]; if (s[1] > maxY) maxY = s[1];
    }
    if (n < 4) return;
    const w = maxX - minX, h = maxY - minY;
    if (w < 300 || h < 300) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    hits.push({ kind: "mesh", name: o.name || "(noname)", parent: o.parent && o.parent.name, w: +w.toFixed(0), h: +h.toFixed(0), x: +minX.toFixed(0), y: +minY.toFixed(0), a2c: !!(m && m.alphaToCoverage), dt: m && m.depthTest, dw: m && m.depthWrite, tr: !!(m && m.transparent) });
  });
  hits.sort((a, b) => (b.pixH || b.w * b.h || 0) - (a.pixH || a.w * a.h || 0));
  return { cam: cam.position.toArray().map(n => +n.toFixed(1)), fov: cam.fov, hits: hits.slice(0, 35) };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
