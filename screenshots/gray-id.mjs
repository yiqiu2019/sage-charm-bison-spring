import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 240)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 45000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__gateGuards && window.__gateGuards.ready));
  if (ok) break;
  await page.waitForTimeout(300);
}
const info = await page.evaluate(async () => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  const hud = document.getElementById("hud");
  if (hud) hud.style.display = "none";
  window.__freeze = true;
  window.__hour("dusk", true);
  window.__debug.look(128, 5.4, -32, 128, 7.2, 2);
  if (window.__tickGateGuards) window.__tickGateGuards(window.__camera);
  if (window.__tickCity) window.__tickCity(window.__camera);
  const scene = window.__scene;
  const odd = [];
  scene.traverse((o) => {
    if (!o.isMesh && !o.isSprite && !o.isPoints) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      const oddMat = m.transparent || m.depthTest === false || m.depthWrite === false || o.isSprite || (m.opacity != null && m.opacity < 0.98);
      if (!oddMat) continue;
      const p = o.getWorldPosition(o.position.clone());
      odd.push({
        name: o.name || o.type,
        type: o.type,
        vis: o.visible,
        order: o.renderOrder,
        x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1),
        mat: m.type, tr: !!m.transparent, op: m.opacity, dw: m.depthWrite, dt: m.depthTest,
        side: m.side, color: m.color ? "#" + m.color.getHexString() : "",
        count: o.count,
      });
    }
  });
  // also backdrop
  const back = [];
  if (window.__backdrop) back.push("has");
  const bd = scene.parent; // not it
  const backdropOdd = [];
  const rootScenes = [];
  // find backdrop via sky parent
  let sky = null;
  scene.traverse((o) => { if (o.name === "sky") sky = o; });
  // sky was moved
  function walk(sc, tag) {
    if (!sc || !sc.traverse) return;
    sc.traverse((o) => {
      if (o === sc) return;
      if (!o.isMesh) return;
      const m = o.material;
      if (!m || Array.isArray(m)) return;
      if (m.transparent || m.depthTest === false) {
        const p = o.getWorldPosition(o.position.clone());
        backdropOdd.push({ tag, name: o.name || o.type, vis: o.visible, order: o.renderOrder, x: +p.x.toFixed(0), y: +p.y.toFixed(0), z: +p.z.toFixed(0), tr: !!m.transparent, dt: m.depthTest, op: m.opacity });
      }
    });
  }
  // locate sky by searching renderer... use window hooks
  window.__paint();
  const hits = [];
  for (let ny = 0.55; ny <= 0.95; ny += 0.1) {
    for (let nx = -0.4; nx <= 0.4; nx += 0.2) {
      hits.push({ nx, ny, h: window.__hit(nx, ny) });
    }
  }
  const canvas = document.querySelector("canvas");
  const url = canvas.toDataURL("image/jpeg", 0.6);
  return { odd, backdropOdd, hits, boot: window.__bootErr || null, url, stage: window.__stage };
});
const b64 = info.url.split(",")[1];
fs.writeFileSync("/workspace/screenshots/gray-gate/id-front.jpg", Buffer.from(b64, "base64"));
delete info.url;
fs.writeFileSync("/workspace/screenshots/gray-gate/id.json", JSON.stringify({ errors, info }, null, 2));
console.log(JSON.stringify({ errors, boot: info.boot, stage: info.stage, oddN: info.odd.length, odd: info.odd.slice(0, 40), back: info.backdropOdd.slice(0, 20), hits: info.hits }, null, 2).slice(0, 8000));
await browser.close();
