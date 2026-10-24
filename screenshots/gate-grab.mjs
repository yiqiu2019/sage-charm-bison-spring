import { chromium } from "playwright";
import fs from "fs";
const outDir = "/workspace/artifacts/gate";
fs.mkdirSync(outDir, { recursive: true });
const shaderErrors = [];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.setDefaultTimeout(220000);
page.on("console", (m) => {
  const t = m.text();
  if (/shader|VALIDATE_STATUS|undeclared|NaN/i.test(t)) {
    shaderErrors.push(t.slice(0, 240));
    console.log("CON", m.type(), t.slice(0, 240));
  }
});
page.on("pageerror", (e) => console.log("PAGE", e.message.slice(0, 400)));

async function boot(url) {
  shaderErrors.length = 0;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    const s = await page.evaluate(() => ({
      done: !!document.querySelector("#loader.done"),
      debug: !!window.__debug,
      err: window.__bootErr || null,
      pct: document.querySelector("#loader .pct")?.textContent || "",
    }));
    console.log("boot", JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + "s");
    if (s.err) throw new Error(s.err);
    if (s.done && s.debug) return;
    await page.waitForTimeout(2500);
  }
  throw new Error("boot timeout");
}

async function shot(name, look, hour) {
  const data = await page.evaluate(({ look, hour }) => {
    window.__freeze = true;
    if (hour && window.__hour) window.__hour(hour, true);
    window.__debug.look(look[0], look[1], look[2], look[3], look[4], look[5]);
    window.__paint();
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.82);
  }, { look, hour: hour || null });
  const b64 = data.split(",")[1];
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(b64, "base64"));
  console.log("shot", name, b64.length);
}

const bridge = [128, 4.6, -22, 128, 6.2, 4];
try {
  await boot("http://127.0.0.1:8080/zhaowangcheng.html?grab=1&pick=1");
  if (shaderErrors.length) {
    console.log("SHADER_FAIL", shaderErrors.length);
    process.exitCode = 1;
  } else {
    await page.evaluate(() => {
      const L = document.getElementById("loader");
      if (L) L.style.display = "none";
      const p = document.getElementById("pickread");
      if (p) p.style.display = "none";
    });
    await shot("after-bridge", bridge);
    await shot("after-b108", [118, 11.7, -58, 128, 10, -6]);
    await shot("after-b128", [138, 11.7, -58, 128, 10, -6]);
    await shot("after-b148", [158, 11.7, -58, 128, 10, -6]);
    await shot("after-gap", [122.6, 2.4, 0.4, 122.6, 3.2, 6]);
    await shot("after-mist", bridge, "mist");
    await shot("after-night", bridge, "night");
    const extra = await page.evaluate(async () => {
      window.__freeze = true;
      window.__hour("dusk", true);
      window.__debug.look(122.6, 2.4, 0.4, 122.6, 3.2, 6);
      window.__paint();
      const picks = [];
      for (const [x, y] of [[550, 300], [550, 360], [640, 280], [460, 280], [550, 180]]) {
        window.__pickAt(x, y);
        picks.push(window.__pickLast);
      }
      const bench = await window.__debug.bench(3);
      return { picks, bench };
    });
    console.log("EXTRA", JSON.stringify(extra));
    await boot("http://127.0.0.1:8080/zhaowangcheng.html?grab=1&post=0");
    if (shaderErrors.length) console.log("POST_SHADER", shaderErrors.length);
    await page.evaluate(() => {
      const L = document.getElementById("loader");
      if (L) L.style.display = "none";
    });
    await shot("after-post0", bridge);
  }
} catch (err) {
  console.log("FAIL", err && err.stack ? err.stack.slice(0, 500) : err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
