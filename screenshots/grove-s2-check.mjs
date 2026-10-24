import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/grove-s2";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN/i.test(t)) errs.push(m.type() + " " + t.slice(0, 300));
});
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 400)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 170000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
    trees: !!(window.__trees && window.__trees.count),
    meshes: window.__grove && window.__grove.modelMeshes,
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.trees && s.meshes) { ready = true; break; }
  await page.waitForTimeout(2000);
}
if (!ready) {
  console.log("NOT READY", errs.slice(0, 6));
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  window.__hour && window.__hour("dusk", true);
});

async function shot(name, look) {
  const data = await page.evaluate((look) => {
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.84);
  }, look);
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name, data.length);
}

await shot("air-steep", [150, 400, -520, 150, 2, -400]);
await shot("air-south", [160, 210, -730, 145, 6, -420]);

const bench = await page.evaluate(async () => {
  const treeStat = () => {
    const rows = [];
    window.__scene.traverse((o) => {
      if (!o.name || o.name.indexOf("grove") !== 0) return;
      const g = o.geometry;
      const vc = g && (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0));
      const n = o.isInstancedMesh ? o.count : 1;
      rows.push({
        name: o.name,
        n,
        vis: o.visible,
        culled: o.frustumCulled,
        tris: Math.round(n * (vc || 0) / 3),
      });
    });
    return rows;
  };
  const detach = () => {
    const held = [];
    window.__scene.traverse((o) => {
      if (o.name && o.name.indexOf("grove") === 0 && o.parent) held.push({ o, p: o.parent });
    });
    for (const h of held) h.p.remove(h.o);
    return held;
  };
  window.__debug.look(128, 6.2, -40, 128, 2.2, -520);
  window.__paint();
  const moatTrees = treeStat();
  const moatAfter = await window.__debug.bench(12);
  window.__debug.look(128, 3.2, -230, 128, 2.0, -560);
  window.__paint();
  const aveTrees = treeStat();
  const aveAfter = await window.__debug.bench(12);
  const held = detach();
  window.__debug.look(128, 6.2, -40, 128, 2.2, -520);
  window.__paint();
  const moatBefore = await window.__debug.bench(12);
  window.__debug.look(128, 3.2, -230, 128, 2.0, -560);
  window.__paint();
  const aveBefore = await window.__debug.bench(12);
  for (const h of held) h.p.add(h.o);
  const sum = (rows, name) => rows.filter((r) => r.name === name).reduce((a, r) => a + r.tris, 0);
  return {
    moatAfter, aveAfter, moatBefore, aveBefore,
    moatModelTris: sum(moatTrees, "groveTree"),
    aveModelTris: sum(aveTrees, "groveTree"),
    moatBoardTris: sum(moatTrees, "groveBoard"),
    aveBoardTris: sum(aveTrees, "groveBoard"),
    wallTris: sum(aveTrees, "groveWall"),
    aveTrees,
    shown: window.__grove && window.__grove.shown,
    nearD: window.__grove && window.__grove.nearD,
    draws: window.__grove && window.__grove.draws,
  };
});
fs.writeFileSync(outDir + "/final-bench2.json", JSON.stringify(bench, null, 2));
fs.writeFileSync(outDir + "/final-errs2.json", JSON.stringify(errs.slice(0, 20), null, 2));
console.log(JSON.stringify(bench, null, 2).slice(0, 4000));
await browser.close();
