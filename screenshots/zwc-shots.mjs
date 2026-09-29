import { chromium } from "playwright";
import fs from "fs";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => logs.push("PAGE: " + e.message));
const cdp = await page.context().newCDPSession(page);
async function snap(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/workspace/screenshots/" + name, Buffer.from(data, "base64"));
  console.log("shot", name);
}
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("boot"), { timeout: 25000 });
await page.evaluate(() => { const h = document.getElementById("hud"); if (h) h.style.display = "none"; });
await page.waitForTimeout(900);
await snap("opening.png");
await page.evaluate(() => {
  window.__debug.pose(128, -36, Math.PI);
  window.__debug.setBlend(1);
  window.__debug.unlook();
});
await page.waitForTimeout(700);
await snap("b-center.png");
await page.evaluate(() => window.__debug.look(70, 3.2, -12, 70, 6.2, 6));
await page.waitForTimeout(500);
await snap("wall.png");
await page.evaluate(() => window.__debug.look(142, 2.1, -26, 128, 1.2, -40));
await page.waitForTimeout(500);
await snap("bridge.png");
const info = await page.evaluate(() => ({
  plants: window.__plants, cam: window.__cam(), err: window.__bootErr || null,
}));
console.log(JSON.stringify(info));
console.log("errors", logs.length);
console.log(logs.slice(0, 8).join("\n"));
await browser.close();
