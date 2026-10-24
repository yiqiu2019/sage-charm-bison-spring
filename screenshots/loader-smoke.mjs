import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error") logs.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => logs.push("PAGE " + e.message));
const url = process.argv[2] || "http://127.0.0.1:8080/zhaowangcheng.html?fps=1";
await page.goto(url, { waitUntil: "commit", timeout: 120000 });
await page.waitForTimeout(400);
const early = await page.evaluate(() => {
  const L = document.getElementById("loader");
  const orbit = document.querySelector("#loader .orbit");
  const anim = orbit && orbit.getAnimations()[0];
  return {
    has: !!L,
    pct: document.querySelector("#loader .pct")?.textContent,
    cls: L && L.className,
    anim: anim ? anim.playState : null,
    bg: getComputedStyle(document.body).backgroundColor,
  };
});
console.log("early", JSON.stringify(early));
const t0 = Date.now();
let last = "";
const hist = [];
while (Date.now() - t0 < 150000) {
  const s = await page.evaluate(() => ({
    pct: document.querySelector("#loader .pct")?.textContent,
    cls: document.getElementById("loader")?.className,
    dl: window.__dl,
    dec: window.__decGot,
    stage: window.__stage,
    err: window.__bootErr || null,
    warm: window.__warmLog || null,
  }));
  const key = JSON.stringify(s);
  if (key !== last) {
    hist.push({ t: Date.now() - t0, ...s });
    last = key;
    console.log(JSON.stringify(hist[hist.length - 1]));
  }
  if (s.cls && s.cls.includes("done")) break;
  if (s.err) break;
  await page.waitForTimeout(500);
}
console.log("LOGS", logs.slice(0, 12));
await browser.close();
