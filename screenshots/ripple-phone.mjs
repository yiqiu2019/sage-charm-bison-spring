import { chromium } from "playwright";
import fs from "fs";
const out = "/workspace/artifacts/ripples";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const logs = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => logs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); });
const cdp = await page.context().newCDPSession(page);
async function boot(url) {
  await page.goto(url, { waitUntil: "commit", timeout: 90000 });
  await page.waitForFunction(() => window.__debug && window.__debug.soak && !document.getElementById("boot"), { timeout: 50000 });
  await page.evaluate(() => { const h = document.getElementById("hud"); if (h) h.style.display = "none"; });
}
await boot("http://127.0.0.1:8080/zhaowangcheng.html?post=0&fps=1");
await page.evaluate(() => {
  window.__debug.pose(90, -28, Math.PI / 2);
  window.__debug.soak(2.3, ["KeyW"]);
  const s = window.__debug.state();
  window.__debug.look(s.x + 2.2, 2.05, s.z - 4.4, s.x - 0.6, 0.08, s.z + 0.4);
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
let shot = await cdp.send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(out + "/post0-run.png", Buffer.from(shot.data, "base64"));
const px = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  const pix = new Uint8Array(64);
  gl.readPixels(Math.floor(c.width * 0.5), Math.floor(c.height * 0.35), 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, pix);
  let zero = 0, white = 0;
  for (let i = 0; i < pix.length; i += 4) {
    const s = pix[i] + pix[i + 1] + pix[i + 2];
    if (s === 0) zero++;
    if (pix[i] > 250 && pix[i + 1] > 250 && pix[i + 2] > 250) white++;
  }
  return { zero, white };
});
console.log("post0", JSON.stringify(px));

await page.setViewportSize({ width: 896, height: 414 });
await boot("http://127.0.0.1:8080/zhaowangcheng.html?phone=1&q=low&fps=1");
const phone = await page.evaluate(async () => {
  window.__debug.pose(90, -28, Math.PI / 2);
  const soaked = window.__debug.soak(2.3, ["KeyW"]);
  const water = window.__scene.getObjectByName("water");
  const b = await window.__debug.bench(4);
  return { bench: b, slots: water.material.uniforms.uRipples.value.length, range: water.material.uniforms.uRippleRange.value, weights: soaked.alive.map((a) => a.w) };
});
console.log("phone", JSON.stringify(phone));
console.log("logs", logs.join(" | ") || "none");
await browser.close();
