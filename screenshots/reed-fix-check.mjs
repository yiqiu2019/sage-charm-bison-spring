import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/reed-diag";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 400)));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 90000) {
  const s = await page.evaluate(() => ({
    ready: !!window.__northReady,
    err: window.__bootErr || null,
  }));
  if (s.err) { console.log("ERR", s.err); break; }
  if (s.ready) { ready = true; break; }
  await page.waitForTimeout(1000);
}
console.log("ready", ready, Math.round((Date.now() - t0) / 1000) + "s");
if (!ready) {
  console.log(errs.slice(0, 6));
  await browser.close();
  process.exit(1);
}
const data = await page.evaluate(async () => {
  const L = document.getElementById("loader");
  if (L) L.style.display = "none";
  window.__freeze = true;
  window.__hour("dusk", true);
  window.__debug.look(200, 6.4, 400, 210, 2.2, 560);
  window.__paint();
  const url = document.querySelector("canvas").toDataURL("image/jpeg", 0.82);
  return { url };
});
fs.writeFileSync(outDir + "/after-fix.jpg", Buffer.from(data.url.split(",")[1], "base64"));
fs.writeFileSync(outDir + "/after-errs.json", JSON.stringify(errs, null, 2));
console.log("wrote after-fix.jpg", errs.length);
await browser.close();
