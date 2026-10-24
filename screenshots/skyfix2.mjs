import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/artifacts/skyfix";
fs.mkdirSync(outDir, { recursive: true });
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
  fs.writeFileSync(outDir + "/" + name, Buffer.from(data, "base64"));
  console.log("shot", name);
}
await page.goto("http://127.0.0.1:8080/zhaowangcheng.html", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("boot") && window.__backdrop, { timeout: 30000 });
async function shot(name, hour, setup) {
  const r = await page.evaluate(async ({ hour, setup }) => {
    window.__hour(hour, true);
    eval(setup);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const b = await window.__debug.bench(2);
    return { b, err: window.__bootErr || null };
  }, { hour, setup });
  console.log(name, JSON.stringify(r));
  await snap(name + ".png");
}
await shot("west-mist", "mist", `window.__debug.pose(-16, 140, Math.PI / 2); window.__debug.look(-4, 3.5, 140, -900, 18, 155);`);
await shot("west-dusk", "dusk", `window.__debug.pose(-16, 140, Math.PI / 2); window.__debug.look(-4, 3.5, 140, -900, 18, 155);`);
await shot("west-night", "night", `window.__debug.pose(-16, 140, Math.PI / 2); window.__debug.look(-4, 3.5, 140, -900, 18, 155);`);
console.log("errors", logs.join("\n"));
await browser.close();
