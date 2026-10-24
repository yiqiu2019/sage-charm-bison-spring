import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/bridge";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(150000);
const logs = [];
page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 400)); });
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
while (Date.now() - t0 < 150000) {
  const s = await page.evaluate(() => ({
    cls: document.getElementById("loader")?.className || "",
    pct: document.querySelector("#loader .pct")?.textContent,
    stage: window.__stage || null,
    debug: !!window.__debug,
    err: window.__bootErr || null,
  }));
  console.log("wait", JSON.stringify(s));
  if (s.err) break;
  if (s.cls.includes("done") && s.debug) { ready = true; break; }
  await page.waitForTimeout(2000);
}
if (!ready) {
  console.log("NOT READY", logs.slice(0, 8).join("\n"));
  await snap("before-stuck.png");
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => window.__loader.enter());
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const h = document.getElementById("hud");
  if (h) h.style.display = "none";
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
});
await page.evaluate(() => {
  window.__debug.pose(128, -40, Math.PI / 2);
  window.__debug.setBlend(1);
  window.__debug.unlook();
});
await page.waitForTimeout(700);
await snap("before-b.png");
const camB = await page.evaluate(() => window.__cam());
console.log("camB", JSON.stringify(camB));
await page.evaluate(() => window.__debug.look(116.5, 0.7, -44, 128, 2.6, -36));
await page.waitForTimeout(500);
await snap("before-low.png");
await page.evaluate(() => window.__debug.look(156, 2.4, -42, 128, 2.6, -40));
await page.waitForTimeout(450);
await snap("before-side.png");
const bench = await page.evaluate(() => window.__debug.bench(6));
console.log("bench", JSON.stringify(bench));
console.log("errors", logs.length);
console.log(logs.slice(0, 6).join("\n"));
await browser.close();
