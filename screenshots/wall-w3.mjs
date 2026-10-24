import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/wall-w3";
fs.mkdirSync(outDir, { recursive: true });
const tag = process.argv[2] || "before";
const extra = process.argv[3] || "";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader|NaN/i.test(t)) console.log("C", m.type(), t.slice(0, 400));
});
page.on("pageerror", (e) => console.log("PAGE", e.message.slice(0, 400)));

await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1" + extra, {
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
  console.log("NOT READY");
  await browser.close();
  process.exit(1);
}
await page.click("#loader .enter");
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
});
await page.waitForTimeout(400);

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
  else await page.waitForTimeout(250);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${tag}-${name}.png` });
  console.log("shot", tag, name);
}

const info = await page.evaluate(() => {
  const rows = [];
  window.__scene.traverse((o) => {
    if (!o.name) return;
    if (!/inner|apron|ground|slope|reed|bank/i.test(o.name)) return;
    const m = o.material;
    rows.push({
      name: o.name,
      kind: m && m.userData && m.userData.kind,
      type: m && m.type,
      color: m && m.color ? "#" + m.color.getHexString() : "",
    });
  });
  return { meshes: rows, bank: window.__bank || null, reed: window.__reedGlb || null };
});
console.log("INFO", JSON.stringify(info));

await shot("south", [52, 2.8, -24, 52, 0.9, -1]);
const px = await page.evaluate(async () => {
  const pts = [];
  for (let y = 180; y <= 560; y += 40) {
    const c = await window.__px(640, y);
    pts.push({ y, c });
  }
  return pts;
});
console.log("PX", JSON.stringify(px));

if (tag === "before") {
  const bench = await page.evaluate(() => window.__debug.bench(30));
  console.log("BENCH", JSON.stringify(bench));
  await browser.close();
  process.exit(0);
}

await shot("close", [52, 1.55, -18, 55, 0.6, -7]);
await shot("west", [-26, 6.2, 90, -1, 1.4, 100]);
await shot("junction", [72, 4.6, -30, 104, 1.1, -12]);
await shot("close-mist", [52, 1.55, -18, 55, 0.6, -7], "mist");
await shot("close-night", [52, 1.55, -18, 55, 0.6, -7], "night");
await page.evaluate(() => {
  const b = document.querySelector('#hours button[data-hour="dusk"]');
  if (b) b.click();
});
await page.waitForTimeout(2200);
await shot("veg0", [52, 2.2, -20, 54, 0.7, -4]);

const bench = await page.evaluate(() => window.__debug.bench(30));
console.log("BENCH", JSON.stringify(bench));
const counts = await page.evaluate(() => ({
  bank: window.__innerBank || null,
  grass: window.__innerGrass || null,
  stones: window.__innerStones || null,
}));
console.log("COUNTS", JSON.stringify(counts));
await browser.close();
