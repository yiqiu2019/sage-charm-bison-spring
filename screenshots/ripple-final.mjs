import { chromium } from "playwright";
import fs from "fs";

const out = "/workspace/artifacts/ripples";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const logs = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(m.text().slice(0, 240)); });
page.on("pageerror", (e) => logs.push("PAGE " + e.message));
const cdp = await page.context().newCDPSession(page);
async function snap(name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out + "/" + name, Buffer.from(data, "base64"));
  console.log("shot", name);
}
async function boot(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__debug && window.__debug.soak && !document.getElementById("boot"), { timeout: 40000 });
  await page.evaluate(() => { const h = document.getElementById("hud"); if (h) h.style.display = "none"; });
}
function place(sec, codes, hour) {
  return page.evaluate(({ sec, codes, hour }) => {
    if (hour) window.__hour(hour, true);
    window.__debug.pose(90, -28, Math.PI / 2);
    const soaked = window.__debug.soak(sec, codes);
    const s = window.__debug.state();
    window.__debug.look(s.x + 2.2, 2.05, s.z - 4.4, s.x - 0.6, 0.08, s.z + 0.4);
    return soaked;
  }, { sec, codes, hour });
}

await boot("http://127.0.0.1:8080/zhaowangcheng.html?fps=1");
console.log("idle", JSON.stringify(await place(3.2, [], null)));
await snap("dusk-idle.png");
console.log("run", JSON.stringify(await place(2.4, ["KeyW"], null)));
await snap("dusk-run.png");
const bench = await page.evaluate(async () => {
  const u = window.__scene.getObjectByName("water").material.uniforms.uRippleRange;
  const on = await window.__debug.bench(4);
  const prev = u.value; u.value = 0;
  await window.__debug.bench(1);
  const off = await window.__debug.bench(4);
  u.value = prev;
  return { on, off, drop: +(off.fps - on.fps) };
});
console.log("bench", JSON.stringify(bench));
console.log("mist", JSON.stringify(await place(2.3, ["KeyW"], "mist")));
await snap("mist-run.png");
console.log("night", JSON.stringify(await place(2.3, ["KeyW"], "night")));
await snap("night-run.png");

await boot("http://127.0.0.1:8080/zhaowangcheng.html?post=0&fps=1");
console.log("post0", JSON.stringify(await place(2.3, ["KeyW"], null)));
await snap("post0-run.png");

await page.setViewportSize({ width: 896, height: 414 });
await boot("http://127.0.0.1:8080/zhaowangcheng.html?phone=1&q=low&fps=1");
const phone = await page.evaluate(async () => {
  window.__debug.pose(90, -28, Math.PI / 2);
  const soaked = window.__debug.soak(2.3, ["KeyW"]);
  const water = window.__scene.getObjectByName("water");
  const b = await window.__debug.bench(4);
  return {
    bench: b,
    slots: water.material.uniforms.uRipples.value.length,
    range: water.material.uniforms.uRippleRange.value,
    weights: soaked.alive.map((a) => a.w),
  };
});
console.log("phone", JSON.stringify(phone));
console.log("LOGS", logs.join(" | ") || "none");
await browser.close();
