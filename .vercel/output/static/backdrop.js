// 远景：三层太行山 + 邯郸大北城贴图，以及西面 3D 近处丘陵。
// 贴图按规格坐标摆在竖直圆弧上；颜色随时段在着色器里染，不吃主场景雾。
export function bootBackdrop(THREE, opts) {
  const { backdropScene, scene, skyMat, isPhone, maps, groundY, renderer } = opts;
  const CX = 175, CZ = 190, Y0 = -15, OVERLAP = 8;
  const DEG = Math.PI / 180;

  const uDark = { value: new THREE.Color(0x4a4048) };
  const uLight = { value: new THREE.Color(0xa89890) };
  const uRimColor = { value: new THREE.Color(0xffb070) };
  const skyU = skyMat.uniforms;
  const layerRecs = [];

  const vert = `
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `;
  const frag = `
    uniform sampler2D map;
    uniform vec3 uDark;
    uniform vec3 uLight;
    uniform vec3 uRimColor;
    uniform float uFogK;
    uniform float uRim;
    uniform float uFoot0;
    uniform vec3 sunDir;
    uniform vec3 sunGlow;
    uniform vec3 bottom;
    uniform vec3 midc;
    uniform vec3 topc;
    uniform vec3 afterglow;
    uniform float uBlend;
    uniform float uAfter;
    uniform float uSoft;
    varying vec2 vUv;
    varying vec3 vWorld;

    vec3 safeNorm(vec3 v, vec3 fb) {
      float l = length(v);
      return l > 1e-4 ? v / l : fb;
    }

    vec3 duskSky(vec3 d, vec3 sd) {
      float h = clamp(d.y, 0.0, 1.0);
      vec3 flatD = safeNorm(vec3(d.x, 0.0, d.z), vec3(sd.x, 0.0, sd.z));
      vec3 flatS = safeNorm(vec3(sd.x, 0.0, sd.z), vec3(-1.0, 0.0, 0.0));
      float facing = clamp(dot(flatD, flatS) * 0.5 + 0.5, 0.0, 1.0);
      vec3 hor = mix(vec3(0.50, 0.55, 0.62), vec3(0.76, 0.44, 0.28), pow(facing, 1.15));
      vec3 col = mix(hor, vec3(0.42, 0.38, 0.48), smoothstep(0.0, 0.30, h));
      col = mix(col, vec3(0.32, 0.40, 0.52), smoothstep(0.14, 0.78, h));
      col = mix(col, vec3(0.34, 0.42, 0.54), (1.0 - facing) * 0.28);
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, 0.85);
      float s = max(dot(d, sd), 0.0);
      vec3 glow = sunGlow;
      float gl = dot(max(glow, vec3(0.0)), vec3(0.299, 0.587, 0.114));
      glow = mix(vec3(gl), glow, 0.85);
      col += glow * pow(s, 70.0) * 0.16;
      return clamp(col, vec3(0.0), vec3(4.0));
    }

    vec3 linToSrgb(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(c, vec3(0.416666)) - 0.055;
      return mix(hi, lo, step(c, vec3(0.0031308)));
    }

    vec3 skyAt(vec3 d) {
      vec3 sd = safeNorm(sunDir, vec3(0.0, 1.0, 0.0));
      vec3 duskCol = duskSky(d, sd);
      float s = max(dot(d, sd), 0.0);
      float elev = clamp(d.y, 0.0, 1.0);
      vec3 graded = mix(bottom, midc, smoothstep(0.0, 0.38, elev));
      graded = mix(graded, topc, smoothstep(0.20, 0.88, elev));
      float west = smoothstep(0.2, -0.7, d.x) * smoothstep(0.42, 0.02, d.y);
      graded = mix(graded, afterglow, west * clamp(uAfter, 0.0, 1.0));
      graded += sunGlow * pow(s, 40.0) * clamp(uSoft, 0.0, 1.0) * 0.35;
      graded *= mix(1.0, 1.55, clamp(uAfter, 0.0, 1.0));
      float luma = dot(max(graded, vec3(0.0)), vec3(0.299, 0.587, 0.114));
      graded = mix(vec3(luma), graded, 0.85);
      graded = linToSrgb(clamp(graded, 0.0, 1.0));
      return clamp(mix(duskCol, graded, clamp(uBlend, 0.0, 1.0)), 0.0, 1.0);
    }

    void main() {
      vec4 tex = texture2D(map, vUv);
      float L = clamp(dot(max(tex.rgb, vec3(0.0)), vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
      L = clamp((L - 0.38) * 1.65 + 0.40, 0.0, 1.0);
      float A = clamp(tex.a, 0.0, 1.0);
      A *= smoothstep(0.0, 0.11, vUv.x) * smoothstep(1.0, 0.89, vUv.x);
      A *= smoothstep(0.0, 0.07, vUv.y);
      if (A < 0.004) discard;
      vec3 base = mix(uDark, uLight, L);
      vec3 dir = vWorld - cameraPosition;
      float hl = length(dir.xz);
      vec3 d = vec3(0.0, 1.0, 0.0);
      if (hl > 1e-3) {
        d = vec3(dir.x / hl, 0.02, dir.z / hl);
        float dl = length(d);
        if (dl > 1e-4) d /= dl;
      }
      float foot = smoothstep(uFoot0, 0.05, vUv.y);
      float k = mix(clamp(uFogK, 0.0, 0.90), 0.99, foot);
      vec3 col = mix(base, skyAt(d), clamp(k, 0.0, 0.97));
      vec3 sun = safeNorm(sunDir, vec3(0.0, 1.0, 0.0));
      vec3 flatS = safeNorm(vec3(sun.x, 0.0, sun.z), vec3(1.0, 0.0, 0.0));
      float facing = max(dot(safeNorm(vec3(d.x, 0.0, d.z), flatS), flatS), 0.0);
      float ridge = smoothstep(0.62, 0.84, L) * (1.0 - smoothstep(0.90, 0.98, L));
      ridge *= smoothstep(0.40, 0.78, vUv.y);
      col += uRimColor * ridge * facing * facing * clamp(uRim, 0.0, 1.0) * 0.55;
      col = clamp(col, vec3(0.0), vec3(6.0));
      gl_FragColor = vec4(col * A, A);
    }
  `;

  function makeMat(tex, baseK, rim, foot0) {
    const uFogK = { value: baseK };
    const uRim = { value: 0 };
    const uFoot0 = { value: foot0 };
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex },
        uDark, uLight, uRimColor, uFogK, uRim, uFoot0,
        sunDir: skyU.sunDir,
        sunGlow: skyU.sunGlow,
        bottom: skyU.bottom,
        midc: skyU.midc,
        topc: skyU.topc,
        afterglow: skyU.afterglow,
        uBlend: skyU.uBlend,
        uAfter: skyU.uAfter,
        uSoft: skyU.uSoft,
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      side: THREE.DoubleSide,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    layerRecs.push({ baseK, rim, uFogK, uRim });
    return mat;
  }

  function arcGeo(R, height, azCenter, azWidth, mirror, segs, y0) {
    const pos = [], uv = [], idx = [];
    const half = azWidth * 0.5;
    const baseY = y0 == null ? Y0 : y0;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const az = (azCenter - half + azWidth * t) * DEG;
      const x = CX + R * Math.sin(az);
      const z = -(CZ + R * Math.cos(az));
      const u = mirror ? 1 - t : t;
      pos.push(x, baseY, z, x, baseY + height, z);
      uv.push(u, 0, u, 1);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }

  function panels(az0, az1, n) {
    const span = az1 - az0;
    const width = (span + (n - 1) * OVERLAP) / n;
    const step = width - OVERLAP;
    const out = [];
    for (let i = 0; i < n; i++) out.push({ center: az0 + width * 0.5 + i * step, width, mirror: i % 2 === 1 });
    return out;
  }

  const layers = [
    { name: "farthest", file: "mtn_farthest", R: 2000, H: 95, fogK: 0.75, order: 1, parts: panels(170, 370, 5) },
    { name: "far", file: "mtn_far", R: 1500, H: 105, fogK: 0.55, order: 2, parts: panels(180, 360, 4) },
    { name: "mid", file: "mtn_mid", R: 1000, H: 90, fogK: 0.30, order: 3, rim: true, parts: panels(200, 340, 3) },
    { name: "city", file: "city_dabei", R: 900, H: 26, fogK: 0.45, order: 4, foot0: 0.40, y0: -8, parts: [{ center: 50, width: 20, mirror: false }] },
  ];

  const size = isPhone ? "1024" : "2048";
  const segs = isPhone ? 8 : 14;
  const aniso = Math.min(isPhone ? 4 : 8, renderer.capabilities.getMaxAnisotropy() || 1);
  let left = layers.length;
  let resolveReady;
  const ready = new Promise((res) => { resolveReady = res; });
  const loader = new THREE.TextureLoader();
  const counts = {};

  for (const layer of layers) {
    const tex = loader.load(
      "/backdrop/" + layer.file + "_" + size + ".png",
      () => { if (--left <= 0) resolveReady(true); },
      undefined,
      () => { if (--left <= 0) resolveReady(false); },
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = aniso;
    const mat = makeMat(tex, layer.fogK, !!layer.rim, layer.foot0 == null ? 0.50 : layer.foot0);
    const group = new THREE.Group();
    group.name = "bd-" + layer.name;
    layer.parts.forEach((p, i) => {
      const mesh = new THREE.Mesh(arcGeo(layer.R, layer.H, p.center, p.width, p.mirror, segs, layer.y0), mat);
      mesh.name = layer.name + "-" + i + (p.mirror ? "-m" : "");
      mesh.frustumCulled = false;
      mesh.renderOrder = layer.order + i * 0.01;
      group.add(mesh);
    });
    counts[layer.name] = layer.parts.length;
    backdropScene.add(group);
  }

  // 西面近处丘陵：主场景里的 3D 地形，吃主场景雾，接在田野西缘之外。
  const az0 = 210, az1 = 330, r0 = 600, r1 = 850;
  const azN = isPhone ? 28 : 48;
  const rN = isPhone ? 8 : 12;
  function smoother(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / ((b - a) || 1)));
    return t * t * (3 - 2 * t);
  }
  function openFade(x, z) {
    const west = 1 - smoother(-480, -400, x);
    const south = 1 - smoother(-250, -180, z);
    const north = smoother(480, 550, z);
    return Math.max(west, south, north);
  }
  function hillH(az, r, x, z) {
    const u = (az - az0) / (az1 - az0);
    const v = (r - r0) / (r1 - r0);
    const eu = Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
    const ev = Math.sin(Math.PI * Math.max(0, Math.min(1, v)));
    const dome = Math.pow(eu, 0.85) * Math.pow(ev, 1.5);
    const n = 0.5 + 0.5 * (
      Math.sin(az * 0.045 + 0.7) * 0.55
      + Math.sin(az * 0.11 + r * 0.008) * 0.25
      + Math.sin(r * 0.02 - 1.4) * 0.2
    );
    const h = Math.min(35, (9 + n * 26) * dome) * openFade(x, z);
    return h;
  }
  const grid = [];
  for (let j = 0; j <= rN; j++) {
    const row = [];
    for (let i = 0; i <= azN; i++) {
      const az = az0 + (az1 - az0) * (i / azN);
      const r = r0 + (r1 - r0) * (j / rN);
      const rad = az * DEG;
      const x = CX + r * Math.sin(rad);
      const z = CZ + r * Math.cos(rad);
      row.push({ x, z, h: hillH(az, r, x, z) });
    }
    grid.push(row);
  }
  const pos = [], col = [], idx = [];
  const vertOf = new Map();
  function vid(i, j) {
    const key = i + j * (azN + 2);
    if (vertOf.has(key)) return vertOf.get(key);
    const p = grid[j][i];
    const id = pos.length / 3;
    pos.push(p.x, groundY(p.x, p.z) + p.h, -p.z);
    const g = smoother(0.35, 0.72, 0.5 + 0.5 * Math.sin(p.x * 0.02 + 1.3) * Math.cos(p.z * 0.017));
    const patch = g * smoother(2.5, 8, p.h);
    col.push(1 - patch * 0.12, 1 - patch * 0.02, 1 - patch * 0.28);
    vertOf.set(key, id);
    return id;
  }
  let kept = 0, hMax = 0;
  for (let j = 0; j < rN; j++) {
    for (let i = 0; i < azN; i++) {
      const hs = [grid[j][i].h, grid[j][i + 1].h, grid[j + 1][i].h, grid[j + 1][i + 1].h];
      let m = 0;
      for (const h of hs) { if (h > m) m = h; if (h > hMax) hMax = h; }
      if (m < 0.45) continue;
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1);
      idx.push(a, d, b, b, d, c);
      kept++;
    }
  }
  const hillGeo = new THREE.BufferGeometry();
  hillGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hillGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  hillGeo.setIndex(idx);
  hillGeo.computeVertexNormals();
  const nrm = hillGeo.getAttribute("normal");
  if (nrm && nrm.count) {
    let ny = 0;
    for (let i = 0; i < nrm.count; i++) ny += nrm.getY(i);
    if (ny < 0) {
      for (let k = 0; k < idx.length; k += 3) {
        const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t;
      }
      hillGeo.setIndex(idx);
      hillGeo.computeVertexNormals();
    }
  }
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true,
  });
  hillMat.polygonOffset = true;
  hillMat.polygonOffsetFactor = -2;
  hillMat.polygonOffsetUnits = -2;
  hillMat.onBeforeCompile = (shader) => {
    shader.uniforms.uDirt = { value: maps.dirt.color };
    shader.uniforms.uBank = { value: maps.bank.color };
    shader.uniforms.uDirtR = { value: maps.dirt.rough };
    shader.uniforms.uBankR = { value: maps.bank.rough };
    shader.uniforms.uTile = { value: 18 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHW;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform sampler2D uDirt;
        uniform sampler2D uBank;
        uniform sampler2D uDirtR;
        uniform sampler2D uBankR;
        uniform float uTile;
        varying vec3 vHW;
        float hHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float hNoise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hHash(i), b = hHash(i + vec2(1.0, 0.0)), c = hHash(i + vec2(0.0, 1.0)), d = hHash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        float hBlend(){
          float tile = max(uTile, 1e-3);
          float nse = hNoise(vHW.xz * 0.011) * 0.62 + hNoise(vHW.xz * 0.027 + 3.1) * 0.38;
          return smoothstep(0.0, 1.0, clamp((nse - 0.5) * 0.9 + 0.5, 0.0, 1.0));
        }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec2 uv = vHW.xz / max(uTile, 1e-3);
          vec3 dirt = texture2D(uDirt, uv).rgb;
          vec3 bank = texture2D(uBank, uv).rgb;
          diffuseColor.rgb *= mix(bank, dirt, hBlend());
        }`)
      .replace("#include <roughnessmap_fragment>", `
        float roughnessFactor = clamp(mix(texture2D(uBankR, vHW.xz / max(uTile, 1e-3)).g, texture2D(uDirtR, vHW.xz / max(uTile, 1e-3)).g, hBlend()), 0.45, 1.0);
      `);
  };
  hillMat.customProgramCacheKey = () => "near-hill-bank-dirt";
  const hills = new THREE.Mesh(hillGeo, hillMat);
  hills.name = "nearHills";
  hills.frustumCulled = false;
  hills.castShadow = false;
  hills.receiveShadow = false;
  scene.add(hills);

  function sync(darkHex, lightHex, mist, skyBlend) {
    uDark.value.setHex(darkHex);
    uLight.value.setHex(lightHex);
    const m = Math.max(0, Math.min(1, mist || 0));
    const blend = Math.max(0, Math.min(1, skyBlend || 0));
    const rim = (1 - blend) * (1 - m) * (isPhone ? 0 : 1);
    for (const rec of layerRecs) {
      const k = rec.baseK + m * 0.15;
      rec.uFogK.value = k < 0 ? 0 : k > 0.95 ? 0.95 : k;
      rec.uRim.value = rec.rim ? rim : 0;
    }
  }

  return {
    ready,
    sync,
    stats: { counts, hillQuads: kept, hillH: +hMax.toFixed(2) },
  };
}
