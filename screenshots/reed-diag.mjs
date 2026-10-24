import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/reed-diag";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 400)));
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader/i.test(t)) errs.push(m.type() + " " + t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 180000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    err: window.__bootErr || null,
    north: window.__north ? { reeds: window.__north.reeds, grass: window.__north.grass, shrubs: window.__north.shrubs } : null,
    ready: !!window.__northReady,
    bank: window.__reeds ? { clumps: window.__reeds.clumps, cards: window.__reeds.cards } : null,
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.ready) { ready = true; break; }
  await page.waitForTimeout(2000);
}
if (!ready) {
  console.log("NOT READY", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}

async function shot(name, paint) {
  const data = await page.evaluate(async (paint) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    window.__hour("dusk", true);
    window.__debug.look(200, 6.4, 400, 210, 2.2, 560);
    if (paint) (0, eval)(paint);
    window.__paint();
    const bench = await window.__debug.bench(6);
    const url = document.querySelector("canvas").toDataURL("image/jpeg", 0.8);
    return { url, bench };
  }, paint || "");
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.url.split(",")[1], "base64"));
  console.log(name, JSON.stringify(data.bench));
}

await shot("before", "");
await shot("tint", `
  const THREE = window.__THREE || null;
  const mats = new Map();
  function basic(hex) {
    if (!mats.has(hex)) mats.set(hex, new (Object.getPrototypeOf(window.__scene).constructor ? window.THREE : window.THREE).MeshBasicMaterial({ color: hex, side: 2 }));
    return mats.get(hex);
  }
`);
// do tint properly inside evaluate without relying on window.THREE
const tinted = await page.evaluate(async () => {
  const colors = {
    northReed: 0xff0000,
    northGrass: 0x00ff00,
    northTree: 0x0000ff,
    reed: 0xffff00,
    reedGlb: 0xff00ff,
  };
  const counts = {};
  window.__scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || "";
    const hex = colors[n];
    if (hex == null) return;
    counts[n] = (counts[n] || 0) + (o.count || 1);
    const mat = o.material;
    if (mat) {
      mat.userData = mat.userData || {};
      mat.userData._was = { color: mat.color ? mat.color.getHex() : null, emissive: mat.emissive ? mat.emissive.getHex() : null, ei: mat.emissiveIntensity };
      if (mat.emissive) { mat.emissive.setHex(hex); mat.emissiveIntensity = 1.2; }
      if (mat.color) mat.color.setHex(hex);
      mat.needsUpdate = true;
    }
  });
  window.__hour("dusk", true);
  window.__debug.look(200, 6.4, 400, 210, 2.2, 560);
  window.__paint();
  const url = document.querySelector("canvas").toDataURL("image/jpeg", 0.8);
  const bench = await window.__debug.bench(8);
  return { url, counts, bench };
});
fs.writeFileSync(outDir + "/emissive.jpg", Buffer.from(tinted.url.split(",")[1], "base64"));
console.log("emissive counts", JSON.stringify(tinted.counts), JSON.stringify(tinted.bench));
fs.writeFileSync(outDir + "/errs.json", JSON.stringify(errs, null, 2));
await browser.close();
