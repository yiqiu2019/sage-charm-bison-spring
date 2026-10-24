import { chromium } from "playwright";
import fs from "fs";

const exe = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
page.on("pageerror", (e) => console.log("PE", e.message.slice(0, 200)));
page.on("crash", () => console.log("CRASH"));
console.log("goto");
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
for (let i = 0; i < 40; i++) {
  const ok = await page.evaluate(() => typeof window.__paint === "function" && !!window.__renderer);
  if (i % 5 === 0) console.log("t", ((Date.now() - t0) / 1000).toFixed(0), ok);
  if (ok) break;
  await page.waitForTimeout(1000);
}
// give warm a moment but don't wait forever — paint works once __paint exists
await page.waitForTimeout(2000);
console.log("ready", ((Date.now() - t0) / 1000).toFixed(1));

async function shot(name, opts) {
  const dataUrl = await page.evaluate(async (opts) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    const r = window.__renderer;
    r.shadowMap.enabled = false;
    r.setPixelRatio(1);
    r.setSize(800, 450, false);
    if (window.__post) {
      window.__post.enabled = !!opts.post;
      if (window.__post.setSize) window.__post.setSize();
    }
    const water = window.__scene.getObjectByName("water");
    if (water) water.visible = opts.water !== false;
    const look = opts.look;
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    const t = performance.now();
    window.__paint();
    const ms = Math.round(performance.now() - t);
    const url = document.querySelector("canvas").toDataURL("image/jpeg", 0.72);
    return { ms, url, post: window.__post && window.__post.enabled, water: water && water.visible, shadow: r.shadowMap.enabled, w: r.domElement.width, h: r.domElement.height };
  }, opts);
  const b64 = dataUrl.url.replace(/^data:image\/jpeg;base64,/, "");
  fs.writeFileSync(`/workspace/artifacts/repro_${name}.jpg`, Buffer.from(b64, "base64"));
  console.log(name, "ms", dataUrl.ms, "buf", dataUrl.w, dataUrl.h, "post", dataUrl.post, "water", dataUrl.water, "shadow", dataUrl.shadow, "bytes", b64.length);
}

const lookFar = [160, 7, -48, 128, 8, 0];
await shot("post", { post: true, water: true, look: lookFar });
await shot("nopost", { post: false, water: true, look: lookFar });
await shot("nowater", { post: true, water: false, look: lookFar });
await browser.close();
console.log("done");
