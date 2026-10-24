import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/gray-gate";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high&pick=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__water && window.__renderer && window.__gateGuards && window.__gateGuards.ready));
  if (ok) break;
  await page.waitForTimeout(400);
}
await page.waitForTimeout(2500);

const result = await page.evaluate(async () => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  const hud = document.getElementById("hud");
  if (hud) hud.style.display = "none";
  window.__freeze = true;
  window.__hour("dusk", true);
  const scene = window.__scene;
  const water = window.__water;
  const renderer = window.__renderer;
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

  const calls = [];
  const orig = water.onBeforeRender;
  water.onBeforeRender = function (r, s, c) {
    const wp = new c.position.constructor();
    const cp = new c.position.constructor();
    wp.setFromMatrixPosition(this.matrixWorld);
    cp.copy(c.position);
    calls.push({
      override: s.overrideMaterial ? (s.overrideMaterial.type || "yes") : "",
      autoClear: r.autoClear,
      camY: +c.position.y.toFixed(2),
      waterY: +wp.y.toFixed(2),
      below: cp.y < wp.y,
    });
    if (calls.length > 12) calls.shift();
    return orig.apply(this, arguments);
  };

  function paint() { window.__paint(); }

  paint();
  paint();

  const rt = water.getRenderTarget();
  const w = rt.width, h = rt.height;
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  let r = 0, g = 0, b = 0, n = 0, blue = 0, gray = 0;
  const step = 8;
  for (let i = 0; i < buf.length; i += 4 * step) {
    r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
    const mx = Math.max(buf[i], buf[i + 1], buf[i + 2]);
    const mn = Math.min(buf[i], buf[i + 1], buf[i + 2]);
    if (buf[i + 2] > buf[i] + 30 && buf[i + 2] > buf[i + 1] + 30) blue++;
    if (mx - mn < 18 && mx > 40) gray++;
  }
  const refl = {
    w, h, n,
    mean: [+(r / n).toFixed(1), +(g / n).toFixed(1), +(b / n).toFixed(1)],
    blueFrac: +(blue / n).toFixed(3),
    grayFrac: +(gray / n).toFixed(3),
    calls: calls.slice(),
  };

  // planes / transparent near the gate
  scene.updateMatrixWorld(true);
  const suspects = [];
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isSprite)) return;
    const geo = o.geometry;
    if (!geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;
    const size = bb.getSize(new o.position.constructor());
    const center = bb.getCenter(new o.position.constructor());
    center.applyMatrix4(o.matrixWorld);
    const sx = size.x * o.scale.x, sy = size.y * o.scale.y, sz = size.z * o.scale.z;
    // instance scale not in object.scale; skip huge instanced by using matrix later
    const dx = center.x - 128, dz = center.z - 0;
    const dist = Math.hypot(dx, dz);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const flat = Math.min(sx, sy, sz) < 0.35 && Math.max(sx, sy, sz) > 4;
    const near = dist < 90 && center.y < 30 && center.y > -2;
    const trans = !!(mat && (mat.transparent || mat.depthWrite === false || mat.opacity < 1));
    if (!(flat || (near && trans) || o.isSprite)) return;
    if (o.isInstancedMesh && o.count > 30 && dist > 40) return;
    suspects.push({
      name: o.name || "",
      type: o.type,
      geo: geo.type,
      fn: (o.userData && o.userData.fn) || "",
      dist: +dist.toFixed(1),
      c: [+center.x.toFixed(1), +center.y.toFixed(1), +(-center.z).toFixed(1)],
      size: [+sx.toFixed(2), +sy.toFixed(2), +sz.toFixed(2)],
      vis: o.visible,
      trans: !!(mat && mat.transparent),
      depthWrite: mat ? mat.depthWrite : null,
      opacity: mat && mat.opacity != null ? +mat.opacity.toFixed(2) : null,
      mat: mat ? (mat.name || mat.type) : "",
      order: o.renderOrder,
      count: o.isInstancedMesh ? o.count : 1,
    });
  });
  suspects.sort((a, b) => a.dist - b.dist);

  // screen grab helper
  function grabRaw() {
    paint();
    const W = canvas.width, H = canvas.height;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { W, H, px };
  }
  function stats(img) {
    const { W, H, px } = img;
    // find mid-frame low-sat blobs not touching the top 8%
    let grayN = 0, tot = 0;
    const step = 4;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = Math.floor(H * 0.2); y < H * 0.92; y += step) {
      for (let x = Math.floor(W * 0.08); x < W * 0.92; x += step) {
        const i = ((H - 1 - y) * W + x) * 4; // readPixels is bottom-up; keep y as top-down via flip later
        tot++;
      }
    }
    // top-down scan
    for (let y = Math.floor(H * 0.15); y < H * 0.9; y += step) {
      for (let x = Math.floor(W * 0.05); x < W * 0.95; x += step) {
        const yy = H - 1 - y;
        const i = (yy * W + x) * 4;
        const R = px[i], G = px[i + 1], B = px[i + 2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const lum = (R + G + B) / 3;
        if (mx - mn < 16 && lum > 90 && lum < 170) {
          grayN++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { grayN, box: grayN ? [minX, minY, maxX, maxY] : null, W, H };
  }

  const cams = {
    bridge: [128, 5.2, -28, 128, 6.2, 2],
    side: [150, 4.2, -22, 128, 5.5, 2],
    yaw: [118, 5.0, -24, 140, 5.5, 2],
    inside: [128, 3.2, 6, 128, 3.4, -8],
  };
  const shots = {};
  for (const [k, cam] of Object.entries(cams)) {
    window.__debug.look(...cam);
    window.__post.enabled = true;
    const a = grabRaw();
    shots[k] = stats(a);
    // jpeg via canvas after paint (already painted)
    const url = canvas.toDataURL("image/jpeg", 0.72);
    shots[k].url = url;
  }

  // Does skipping reflector while overrideMaterial is set change the bridge view?
  window.__debug.look(...cams.bridge);
  window.__post.enabled = true;
  paint();
  const before = grabRaw();
  water.onBeforeRender = function (r, s, c) {
    if (s.overrideMaterial) return;
    return orig.apply(this, arguments);
  };
  paint();
  paint();
  const after = grabRaw();
  let diffN = 0, dminX = before.W, dminY = before.H, dmaxX = -1, dmaxY = -1;
  const st = 3;
  for (let y = 0; y < before.H; y += st) {
    for (let x = 0; x < before.W; x += st) {
      const i = (y * before.W + x) * 4;
      const d = Math.abs(before.px[i] - after.px[i]) + Math.abs(before.px[i + 1] - after.px[i + 1]) + Math.abs(before.px[i + 2] - after.px[i + 2]);
      if (d > 24) {
        diffN++;
        const top = before.H - 1 - y;
        if (x < dminX) dminX = x;
        if (top < dminY) dminY = top;
        if (x > dmaxX) dmaxX = x;
        if (top > dmaxY) dmaxY = top;
      }
    }
  }

  // second reflection read after the patched paints
  const buf2 = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf2);
  let r2 = 0, g2 = 0, b2 = 0, n2 = 0;
  for (let i = 0; i < buf2.length; i += 4 * step) {
    r2 += buf2[i]; g2 += buf2[i + 1]; b2 += buf2[i + 2]; n2++;
  }

  return {
    refl,
    reflAfterSkip: { mean: [+(r2 / n2).toFixed(1), +(g2 / n2).toFixed(1), +(b2 / n2).toFixed(1)] },
    aoDiff: { n: diffN, box: diffN ? [dminX, dminY, dmaxX, dmaxY] : null },
    suspects: suspects.slice(0, 40),
    shots: Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, { grayN: v.grayN, box: v.box, W: v.W, H: v.H }])),
    urls: Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, v.url])),
    bootErr: window.__bootErr || null,
  };
});

for (const [k, url] of Object.entries(result.urls || {})) {
  const b64 = url.split(",")[1];
  fs.writeFileSync(`${outDir}/probe-${k}.jpg`, Buffer.from(b64, "base64"));
}
delete result.urls;
fs.writeFileSync(`${outDir}/probe.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ errors, boot: result.bootErr, refl: result.refl, reflAfter: result.reflAfterSkip, aoDiff: result.aoDiff, shots: result.shots, suspects: result.suspects }, null, 1));
await browser.close();
