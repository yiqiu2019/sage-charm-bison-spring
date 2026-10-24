import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// 画面后期 P1。不改模型、材质和线性距离雾参数。
// 高度雾是屏幕空间按世界 Y 衰减，不是 FogExp2（规格禁止指数距离雾）。

const VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tAO;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uFogColor;
uniform float uExposure;
uniform float uSat;
uniform float uShadow;
uniform float uHigh;
uniform float uContrast;
uniform float uFogH;
uniform float uAO;
uniform float uVig;
uniform float uGrain;

vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 agx(vec3 color) {
  const mat3 to2020 = mat3(
    vec3(0.6274, 0.0691, 0.0164),
    vec3(0.3293, 0.9195, 0.0880),
    vec3(0.0433, 0.0113, 0.8956)
  );
  const mat3 toSrgb = mat3(
    vec3(1.6605, -0.1246, -0.0182),
    vec3(-0.5876, 1.1329, -0.1006),
    vec3(-0.0728, -0.0083, 1.1187)
  );
  const mat3 insetM = mat3(
    vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
  );
  const mat3 outsetM = mat3(
    vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
  );
  color *= max(uExposure, 0.0);
  color = to2020 * color;
  color = insetM * color;
  color = max(color, vec3(1e-10));
  color = log2(color);
  color = (color - (-12.47393)) / (4.026069 - (-12.47393));
  color = clamp(color, 0.0, 1.0);
  color = agxContrast(color);
  color = outsetM * color;
  color = pow(max(color, vec3(0.0)), vec3(2.2));
  color = toSrgb * color;
  return clamp(color, 0.0, 1.0);
}

vec3 encSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(0.416666667)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

float grainOf(vec2 p) {
  float h = sin(dot(p, vec2(127.1, 311.7))) * 43758.5453;
  h = h - floor(h);
  if (!(h == h)) h = 0.5;
  return h;
}

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  // 不要把过亮或非有限像素换成一块纯灰：那块灰会盖住城门。
  // Inf 能被 clamp 拉回来；NaN 只能落到暗色，真正的 NaN 片元应在材质里被 discard。
  if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.02, 0.018, 0.016);
  c = clamp(c, vec3(0.0), vec3(6.0));

  float ao = texture2D(tAO, vUv).r;
  if (!(ao == ao)) ao = 1.0;
  ao = clamp(ao, 0.0, 1.0);
  c *= mix(1.0, ao, clamp(uAO, 0.0, 1.0));

  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float sat = clamp(uSat, 0.0, 1.5);
  c = mix(vec3(luma), c, sat);
  float sh = 1.0 - smoothstep(0.02, 0.42, luma);
  float hi = smoothstep(0.55, 1.5, luma);
  vec3 cool = vec3(luma) * vec3(0.80, 0.88, 1.06);
  vec3 warm = vec3(luma) * vec3(1.06, 0.97, 0.86);
  c = mix(c, mix(c, cool, 0.7), clamp(sh * uShadow, 0.0, 0.5));
  c = mix(c, mix(c, warm, 0.7), clamp(hi * uHigh, 0.0, 0.5));

  float depth = texture2D(tDepth, vUv).x;
  if (!(depth == depth)) depth = 1.0;
  if (depth < 0.9995) {
    vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uInvProj * clip;
    float w = view.w;
    if (!(w == w) || abs(w) < 1e-5) w = 1.0;
    view.xyz /= w;
    vec4 world = uCamWorld * vec4(view.xyz, 1.0);
    float y = world.y;
    if (!(y == y)) y = 8.0;
    float hy = max(y, 0.0);
    float hden = exp(-hy / 6.8);
    if (!(hden == hden)) hden = 0.0;
    float fogAmt = clamp(uFogH, 0.0, 1.0) * hden;
    fogAmt = clamp(fogAmt, 0.0, 0.72);
    vec3 fogC = uFogColor;
    float fs = fogC.r + fogC.g + fogC.b;
    if (!(fs == fs)) fogC = vec3(0.55, 0.5, 0.46);
    c = mix(c, fogC, fogAmt);
  }

  c = clamp(c, vec3(0.0), vec3(8.0));
  vec3 mapped = agx(c);
  vec3 scurve = mapped * mapped * (3.0 - 2.0 * mapped);
  mapped = mix(mapped, scurve, clamp(uContrast, 0.0, 1.0));
  vec2 q = vUv - 0.5;
  float vig = smoothstep(0.42, 1.08, length(q) * 1.4142);
  mapped *= mix(1.0, 0.85, vig * clamp(uVig, 0.0, 1.0));
  vec3 enc = encSRGB(mapped);
  float g = grainOf(gl_FragCoord.xy) - 0.5;
  enc += g * clamp(uGrain, 0.0, 0.05);
  enc = max(enc, vec3(0.04));
  gl_FragColor = vec4(clamp(enc, 0.0, 1.0), 1.0);
}
`;

function makeWhite(THREE) {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

export function bootPost(ctx) {
  const { THREE, renderer, scene, camera, backdropScene, backdropCam, isPhone, sun, params } = ctx;
  const enabled = params.get("post") !== "0";
  const useBloom = enabled && !isPhone;
  const useAO = enabled && !isPhone;
  const info = {
    enabled,
    phone: isPhone,
    ao: useAO,
    bloom: useBloom,
    aoErr: null,
    exposure: 1.1,
    sat: 0.83,
    shadowTint: 0.1,
    highTint: 0.08,
    contrast: 0.2,
    fogH: 0.16,
    bloomStrength: 0.14,
  };
  window.__postInfo = info;

  const shadowOrig = sun && sun.shadow ? {
    radius: sun.shadow.radius,
    bias: sun.shadow.bias,
    normalBias: sun.shadow.normalBias,
    left: sun.shadow.camera.left,
    right: sun.shadow.camera.right,
    top: sun.shadow.camera.top,
    bottom: sun.shadow.camera.bottom,
    near: sun.shadow.camera.near,
    far: sun.shadow.camera.far,
  } : null;

  const size = new THREE.Vector2(Math.max(1, renderer.domElement.width), Math.max(1, renderer.domElement.height));
  const beauty = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  beauty.texture.colorSpace = THREE.LinearSRGBColorSpace;
  beauty.depthTexture.format = THREE.DepthFormat;
  beauty.depthTexture.type = THREE.UnsignedIntType;

  const white = makeWhite(THREE);
  let ao = null;
  if (useAO) {
    ao = new GTAOPass(scene, camera, Math.max(1, size.x >> 1), Math.max(1, size.y >> 1));
    ao.output = GTAOPass.OUTPUT.Off;
    ao.updateGtaoMaterial({
      radius: 0.55,
      distanceExponent: 1.35,
      thickness: 0.55,
      distanceFallOff: 0.8,
      scale: 1.05,
      samples: 8,
    });
  }
  let bloom = null;
  if (useBloom) {
    bloom = new UnrealBloomPass(size.clone(), 0.12, 0.4, 1.45);
  }

  const uniforms = {
    tDiffuse: { value: beauty.texture },
    tDepth: { value: beauty.depthTexture },
    tAO: { value: white },
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uFogColor: { value: new THREE.Color(0xb97351) },
    uExposure: { value: 1.1 },
    uSat: { value: 0.83 },
    uShadow: { value: 0.1 },
    uHigh: { value: 0.08 },
    uContrast: { value: 0.2 },
    uFogH: { value: 0.16 },
    uAO: { value: 0 },
    uVig: { value: isPhone ? 0 : 1 },
    uGrain: { value: isPhone ? 0 : 0.012 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VS,
    fragmentShader: FS,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  mat.customProgramCacheKey = () => "zwc-post-p1";
  const fsQuad = new FullScreenQuad(mat);

  function applyShadow(on) {
    if (!sun || !sun.shadow || !shadowOrig || isPhone) return;
    const cam = sun.shadow.camera;
    if (on) {
      sun.shadow.radius = 2;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.05;
      cam.left = -64;
      cam.right = 64;
      cam.top = 64;
      cam.bottom = -64;
      cam.near = 8;
      cam.far = 190;
    } else {
      sun.shadow.radius = shadowOrig.radius;
      sun.shadow.bias = shadowOrig.bias;
      sun.shadow.normalBias = shadowOrig.normalBias;
      cam.left = shadowOrig.left;
      cam.right = shadowOrig.right;
      cam.top = shadowOrig.top;
      cam.bottom = shadowOrig.bottom;
      cam.near = shadowOrig.near;
      cam.far = shadowOrig.far;
    }
    cam.updateProjectionMatrix();
  }
  applyShadow(enabled && !isPhone);

  function setSize() {
    const w = Math.max(1, renderer.domElement.width);
    const h = Math.max(1, renderer.domElement.height);
    if (w === size.x && h === size.y) return;
    size.set(w, h);
    beauty.setSize(w, h);
    if (bloom) bloom.setSize(w, h);
    if (ao) ao.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  function sync(u) {
    const num = (v, d) => (typeof v === "number" && v === v ? v : d);
    info.exposure = num(u.exposure, info.exposure);
    info.sat = num(u.sat, info.sat);
    info.shadowTint = num(u.shadowTint, info.shadowTint);
    info.highTint = num(u.highTint, info.highTint);
    info.contrast = num(u.contrast, info.contrast);
    info.fogH = num(u.fogH, info.fogH);
    info.bloomStrength = num(u.bloom, info.bloomStrength);
    uniforms.uExposure.value = info.exposure;
    uniforms.uSat.value = info.sat;
    uniforms.uShadow.value = info.shadowTint;
    uniforms.uHigh.value = info.highTint;
    uniforms.uContrast.value = info.contrast;
    uniforms.uFogH.value = info.fogH;
    uniforms.uAO.value = useAO ? 0.4 : 0;
    if (u.fogColor && u.fogColor.isColor) uniforms.uFogColor.value.copy(u.fogColor);
    if (bloom) bloom.strength = info.bloomStrength;
    if (bloom && typeof u.threshold === "number" && u.threshold === u.threshold) bloom.threshold = u.threshold;
    if (enabled) {
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = info.exposure;
    } else {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
  }

  function render() {
    if (!enabled) return;
    setSize();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.setRenderTarget(beauty);
    renderer.autoClear = false;
    renderer.clear(true, true, true);
    const tBeauty = performance.now();
    renderer.render(backdropScene, backdropCam);
    renderer.clearDepth();
    renderer.render(scene, camera);
    info.beautyMs = performance.now() - tBeauty;

    if (ao) {
      const prevFar = camera.far;
      camera.far = Math.min(prevFar, 140);
      camera.updateProjectionMatrix();
      const tAo = performance.now();
      try {
        ao.camera = camera;
        ao.render(renderer, beauty, beauty);
        uniforms.tAO.value = ao.pdRenderTarget.texture;
      } catch (err) {
        scene.overrideMaterial = null;
        info.ao = false;
        info.aoErr = String(err && err.message ? err.message : err);
        ao = null;
        uniforms.uAO.value = 0;
        uniforms.tAO.value = white;
      } finally {
        info.aoMs = performance.now() - tAo;
        camera.far = prevFar;
        camera.updateProjectionMatrix();
      }
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.setRenderTarget(beauty);
    if (bloom && info.bloomStrength > 0.001) {
      bloom.radius = 0.4;
      bloom.strength = info.bloomStrength;
      bloom.render(renderer, beauty, beauty);
    }

    camera.updateMatrixWorld();
    uniforms.tDiffuse.value = beauty.texture;
    uniforms.tDepth.value = beauty.depthTexture;
    uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    uniforms.uCamWorld.value.copy(camera.matrixWorld);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    fsQuad.render(renderer);
  }

  window.__syncPost = sync;
  window.__postTune = (partial) => {
    if (!partial) return info;
    if (partial.exposure != null) uniforms.uExposure.value = partial.exposure;
    if (partial.sat != null) uniforms.uSat.value = partial.sat;
    if (partial.fogH != null) uniforms.uFogH.value = partial.fogH;
    if (partial.shadowTint != null) uniforms.uShadow.value = partial.shadowTint;
    if (partial.highTint != null) uniforms.uHigh.value = partial.highTint;
    if (partial.contrast != null) uniforms.uContrast.value = partial.contrast;
    if (partial.ao != null) uniforms.uAO.value = partial.ao;
    if (partial.bloom != null && bloom) bloom.strength = partial.bloom;
    if (partial.threshold != null && bloom) bloom.threshold = partial.threshold;
    return {
      exposure: uniforms.uExposure.value,
      sat: uniforms.uSat.value,
      fogH: uniforms.uFogH.value,
      bloom: bloom ? bloom.strength : 0,
      threshold: bloom ? bloom.threshold : 0,
    };
  };
  return { enabled, render, setSize, sync, info };
}
