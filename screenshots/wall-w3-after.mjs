import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/wall-w3";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN/i.test(t)) errs.push(m.type() + " " + t.slice(0, 300));
});
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 300)));

await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
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
  if (s.err) break;
  if (s.done && s.debug) { ready = true; break; }
  await page.waitForTimeout(2000);
}
if (!ready) {
  console.log("NOT READY", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}
await page.click("#loader .enter");
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
});
await page.waitForTimeout(500);

async function shot(name, look, hour) {
  await page.evaluate(({ look, hour }) => {
    if (hour) {
      const b = document.querySelector(`#hours button[data-hour="${hour}"]`);
      if (b) b.click();
    }
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    if (window.__paint) window.__paint();
  }, { look, hour: hour || null });
  if (hour) await page.waitForTimeout(2200);
  else await page.waitForTimeout(300);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("shot", name);
}

const diag = await page.evaluate(() => {
  const hits = [];
  function onInner(x, z) {
    const south = z <= 0.2 && z >= -14 && x >= -1 && x <= 362;
    const west = x <= 0.2 && x >= -14 && z >= -1 && z <= 232;
    const northW = z >= 220 && z <= 234 && x >= -1 && x <= 90;
    const northC = z >= 378 && z <= 394 && x >= 78 && x <= 362;
    const east = x >= 348 && x <= 364 && z >= -1 && z <= 392;
    const northIn = x >= 78 && x <= 92 && z >= 220 && z <= 392;
    if (!(south || west || northW || northC || east || northIn)) return false;
    if (x > 97 && x < 159 && z > -17 && z < 1) return false;
    return true;
  }
  window.__scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.name) return;
    if (!/reed|tree|shrub|grass|stone|bank/i.test(o.name)) return;
    const arr = o.instanceMatrix.array;
    let n = 0;
    const cap = Math.min(o.count, 8000);
    for (let i = 0; i < cap; i++) {
      const x = arr[i * 16 + 12];
      const z = -arr[i * 16 + 14];
      if (onInner(x, z)) n++;
    }
    if (n) hits.push({ name: o.name, n, count: o.count });
  });
  return {
    hits,
    grass: window.__innerGrass || null,
    stones: window.__innerStones || null,
    bank: window.__innerBank || null,
  };
});
console.log("DIAG", JSON.stringify(diag));
console.log("ERRS", errs.slice(0, 12));

await shot("after-south", [52, 2.8, -24, 52, 0.9, -1]);
await shot("after-close", [48, 1.7, -18, 50, 0.55, -4]);
await shot("after-profile", [36, 2.1, -7, 70, 1.05, -8]);
await shot("after-west", [-22, 5.4, 110, -2, 1.2, 80]);
await shot("after-junction", [78, 3.4, -22, 100, 0.9, -12]);
await shot("after-close-mist", [48, 1.7, -18, 50, 0.55, -4], "mist");
await shot("after-close-night", [48, 1.7, -18, 50, 0.55, -4], "night");
await page.evaluate(() => {
  const b = document.querySelector('#hours button[data-hour="dusk"]');
  if (b) b.click();
});
await page.waitForTimeout(2200);
await page.evaluate(() => {
  window.__scene.traverse((o) => {
    const n = o.name || "";
    if (/reed|grass|stone|tree|shrub|bankGrass|bankStones|innerGrass|innerStone|autumn/i.test(n)) o.visible = false;
  });
});
await shot("after-veg0", [48, 2.4, -16, 50, 0.6, -2]);
await page.evaluate(() => window.__debug.look(52, 2.8, -24, 52, 0.9, -1));
const bench = await page.evaluate(() => window.__debug.bench(20));
console.log("BENCH", JSON.stringify(bench));
const px = await page.evaluate(async () => {
  const pts = [];
  for (const y of [360, 400, 430, 460, 500]) pts.push({ y, c: await window.__px(640, y) });
  return pts;
});
console.log("PX", JSON.stringify(px));
console.log("ERRS2", errs.slice(0, 12));
await browser.close();
