import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/city-c1";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 90000) {
  const s = await page.evaluate(() => ({ debug: !!window.__debug, ready: !!window.__cityReady, err: window.__bootErr || null }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.debug && s.ready) { ready = true; break; }
  await page.waitForTimeout(1500);
}
if (!ready) { console.log("NOT READY"); await browser.close(); process.exit(1); }

async function grab(name, look, fov) {
  const info = await page.evaluate(({ look, fov }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    window.__hideVeg = false;
    if (window.__hour) window.__hour("dusk", true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    const cam = window.__camera;
    cam.fov = fov;
    cam.far = 2500;
    cam.updateProjectionMatrix();
    const fog = window.__scene.fog;
    if (fog) { fog.near = 280; fog.far = 2600; }
    window.__scene.traverse((o) => {
      const u = o.material && o.material.uniforms;
      if (!u) return;
      if (u.uFogFar) u.uFogFar.value = 2600;
      if (u.uFogNear) u.uFogNear.value = 280;
    });
    window.__paint();
    const meshes = [];
    window.__scene.traverse((o) => {
      if (o.name !== "cityTree" || !o.visible || !o.count) return;
      const s = o.boundingSphere;
      meshes.push({ n: o.count, lv: o.material && o.material.customProgramCacheKey && o.material.customProgramCacheKey(), r: s ? +s.radius.toFixed(1) : null });
    });
    return { meshes, url: document.querySelector("canvas").toDataURL("image/jpeg", 0.86) };
  }, { look, fov });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(info.url.split(",")[1], "base64"));
  console.log(name, JSON.stringify(info.meshes));
}

// High oblique: west city in the foreground, east and north still in frame.
await grab("air", [-30, 118, -70, 190, 6, 200], 58);
await browser.close();
