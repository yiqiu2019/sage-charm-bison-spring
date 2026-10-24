import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 636 } });
page.setDefaultTimeout(180000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 150000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__debug && window.__cityReady && window.__gateGuards && window.__gateGuards.ready));
  if (ok) break;
  await page.waitForTimeout(400);
}
const ready = await page.evaluate(() => ({
  paint: !!window.__paint,
  city: !!window.__cityReady,
  guards: window.__gateGuards && window.__gateGuards.ready,
}));
console.log("ready", ready);
await page.evaluate(() => {
  window.dispatchEvent(new Event("embark"));
  window.__freeze = true;
  window.__debug.look(140, 6, -28, 128, 8, 2);
  if (window.__tickCity) window.__tickCity(window.__camera);
  if (window.__tickSouth) window.__tickSouth(window.__camera);
  if (window.__tickGrove) window.__tickGrove(window.__camera);
  if (window.__tickNorth) window.__tickNorth(window.__camera);
  if (window.__tickGateGuards) window.__tickGateGuards(window.__camera);
});
const data = await page.evaluate(() => {
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  const box = new window.__camera.position.constructor().constructor
    ? null : null;
  const THREEBox = window.__camera.projectionMatrix.constructor;
  // use Box3 from a mesh
  const rows = [];
  scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh || o.isPoints)) return;
    if (!o.geometry) return;
    if (o.geometry.computeBoundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb) return;
    if (o.computeBoundingBox) {
      try { o.computeBoundingBox(); } catch (e) {}
    }
    const wb = o.boundingBox;
    const g = (wb && isFinite(wb.min.x)) ? wb : null;
    let min = null, max = null;
    if (g) {
      min = [g.min.x, g.min.y, g.min.z];
      max = [g.max.x, g.max.y, g.max.z];
    } else {
      // transform 8 corners
      const xs = [bb.min.x, bb.max.x], ys = [bb.min.y, bb.max.y], zs = [bb.min.z, bb.max.z];
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      const v = window.__camera.position.clone();
      for (const x of xs) for (const y of ys) for (const z of zs) {
        v.set(x, y, z).applyMatrix4(o.matrixWorld);
        if (v.x < mnx) mnx = v.x; if (v.y < mny) mny = v.y; if (v.z < mnz) mnz = v.z;
        if (v.x > mxx) mxx = v.x; if (v.y > mxy) mxy = v.y; if (v.z > mxz) mxz = v.z;
      }
      min = [mnx, mny, mnz]; max = [mxx, mxy, mxz];
    }
    const dx = max[0] - min[0], dy = max[1] - min[1], dz = max[2] - min[2];
    const mat = o.material || {};
    rows.push({
      name: o.name || o.type,
      type: o.isInstancedMesh ? "inst" : o.isPoints ? "pts" : "mesh",
      n: o.isInstancedMesh ? o.count : (o.geometry.attributes.position ? o.geometry.attributes.position.count : 0),
      min, max,
      dx: +dx.toFixed(1), dy: +dy.toFixed(1), dz: +dz.toFixed(1),
      a2c: !!mat.alphaToCoverage,
      dw: mat.depthWrite !== false,
      dt: mat.depthTest !== false,
      trans: !!mat.transparent,
      side: mat.side,
      ro: o.renderOrder || 0,
      kind: (mat.userData && mat.userData.kind) || mat.name || "",
      vis: o.visible,
    });
  });
  return {
    fov: window.__camera.fov,
    aspect: window.__camera.aspect,
    near: window.__camera.near,
    far: window.__camera.far,
    rows,
  };
});
fs.writeFileSync("/workspace/screenshots/gray-gate/aabb2.json", JSON.stringify(data));
console.log("meshes", data.rows.length, "fov", data.fov, "aspect", data.aspect);
const big = data.rows.filter((r) => r.dy > 8 && (r.dx > 15 || r.dz > 15));
big.sort((a, b) => (b.dx * b.dy) - (a.dx * a.dy));
for (const r of big.slice(0, 40)) {
  console.log(`${r.type} ${r.name} ${r.kind} ${r.dx}x${r.dy}x${r.dz} a2c=${r.a2c} dw=${r.dw} n=${r.n} vis=${r.vis} min=${r.min.map((v)=>v.toFixed(1)).join(",")}`);
}
await browser.close();
