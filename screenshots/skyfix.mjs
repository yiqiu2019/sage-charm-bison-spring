import { chromium } from "playwright";
import fs from "fs";

const outDir = "/workspace/artifacts/skyfix";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 400)); });
page.on("pageerror", (e) => logs.push("PAGE: " + e.message));
const cdp = await page.context().newCDPSession(page);
async function snap(name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(outDir + "/" + name, Buffer.from(data, "base64"));
  console.log("shot", name);
}
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("boot"), { timeout: 30000 });
await page.waitForFunction(() => window.__backdrop && window.__buildings && window.__buildings.ready, { timeout: 25000 }).catch((e) => console.log("wait", e.message));

const info = await page.evaluate(() => {
  const names = [];
  const walk = (o, pre) => {
    if (names.length > 80) return;
    const n = o.name || o.type;
    if (/hill|mtn|bd-|sky|ground|ridge|city/i.test(n) || (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position && o.geometry.attributes.position.count > 2000)) {
      names.push(pre + n + ":" + (o.geometry && o.geometry.attributes && o.geometry.attributes.position ? o.geometry.attributes.position.count : ""));
    }
    for (const c of o.children || []) walk(c, pre + (o.name || "") + "/");
  };
  walk(window.__scene || null, "");
  return {
    err: window.__bootErr || null,
    bd: window.__backdrop && window.__backdrop.stats,
    buildings: window.__buildings,
    sceneName: !!window.__scene,
  };
});
console.log("info", JSON.stringify(info));

async function shot(name, hour, setup) {
  const r = await page.evaluate(async ({ hour, setup }) => {
    window.__hour(hour, true);
    // eslint-disable-next-line no-eval
    eval(setup);
    const b = await window.__debug.bench(3);
    const c = window.__cam();
    const hall = { x: 132, y: 28, z: -85 };
    const d = Math.hypot(c.px - hall.x, c.py - hall.y, c.pz - hall.z);
    const lods = {};
    if (window.__scene) window.__scene.traverse((o) => {
      if (o.name && (o.name.indexOf("hall2_") === 0 || o.name.indexOf("pavilion_") === 0)) lods[o.name] = o.count;
    });
    return { b, c, hallDist: +d.toFixed(1), lods };
  }, { hour, setup });
  console.log(name, JSON.stringify(r));
  await snap(name + ".png");
}

await shot("west-dusk", "dusk", `window.__debug.pose(-16, 150, Math.PI / 2); window.__debug.look(-4, 3.5, 148, -900, 18, 165);`);
await shot("ne-dusk", "dusk", `window.__debug.look(470, 9, 500, 880, 6, 790);`);
await shot("hall-dusk", "dusk", `window.__debug.look(230, 14, -8, 132, 30, 85);`);
await shot("west-night", "night", `window.__debug.pose(-16, 150, Math.PI / 2); window.__debug.look(-4, 3.5, 148, -900, 18, 165);`);
await shot("west-mist", "mist", `window.__debug.pose(-16, 150, Math.PI / 2); window.__debug.look(-4, 3.5, 148, -900, 18, 165);`);

console.log("errors", logs.length);
console.log(logs.slice(0, 12).join("\n"));
await browser.close();
