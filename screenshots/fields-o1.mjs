import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/screenshots/fields-o1";
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
  if (/error|Error|shader/i.test(t) && !/favicon/i.test(t)) errs.push(m.type() + " " + t.slice(0, 280));
});
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let boot = null;
while (Date.now() - t0 < 150000) {
  boot = await page.evaluate(() => ({
    err: window.__bootErr || window.__fieldErr || null,
    stage: window.__stage || null,
    fields: window.__fields || null,
  }));
  if (boot.err) break;
  if (boot.fields && boot.fields.ready) break;
  await page.waitForTimeout(1000);
}
console.log("boot", JSON.stringify(boot), Math.round((Date.now() - t0) / 1000) + "s");
if (!boot || !boot.fields || !boot.fields.ready) {
  console.log("errs", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}

const mask = await page.evaluate(() => {
  const tex = window.__fieldMaskTex;
  const geo = window.__fieldGeo;
  if (!tex || !tex.image) return null;
  const src = tex.image.data || tex.image;
  const N = tex.image.width || Math.round(Math.sqrt(src.length / 4));
  const S = 720;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const img = g.createImageData(S, S);
  const col = {
    0: [28, 36, 34],
    64: [122, 108, 86],
    128: [196, 164, 110],
    180: [92, 74, 52],
    230: [150, 132, 108],
    255: [168, 150, 104],
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c0 = Math.min(N - 1, Math.floor(x / S * N));
      const r0 = Math.min(N - 1, Math.floor((S - 1 - y) / S * N));
      const cls = src[(r0 * N + c0) * 4];
      const rgb = col[cls] || [80, 70, 60];
      const i = (y * S + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.font = "16px sans-serif";
  g.fillStyle = "#f4efe4";
  const label = (txt, x, y) => { g.fillText(txt, x, y); };
  label("城外田野遮罩  黄=田  褐=菜畦  浅=土路  灰=留白", 16, 24);
  return { url: c.toDataURL("image/jpeg", 0.85), geo, n: N };
});
if (mask) fs.writeFileSync(outDir + "/regions.jpg", Buffer.from(mask.url.split(",")[1], "base64"));

async function shot(name, cam, hour) {
  const data = await page.evaluate(async ({ cam, hour, name }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    if (window.__hour) window.__hour(hour, true);
    const fog = window.__scene && window.__scene.fog;
    const prev = fog ? fog.far : null;
    if (name === "air" && fog) fog.far = 1600;
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint();
    window.__paint();
    const url = document.querySelector("canvas").toDataURL("image/jpeg", 0.82);
    if (fog && prev != null) fog.far = prev;
    return url;
  }, { cam, hour, name });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log("shot", name);
}

const shots = [
  ["dusk-east", [392, 9, 90, 560, 3, 80], "dusk"],
  ["dusk-north", [200, 11, 392, 210, 3, 620], "dusk"],
  ["dusk-ne", [360, 14, 400, 620, 4, 680], "dusk"],
  ["dusk-nw", [20, 16, 470, -220, 3, 340], "dusk"],
  ["dusk-west", [-20, 10, 130, -420, 6, 150], "dusk"],
  ["dusk-south", [128, 9, -46, 140, 3, -360], "dusk"],
  ["dusk-yard", [430, 8, 60, 510, 2, 60], "dusk"],
  ["mist-east", [392, 9, 90, 560, 3, 80], "mist"],
  ["night-east", [392, 9, 90, 560, 3, 80], "night"],
  ["air", [175, 520, 40, 175, 0, 190], "dusk"],
];
for (const [name, cam, hour] of shots) await shot(name, cam, hour);

const bench = await page.evaluate(async () => {
  window.__debug.look(392, 9, 90, 560, 3, 80);
  if (window.__hour) window.__hour("dusk", true);
  const b = await window.__debug.bench(30);
  const names = {};
  window.__scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const n = o.name || o.type;
    if (/field|westRoad|outerGround/i.test(n)) names[n] = (names[n] || 0) + 1;
  });
  return { bench: b, fields: window.__fields, names, err: window.__fieldErr || window.__bootErr || null };
});
fs.writeFileSync(outDir + "/bench.json", JSON.stringify({ bench, errs: errs.slice(0, 12) }, null, 2));
console.log(JSON.stringify(bench, null, 2));
await browser.close();
