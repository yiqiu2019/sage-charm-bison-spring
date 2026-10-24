import { chromium } from "playwright";
import fs from "fs";

const exe = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
console.log("goto");
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__paint === "function");
await page.waitForTimeout(1500);

const looks = {
  open: [188, 7.5, -34, 164, 2.4, -34],
  south: [128, 5, -30, 128, 8, 2],
  close: [128, 3.2, -16, 128, 9, 3],
  east: [175, 6, -22, 130, 6, -8],
};

const result = await page.evaluate(async (looks) => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  const r = window.__renderer;
  r.shadowMap.enabled = false;
  r.setPixelRatio(1);
  r.setSize(900, 500, false);
  if (window.__post) { window.__post.enabled = true; window.__post.setSize(); }
  const out = {};
  for (const [name, look] of Object.entries(looks)) {
    window.__debug.look(...look);
    window.__paint();
    const c = document.querySelector("canvas");
    const ctx = document.createElement("canvas");
    ctx.width = 180; ctx.height = 100;
    const g = ctx.getContext("2d");
    g.drawImage(c, 0, 0, 180, 100);
    const img = g.getImageData(0, 0, 180, 100).data;
    // low local contrast blocks
    let low = 0, blocks = 0;
    for (let y = 2; y < 98; y += 4) {
      for (let x = 2; x < 178; x += 4) {
        const i = (y * 180 + x) * 4;
        const i2 = (y * 180 + x + 3) * 4;
        const d = Math.abs(img[i] - img[i2]) + Math.abs(img[i + 1] - img[i2 + 1]) + Math.abs(img[i + 2] - img[i2 + 2]);
        blocks++;
        if (d < 8) low++;
      }
    }
    out[name] = { low: +(low / blocks).toFixed(3), url: c.toDataURL("image/jpeg", 0.6) };
  }
  return out;
}, looks);

for (const [name, v] of Object.entries(result)) {
  const b64 = v.url.replace(/^data:image\/jpeg;base64,/, "");
  fs.writeFileSync(`/workspace/artifacts/view_${name}.jpg`, Buffer.from(b64, "base64"));
  console.log(name, "lowContrastFrac", v.low, "bytes", b64.length);
}
await browser.close();
