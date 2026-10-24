import { chromium } from "playwright";
import fs from "fs";

const out = "/workspace/artifacts/ripples";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const logs = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") logs.push(t + ": " + m.text().slice(0, 500));
});
page.on("pageerror", (e) => logs.push("PAGE: " + e.message));
const cdp = await page.context().newCDPSession(page);
async function snap(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out + "/" + name, Buffer.from(data, "base64"));
  console.log("shot", name, fs.statSync(out + "/" + name).size);
}
async function boot(url) {
  logs.length = 0;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById("boot") && window.__debug && window.__debug.soak, { timeout: 40000 });
  await page.evaluate(() => { const h = document.getElementById("hud"); if (h) h.style.display = "none"; });
}
async function aim() {
  await page.evaluate(() => {
    const s = window.__debug.state();
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const rx = fz, rz = -fx;
    window.__debug.look(s.x - fx * 0.6 + rx * 4.8, 1.85, s.z - fz * 0.6 + rz * 4.8, s.x - fx * 1.2, 0.02, s.z - fz * 1.2);
  });
  await page.waitForTimeout(900);
}

await boot("http://127.0.0.1:8080/zhaowangcheng.html?fps=1");
let info = await page.evaluate(() => {
  window.__debug.pose(168, -34, Math.PI / 2);
  return window.__debug.soak(3.2, []);
});
console.log("idle", JSON.stringify(info));
await aim();
await snap("dusk-idle.png");

info = await page.evaluate(() => {
  window.__debug.pose(50, -28, Math.PI / 2);
  return window.__debug.soak(2.4, ["KeyW"]);
});
console.log("run", JSON.stringify(info));
await aim();
await snap("dusk-run.png");

const bench = await page.evaluate(() => {
  const water = window.__scene.getObjectByName("water");
  const on = window.__debug.bench(10);
  const prev = water.material.uniforms.uRippleRange.value;
  water.material.uniforms.uRippleRange.value = 0;
  const off = window.__debug.bench(10);
  water.material.uniforms.uRippleRange.value = prev;
  return { on, off };
});
console.log("bench", JSON.stringify(bench));

await page.evaluate(() => {
  window.__hour("mist", true);
  window.__debug.pose(50, -28, Math.PI / 2);
  return window.__debug.soak(2.2, ["KeyW"]);
});
await aim();
await snap("mist-run.png");

await page.evaluate(() => {
  window.__hour("night", true);
  window.__debug.pose(50, -28, Math.PI / 2);
  return window.__debug.soak(2.2, ["KeyW"]);
});
await aim();
await snap("night-run.png");

await boot("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&post=0");
info = await page.evaluate(() => {
  window.__debug.pose(50, -28, Math.PI / 2);
  return window.__debug.soak(2.2, ["KeyW"]);
});
console.log("post0", JSON.stringify(info));
await aim();
await snap("post0-run.png");
const px = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  const pix = new Uint8Array(16);
  gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height / 2), 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, pix);
  let zero = 0;
  for (let i = 0; i < pix.length; i += 4) if (pix[i] + pix[i + 1] + pix[i + 2] === 0) zero++;
  return { zero, pix: Array.from(pix) };
});
console.log("pixels", JSON.stringify(px));

await page.setViewportSize({ width: 896, height: 414 });
await boot("http://127.0.0.1:8080/zhaowangcheng.html?phone=1&q=low&fps=1");
const phone = await page.evaluate(() => {
  window.__debug.pose(50, -28, Math.PI / 2);
  const soaked = window.__debug.soak(2.2, ["KeyW"]);
  const water = window.__scene.getObjectByName("water");
  const b = window.__debug.bench(8);
  return {
    soaked,
    bench: b,
    slots: water.material.uniforms.uRipples.value.length,
    range: water.material.uniforms.uRippleRange.value,
  };
});
console.log("phone", JSON.stringify(phone));
console.log("LOGS\n" + (logs.join("\n") || "none"));
await browser.close();
