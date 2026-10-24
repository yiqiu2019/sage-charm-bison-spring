import { chromium } from "playwright";
import fs from "fs";
const out = "/workspace/screenshots/brazier/after-close-side.jpg";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|shader/i.test(t)) console.log("C", m.type(), t.slice(0, 300));
});
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&pick=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 200000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    err: window.__bootErr || null,
    debug: !!window.__debug,
    h: window.__boatReady && window.__boatReady.brazierH,
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug && s.h) break;
  await page.waitForTimeout(2500);
}
await page.click("#loader .enter");
await page.evaluate(() => { const L = document.getElementById("loader"); if (L) L.style.display = "none"; });
const shots = [
  ["after-b-west-dusk", [78, 11.6, -46, 70, 12.2, 3.2], "dusk"],
  ["after-b-east-dusk", [210, 11.6, -46, 230, 12.2, 3.2], "dusk"],
  ["after-b-west-night", [78, 11.6, -46, 70, 12.2, 3.2], "night"],
];
for (const [name, look, hour] of shots) {
  const data = await page.evaluate(({ look, hour }) => {
    window.__freeze = true;
    window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    const canvas = document.querySelector("canvas");
    return { url: canvas.toDataURL("image/jpeg", 0.84), diag: window.__brazierDiag };
  }, { look, hour });
  fs.writeFileSync(`/workspace/screenshots/brazier/${name}.jpg`, Buffer.from(data.url.split(",")[1], "base64"));
  console.log("shot", name, JSON.stringify(data.diag));
}
await browser.close();
