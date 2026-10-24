import { chromium } from "playwright";
import fs from "fs";

const out = "/workspace/screenshots/gray-gate";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high&pick=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const b = await page.evaluate(() => !!(window.__paint && window.__gateGuards && window.__gateGuards.ready && window.__reeds && window.__city && window.__city.spots));
  if (b) break;
  await page.waitForTimeout(400);
}
console.log("boot", Math.round((Date.now() - t0) / 1000) + "s", "errs", errs);

const census = await page.evaluate(() => {
  const THREE = window.__scene.constructor.prototype ? null : null;
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  const rows = [];
  const v3 = (x) => ({ x: +x.x.toFixed(1), y: +x.y.toFixed(1), z: +(-x.z).toFixed(1) });
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const mat = o.material;
    const mats = Array.isArray(mat) ? mat : [mat];
    const infoM = mats.filter(Boolean).map((m) => ({
      type: m.type,
      name: m.name || "",
      trans: !!m.transparent,
      dw: m.depthWrite,
      dt: m.depthTest,
      side: m.side,
      alphaTest: m.alphaTest || 0,
      color: m.color ? m.color.getHexString() : "",
      map: !!(m.map && m.map.image),
      key: m.customProgramCacheKey ? m.customProgramCacheKey() : "",
    }));
    if (o.isInstancedMesh) {
      const m4 = new o.matrixWorld.constructor();
      const p = new o.position.constructor();
      const q = new o.quaternion.constructor();
      const s = new o.scale.constructor();
      let maxS = 0;
      const near = [];
      let nan = 0;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        m4.decompose(p, q, s);
        if (!isFinite(s.x) || !isFinite(s.y) || !isFinite(p.x)) { nan++; continue; }
        const sm = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
        if (sm > maxS) maxS = sm;
        p.applyMatrix4(o.matrixWorld);
        const specZ = -p.z;
        if (p.x > 80 && p.x < 180 && specZ > -100 && specZ < 25 && sm > 0.8) {
          if (near.length < 8) near.push({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +specZ.toFixed(1), sx: +s.x.toFixed(2), sy: +s.y.toFixed(2), sz: +s.z.toFixed(2) });
        }
      }
      const interesting = near.length || maxS > 20 || nan || infoM.some((m) => m.trans || m.dw === false);
      if (interesting && (near.length || (o.name || "").match(/board|bill|flag|smoke|mist|reed|guard|gate|sprite|card|wflag/i) || maxS > 40)) {
        rows.push({ kind: "inst", name: o.name || g.type, n: o.count, maxS: +maxS.toFixed(2), nan, nearN: near.length, near, mat: infoM });
      }
    } else {
      const c = g.boundingBox.getCenter(new o.position.constructor()).applyMatrix4(o.matrixWorld);
      const sz = g.boundingBox.getSize(new o.position.constructor());
      const sx = Math.abs(sz.x * o.scale.x), sy = Math.abs(sz.y * o.scale.y), szz = Math.abs(sz.z * o.scale.z);
      const big = Math.max(sx, sy, szz);
      const specZ = -c.z;
      const near = c.x > 70 && c.x < 190 && specZ > -110 && specZ < 30;
      if ((near && big > 2) || big > 80 || infoM.some((m) => m.trans && near)) {
        rows.push({ kind: "mesh", name: o.name || g.type, big: +big.toFixed(1), sx: +sx.toFixed(1), sy: +sy.toFixed(1), sz: +szz.toFixed(1), at: v3(c), vis: o.visible, mat: infoM });
      }
    }
  });
  return { rows, guards: window.__gateGuards, reeds: window.__reeds && { clumps: window.__reeds.clumps, cards: window.__reeds.cards } };
});
fs.writeFileSync(out + "/census2.json", JSON.stringify(census, null, 1));
console.log("census rows", census.rows.length, "guards", JSON.stringify(census.guards && census.guards.guards));

async function shot(name, cam, hour, tweak) {
  const data = await page.evaluate(async ({ cam, hour, tweak }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    const hud = document.getElementById("hud");
    if (hud) hud.style.display = "none";
    window.__freeze = true;
    if (window.__hour) window.__hour(hour, true);
    if (tweak === "post0") window.__post.enabled = false;
    else if (window.__post) window.__post.enabled = true;
    window.__hideVeg = tweak === "veg0";
    const scene = window.__scene;
    const show = (pred, on) => scene.traverse((o) => { if (pred(o)) o.visible = on; });
    show((o) => o.name === "water" || o.name === "northWater", tweak !== "water0");
    show((o) => o.name === "guardGe" || o.name === "guardSword", tweak !== "guard0");
    if (tweak !== "veg0") {
      show((o) => /reed|bankGrass|bankStones|autumnTree|innerGrass|innerStone|hillTrees|grove|northReed|northGrass|northTree|cityTree|field/.test(o.name || ""), true);
    }
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint();
    window.__paint();
    const hits = [];
    for (const ny of [-0.35, 0, 0.35]) {
      for (const nx of [-0.45, 0, 0.45]) hits.push({ nx, ny, h: window.__hit(nx, ny) });
    }
    const gl = window.__camera ? null : null;
    return { url: document.querySelector("canvas").toDataURL("image/jpeg", 0.72), hits, cam: window.__cam && window.__cam() };
  }, { cam, hour, tweak });
  fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from(data.url.split(",")[1], "base64"));
  const brief = data.hits.map((h) => `${h.nx},${h.ny}:${(h.h[0] && (h.h[0].name + "@" + h.h[0].d)) || "-"}`).join(" ");
  console.log(name, brief);
}

const eye = [128, 5.2, -26, 128, 6.2, 2];
const ang = [110, 4.6, -20, 134, 5.2, 1];
const close = [128, 4.0, -10, 128, 5.2, 3];
await shot("eye-dusk", eye, "dusk", "");
await shot("eye-post0", eye, "dusk", "post0");
await shot("eye-veg0", eye, "dusk", "veg0");
await shot("eye-water0", eye, "dusk", "water0");
await shot("eye-guard0", eye, "dusk", "guard0");
await shot("ang-dusk", ang, "dusk", "");
await shot("close2-dusk", close, "dusk", "");
await shot("eye-night", eye, "night", "");
console.log("errs", errs);
await browser.close();
