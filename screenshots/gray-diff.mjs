import { chromium } from "playwright";
import fs from "fs";

const out = "/workspace/screenshots/gray-gate";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?fps=1&grab=1&q=high", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const b = await page.evaluate(() => !!(window.__paint && window.__gateGuards && window.__gateGuards.ready));
  if (b) break;
  await page.waitForTimeout(300);
}
console.log("boot", Math.round((Date.now() - t0) / 1000) + "s");

async function shot(name, cam, hour, tweak) {
  const data = await page.evaluate(async ({ cam, hour, tweak }) => {
    const L = document.getElementById("loader");
    if (L) L.style.display = "none";
    window.__freeze = true;
    if (window.__hour) window.__hour(hour, true);
    if (tweak === "post0" && window.__post) window.__post.enabled = false;
    else if (window.__post) window.__post.enabled = true;
    if (tweak === "veg0") window.__hideVeg = true;
    else window.__hideVeg = false;
    if (tweak === "water0") {
      window.__scene.traverse((o) => { if (o.name === "water") o.visible = false; });
    } else {
      window.__scene.traverse((o) => { if (o.name === "water") o.visible = true; });
    }
    if (tweak === "guard0") {
      window.__scene.traverse((o) => { if (o.name === "guardGe" || o.name === "guardSword") o.visible = false; });
    } else {
      window.__scene.traverse((o) => { if (o.name === "guardGe" || o.name === "guardSword") o.visible = true; });
    }
    window.__debug.look(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5]);
    window.__paint();
    window.__paint();
    const hits = window.__hit(0, 0.05).concat(window.__hit(0, -0.15)).concat(window.__hit(-0.2, 0));
    return { url: document.querySelector("canvas").toDataURL("image/jpeg", 0.85), hits };
  }, { cam, hour, tweak });
  fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from(data.url.split(",")[1], "base64"));
  console.log(name, JSON.stringify(data.hits));
}

const cam = [128, 2.6, -16, 128, 4.2, 4];
const side = [112, 3.2, -18, 128, 4, 2];
await shot("close-dusk", cam, "dusk", "");
await shot("close-post0", cam, "dusk", "post0");
await shot("close-veg0", cam, "dusk", "veg0");
await shot("close-water0", cam, "dusk", "water0");
await shot("close-guard0", cam, "dusk", "guard0");
await shot("side-dusk", side, "dusk", "");
await shot("close-night", cam, "night", "");
await shot("close-mist", cam, "mist", "");
await browser.close();
