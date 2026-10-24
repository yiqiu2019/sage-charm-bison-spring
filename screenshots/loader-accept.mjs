import { chromium } from "playwright";
import fs from "fs";

const out = "/workspace/screenshots/loader";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});

async function shot(page, name) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out + "/" + name, Buffer.from(data, "base64"));
  console.log("shot", name);
  await cdp.detach();
}

function attach(page, bag) {
  page.on("console", (m) => { if (m.type() === "error") bag.push(m.text().slice(0, 240)); });
  page.on("pageerror", (e) => bag.push("PAGE " + e.message));
}

async function layout(label, w, h, q) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const bag = [];
  attach(page, bag);
  await page.goto("http://127.0.0.1:8080/zhaowangcheng.html?" + q, { waitUntil: "commit", timeout: 60000 });
  await page.waitForTimeout(500);
  const box = await page.evaluate(() => {
    const L = document.getElementById("loader");
    const r = L.getBoundingClientRect();
    const b = document.querySelector("#loader .bi").getBoundingClientRect();
    return {
      vw: innerWidth, vh: innerHeight,
      loader: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bi: [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)],
      pct: document.querySelector("#loader .pct")?.textContent,
    };
  });
  await shot(page, label + ".png");
  console.log(label, JSON.stringify(box), bag.slice(0, 3));
  await page.close();
}

async function throttled(name, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const bag = [];
  attach(page, bag);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 1.6 * 1000 * 1000 / 8,
    uploadThroughput: 750 * 1000 / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const t0 = Date.now();
  const nav = page.goto(url, { waitUntil: "commit", timeout: 180000 });
  await page.waitForTimeout(300);
  await shot(page, name + "-0.3s.png");
  const early = await page.evaluate(() => {
    const orbit = document.querySelector("#loader .orbit");
    const anim = orbit && orbit.getAnimations()[0];
    return {
      has: !!document.getElementById("loader"),
      pct: document.querySelector("#loader .pct")?.textContent,
      anim: anim ? anim.playState : null,
      bg: getComputedStyle(document.body).backgroundColor,
    };
  }).catch((e) => ({ evalErr: String(e).slice(0, 160) }));
  console.log(name, "early", Date.now() - t0, JSON.stringify(early));
  await nav;

  const hist = [];
  let saw50 = false, saw95 = false;
  const deadline = Date.now() + 600000;
  let lastPct = "";
  let lastChange = Date.now();
  let maxStall = 0;
  const orbitT = [];
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const orbit = document.querySelector("#loader .orbit");
      const anim = orbit && orbit.getAnimations()[0];
      return {
        pct: document.querySelector("#loader .pct")?.textContent || "",
        done: document.getElementById("loader")?.classList.contains("done") || false,
        hide: document.getElementById("loader")?.classList.contains("hide") || false,
        animT: anim ? anim.currentTime : null,
        err: window.__bootErr || null,
      };
    });
    if (s.pct !== lastPct) {
      maxStall = Math.max(maxStall, Date.now() - lastChange);
      lastChange = Date.now();
      lastPct = s.pct;
      hist.push({ t: Date.now() - t0, pct: s.pct, done: s.done });
      console.log(name, JSON.stringify(hist[hist.length - 1]));
    }
    if (s.animT != null) orbitT.push([Date.now(), s.animT]);
    if (!saw50 && Number(s.pct) >= 50) { saw50 = true; await shot(page, name + "-50.png"); }
    if (!saw95 && Number(s.pct) >= 95 && Number(s.pct) < 100) { saw95 = true; await shot(page, name + "-95.png"); }
    if (s.done) break;
    await page.waitForTimeout(200);
  }
  maxStall = Math.max(maxStall, Date.now() - lastChange);
  const before = await page.evaluate(() => ({
    cam: window.__cam ? window.__cam() : null,
    speed: window.__debug && window.__debug.state ? window.__debug.state().speed : null,
    err: window.__bootErr || null,
  })).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
  console.log(name, "before", JSON.stringify(before), "maxStallMs", maxStall);
  const clickAt = Date.now();
  const ready = await page.evaluate(() => !!document.getElementById("loader")?.classList.contains("done")).catch(() => false);
  if (ready) {
    try { await page.click("#loader .enter", { timeout: 180000 }); }
    catch (e) { console.log(name, "click-fail", String(e).slice(0, 180)); }
  } else {
    console.log(name, "skip-click");
  }
  await page.waitForTimeout(1000);
  await shot(page, name + "-after.png");
  await page.waitForTimeout(2200);
  const after = await page.evaluate(() => ({
    maxFrame: window.__maxFrameMs || 0,
    cam: window.__cam ? window.__cam() : null,
    speed: window.__debug && window.__debug.state ? window.__debug.state().speed : null,
    loader: document.getElementById("loader")?.className,
    display: document.getElementById("loader")?.style.display,
  }));
  let orbitGap = 0;
  for (let i = 1; i < orbitT.length; i++) {
    const dt = orbitT[i][0] - orbitT[i - 1][0];
    const da = (orbitT[i][1] || 0) - (orbitT[i - 1][1] || 0);
    if (dt > 400 && da < 50) orbitGap = Math.max(orbitGap, dt);
  }
  console.log(name, "after", JSON.stringify(after), "clickWait", Date.now() - clickAt, "orbitGap", orbitGap);
  console.log(name, "errors", bag.slice(0, 8));
  await cdp.detach();
  await page.close();
}

const only = process.argv[2] || "";
if (!only || only === "layout") {
  await layout("low-portrait", 390, 844, "q=low");
  await layout("low-landscape", 844, 390, "q=low");
}
if (!only || only === "dev") await throttled("dev", "http://127.0.0.1:8080/zhaowangcheng.html?fps=1");
if (!only || only === "standalone") await throttled("standalone", "http://127.0.0.1:8080/zhaowangcheng_standalone.html?fps=1");
await browser.close();
console.log("ACCEPT DONE");
