import { chromium } from "playwright";
import fs from "fs";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on("console", (m) => { const t = m.text(); if (/Shader Error|error/i.test(t)) errs.push(t.slice(0, 240)); });
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=low", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 180000) {
  const s = await page.evaluate(() => ({ done: !!document.querySelector("#loader.done"), debug: !!window.__debug, err: window.__bootErr || null }));
  if (s.err) { console.log("booterr", s.err); break; }
  if (s.done && s.debug) { ready = true; break; }
  await page.waitForTimeout(2500);
}
if (!ready) { console.log("NOT READY", errs.slice(0, 4)); process.exit(1); }
await page.click("#loader .enter");
await page.evaluate(() => { const L = document.getElementById("loader"); if (L) L.style.display = "none"; window.__freeze = true; });
const info = await page.evaluate(() => {
  let mesh = null;
  window.__scene.traverse((o) => { if (o.name === "rammed") mesh = o; });
  return { key: mesh.material.customProgramCacheKey(), kind: mesh.material.userData.kind, phone: document.documentElement.classList.contains("phone") };
});
console.log("info", JSON.stringify(info));
await page.evaluate(() => {
  window.__hour("dusk", true);
  window.__debug.pose(200, -20, 0);
  window.__debug.look(210, 3.6, -8, 210, 5.4, 2);
  window.__paint();
});
const url = await page.evaluate(() => document.querySelector("canvas").toDataURL("image/jpeg", 0.8));
fs.writeFileSync("/workspace/artifacts/wall-w1/after-macro-low.jpg", Buffer.from(url.split(",")[1], "base64"));
console.log("shaderErrs", errs.length, errs.slice(0, 3).join(" || "));
await browser.close();
