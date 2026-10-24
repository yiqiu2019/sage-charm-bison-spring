import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 636 } });
page.setDefaultTimeout(120000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__debug && window.__cityReady && window.__gateGuards));
  if (ok) break;
  await page.waitForTimeout(500);
}
await page.evaluate(() => {
  window.dispatchEvent(new Event("embark"));
  window.__freeze = true;
});
await page.waitForTimeout(300);

const cams = [
  { name: "B", look: [178, 11.7, -52, 128, 10, -6] },
  { name: "front", look: [140, 4.5, -22, 128, 6, 2] },
  { name: "low", look: [128, 3.9, -15, 128, 4.6, 2] },
];

const out = {};
for (const cam of cams) {
  const rows = await page.evaluate((look) => {
    const dbg = window.__debug;
    dbg.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    if (window.__paint) window.__paint();
    const camera = window.__camera;
    const scene = window.__scene;
    camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    const W = window.innerWidth, H = window.innerHeight;
    const vp = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
    const v = camera.position.constructor ? new camera.position.constructor() : null;
    const Vec3 = camera.position.constructor;
    const p = new Vec3();
    function projBox(min, max) {
      const xs = [min.x, max.x], ys = [min.y, max.y], zs = [min.z, max.z];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
      for (const x of xs) for (const y of ys) for (const z of zs) {
        p.set(x, y, z).applyMatrix4(vp);
        if (p.z < -1 || p.z > 1) continue;
        const sx = (p.x * 0.5 + 0.5) * W;
        const sy = (-p.y * 0.5 + 0.5) * H;
        if (sx < x0) x0 = sx;
        if (sy < y0) y0 = sy;
        if (sx > x1) x1 = sx;
        if (sy > y1) y1 = sy;
        n++;
      }
      if (n < 2) return null;
      const w = x1 - x0, h = y1 - y0;
      return { x0: +x0.toFixed(0), y0: +y0.toFixed(0), x1: +x1.toFixed(0), y1: +y1.toFixed(0), w: +w.toFixed(0), h: +h.toFixed(0) };
    }
    const hits = [];
    const box = new Vec3(); // dummy
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.visible) return;
      const g = o.geometry;
      if (!g.boundingBox) {
        if (g.boundingSphere && o.isInstancedMesh) {
          // skip full recompute of huge geos; use sphere-less
        }
        try { g.computeBoundingBox(); } catch (e) { return; }
      }
      if (!g.boundingBox) return;
      if (o.isInstancedMesh) {
        const n = o.count || 0;
        const step = Math.max(1, Math.floor(n / 400));
        const m = camera.matrixWorld.clone(); // reuse later
        const M = new m.constructor();
        const bb = g.boundingBox;
        for (let i = 0; i < n; i += step) {
          o.getMatrixAt(i, M);
          // instance AABB in world: transform 8 corners by matrix (mesh at identity assumed, also * matrixWorld)
          const e = M.elements;
          const mw = o.matrixWorld.elements;
          // combine roughly: world = mesh.matrixWorld * instance
          const WM = new M.constructor().multiplyMatrices(o.matrixWorld, M);
          const min = bb.min, max = bb.max;
          const corners = [];
          for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
            corners.push(new Vec3(x, y, z).applyMatrix4(WM));
          }
          let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
          for (const c of corners) {
            if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x;
            if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y;
            if (c.z < z0) z0 = c.z; if (c.z > z1) z1 = c.z;
          }
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          if (cx < 60 || cx > 230 || cz < -20 || cz > 90) continue;
          const sy = y1 - y0, sx = x1 - x0;
          if (sy < 6 && sx < 6) continue;
          const scr = projBox({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 });
          if (!scr || scr.w < 180 || scr.h < 180) continue;
          hits.push({ name: o.name || "?", i, world: [+sx.toFixed(1), +sy.toFixed(1), +(z1 - z0).toFixed(1)], scr, at: [+cx.toFixed(1), +((y0 + y1) / 2).toFixed(1), +cz.toFixed(1)] });
        }
      } else {
        if (!o.geometry.boundingBox) return;
        o.updateWorldMatrix(true, false);
        const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
        if (sy < 4 && sx < 8) return;
        const scr = projBox(bb.min, bb.max);
        if (!scr || scr.h < 200 || scr.w < 200) return;
        // prefer boxes that aren't the entire screen
        if (scr.w > W * 0.98 && scr.h > H * 0.98) return;
        hits.push({
          name: o.name || o.parent && o.parent.name || "?",
          world: [+sx.toFixed(1), +sy.toFixed(1), +sz.toFixed(1)],
          scr,
          at: [+((bb.min.x + bb.max.x) / 2).toFixed(1), +((bb.min.y + bb.max.y) / 2).toFixed(1), +((bb.min.z + bb.max.z) / 2).toFixed(1)],
          a2c: !!(o.material && o.material.alphaToCoverage),
          verts: o.geometry.attributes.position ? o.geometry.attributes.position.count : 0,
        });
      }
    });
    hits.sort((a, b) => (b.scr.w * b.scr.h) - (a.scr.w * a.scr.h));
    return { W, H, n: hits.length, hits: hits.slice(0, 25) };
  }, cam.look);
  out[cam.name] = rows;
  console.log("\n==", cam.name, "hits", rows.n);
  for (const h of rows.hits.slice(0, 12)) {
    console.log(h.name, "scr", h.scr, "world", h.world, "at", h.at, h.i != null ? "i" + h.i : "", h.a2c ? "a2c" : "");
  }
}
fs.writeFileSync("/workspace/screenshots/gray-gate/who.json", JSON.stringify(out, null, 2));
await browser.close();
