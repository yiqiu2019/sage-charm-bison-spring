import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/screenshots/brazier";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
page.on("pageerror", (e) => console.log("PAGE", e.message));
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
for (const [name, look, hour] of [
  ["fix-close", [60, 13.15, 7.4, 60, 12.55, 3.4], "dusk"],
  ["fix-close-night", [52, 13.3, 5.0, 62, 12.7, 3.6], "night"],
]) {
  const data = await page.evaluate(({ look, hour }) => {
    window.__freeze = true;
    window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    if (window.__pickAt) window.__pickAt(rect.left + rect.width * 0.52, rect.top + rect.height * 0.46);
    return { url: canvas.toDataURL("image/jpeg", 0.86), pick: window.__pickLast, diag: window.__brazierDiag };
  }, { look, hour });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.url.split(",")[1], "base64"));
  console.log(name, JSON.stringify(data.pick), JSON.stringify(data.diag));
}
await browser.close();
