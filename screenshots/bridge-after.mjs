import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/bridge";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const logs = [];
page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 500)); });
page.on("pageerror", (e) => logs.push("PAGE: " + e.message));
const cdp = await page.context().newCDPSession(page);
async function snap(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(outDir + "/" + name, Buffer.from(data, "base64"));
  console.log("shot", name);
}
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1", { waitUntil: "domcontentloaded", timeout: 120000 });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 180000) {
  const s = await page.evaluate(() => ({
    cls: document.getElementById("loader")?.className || "",
    pct: document.querySelector("#loader .pct")?.textContent,
    stage: window.__stage || null,
    debug: !!window.__debug,
    bridge: window.__bridge || null,
    err: window.__bootErr || null,
  }));
  if (s.bridge || s.err || (Date.now() - t0) % 8000 < 2200) console.log("wait", JSON.stringify(s).slice(0, 400));
  if (s.err) break;
  if (s.cls.includes("done") && s.debug) { ready = true; break; }
  await page.waitForTimeout(2000);
}
if (!ready) {
  console.log("NOT READY");
  console.log(logs.slice(0, 12).join("\n"));
  await snap("after-stuck.png");
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => {
  window.__loader.enter();
  const h = document.getElementById("hud");
  if (h) h.style.display = "none";
});
await page.waitForTimeout(800);
const info = await page.evaluate(() => ({ bridge: window.__bridge, boat: window.__boatReady, err: window.__bootErr || null }));
console.log("info", JSON.stringify(info));
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__hour("dusk", true);
  window.__debug.pose(128, -40, Math.PI / 2);
  window.__debug.setBlend(1);
  window.__debug.unlook();
});
await page.waitForTimeout(500);
await snap("after-b.png");
await page.evaluate(() => window.__debug.look(119, 0.55, -43, 129, 2.4, -36));
await page.waitForTimeout(350);
await snap("after-low.png");
await page.evaluate(() => window.__debug.look(164, 1.6, -40, 128, 2.5, -40));
await page.waitForTimeout(350);
await snap("after-side.png");
await page.evaluate(() => {
  window.__hour("mist", true);
  window.__debug.pose(128, -40, Math.PI / 2);
  window.__debug.setBlend(1);
  window.__debug.unlook();
});
await page.waitForTimeout(400);
await snap("after-mist.png");
await page.evaluate(() => {
  window.__hour("night", true);
  window.__debug.pose(128, -40, Math.PI / 2);
  window.__debug.setBlend(1);
  window.__debug.unlook();
});
await page.waitForTimeout(400);
await snap("after-night.png");
const bench = await page.evaluate(() => window.__debug.bench(6));
console.log("bench", JSON.stringify(bench));
console.log("errors", logs.length);
console.log(logs.slice(0, 15).join("\n"));
await browser.close();
