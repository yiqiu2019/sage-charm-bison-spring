// 远景：三层太行山 + 邯郸大北城 + 东/南平原树带，以及西面 3D 近处丘陵。
// 贴图按规格坐标摆在竖直圆弧上；颜色随时段在着色器里染，不吃主场景雾。
export function bootBackdrop(THREE, opts) {
  const { backdropScene, scene, skyMat, isPhone, maps, groundY, renderer, plantTime } = opts;
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
  let left = layers.length + 1;
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

  // 平原远景带。天边山影实际 170°–370°（跨过正北，止于 10°）。
  // 北端从 0° 起，与山影交叠 10°；向东、向南到 225°（5×45°）。
  // 南端比山影起点 170° 多伸出一截，是为了南护城河向南看时树带仍在画面里。
  const plainR = 1200;
  const plainPanel = 45;
  const plainN = 5;
  const plainAz0 = 0;
  const plainAz1 = plainAz0 + plainPanel * plainN;
  const plainFade = 10;
  const plainFogK = 0.30 + (0.55 - 0.30) * ((plainR - 1000) / (1500 - 1000));
  const plainAspect = 2508 / 128;
  const plainArcLen = plainR * plainPanel * DEG;
  const plainH = plainArcLen / plainAspect;
  const plainGroundV = 0.219;
  const plainGroundY = 0.8;
  const plainY0 = plainGroundY - plainGroundV * plainH;
  const plainFile = isPhone ? "plain_band_1254.webp" : "plain_band_2508.webp";
  const plainTex = loader.load(
    "/backdrop/" + plainFile,
    () => { if (--left <= 0) resolveReady(true); },
    undefined,
    () => { if (--left <= 0) resolveReady(false); },
  );
  plainTex.colorSpace = THREE.SRGBColorSpace;
  plainTex.wrapS = plainTex.wrapT = THREE.ClampToEdgeWrapping;
  plainTex.generateMipmaps = true;
  plainTex.minFilter = THREE.LinearMipmapLinearFilter;
  plainTex.magFilter = THREE.LinearFilter;
  plainTex.anisotropy = aniso;
  const plainFogU = { value: plainFogK };
  const plainRimU = { value: 0 };
  const plainVert = `
    varying vec2 vUv;
    varying vec3 vWorld;
    varying float vAz;
    attribute float aAz;
    void main() {
      vUv = uv;
      vAz = aAz;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `;
  const plainFrag = `
    uniform sampler2D map;
    uniform vec3 uDark;
    uniform vec3 uLight;
    uniform float uFogK;
    uniform vec3 sunDir;
    uniform vec3 sunGlow;
    uniform vec3 bottom;
    uniform vec3 midc;
    uniform vec3 topc;
    uniform vec3 afterglow;
    uniform float uBlend;
    uniform float uAfter;
    uniform float uSoft;
    uniform float uAz0;
    uniform float uAz1;
    uniform float uFade;
    varying vec2 vUv;
    varying vec3 vWorld;
    varying float vAz;

    vec3 safeNorm(vec3 v, vec3 fb) {
      float l = length(v);
      return l > 1e-4 ? v / l : fb;
    }

    vec3 duskSky(vec3 d, vec3 sd) {
      float h = clamp(d.y, 0.0, 1.0);
      vec3 flatD = safeNorm(vec3(d.x, 0.0, d.z), vec3(sd.x, 0.0, sd.z));
      vec3 flatS = safeNorm(vec3(sd.x, 0.0, sd.z), vec3(-1.0, 0.0, 0.0));
      float facing = clamp(dot(flatD, flatS) * 0.5 + 0.5, 0.0, 1.0);
      vec3 hor = mix(vec3(0.50, 0.55, 0.62), vec3(0.76, 0.44, 0.28), pow(max(facing, 0.0), 1.15));
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
      vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(0.416666)) - 0.055;
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
      vec4 tex = texture2D(map, clamp(vUv, vec2(0.0), vec2(1.0)));
      float L = dot(max(tex.rgb, vec3(0.0)), vec3(0.299, 0.587, 0.114));
      if (!(L == L)) L = 0.0;
      L = clamp(L, 0.0, 1.0);
      float A = tex.a;
      if (!(A == A) || A < 0.0) A = 0.0;
      if (A > 1.0) A = 1.0;
      float span = max(uFade, 1e-3);
      float fadeIn = smoothstep(uAz0, uAz0 + span, vAz);
      float fadeOut = 1.0 - smoothstep(uAz1 - span, uAz1, vAz);
      A *= clamp(fadeIn, 0.0, 1.0) * clamp(fadeOut, 0.0, 1.0);
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
      vec3 sky = skyAt(d);
      float foot = smoothstep(0.24, 0.02, vUv.y);
      float k = mix(clamp(uFogK, 0.0, 0.90), 0.98, clamp(foot, 0.0, 1.0));
      vec3 col = mix(base, sky, clamp(k, 0.0, 0.98));
      float skyL = dot(max(sky, vec3(0.0)), vec3(0.299, 0.587, 0.114));
      float colL = dot(max(col, vec3(0.0)), vec3(0.299, 0.587, 0.114));
      float capL = skyL * 0.90;
      if (colL > capL && colL > 1e-4) col *= capL / colL;
      col = clamp(col, vec3(0.0), vec3(4.0));
      if (!(col.r == col.r) || !(col.g == col.g) || !(col.b == col.b)) col = vec3(0.35, 0.32, 0.36);
      gl_FragColor = vec4(col * A, A);
    }
  `;
  const plainMat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: plainTex },
      uDark, uLight,
      uFogK: plainFogU,
      sunDir: skyU.sunDir,
      sunGlow: skyU.sunGlow,
      bottom: skyU.bottom,
      midc: skyU.midc,
      topc: skyU.topc,
      afterglow: skyU.afterglow,
      uBlend: skyU.uBlend,
      uAfter: skyU.uAfter,
      uSoft: skyU.uSoft,
      uAz0: { value: plainAz0 },
      uAz1: { value: plainAz1 },
      uFade: { value: plainFade },
    },
    vertexShader: plainVert,
    fragmentShader: plainFrag,
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
  plainMat.precision = "highp";
  plainMat.customProgramCacheKey = () => "plain-band-r1200-v1";
  layerRecs.push({ baseK: plainFogK, rim: false, uFogK: plainFogU, uRim: plainRimU });

  function plainGeo(azCenter, azWidth, mirror) {
    const pos = [], uv = [], azs = [], idx = [];
    const half = azWidth * 0.5;
    const nSeg = segs;
    for (let i = 0; i <= nSeg; i++) {
      const t = i / nSeg;
      const az = azCenter - half + azWidth * t;
      const rad = az * DEG;
      const x = CX + plainR * Math.sin(rad);
      const z = -(CZ + plainR * Math.cos(rad));
      const u = mirror ? 1 - t : t;
      pos.push(x, plainY0, z, x, plainY0 + plainH, z);
      uv.push(u, 0, u, 1);
      azs.push(az, az);
    }
    for (let i = 0; i < nSeg; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("aAz", new THREE.Float32BufferAttribute(azs, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }
  const plainGroup = new THREE.Group();
  plainGroup.name = "bd-plain";
  for (let i = 0; i < plainN; i++) {
    const center = plainAz0 + plainPanel * (i + 0.5);
    const mesh = new THREE.Mesh(plainGeo(center, plainPanel, i % 2 === 1), plainMat);
    mesh.name = "plain-" + i + (i % 2 === 1 ? "-m" : "");
    mesh.frustumCulled = false;
    mesh.renderOrder = 2.5 + i * 0.01;
    plainGroup.add(mesh);
  }
  counts.plain = plainN;
  backdropScene.add(plainGroup);
  const plainStats = {
    az0: plainAz0,
    az1: plainAz1,
    fade: plainFade,
    fogK: +plainFogK.toFixed(3),
    panels: plainN,
    panelDeg: plainPanel,
    H: +plainH.toFixed(2),
    y0: +plainY0.toFixed(2),
    yGround: plainGroundY,
    groundV: plainGroundV,
    file: plainFile,
    R: plainR,
  };
  if (typeof window !== "undefined") window.__plainBand = plainStats;

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
  function reliefAt(x, z) {
    const dx = x - CX, dz = z - CZ;
    const r = Math.hypot(dx, dz) || 1;
    let az = Math.atan2(dx, dz) / DEG;
    if (az < 0) az += 360;
    const h = hillH(az, r, x, z);
    return { r, az, h, y: groundY(x, z) + h };
  }
  function slopeInfo(x, z) {
    const e = 12;
    const y0 = reliefAt(x, z);
    const dx = (reliefAt(x + e, z).y - reliefAt(x - e, z).y) / (2 * e);
    const dz = (reliefAt(x, z + e).y - reliefAt(x, z - e).y) / (2 * e);
    const slope = Math.atan(Math.hypot(dx, dz)) / DEG;
    let nx = -dx, ny = 1, nz = -dz;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    let acc = 0;
    const rad = 40, n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      acc += reliefAt(x + Math.cos(a) * rad, z + Math.sin(a) * rad).y;
    }
    return { r: y0.r, az: y0.az, h: y0.h, y: y0.y, slope, nx, ny, nz, dx, dz, conc: acc / n - y0.y };
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
    const valley = smoother(0.25, 2.2, slopeInfo(p.x, p.z).conc);
    col.push(valley, 1, 1);
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
  const denTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]), 2, 2, THREE.RGBAFormat);
  denTex.colorSpace = THREE.NoColorSpace;
  denTex.wrapS = denTex.wrapT = THREE.ClampToEdgeWrapping;
  denTex.minFilter = THREE.LinearFilter;
  denTex.magFilter = THREE.LinearFilter;
  denTex.generateMipmaps = false;
  denTex.unpackAlignment = 1;
  denTex.needsUpdate = true;
  const uDen = { value: denTex };
  const uDenRect = { value: new THREE.Vector4(-1e9, -1e9, 0, 0) };
  const treeTime = plantTime || { value: 0 };
  const tintDusk = new THREE.Color(0x6a5346);
  const tintNight = new THREE.Color(0x2a3548);
  const tintMist = new THREE.Color(0xc9ced3);
  const uTint = { value: tintDusk.clone() };
  const hillStats = { pending: true, trees: 0, shrubs: 0, total: 0, zones: {}, species: {} };

  const hillMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true,
  });
  hillMat.polygonOffset = true;
  hillMat.polygonOffsetFactor = -2;
  hillMat.polygonOffsetUnits = -2;
  hillMat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: new THREE.Color(0x8A7A58) };
    shader.uniforms.uRock = { value: new THREE.Color(0x7A7468) };
    shader.uniforms.uDen = uDen;
    shader.uniforms.uDenRect = uDenRect;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
varying vec3 vHW;
varying vec3 vNw;
varying float vValley;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
  vHW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  {
    float onl = length(objectNormal);
    vec3 on = onl > 1e-5 ? objectNormal / onl : vec3(0.0, 1.0, 0.0);
    vNw = mat3(modelMatrix) * on;
  }`)
      .replace("#include <color_vertex>", `#include <color_vertex>
#ifdef USE_COLOR
  vValley = clamp(color.r, 0.0, 1.0);
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 uGrass;
uniform vec3 uRock;
uniform sampler2D uDen;
uniform vec4 uDenRect;
varying vec3 vHW;
varying vec3 vNw;
varying float vValley;
float hHash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hHash(i), b = hHash(i + vec2(1.0, 0.0));
  float c = hHash(i + vec2(0.0, 1.0)), d = hHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`)
      .replace("#include <color_fragment>", `{
  float ny = abs(vNw.y) / max(length(vNw), 1e-5);
  ny = clamp(ny, 0.0, 1.0);
  float slope = acos(ny);
  float steep = smoothstep(0.14, 0.42, slope);
  vec3 albedo = mix(uGrass, uRock, steep);
  albedo *= mix(1.0, 0.85, clamp(vValley, 0.0, 1.0));
  float nA = hNoise(vHW.xz * 0.016);
  float nB = hNoise(vHW.xz * 0.031 + vec2(19.0, 7.0));
  float macro = (nA * 0.62 + nB * 0.38 - 0.5) * 2.0;
  albedo *= clamp(1.0 + macro * 0.08, 0.75, 1.25);
  float den = 0.0;
  if (uDenRect.z > 1e-8 && uDenRect.w > 1e-8) {
    vec2 dUv = vec2((vHW.x - uDenRect.x) * uDenRect.z, (vHW.z - uDenRect.y) * uDenRect.w);
    if (dUv.x > 0.0 && dUv.x < 1.0 && dUv.y > 0.0 && dUv.y < 1.0) den = texture2D(uDen, dUv).r;
  }
  den = clamp(den, 0.0, 1.0);
  albedo *= mix(1.0, 0.87, den);
  float sumC = albedo.r + albedo.g + albedo.b;
  if (!(sumC == sumC) || sumC < 0.0 || sumC > 4.0) albedo = uGrass;
  diffuseColor.rgb = clamp(albedo, 0.0, 1.0);
}`)
      .replace("#include <roughnessmap_fragment>", `float roughnessFactor = 0.96;`);
  };
  hillMat.customProgramCacheKey = () => "near-hill-cover-1";
  const hills = new THREE.Mesh(hillGeo, hillMat);
  hills.name = "nearHills";
  hills.frustumCulled = false;
  hills.castShadow = false;
  hills.receiveShadow = false;
  scene.add(hills);

  function scheduleHillTrees() {
    const url = "/textures/hill_trees/hill_trees.json";
    fetch(url).then((r) => {
      if (!r.ok) throw new Error("hill json " + r.status);
      return r.json();
    }).then((json) => {
      const cells = Array.isArray(json && json.cells) ? json.cells : [];
      const groups = { oak: [], pine: [], smoke: [], bare: [], bush: [], smokeBush: [] };
      for (const c of cells) {
        if (!c || !c.uv || !c.heightRange_m || !(c.aspect > 0)) continue;
        if (c.name === "bush_d") groups.smokeBush.push(c);
        else if (groups[c.species]) groups[c.species].push(c);
      }
      if (!groups.smokeBush.length && groups.bush.length) groups.smokeBush.push(groups.bush[groups.bush.length - 1]);
      const file = isPhone ? (json.atlas && json.atlas.file_low) : (json.atlas && json.atlas.file_high);
      if (!file || !groups.oak.length) throw new Error("hill atlas empty");
      const tex = new THREE.TextureLoader().load("/textures/hill_trees/" + file);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = Math.min(isPhone ? 4 : 8, renderer.capabilities.getMaxAnisotropy() || 1);

      function mulberry32(a) {
        return function () {
          a |= 0; a = a + 0x6D2B79F5 | 0;
          let t = Math.imul(a ^ a >>> 15, 1 | a);
          t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }
      function h2(ix, iz) {
        let a = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
        a = Math.imul(a ^ (a >>> 13), 1274126177);
        return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
      }
      function vnoise(x, z) {
        const x0 = Math.floor(x), z0 = Math.floor(z);
        const fx = x - x0, fz = z - z0;
        const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
        const a = h2(x0, z0), b = h2(x0 + 1, z0), c = h2(x0, z0 + 1), d = h2(x0 + 1, z0 + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      }
      function clump(x, z) {
        return vnoise(x / 96, z / 96) * 0.58 + vnoise(x / 44 + 8.2, z / 44 - 3.4) * 0.42;
      }
      function pick(rng, list) {
        if (!list || !list.length) return null;
        return list[(rng() * list.length) | 0];
      }
      const rng = mulberry32(0x1e11a);
      const step = 5;
      const densMul = isPhone ? 0.5 : 1;
      const cap = isPhone ? 4000 : 8000;
      const CELL = 6;
      const buckets = new Map();
      function tooClose(x, z, minD, pred) {
        const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
        const rad = Math.ceil(minD / CELL) + 1;
        const min2 = minD * minD;
        for (let iz = cz - rad; iz <= cz + rad; iz++) {
          for (let ix = cx - rad; ix <= cx + rad; ix++) {
            const arr = buckets.get(ix + "," + iz);
            if (!arr) continue;
            for (const p of arr) {
              if (pred && !pred(p)) continue;
              const dx = p.x - x, dz = p.z - z;
              if (dx * dx + dz * dz < min2) return true;
            }
          }
        }
        return false;
      }
      const placed = [];
      function addPlant(p) {
        placed.push(p);
        const k = (Math.floor(p.x / CELL)) + "," + (Math.floor(p.z / CELL));
        let a = buckets.get(k);
        if (!a) buckets.set(k, a = []);
        a.push(p);
      }
      function choose(zone, roll) {
        if (zone === "foot") return roll < 0.86 ? ["shrub", "bush"] : ["shrub", "smokeBush"];
        if (zone === "valley") {
          if (roll < 0.70) return ["tree", "oak"];
          if (roll < 0.90) return ["tree", "pine"];
          return ["tree", "smoke"];
        }
        if (zone === "north") {
          if (roll < 0.55) return ["tree", "pine"];
          if (roll < 0.90) return ["tree", "oak"];
          return ["shrub", "bush"];
        }
        if (zone === "south") {
          if (roll < 0.40) return ["tree", "oak"];
          if (roll < 0.85) return ["shrub", "bush"];
          if (roll < 0.925) return ["tree", "smoke"];
          return ["shrub", "smokeBush"];
        }
        if (zone === "ridge") {
          if (roll < 0.62) return ["shrub", "bush"];
          if (roll < 0.84) return ["tree", "bare"];
          return ["tree", "oak"];
        }
        if (roll < 0.36) return ["tree", "oak"];
        if (roll < 0.52) return ["tree", "pine"];
        if (roll < 0.88) return ["shrub", "bush"];
        return ["shrub", "smokeBush"];
      }
      const footStep = isPhone ? 9 : 7;
      let footN = 0;
      const footCap = isPhone ? 180 : 420;
      for (let r = r0 - 30; r < r0 - 1 && footN < footCap; r += footStep) {
        const dAz = (footStep / Math.max(r, 80)) / DEG;
        for (let az = az0 + 1.2; az < az1 - 1.2 && footN < footCap; az += dAz) {
          const x = CX + r * Math.sin(az * DEG) + (rng() - 0.5) * footStep * 0.85;
          const z = CZ + r * Math.cos(az * DEG) + (rng() - 0.5) * footStep * 0.85;
          const s = reliefAt(x, z);
          if (s.h > 1.05) continue;
          const x2 = CX + (r + 32) * Math.sin(az * DEG);
          const z2 = CZ + (r + 32) * Math.cos(az * DEG);
          if (reliefAt(x2, z2).h < 1.5) continue;
          if (rng() > 0.4 * densMul) continue;
          const sp = rng() < 0.86 ? "bush" : "smokeBush";
          const cell = pick(rng, groups[sp]);
          if (!cell) continue;
          const hgt = cell.heightRange_m[0] + (cell.heightRange_m[1] - cell.heightRange_m[0]) * rng();
          const width = hgt * cell.aspect;
          if (tooClose(x, z, 2.4, (q) => q.kind === "shrub")) continue;
          addPlant({
            x, z, y: s.y, kind: "shrub", sp, zone: "footslope",
            hgt, width, cell, flip: rng() < 0.5 ? -1 : 1,
          });
          footN++;
        }
      }
      for (let r = r0 + 8; r <= r1 - 6 && placed.length < cap; r += step) {
        const dAz = (step / r) / DEG;
        for (let az = az0 + dAz * 0.37; az < az1 - 0.25 && placed.length < cap; az += dAz) {
          let x = CX + r * Math.sin(az * DEG) + (rng() - 0.5) * step * 0.92;
          let z = CZ + r * Math.cos(az * DEG) + (rng() - 0.5) * step * 0.92;
          let s = reliefAt(x, z);
          if (s.az < az0 + 0.6 || s.az > az1 - 0.6 || s.r < r0 + 1 || s.r > r1 - 1) continue;
          if (s.h < 1.6) continue;
          const g = slopeInfo(x, z);
          if (g.slope > 35) continue;
          const foot = s.r < r0 + 34;
          const far = smoother(680, 840, s.r);
          const distK = (0.5 + 0.5 * far) * densMul;
          const cl = clump(x, z);
          const valleyW = smoother(0.4, 1.9, g.conc);
          const ridgeW = smoother(-0.8, -2.5, g.conc) * (1 - valleyW);
          const northW = smoother(0.04, 0.13, g.nz) * (1 - valleyW) * (1 - ridgeW);
          const southW = smoother(0.04, 0.13, -g.nz) * (1 - valleyW) * (1 - ridgeW);
          let zone = "neutral";
          let p = 0;
          if (foot) { zone = "foot"; p = 0.58 * (0.5 + 0.5 * cl) * densMul; }
          else if (valleyW > 0.45 && valleyW >= ridgeW) { zone = "valley"; p = 0.93 * (0.82 + 0.18 * cl) * distK; }
          else if (ridgeW > 0.48) { zone = "ridge"; p = 0.22 * (0.4 + 0.6 * cl) * distK; }
          else if (northW > 0.42 && northW >= southW) { zone = "north"; p = 0.8 * (0.72 + 0.28 * cl) * distK; }
          else if (southW > 0.42) { zone = "south"; p = (cl > 0.48 ? 0.86 : 0.04) * distK; }
          else p = (cl > 0.52 ? 0.74 : 0.04) * distK;
          if (rng() > p) continue;
          let [kind, sp] = choose(zone, rng());
          const grazed = 1 - smoother(640, 780, s.r);
          if (kind === "tree" && zone !== "ridge" && grazed > 0.35 && rng() < grazed * 0.8) {
            kind = "shrub";
            sp = rng() < 0.82 ? "bush" : "smokeBush";
          }
          if (zone === "ridge" && kind === "tree") {
            const gl = Math.hypot(g.dx, g.dz) || 1;
            const push = 10 + rng() * 10;
            x -= (g.dx / gl) * push;
            z -= (g.dz / gl) * push;
            s = reliefAt(x, z);
            if (s.h < 1.6 || s.az < az0 || s.az > az1) continue;
            const g2 = slopeInfo(x, z);
            if (g2.slope > 35) continue;
          }
          const cell = pick(rng, groups[sp]);
          if (!cell) continue;
          const hgt = cell.heightRange_m[0] + (cell.heightRange_m[1] - cell.heightRange_m[0]) * rng();
          const width = hgt * cell.aspect;
          const minD = kind === "tree" ? Math.max(4.4, 0.6 * width) : 1.5;
          if (tooClose(x, z, minD, (q) => (kind === "shrub" ? q.kind === "shrub" : q.kind === "tree"))) continue;
          if (kind === "shrub" && tooClose(x, z, 1.6, (q) => q.kind === "tree")) continue;
          addPlant({ x, z, y: s.y, kind, sp, zone, hgt, width, cell, flip: rng() < 0.5 ? -1 : 1 });
        }
      }
      const valleyTrees = placed.filter((q) => q.kind === "tree" && q.zone === "valley");
      for (const t of valleyTrees) {
        if (placed.length >= cap) break;
        if (rng() > 0.16) continue;
        const a = rng() * Math.PI * 2;
        const d = 2.3 + rng() * 2.2;
        const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        const s = reliefAt(x, z);
        if (s.h < 1.6) continue;
        if (tooClose(x, z, 1.5, (q) => q.kind === "shrub")) continue;
        const cell = pick(rng, groups.bush);
        if (!cell) continue;
        const hgt = cell.heightRange_m[0] + (cell.heightRange_m[1] - cell.heightRange_m[0]) * rng();
        addPlant({
          x, z, y: s.y, kind: "shrub", sp: "bush", zone: "under",
          hgt, width: hgt * cell.aspect, cell, flip: rng() < 0.5 ? -1 : 1,
        });
      }
      if (!placed.length) throw new Error("hill trees none");
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.translate(0, 0.5, 0);
      const uvA = new Float32Array(placed.length * 4);
      const flipA = new Float32Array(placed.length);
      const dummy = new THREE.Object3D();
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
        map: tex, color: 0xffffff, alphaTest: 0.4, transparent: false,
        side: THREE.DoubleSide, fog: true, toneMapped: true,
      }), placed.length);
      mesh.material.customProgramCacheKey = () => "hill-tree-billboard-1";
      if (!isPhone) mesh.material.alphaToCoverage = true;
      mesh.material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = treeTime;
        shader.uniforms.uWind = { value: new THREE.Vector2(1, 0.7) };
        shader.uniforms.uTint = uTint;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>
attribute vec4 aUvRect;
attribute float aFlip;
uniform float uTime;
uniform vec2 uWind;
varying vec2 vUvG;`)
          .replace("#include <uv_vertex>", `#include <uv_vertex>
{
  vec2 tuv = uv;
  if (aFlip < 0.0) tuv.x = 1.0 - tuv.x;
  vUvG = vec2(mix(aUvRect.x, aUvRect.z, tuv.x), mix(aUvRect.y, aUvRect.w, tuv.y));
}`)
          .replace("#include <project_vertex>", `vec4 mvPosition;
{
  vec3 iPos = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  float iW = max(length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z)), 1e-5);
  float iH = max(length(vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z)), 1e-5);
  vec2 toCam = cameraPosition.xz - iPos.xz;
  float cd = length(toCam);
  vec2 right = cd > 1e-4 ? vec2(toCam.y, -toCam.x) / cd : vec2(1.0, 0.0);
  float hh = clamp(position.y, 0.0, 1.0);
  float wlen = length(uWind);
  vec2 wdir = wlen > 1e-5 ? uWind / wlen : vec2(1.0, 0.0);
  vec2 hp = fract(iPos.xz * vec2(0.1031, 0.1037));
  hp += dot(hp, hp.yx + 19.19);
  float phase = fract((hp.x + hp.y) * hp.x) * 6.2831853;
  float gust = 0.62 + 0.38 * sin(uTime * 0.23 + iPos.x * 0.011 + iPos.z * 0.008);
  gust *= 0.78 + 0.22 * sin(uTime * 0.09 + 1.4);
  float th = uTime * 1.15 + phase - dot(iPos.xz, wdir) * 0.02;
  float wave = sin(th) * 0.7 + sin(th * 0.53 + phase) * 0.3;
  float sway = hh * hh * gust * wave * iH * 0.05;
  sway = clamp(sway, -iH * 0.12, iH * 0.12);
  vec3 world = iPos;
  world.x += right.x * position.x * iW + wdir.x * sway;
  world.z += right.y * position.x * iW + wdir.y * sway;
  world.y += position.y * iH;
  vec4 wpos = modelMatrix * vec4(world, 1.0);
  mvPosition = viewMatrix * wpos;
  gl_Position = projectionMatrix * mvPosition;
}`);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>
uniform vec3 uTint;
varying vec2 vUvG;`)
          .replace("#include <map_fragment>", `{
  vec4 sampledDiffuseColor = texture2D(map, clamp(vUvG, 0.0, 1.0));
  vec3 tint = clamp(uTint, vec3(0.0), vec3(2.5));
  sampledDiffuseColor.rgb = clamp(sampledDiffuseColor.rgb * tint, vec3(0.0), vec3(4.0));
  float a = sampledDiffuseColor.a;
  if (!(a == a) || a < 0.0) a = 0.0;
  if (a > 1.0) a = 1.0;
  sampledDiffuseColor.a = a;
  float sumC = sampledDiffuseColor.r + sampledDiffuseColor.g + sampledDiffuseColor.b;
  if (!(sumC == sumC)) sampledDiffuseColor.rgb = vec3(0.04);
  diffuseColor *= sampledDiffuseColor;
}`);
      };
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      const denPad = 24;
      placed.forEach((p, i) => {
        const uv = p.cell.uv;
        uvA[i * 4] = uv.u0; uvA[i * 4 + 1] = uv.v0; uvA[i * 4 + 2] = uv.u1; uvA[i * 4 + 3] = uv.v1;
        flipA[i] = p.flip;
        const wx = p.x, wz = -p.z;
        dummy.position.set(wx, p.y - 0.3, wz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(Math.max(0.4, p.width), Math.max(0.4, p.hgt), 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
        hillStats.zones[p.zone] = (hillStats.zones[p.zone] || 0) + 1;
        hillStats.species[p.cell.name] = (hillStats.species[p.cell.name] || 0) + 1;
        if (p.kind === "tree") hillStats.trees++;
        else hillStats.shrubs++;
      });
      geo.setAttribute("aUvRect", new THREE.InstancedBufferAttribute(uvA, 4));
      geo.setAttribute("aFlip", new THREE.InstancedBufferAttribute(flipA, 1));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = "hillTrees";
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      const W = 160, H = 160;
      const spanX = Math.max(8, (maxX - minX) + denPad * 2);
      const spanZ = Math.max(8, (maxZ - minZ) + denPad * 2);
      const ox = minX - denPad, oz = minZ - denPad;
      const data = new Uint8Array(W * H * 4);
      for (const p of placed) {
        if (p.kind !== "tree") continue;
        const wx = p.x, wz = -p.z;
        const px = ((wx - ox) / spanX) * (W - 1);
        const py = ((wz - oz) / spanZ) * (H - 1);
        const rad = 12;
        const rx = (rad / spanX) * (W - 1);
        const ry = (rad / spanZ) * (H - 1);
        const x0 = Math.max(0, Math.floor(px - rx - 1));
        const x1 = Math.min(W - 1, Math.ceil(px + rx + 1));
        const y0 = Math.max(0, Math.floor(py - ry - 1));
        const y1 = Math.min(H - 1, Math.ceil(py + ry + 1));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const dx = (x - px) / Math.max(rx, 1e-3);
            const dy = (y - py) / Math.max(ry, 1e-3);
            const d2 = dx * dx + dy * dy;
            if (d2 > 1) continue;
            const i = (x + y * W) * 4;
            data[i] = Math.min(255, data[i] + (1 - d2) * 0.46 * 255);
            data[i + 3] = 255;
          }
        }
      }
      const next = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
      next.colorSpace = THREE.NoColorSpace;
      next.wrapS = next.wrapT = THREE.ClampToEdgeWrapping;
      next.minFilter = THREE.LinearFilter;
      next.magFilter = THREE.LinearFilter;
      next.generateMipmaps = false;
      next.unpackAlignment = 1;
      next.needsUpdate = true;
      uDen.value = next;
      uDenRect.value.set(ox, oz, 1 / spanX, 1 / spanZ);
      hillStats.pending = false;
      hillStats.total = placed.length;
      hillStats.file = file;
      if (mesh.boundingSphere) {
        hillStats.radius = +mesh.boundingSphere.radius.toFixed(1);
        const c = mesh.boundingSphere.center;
        hillStats.center = [+c.x.toFixed(0), +c.y.toFixed(0), +c.z.toFixed(0)];
      }
      if (typeof window !== "undefined") window.__hillTrees = hillStats;
    }).catch((err) => {
      hillStats.pending = false;
      hillStats.error = String(err && err.message || err);
      if (typeof window !== "undefined") window.__hillTrees = hillStats;
      console.error(err);
    });
  }
  scheduleHillTrees();

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
    uTint.value.copy(tintDusk).lerp(tintNight, blend).lerp(tintMist, m);
  }

  return {
    ready,
    sync,
    stats: { counts, hillQuads: kept, hillH: +hMax.toFixed(2), hillTrees: hillStats, plain: plainStats },
  };
}
