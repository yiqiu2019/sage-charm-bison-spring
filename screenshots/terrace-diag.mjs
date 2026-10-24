import { chromium } from "playwright";
import fs from "fs";
const out = "/workspace/screenshots/terrace-c2";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on("console", (m) => { const t = m.text(); if (/error|Error|shader|NaN|terrace/i.test(t)) errs.push(m.type()+" "+t.slice(0,400)); });
page.on("pageerror", (e) => errs.push("PAGE "+String(e).slice(0,500)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now()-t0 < 90000) {
  const s = await page.evaluate(() => ({ d: !!window.__debug, e: window.__bootErr||null, t: !!window.__terraceReady }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now()-t0)/1000)+"s");
  if (s.e) { console.log("ERR", s.e); break; }
  if (s.d && s.t) break;
  await page.waitForTimeout(1200);
}
const info = await page.evaluate(() => {
  const L = document.getElementById("loader"); if (L) L.style.display = "none";
  window.__freeze = true;
  window.__hour && window.__hour("dusk", true);
  const root = window.__scene.getObjectByName("terraceC2");
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const bb = g.boundingBox || (g.computeBoundingBox(), g.boundingBox);
    meshes.push({
      name: o.name, count: o.count ?? null, visible: o.visible, culled: o.frustumCulled,
      verts: g.attributes.position ? g.attributes.position.count : 0,
      bb: bb ? [bb.min.toArray().map(n=>+n.toFixed(1)), bb.max.toArray().map(n=>+n.toFixed(1))] : null,
    });
  });
  window.__debug.look(48, 22, 8, 48, 14, 30);
  window.__paint();
  window.__debug.look(188, 28, 8, 188, 16, 40);
  window.__paint();
  const t = window.__terrace;
  return {
    meshes,
    rows: t && t.rows,
    galleries: t && t.galleries,
    sizes: t && t.sizes,
    braziers: t && t.braziers,
    flags: t && t.flags,
    cityV: window.__city && window.__city.violations,
  };
});
fs.writeFileSync(out+"/diag.json", JSON.stringify({ info, errs }, null, 2));
const shot = async (name, look) => {
  const data = await page.evaluate((look) => {
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.8);
  }, look);
  fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name);
};
await shot("inside-dian", [48, 22, 8, 48, 12, 28]);
await shot("inside-lou", [188, 30, 10, 188, 16, 40]);
await shot("above-west", [20, 40, 90, 36, 14, 90]);
console.log(JSON.stringify({
  names: info.meshes.map(m => m.name+":"+m.count+" v"+m.verts),
  sizes: info.sizes,
  galleries: info.galleries,
  cityV: info.cityV,
  errs: errs.slice(0, 6),
}, null, 2).slice(0, 3500));
await browser.close();
