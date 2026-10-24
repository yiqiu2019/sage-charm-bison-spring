import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/wall-w1";
fs.mkdirSync(outDir, { recursive: true });
const tag = process.argv[2] || "before";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const logs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN|THREE/i.test(t)) console.log("C", m.type(), t.slice(0, 500));
  else if (t.length < 180) console.log("C", m.type(), t);
});
page.on("pageerror", (e) => logs.push("PAGE: " + e.message));

const q = process.argv[3] || "";
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1" + q, { waitUntil: "domcontentloaded", timeout: 60000 });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 240000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    pct: document.querySelector("#loader .pct")?.textContent || "",
    err: window.__bootErr || null,
    debug: !!window.__debug,
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) { console.log(s.err); break; }
  if (s.done && s.debug) { ready = true; break; }
  await page.waitForTimeout(2500);
}
if (!ready) {
  console.log("NOT READY", logs.slice(0, 8).join("\n"));
  await browser.close();
  process.exit(1);
}
await page.click("#loader .enter");
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
});
await page.waitForTimeout(500);

const diag = await page.evaluate(() => {
  const resources = performance.getEntriesByType("resource")
    .filter((e) => /hangtu/.test(e.name))
    .map((e) => ({ name: e.name.split("/").pop(), size: e.transferSize || e.decodedBodySize || 0 }));
  const meshes = [];
  window.__scene.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    if (o.name !== "rammed" && !(o.material && o.material.userData && o.material.userData.kind === "wall")) return;
    const pos = o.geometry.attributes.position;
    const nrm = o.geometry.attributes.normal;
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    const sample = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
      if (sample.length < 4 && i % Math.ceil(pos.count / 4) === 0) sample.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)]);
    }
    function span(x0, x1, y0, y1) {
      let zLo = 1e9, zHi = -1e9, n = 0, ny = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        if (Math.abs(z) > 12) continue;
        zLo = Math.min(zLo, z); zHi = Math.max(zHi, z); n++;
        ny += Math.abs(nrm.getY(i));
      }
      return n ? { n, z0: +zLo.toFixed(3), z1: +zHi.toFixed(3), width: +(Math.abs(zHi - zLo)).toFixed(3), avgAbsNy: +(ny / n).toFixed(3) } : { n: 0 };
    }
    meshes.push({
      name: o.name,
      kind: o.material.userData && o.material.userData.kind,
      color: o.material.color && o.material.color.getHexString(),
      key: o.material.customProgramCacheKey ? o.material.customProgramCacheKey() : null,
      verts: pos.count,
      min: min.map((v) => +v.toFixed(2)),
      max: max.map((v) => +v.toFixed(2)),
      sample,
      base: span(160, 300, 0.75, 1.1),
      top: span(160, 300, 10.6, 11.05),
      mid: span(160, 300, 5.4, 6.4),
    });
  });
  return { resources, meshes };
});
console.log("DIAG", JSON.stringify(diag, null, 2));

await page.evaluate(() => { window.__freeze = true; });

async function shot(name, hour, setup) {
  const r = await page.evaluate(async ({ hour, setup }) => {
    window.__hour(hour, true);
    eval(setup);
    window.__paint();
    const canvas = document.querySelector("canvas");
    const c2 = document.createElement("canvas");
    c2.width = canvas.width;
    c2.height = canvas.height;
    const ctx = c2.getContext("2d");
    ctx.drawImage(canvas, 0, 0);
    // sample a few points that should land on the wall for the known cameras
    const samples = [];
    const pts = [[0.5, 0.55], [0.42, 0.48], [0.62, 0.62], [0.35, 0.7], [0.7, 0.4]];
    for (const [u, v] of pts) {
      const x = Math.floor(u * c2.width), y = Math.floor(v * c2.height);
      const px = ctx.getImageData(x, y, 1, 1).data;
      samples.push({ u, v, rgb: [px[0], px[1], px[2]] });
    }
    const url = c2.toDataURL("image/jpeg", 0.86);
    return { samples, url, w: c2.width, h: c2.height };
  }, { hour, setup });
  const buf = Buffer.from(r.url.split(",")[1], "base64");
  fs.writeFileSync(`${outDir}/${tag}-${name}.jpg`, buf);
  console.log("saved", name, buf.length, JSON.stringify(r.samples));
}

await shot("que-east", "dusk", `window.__debug.pose(168,-30,0); window.__debug.look(172, 4.6, -20, 156, 7.2, 0);`);
await shot("long-east", "dusk", `window.__debug.pose(80,-28,0); window.__debug.look(28, 6.2, -26, 220, 6.5, -2);`);
if (tag !== "before") {
  await shot("long-nudge", "dusk", `window.__debug.look(28, 6.55, -26, 220, 6.85, -2);`);
}
await shot("lit-west", "dusk", `window.__debug.look(-16, 4.2, 80, 2, 6.0, 80);`);
await shot("shade-east", "dusk", `window.__debug.look(372, 4.2, 80, 348, 6.0, 80);`);
if (tag !== "before") {
  await shot("macro", "dusk", `window.__debug.pose(200,-20,0); window.__debug.look(210, 3.6, -8, 210, 5.4, 2);`);
  await shot("macro-mist", "mist", `window.__debug.look(210, 3.6, -8, 210, 5.4, 2);`);
  await shot("macro-night", "night", `window.__debug.look(210, 3.6, -8, 210, 5.4, 2);`);
}
const bench = await page.evaluate(async () => {
  window.__hour("dusk", true);
  window.__debug.look(28, 6.2, -26, 220, 6.5, -2);
  return window.__debug.bench(20);
});
console.log("bench", JSON.stringify(bench));
console.log("errors", logs.slice(0, 8).join(" | "));
await browser.close();
