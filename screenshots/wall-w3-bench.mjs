import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1", { waitUntil: "domcontentloaded", timeout: 60000 });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 240000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
  }));
  if (s.done && s.debug) { ready = true; break; }
  await page.waitForTimeout(2000);
}
if (!ready) {
  console.log("NOT READY");
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__debug.look(52, 2.8, -24, 52, 0.9, -1);
});
const on = await page.evaluate(() => window.__debug.bench(20));
console.log("BENCH_VEG", JSON.stringify(on));
console.log("COUNTS", JSON.stringify(await page.evaluate(() => ({
  grass: window.__innerGrass, stones: window.__innerStones, bank: window.__innerBank,
}))));
await page.evaluate(() => {
  window.__scene.traverse((o) => {
    const n = o.name || "";
    if (/reed|grass|stone|tree|shrub|bankGrass|bankStones|innerGrass|innerStone|autumn/i.test(n)) o.visible = false;
  });
});
const off = await page.evaluate(() => window.__debug.bench(20));
console.log("BENCH_VEG0", JSON.stringify(off));
console.log("ERRS", JSON.stringify(errs.slice(0, 6)));
await browser.close();
