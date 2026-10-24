import { chromium } from "playwright";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const hits = [];
page.on("request", (r) => {
  const u = r.url();
  if (/guard_(ge|sword)/.test(u)) hits.push(u);
});
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?q=low&fps=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let info = null;
while (Date.now() - t0 < 45000) {
  info = await page.evaluate(() => window.__gateGuards || null);
  if (info) break;
  await page.waitForTimeout(500);
}
console.log(JSON.stringify({ info, hits, ms: Date.now() - t0 }));
await browser.close();
