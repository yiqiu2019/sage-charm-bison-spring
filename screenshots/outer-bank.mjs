import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/outer-bank";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/\[pick\]/.test(t)) console.log("CONSOLE", t.slice(0, 400));
  if (/error|Error|shader|NaN/i.test(t) && !/\[pick\]/.test(t)) errs.push(m.type() + " " + t.slice(0, 240));
});
page.on("pageerror", (e) => errs.push("PAGE " + e.message.slice(0, 300)));

await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?pick=1", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 240000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    pct: document.querySelector("#loader .pct")?.textContent || "",
    err: window.__bootErr || null,
    debug: !!window.__debug,
  }));
  console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
  if (s.err) break;
  if (s.done && s.debug) { ready = true; break; }
  await page.waitForTimeout(2000);
}
if (!ready) {
  console.log("NOT READY", errs.slice(0, 8));
  await browser.close();
  process.exit(1);
}
await page.click("#loader .enter");
await page.evaluate(() => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
});
await page.waitForTimeout(400);

async function shot(name, look, hour) {
  await page.evaluate(({ look, hour }) => {
    const box = document.getElementById("pickread");
    if (box) box.style.display = "none";
    if (hour) {
      const b = document.querySelector(`#hours button[data-hour="${hour}"]`);
      if (b) b.click();
    }
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    if (window.__paint) window.__paint();
  }, { look, hour: hour || null });
  await page.waitForTimeout(hour ? 1800 : 250);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("shot", name);
}

await shot("west", [-88, 5.6, 18, -24, 1.6, 96]);
await shot("west-low", [-24, 2.2, 48, -62, 0.55, 86]);
await shot("bay-sw", [-18, 6.5, -16, -72, 0.4, -72], "dusk");
await shot("bay-wn", [-6, 7.2, 228, -78, 0.5, 292]);
await shot("bay-n", [86, 11, 388, 8, 0.4, 468]);
await shot("bay-ne", [348, 11, 386, 438, 0.4, 468]);
await shot("bay-se", [348, 7.5, -8, 446, 0.4, -72]);
await shot("overhead", [180, 620, 280, 180, 0, 150]);

await page.evaluate(() => {
  const box = document.getElementById("pickread");
  if (box) box.style.display = "block";
  window.__debug.look(-24, 2.2, 48, -62, 0.55, 86);
  if (window.__paint) window.__paint();
});
await page.waitForTimeout(300);
await page.mouse.click(760, 430);
await page.waitForTimeout(200);
const picked = await page.evaluate(() => ({
  text: document.getElementById("pickread")?.textContent || "",
  last: window.__pickLast || null,
}));
console.log("PICK", JSON.stringify(picked));
await page.evaluate(() => window.__paint && window.__paint());
await page.screenshot({ path: `${outDir}/pick.png` });
console.log("shot pick");
console.log("ERRS", errs.slice(0, 10));
await browser.close();
