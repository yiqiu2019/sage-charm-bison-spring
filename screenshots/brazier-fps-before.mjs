import { chromium } from "playwright";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&pick=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 200000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    h: window.__boatReady && window.__boatReady.brazierH,
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.done && s.debug && s.h) break;
  await page.waitForTimeout(2000);
}
await page.click("#loader .enter");
await page.evaluate(() => { const L = document.getElementById("loader"); if (L) L.style.display = "none"; });
const bench = await page.evaluate(async () => {
  window.__freeze = true;
  window.__hour("dusk", true);
  window.__debug.look(168, 7.5, -54, 140, 8, -20);
  window.__paint();
  return window.__debug.bench(20);
});
console.log("BEFORE", JSON.stringify(bench));
await browser.close();
