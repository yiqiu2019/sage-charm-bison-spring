import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/gray-gate";
fs.mkdirSync(outDir, { recursive: true });

const cams = [
  ["front", [128, 3.4, -18, 128, 6.2, 4]],
  ["bridge", [128, 4.6, -42, 128, 7.5, 2]],
  ["offset", [112, 3.8, -24, 130, 6, 2]],
  ["inside", [128, 3.2, 18, 128, 4.5, -2]],
  ["b", [138, 11.7, -58, 128, 10, -6]],
];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 400)));
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader/i.test(t) && !/favicon/i.test(t)) errs.push(m.type() + " " + t.slice(0, 240));
});

const url = process.argv[2] || "http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high&pick=1";
await page.goto(url, { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let boot = null;
while (Date.now() - t0 < 100000) {
  boot = await page.evaluate(() => ({
    err: window.__bootErr || null,
    paint: typeof window.__paint === "function",
    guards: window.__gateGuards || null,
  }));
  if (boot.err) break;
  if (boot.paint && boot.guards && boot.guards.ready) break;
  await page.waitForTimeout(400);
}
console.log("boot", JSON.stringify(boot), Math.round((Date.now() - t0) / 1000) + "s");
if (!boot || !boot.paint) {
  console.log("errs", errs.slice(0, 10));
  await browser.close();
  process.exit(1);
}

async function shot(name) {
  const data = await page.evaluate(async () => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    window.__paint();
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.8);
  });
  const file = `${outDir}/${name}.jpg`;
  fs.writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name);
  return file;
}

await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  if (window.__hour) window.__hour("dusk", true);
});

for (const [name, cam] of cams) {
  const info = await page.evaluate(async (cam) => {
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint();
    const hits = {};
    const grid = [-0.7, -0.35, 0, 0.35, 0.7];
    for (const y of grid) for (const x of grid) {
      const hs = window.__hit(x, y) || [];
      for (const h of hs) {
        const k = h.name + "|" + (h.color || "");
        hits[k] = (hits[k] || 0) + 1;
      }
    }
    return { hits, pick: typeof window.__pickAt };
  }, cam);
  console.log("hits", name, JSON.stringify(info.hits));
  await shot("dusk-" + name);
}

const census = await page.evaluate(() => {
  const THREE = window.THREE || null;
  const scene = window.__scene;
  const rows = [];
  const near = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!(o.isMesh || o.isSprite || o.isPoints)) return;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    const mat = mats[0];
    const flags = {
      name: o.name || "",
      type: o.type,
      sprite: !!o.isSprite,
      trans: !!(mat && mat.transparent),
      opacity: mat && mat.opacity != null ? +mat.opacity.toFixed(2) : null,
      depthWrite: mat ? mat.depthWrite !== false : null,
      alphaTest: mat && mat.alphaTest ? mat.alphaTest : 0,
      side: mat ? mat.side : null,
      geo: o.geometry ? o.geometry.type : "",
      count: o.isInstancedMesh ? o.count : 1,
      visible: o.visible,
    };
    const interesting = flags.sprite || flags.trans || flags.alphaTest > 0 || flags.geo === "PlaneGeometry"
      || /board|smoke|mist|card|reed|guard|pushou|flag|cloud|sprite|bill/i.test(flags.name);
    if (!interesting) return;
    rows.push(flags);
    if (!o.isInstancedMesh || !o.instanceMatrix || o.count < 1) {
      const p = o.getWorldPosition(new (o.position.constructor)());
      if (p.x > 90 && p.x < 170 && p.z > -30 && p.z < 100) {
        near.push({ ...flags, x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), specZ: +(-p.z).toFixed(1) });
      }
      return;
    }
    const e = o.instanceMatrix.array;
    const n = Math.min(o.count, o.instanceMatrix.count || o.count);
    let hit = 0;
    const samples = [];
    for (let i = 0; i < n; i++) {
      const x = e[i * 16 + 12];
      const y = e[i * 16 + 13];
      const z = e[i * 16 + 14];
      const sx = Math.hypot(e[i * 16], e[i * 16 + 1], e[i * 16 + 2]);
      const sy = Math.hypot(e[i * 16 + 4], e[i * 16 + 5], e[i * 16 + 6]);
      if (x > 90 && x < 170 && z > -20 && z < 110) {
        hit++;
        if (samples.length < 8) samples.push({ i, x: +x.toFixed(1), y: +y.toFixed(1), specZ: +(-z).toFixed(1), sx: +sx.toFixed(2), sy: +sy.toFixed(2) });
      }
    }
    if (hit) near.push({ ...flags, nearCount: hit, samples });
  });
  return { rows: rows.slice(0, 80), near, big: window.__big ? window.__big() : [] };
});
fs.writeFileSync(`${outDir}/census.json`, JSON.stringify(census, null, 2));
console.log("near", JSON.stringify(census.near, null, 2).slice(0, 4000));
console.log("big", JSON.stringify(census.big).slice(0, 2000));
console.log("errs", errs.slice(0, 8));
await browser.close();
