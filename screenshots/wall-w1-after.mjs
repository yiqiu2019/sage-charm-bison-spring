import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/artifacts/wall-w1";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
const errs = [];
page.on("pageerror", (e) => errs.push("page:" + String(e).slice(0, 400)));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" || /shader|DBGMAT|ERROR/i.test(t)) errs.push(m.type() + ":" + t.slice(0, 500));
});
const url = "http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&dbg=mat&v=w1g";
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
const t0 = Date.now();
while (Date.now() - t0 < 200000) {
  const s = await page.evaluate(() => ({
    done: !!document.querySelector("#loader.done"),
    debug: !!window.__debug,
    err: window.__bootErr || null,
    stage: window.__stage || "",
  }));
  if (s.err) throw new Error(s.err + " stage " + s.stage);
  if (s.done && s.debug) break;
  await page.waitForTimeout(1500);
}
await page.evaluate(() => {
  const L = document.getElementById("loader");
  const b = L && L.querySelector(".enter");
  if (b) b.click();
  if (L) L.style.display = "none";
});
await page.waitForTimeout(300);
const info = await page.evaluate(() => window.__dbgMat ? window.__dbgMat() : null);
console.log("DBGMAT", JSON.stringify(info));
async function shot(name, hour, cam) {
  await page.evaluate(({ hour, cam }) => {
    window.__hour(hour, true);
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    if (window.__paint) window.__paint();
  }, { hour, cam });
  await page.waitForTimeout(180);
  await page.evaluate(() => window.__paint && window.__paint());
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("shot", name);
}
const east = [172, 3.4, -16, 160, 5.2, 1];
await shot("after-east", "dusk", east);
await shot("after-long", "dusk", [30, 7, -36, 240, 4.5, -1]);
await shot("after-close", "dusk", [190, 3.1, -8, 190, 3.6, 0.4]);
await shot("after-ramp", "dusk", [128, 2.3, -22, 128, 1.05, -6]);
await shot("after-mist", "mist", east);
await shot("after-night", "night", east);
const bench = await page.evaluate(async () => {
  window.__hour("dusk", true);
  window.__debug.look(172, 3.4, -16, 160, 5.2, 1);
  return window.__debug.bench(12);
});
console.log("BENCH", JSON.stringify(bench));
console.log("ERRS", JSON.stringify(errs.slice(0, 12)));
await browser.close();
