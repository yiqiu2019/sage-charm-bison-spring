import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/gate-guards";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 500)));
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader/i.test(t) && !/favicon/i.test(t)) errs.push(m.type() + " " + t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let boot = null;
while (Date.now() - t0 < 160000) {
  boot = await page.evaluate(() => ({
    err: window.__bootErr || null,
    stage: window.__stage || null,
    guards: window.__gateGuards || null,
    paint: typeof window.__paint === "function",
  }));
  if (boot.err) break;
  if (boot.paint && boot.guards && boot.guards.ready) break;
  await page.waitForTimeout(1000);
}
console.log("boot", JSON.stringify(boot), Math.round((Date.now() - t0) / 1000) + "s");
fs.writeFileSync(outDir + "/boot.json", JSON.stringify({ boot, errs: errs.slice(0, 12) }, null, 2));
if (!boot || !boot.guards || !boot.guards.ready || boot.guards.err) {
  console.log("errs", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}

const info = await page.evaluate(() => {
  const THREE = window.__scene ? null : null;
  const rows = [];
  window.__scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name !== "guardGe" && o.parent && o.parent.name !== "guardGe" && o.parent.name !== "guardSword" && !(o.parent.parent && (o.parent.parent.name === "guardGe" || o.parent.parent.name === "guardSword"))) return;
  });
  const guards = [];
  for (const name of ["guardGe", "guardSword"]) {
    const root = window.__scene.getObjectByName(name);
    if (!root) { guards.push({ name, missing: true }); continue; }
    root.updateWorldMatrix(true, true);
    const box = new window.__camera.position.constructor(0, 0, 0);
    // use Box3 from three via geometry
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    const v = root.position.clone();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const pos = o.geometry.attributes.position;
      const q = o.matrixWorld;
      for (let i = 0; i < pos.count; i += 7) {
        v.fromBufferAttribute(pos, i).applyMatrix4(q);
        if (v.x < min[0]) min[0] = v.x;
        if (v.y < min[1]) min[1] = v.y;
        if (v.z < min[2]) min[2] = v.z;
        if (v.x > max[0]) max[0] = v.x;
        if (v.y > max[1]) max[1] = v.y;
        if (v.z > max[2]) max[2] = v.z;
      }
    });
    let matInfo = null;
    root.traverse((o) => {
      if (!o.isMesh || matInfo) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      matInfo = {
        type: m.type,
        side: m.side,
        shadowSide: m.shadowSide,
        spec: m.specularIntensity,
        metal: m.metalness,
        rough: m.roughness,
        aniso: m.map && m.map.anisotropy,
      };
    });
    guards.push({
      name,
      pos: root.position.toArray().map((n) => +n.toFixed(3)),
      yaw: +(root.rotation.y * 180 / Math.PI).toFixed(2),
      min: min.map((n) => +n.toFixed(3)),
      max: max.map((n) => +n.toFixed(3)),
      matInfo,
    });
  }
  return { meta: window.__gateGuards, guards };
});
console.log(JSON.stringify(info, null, 2));
fs.writeFileSync(outDir + "/info.json", JSON.stringify(info, null, 2));

async function shot(name, cam, hour) {
  const data = await page.evaluate(async ({ cam, hour }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    if (window.__hour) window.__hour(hour, true);
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    if (window.__tickGateGuards) window.__tickGateGuards(window.__camera);
    window.__paint();
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.84);
  }, { cam, hour });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name);
}

// B 段：船在湾心 (128,-40)，相机偏移 (10, 11.5, -18)，看向 (128, 10, -6)
await shot("dusk-b", [138, 11.7, -58, 128, 10, -6], "dusk");
// 木桥中间朝城门
await shot("dusk-bridge", [128, 5.1, -40, 128, 2.2, -2], "dusk");
// 近一点，仍在桥面上，用来看清是否发黑
await shot("dusk-close", [128, 4.6, -18, 128, 2.0, -2.5], "dusk");
await shot("night-close", [128, 4.6, -18, 128, 2.0, -2.5], "night");
await shot("night-bridge", [128, 5.1, -40, 128, 2.2, -2], "night");
// 单人正面/背面，确认朝向
await shot("ge-south", [120.3, 1.8, -7.2, 120.3, 1.6, -2.5], "dusk");
await shot("ge-north", [120.3, 2.4, 4.5, 120.3, 1.6, -2.5], "dusk");
await shot("sword-south", [135.7, 1.8, -7.2, 135.7, 1.6, -2.5], "dusk");

console.log("errs", errs.slice(0, 10));
await browser.close();
