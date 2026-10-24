import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/gray-gate";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(120000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 400)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high&pick=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 70000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__gateGuards && window.__gateGuards.ready && window.__buildings && window.__buildings.ready && window.__cityReady));
  if (ok) break;
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1500);

const census = await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  const hud = document.getElementById("hud");
  if (hud) hud.style.display = "none";
  window.__freeze = true;
  window.__hour("dusk", true);
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  const THREE = window.THREE || null;
  const gate = { x: 128, z: 0 };
  const rows = [];
  const nearInst = [];
  scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isSprite && !o.isPoints) return;
    const mat = o.material;
    const mats = Array.isArray(mat) ? mat : [mat];
    const flags = mats.filter(Boolean).map((m) => ({
      type: m.type,
      name: m.name || "",
      transparent: !!m.transparent,
      opacity: m.opacity,
      depthWrite: m.depthWrite,
      depthTest: m.depthTest,
      side: m.side,
      alphaTest: m.alphaTest || 0,
      color: m.color ? "#" + m.color.getHexString() : "",
      map: !!(m.map || (m.uniforms && m.uniforms.map && m.uniforms.map.value) || (m.uniforms && m.uniforms.tDiffuse)),
    }));
    const p = o.getWorldPosition(new (o.position.constructor)());
    let flat = null;
    if (o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      if (bb) {
        const s = bb.getSize(new (o.position.constructor)());
        const sc = o.getWorldScale(new (o.position.constructor)());
        const sx = s.x * sc.x, sy = s.y * sc.y, sz = s.z * sc.z;
        const dims = [sx, sy, sz].sort((a, b) => a - b);
        if (dims[0] < 1.2 && dims[1] > 3 && dims[2] > 3) {
          flat = { sx: +sx.toFixed(2), sy: +sy.toFixed(2), sz: +sz.toFixed(2) };
        }
      }
    }
    const dx = p.x - 128, dz = p.z - 0;
    const d = Math.hypot(dx, dz);
    const interesting = flat || flags.some((f) => f.transparent || !f.depthWrite || f.alphaTest > 0) || o.isSprite || /board|sprite|smoke|mist|reed|guard|door|push|flag|curtain|cloud|bill/i.test((o.name || "") + flags.map((f) => f.name).join(","));
    if (interesting && (d < 220 || (flat && flat.sx + flat.sy + flat.sz > 20))) {
      rows.push({
        name: o.name || o.type,
        type: o.type,
        vis: o.visible,
        order: o.renderOrder,
        d: +d.toFixed(1),
        x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1),
        flat,
        count: o.isInstancedMesh ? o.count : undefined,
        flags,
        parent: o.parent && o.parent.name,
      });
    }
    if (o.isInstancedMesh && o.count > 0 && /board|reed|field|grove|hill|smoke|flag|city|pavilion|guard|grass/i.test(o.name || "")) {
      const m = o.instanceMatrix;
      const e = m.array;
      let nNear = 0;
      const samples = [];
      for (let i = 0; i < o.count; i++) {
        const x = e[i * 16 + 12], y = e[i * 16 + 13], z = e[i * 16 + 14];
        const dd = Math.hypot(x - 128, z - 0);
        if (dd < 90) {
          nNear++;
          if (samples.length < 6) {
            const sx = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
            const sy = Math.hypot(e[i * 16 + 4], e[i * 16 + 5], e[i * 16 + 6]);
            const sz = Math.hypot(e[i * 16 + 8], e[i * 16 + 9], e[i * 16 + 10]);
            samples.push({ i, x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), d: +dd.toFixed(1), sx: +sx.toFixed(2), sy: +sy.toFixed(2), sz: +sz.toFixed(2) });
          }
        }
      }
      if (nNear) nearInst.push({ name: o.name, vis: o.visible, count: o.count, nNear, samples });
    }
  });
  rows.sort((a, b) => a.d - b.d);
  return {
    boot: window.__bootErr || null,
    buildings: window.__buildings,
    city: window.__city && { spots: window.__city.spots, ready: !!window.__cityReady, draws: window.__city.draws },
    reeds: window.__reeds && { clumps: window.__reeds.clumps, chunks: window.__reeds.chunks },
    reedGlb: window.__reedGlb || null,
    guards: window.__gateGuards,
    rows: rows.slice(0, 80),
    nearInst,
    nRows: rows.length,
  };
});

const cams = [
  ["b", 138, 8.5, -48, 128, 8, 0],
  ["b-low", 128, 4.2, -26, 128, 6, 2],
  ["yaw", 108, 5.5, -22, 140, 6, 2],
  ["inside-out", 128, 3.4, 18, 128, 4, -20],
  ["west-water", 90, 3.2, -30, 128, 8, 0],
  ["east-water", 170, 3.2, -28, 128, 7, 0],
];
for (const [name, px, py, pz, lx, ly, lz] of cams) {
  await page.evaluate(({ px, py, pz, lx, ly, lz }) => {
    window.__debug.look(px, py, pz, lx, ly, lz);
    if (window.__tickGateGuards) window.__tickGateGuards(window.__camera);
    if (window.__tickCity) window.__tickCity(window.__camera);
    window.__paint();
    window.__paint();
  }, { px, py, pz, lx, ly, lz });
  await page.waitForTimeout(80);
  const hits = await page.evaluate(() => {
    const pts = [[0, 0], [-0.35, 0.1], [0.35, 0.1], [0, 0.35], [0, -0.15], [-0.6, 0.2], [0.6, -0.1]];
    return pts.map(([nx, ny]) => ({ nx, ny, hit: window.__hit(nx, ny) }));
  });
  census["hits_" + name] = hits;
  await page.screenshot({ path: `${outDir}/census-${name}.jpg`, type: "jpeg", quality: 70 });
}

fs.writeFileSync(`${outDir}/census.json`, JSON.stringify({ errors, census }, null, 2));
console.log(JSON.stringify({ errors, nRows: census.nRows, nearInst: census.nearInst, boot: census.boot, buildings: census.buildings && census.buildings.info, reeds: census.reeds, reedGlb: census.reedGlb && { slots: census.reedGlb.slots, size: census.reedGlb.size } }, null, 2));
await browser.close();
