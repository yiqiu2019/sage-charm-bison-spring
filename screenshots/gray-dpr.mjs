import { chromium } from "playwright";
import fs from "fs";
const OUT = "/workspace/screenshots/gray-gate";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 636 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(60000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 50000) {
  const ok = await page.evaluate(() => !!(window.__paint && window.__debug && window.__cityReady));
  if (ok) break;
  await page.waitForTimeout(400);
}
await page.evaluate(() => {
  const L = document.getElementById("loader"); if (L) L.style.display = "none";
  const hud = document.getElementById("hud"); if (hud) hud.style.display = "none";
  window.dispatchEvent(new Event("embark"));
  window.__hour("dusk", true);
  window.__debug.look(128, 4.2, -22, 128, 6.5, 2);
});
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  window.__paint(); window.__paint();
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl2");
  const size = { w: canvas.width, h: canvas.height, css: [canvas.clientWidth, canvas.clientHeight] };
  const vp = gl.getParameter(gl.VIEWPORT);
  const sc = gl.getParameter(gl.SCISSOR_BOX);
  const st = gl.getParameter(gl.SCISSOR_TEST);
  // nearest camera-facing-ish instances
  const gate = window.__camera.position;
  const hits = [];
  window.__scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const n = o.count || 0;
    let best = null;
    for (let i = 0; i < n; i++) {
      const e = o.instanceMatrix.array;
      const x = e[i * 16 + 12], y = e[i * 16 + 13], z = e[i * 16 + 14];
      const sy = Math.hypot(e[i * 16 + 4], e[i * 16 + 5], e[i * 16 + 6]);
      const d = Math.hypot(x - gate.x, y - gate.y, z - gate.z);
      if (!best || d < best.d) best = { d, x, y, z, sy, i };
    }
    if (best) hits.push({ name: o.name || "?", n, d: +best.d.toFixed(1), sy: +best.sy.toFixed(2), x: +best.x.toFixed(1), y: +best.y.toFixed(1), z: +best.z.toFixed(1) });
  });
  hits.sort((a, b) => a.d - b.d);
  const url = document.querySelector("canvas").toDataURL("image/jpeg", 0.55);
  return { size, vp: [...vp], sc: [...sc], st, hits: hits.slice(0, 25), url };
});
fs.writeFileSync(OUT + "/dpr2-bridge.jpg", Buffer.from(info.url.split(",")[1], "base64"));
delete info.url;
fs.writeFileSync(OUT + "/dpr2-info.json", JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
await browser.close();
