import { chromium } from "playwright";

const exe = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const url = process.argv[2];
const tag = process.argv[3] || "t";

const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-gpu-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.setDefaultTimeout(180000);
page.on("console", (m) => { if (m.type() === "error") console.log("ERR", m.text().slice(0, 250)); });
page.on("pageerror", (e) => console.log("PE", e.message.slice(0, 300)));
page.on("crash", () => console.log("CRASH"));
page.on("framenavigated", (f) => console.log("NAV", f.url()));
console.log("goto", url);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
const t0 = Date.now();
for (let i = 0; i < 80; i++) {
  const st = await page.evaluate(() => document.querySelector("#loader")?.className || "");
  if (i % 4 === 0) console.log("t", ((Date.now() - t0) / 1000).toFixed(0), st);
  if (String(st).includes("done")) break;
  await page.waitForTimeout(1500);
}
console.log("ready", ((Date.now() - t0) / 1000).toFixed(1));

const data = await page.evaluate(() => {
  const L = document.querySelector("#loader");
  if (L) { L.style.display = "none"; L.classList.add("hide"); }
  window.__freeze = true;
  const out = [];
  const scene = window.__scene;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const flags = mats.map((m) => m ? { t: !!m.transparent, o: m.opacity, ty: m.type, b: m.blending, n: m.name || "" } : null);
    const interesting = flags.some((f) => f && (f.t || (f.o != null && f.o < 0.999))) || /mist|water|smoke|plain|net|board|bill/i.test(o.name || "");
    if (!interesting) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const e = o.matrixWorld.elements;
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
      const p = [(e[0] * x + e[4] * y + e[8] * z + e[12]) / w, (e[1] * x + e[5] * y + e[9] * z + e[13]) / w, (e[2] * x + e[6] * y + e[10] * z + e[14]) / w];
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    }
    const size = max.map((v, i) => +(v - min[i]).toFixed(1));
    out.push({ name: o.name || "", vis: o.visible, ro: o.renderOrder, size, flags, inst: o.isInstancedMesh ? o.count : 0 });
  });
  out.sort((a, b) => Math.max(...b.size) - Math.max(...a.size));
  return { n: out.length, top: out.slice(0, 40), camType: typeof window.__cam, hitType: typeof window.__hit };
});
console.log(JSON.stringify(data, null, 2).slice(0, 12000));

await page.evaluate(() => {
  window.__debug.look(128, 6, -24, 128, 8, 4);
  window.__paint();
});
await page.locator("canvas").screenshot({ path: `/workspace/artifacts/zhao_${tag}_gate.png`, timeout: 120000 });
const hits = await page.evaluate(() => {
  const pts = [];
  for (const y of [-0.35, 0, 0.25, 0.5]) {
    for (const x of [-0.55, -0.15, 0.2, 0.5]) pts.push({ x, y, h: window.__hit(x, y) });
  }
  return { cam: window.__cam(), pts };
});
console.log("HITS", JSON.stringify(hits, null, 2).slice(0, 8000));
await browser.close();
console.log("done", tag);
