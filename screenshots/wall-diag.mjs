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
page.on("console", (m) => console.log("C", m.type(), m.text().slice(0, 180)));
page.on("pageerror", (e) => logs.push("PAGE: " + e.message));

await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded", timeout: 60000 });
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
  await page.waitForTimeout(3000);
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
await page.waitForTimeout(400);

const geom = await page.evaluate(() => {
  let mesh = null;
  window.__scene.traverse((o) => { if (o.name === "rammed") mesh = o; });
  const pos = mesh.geometry.attributes.position;
  const sample = [];
  for (let i = 0; i < pos.count && sample.length < 8; i += Math.floor(pos.count / 8)) {
    sample.push([+pos.getX(i).toFixed(1), +pos.getY(i).toFixed(2), +pos.getZ(i).toFixed(1)]);
  }
  let zHi = -1e9, zLo = 1e9, yHi = -1e9, yLo = 1e9;
  let nSouth = 0, southZ = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    yHi = Math.max(yHi, y); yLo = Math.min(yLo, y);
    zHi = Math.max(zHi, z); zLo = Math.min(zLo, z);
    if (x > 170 && x < 200 && y < 1.2) { nSouth++; if (southZ.length < 6) southZ.push(+z.toFixed(2)); }
  }
  return {
    kind: mesh.material.userData.kind,
    color: mesh.material.color.getHexString(),
    n: pos.count,
    y: [+yLo.toFixed(2), +yHi.toFixed(2)],
    z: [+zLo.toFixed(1), +zHi.toFixed(1)],
    sample, nSouth, shoreZ: southZ,
  };
});
console.log("geom", JSON.stringify(geom));

await page.evaluate(() => { window.__freeze = true; console.log("frozen"); });
page.setDefaultTimeout(20000);

async function shot(name, hour, setup) {
  const r = await page.evaluate(({ hour, setup }) => {
    window.__hour(hour, true);
    eval(setup);
    window.__paint();
    const canvas = document.querySelector("canvas");
    const c2 = document.createElement("canvas");
    c2.width = 960;
    c2.height = 540;
    const ctx = c2.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 960, 540);
    const px = ctx.getImageData(480, 260, 1, 1).data;
    const url = c2.toDataURL("image/jpeg", 0.8);
    return { mid: [px[0], px[1], px[2]], url };
  }, { hour, setup });
  const buf = Buffer.from(r.url.split(",")[1], "base64");
  fs.writeFileSync(`${outDir}/${tag}-${name}.jpg`, buf);
  console.log("saved", name, buf.length, r.mid.join(","));
}

await shot("que-east", "dusk", `window.__debug.pose(168,-30,0); window.__debug.look(172, 4.6, -20, 156, 7.2, 0);`);
await shot("long-east", "dusk", `window.__debug.pose(80,-28,0); window.__debug.look(28, 6.2, -26, 220, 6.5, -2);`);
await shot("macro", "dusk", `window.__debug.pose(200,-20,0); window.__debug.look(210, 3.6, -8, 210, 5.4, 2);`);
if (tag !== "before") {
  await shot("macro-mist", "mist", `window.__debug.look(210, 3.6, -8, 210, 5.4, 2);`);
  await shot("macro-night", "night", `window.__debug.look(210, 3.6, -8, 210, 5.4, 2);`);
}
await shot("lit-west", "dusk", `window.__debug.look(-16, 4.2, 80, 2, 6.0, 80);`);
await shot("shade-east", "dusk", `window.__debug.look(372, 4.2, 80, 348, 6.0, 80);`);
const bench = await page.evaluate(async () => {
  window.__hour("dusk", true);
  window.__debug.look(28, 6.2, -26, 220, 6.5, -2);
  return window.__debug.bench(16);
});
console.log("bench", JSON.stringify(bench));
console.log("errors", logs.slice(0, 6).join(" | "));
await browser.close();
