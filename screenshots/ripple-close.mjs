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
  if (t === "error" || t === "warning") logs.push(t + ": " + m.text().slice(0, 400));
});
page.on("pageerror", (e) => logs.push("PAGE: " + e.message));
const cdp = await page.context().newCDPSession(page);
async function snap(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out + "/" + name, Buffer.from(data, "base64"));
  console.log("shot", name);
}
async function boot(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__debug && window.__debug.soak && !document.getElementById("boot"), { timeout: 40000 });
  await page.evaluate(() => { const h = document.getElementById("hud"); if (h) h.style.display = "none"; });
}
async function aimAt(which) {
  await page.evaluate((which) => {
    const water = window.__scene.getObjectByName("water");
    const slots = water.material.uniforms.uRipples.value.filter((v) => v.w > 0.2);
    const src = slots[slots.length - 1] || water.material.uniforms.uRipples.value.find((v) => v.w > 0);
    const s = window.__debug.state();
    let x = s.x, z = s.z;
    if (src) { x = src.x; z = -src.y; }
    if (which === "boat") { x = s.x; z = s.z; }
    window.__debug.look(x + 0.4, 3.1, z + 5.6, x, 0.0, z - 0.8);
  }, which);
  await page.waitForTimeout(1400);
}

await boot("http://127.0.0.1:8080/zhaowangcheng.html?fps=1");
let info = await page.evaluate(() => {
  window.__debug.pose(168, -34, Math.PI / 2);
  return window.__debug.soak(3.2, []);
});
console.log("idle", JSON.stringify(info));
await aimAt("ripple");
await snap("dusk-idle.png");

info = await page.evaluate(() => {
  window.__debug.pose(80, -28, Math.PI / 2);
  return window.__debug.soak(2.6, ["KeyW"]);
});
console.log("run", JSON.stringify(info));
await aimAt("ripple");
await snap("dusk-run.png");

const bench = await page.evaluate(async () => {
  const water = window.__scene.getObjectByName("water");
  const on = await window.__debug.bench(6);
  const prev = water.material.uniforms.uRippleRange.value;
  water.material.uniforms.uRippleRange.value = 0;
  const off = await window.__debug.bench(6);
  water.material.uniforms.uRippleRange.value = prev;
  const prog = water.material.fragmentShader.includes("uRipples");
  return { on, off, prog, err: window.__bootErr || null };
});
console.log("bench", JSON.stringify(bench));

await page.evaluate(() => { window.__hour("mist", true); window.__debug.pose(80, -28, Math.PI / 2); return window.__debug.soak(2.4, ["KeyW"]); });
await aimAt("ripple");
await snap("mist-run.png");

await page.evaluate(() => { window.__hour("night", true); window.__debug.pose(80, -28, Math.PI / 2); return window.__debug.soak(2.4, ["KeyW"]); });
await aimAt("ripple");
await snap("night-run.png");

await boot("http://127.0.0.1:8080/zhaowangcheng.html?post=0&fps=1");
await page.evaluate(() => { window.__debug.pose(80, -28, Math.PI / 2); return window.__debug.soak(2.4, ["KeyW"]); });
await aimAt("ripple");
await snap("post0-run.png");

await page.setViewportSize({ width: 896, height: 414 });
await boot("http://127.0.0.1:8080/zhaowangcheng.html?phone=1&q=low&fps=1");
const phone = await page.evaluate(async () => {
  window.__debug.pose(80, -28, Math.PI / 2);
  const soaked = window.__debug.soak(2.4, ["KeyW"]);
  const water = window.__scene.getObjectByName("water");
  const b = await window.__debug.bench(6);
  return { soaked, bench: b, slots: water.material.uniforms.uRipples.value.length, range: water.material.uniforms.uRippleRange.value };
});
console.log("phone", JSON.stringify(phone));
console.log("LOGS\n" + (logs.join("\n") || "none"));
await browser.close();
