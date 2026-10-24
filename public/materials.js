// Real material set for 赵王城. Maps live in /textures (or data-URLs via urlFor).
export function attachArchiveMaterials(THREE, renderer, isPhone, urlFor) {
  const size = isPhone ? "512" : "1024";
  const aniso = isPhone
    ? Math.min(4, renderer.capabilities.getMaxAnisotropy() || 1)
    : (renderer.capabilities.getMaxAnisotropy() || 1);
  const manager = new THREE.LoadingManager();
  const ready = new Promise((resolve) => {
    manager.onLoad = () => resolve(true);
    manager.onError = () => resolve(false);
  });
  const loader = new THREE.TextureLoader(manager);
  const cache = new Map();

  function map(name, kind) {
    const key = name + "_" + kind + "_" + size;
    if (cache.has(key)) return cache.get(key);
    const ext = name === "hangtu" ? ".webp" : ".jpg";
    const url = urlFor ? urlFor(name, kind, size) : "/textures/" + key + ext;
    const tex = loader.load(url);
    tex.name = key;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = kind === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = aniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    cache.set(key, tex);
    return tex;
  }

  function pack(name) {
    return { color: map(name, "color"), normal: map(name, "normal"), rough: map(name, "rough") };
  }
  const hangtuMap = pack("hangtu");
  const plasterMap = pack("plaster");
  const dirtMap = pack("dirt");
  const bankMap = pack("bank");
  const woodMap = pack("wood");

  function dress(mat, opts) {
    const o = Object.assign({
      tile: 4,
      mode: "tri",
      tint: [1, 1, 1],
      roughBias: 0,
      grain: 0,
      foot: false,
      shore: false,
      loess: false,
      gain: 1,
      normalScale: 1,
    }, opts);
    mat.color.setHex(0xffffff);
    mat.roughness = 1;
    mat.metalness = 0;
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.userData.kind = o.kind || o.mode;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uColorMap = { value: o.maps.color };
      shader.uniforms.uNormalMap = { value: o.maps.normal };
      shader.uniforms.uRoughMap = { value: o.maps.rough };
      shader.uniforms.uColorMapB = { value: o.mapsB ? o.mapsB.color : o.maps.color };
      shader.uniforms.uNormalMapB = { value: o.mapsB ? o.mapsB.normal : o.maps.normal };
      shader.uniforms.uRoughMapB = { value: o.mapsB ? o.mapsB.rough : o.maps.rough };
      shader.uniforms.uTile = { value: o.tile };
      shader.uniforms.uTint = { value: new THREE.Vector3(o.tint[0], o.tint[1], o.tint[2]) };
      shader.uniforms.uRoughBias = { value: o.roughBias };
      shader.uniforms.uGrain = { value: o.grain };
      shader.uniforms.uGain = { value: o.gain };
      shader.uniforms.uNormalScale = { value: o.normalScale };
      shader.uniforms.uMode = { value: o.mode === "xz" ? 1 : o.mode === "blend" ? 2 : o.mode === "strata" ? 3 : 0 };
      shader.uniforms.uLoess = { value: o.loess ? 1 : 0 };
      if (o.kind === "ground") {
        const blank = new Uint8Array([0, 0, 128, 255]);
        const blankTex = new THREE.DataTexture(blank, 1, 1);
        blankTex.needsUpdate = true;
        blankTex.magFilter = THREE.NearestFilter;
        blankTex.minFilter = THREE.NearestFilter;
        blankTex.wrapS = blankTex.wrapT = THREE.ClampToEdgeWrapping;
        blankTex.generateMipmaps = false;
        const geo = window.__fieldGeo;
        shader.uniforms.uFieldMask = { value: (window.__fieldMaskTex) || blankTex };
        shader.uniforms.uField0 = { value: new THREE.Vector2(geo ? geo.x0 : -780, geo ? geo.z0 : -760) };
        shader.uniforms.uFieldInv = { value: new THREE.Vector2(geo ? geo.invX : 1 / 1920, geo ? geo.invY : 1 / 1920) };
        mat.userData.fieldUniforms = shader.uniforms;
      }

      const decl = [
        "varying vec3 vWorld;",
        "varying vec3 vNw;",
        o.foot ? `#ifndef USE_INSTANCING
attribute float aFoot;
#endif
varying float vFoot;` : "",
        o.grain < 0 ? "attribute float aGrain; varying float vGrain;" : "",
        o.shore ? "attribute float aShore; varying float vShore;" : "",
      ].filter(Boolean).join("\n");

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\n" + decl)
        .replace("#include <project_vertex>", `#include <project_vertex>
          vec4 zW;
          #ifdef USE_INSTANCING
            zW = modelMatrix * instanceMatrix * vec4(position, 1.0);
          #else
            zW = modelMatrix * vec4(position, 1.0);
          #endif
          vWorld = zW.xyz;
          vec3 nObj = objectNormal;
          #ifdef USE_INSTANCING
            nObj = mat3(instanceMatrix) * nObj;
          #endif
          vNw = normalize(mat3(modelMatrix) * nObj);
          ${o.foot ? `#ifdef USE_INSTANCING
            vFoot = (modelMatrix * instanceMatrix * vec4(0.0, -0.5, 0.0, 1.0)).y;
          #else
            vFoot = aFoot;
          #endif` : ""}
          ${o.grain < 0 ? "vGrain = aGrain;" : ""}
          ${o.shore ? "vShore = aShore;" : ""}`);

      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform sampler2D uColorMap;
          uniform sampler2D uNormalMap;
          uniform sampler2D uRoughMap;
          uniform sampler2D uColorMapB;
          uniform sampler2D uNormalMapB;
          uniform sampler2D uRoughMapB;
          uniform float uTile;
          uniform vec3 uTint;
          uniform float uRoughBias;
          uniform float uGrain;
          uniform float uGain;
          uniform float uNormalScale;
          uniform float uMode;
          uniform float uLoess;
          varying vec3 vWorld;
          varying vec3 vNw;
          ${o.foot ? "varying float vFoot;" : ""}
          ${o.grain < 0 ? "varying float vGrain;" : ""}
          ${o.shore ? "varying float vShore;" : ""}
          float zRough;
          float zHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float zNoise(vec2 p){
            vec2 i = floor(p); vec2 f = fract(p);
            float a = zHash(i), b = zHash(i + vec2(1.0, 0.0)), c = zHash(i + vec2(0.0, 1.0)), d = zHash(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }
          vec3 zUnpack(vec3 c){ return c * 2.0 - 1.0; }
          vec2 zUvSide(vec3 p, float alongY, float useY){
            return mix(vec2(alongY, p.y), vec2(p.y, alongY), useY);
          }
          ${o.kind === "ground" ? `
          uniform sampler2D uFieldMask;
          uniform vec2 uField0;
          uniform vec2 uFieldInv;
          float zFHash(vec2 p){
            float h = sin(dot(p, vec2(127.1, 311.7))) * 43758.5453;
            return fract(h);
          }
          float zFSmooth(float a, float b, float t){
            float k = clamp((t - a) / max(b - a, 1e-5), 0.0, 1.0);
            return k * k * (3.0 - 2.0 * k);
          }
          float zFieldOri(vec2 sp){
            vec2 b = floor(sp / 250.0);
            return step(0.5, zFHash(b + vec2(0.17, 2.3)));
          }
          vec2 zFieldQ(vec2 sp){
            vec2 b = floor(sp / 250.0);
            vec2 lp = sp - b * 250.0;
            float ori = zFieldOri(sp);
            return mix(lp, lp.yx, ori);
          }
          vec2 zFieldCell(vec2 sp){
            vec2 b = floor(sp / 250.0);
            vec2 q = zFieldQ(sp);
            return floor(q / vec2(60.0, 20.0)) + b * 4.0;
          }
          float zFieldBaulk(vec2 sp){
            vec2 q = zFieldQ(sp);
            float fx = mod(q.x, 60.0);
            float fy = mod(q.y, 20.0);
            if (!(fx == fx)) fx = 0.0;
            if (!(fy == fy)) fy = 0.0;
            float edge = min(min(fx, 60.0 - fx), min(fy, 20.0 - fy));
            return 1.0 - zFSmooth(0.12, 0.40, edge);
          }
          vec2 zFieldGrad(vec2 sp){
            vec2 q = zFieldQ(sp);
            float fx = mod(q.x, 60.0);
            float fy = mod(q.y, 20.0);
            if (!(fx == fx)) fx = 0.0;
            if (!(fy == fy)) fy = 0.0;
            vec2 gq = vec2(0.0);
            if (fx < 0.5) gq.x = 1.0;
            else if (fx > 59.5) gq.x = -1.0;
            if (fy < 0.5) gq.y = 1.0;
            else if (fy > 19.5) gq.y = -1.0;
            return mix(gq, gq.yx, zFieldOri(sp));
          }
          vec3 zSafeN(vec3 n){
            return n / max(length(n), 1e-5);
          }
          vec3 zFieldNormal(vec3 mapN, vec3 wpos, float shore){
            if (!(shore == shore) || shore < 40.0) return mapN;
            vec2 sp = vec2(wpos.x, -wpos.z);
            vec2 uv = (sp - uField0) * uFieldInv;
            if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return mapN;
            float mr = texture2D(uFieldMask, uv).r;
            if (!(mr == mr) || mr < 0.96) return mapN;
            float baulk = zFieldBaulk(sp);
            vec2 gSpec = zFieldGrad(sp);
            vec3 tilt = vec3(gSpec.x, 0.55, -gSpec.y);
            return zSafeN(mapN + tilt * (0.42 * baulk));
          }
          vec4 zFieldColor(vec3 alb, float shore, vec3 wpos){
            float y0 = dot(max(alb, vec3(0.0)), vec3(0.30, 0.59, 0.11));
            if (!(y0 == y0)) y0 = 0.34;
            vec3 earth0 = clamp(vec3(0.45, 0.39, 0.31) * (0.78 + 0.48 * y0), vec3(0.07), vec3(0.62));
            if (!(shore == shore) || shore < 40.0) {
              vec3 bank = alb;
              float warm = max(0.0, bank.r - max(bank.g, bank.b) - 0.012);
              bank.r = max(0.0, bank.r - warm * 0.92);
              bank = mix(bank, earth0, 0.62);
              if (!(bank.r == bank.r && bank.g == bank.g && bank.b == bank.b)) bank = earth0;
              return vec4(clamp(bank, vec3(0.06), vec3(0.58)), 0.9);
            }
            vec2 sp = vec2(wpos.x, -wpos.z);
            if (!(sp.x == sp.x)) return vec4(alb, -1.0);
            vec2 uv = (sp - uField0) * uFieldInv;
            float mr = 0.0; float mb = 0.5;
            if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) {
              vec4 t = texture2D(uFieldMask, uv);
              if (t.r == t.r) { mr = t.r; mb = t.b; }
            }
            float y = dot(max(alb, vec3(0.0)), vec3(0.30, 0.59, 0.11));
            if (!(y == y)) y = 0.34;
            vec3 earth = vec3(0.45, 0.39, 0.31) * (0.78 + 0.48 * y);
            earth *= 0.94 + 0.1 * zFHash(floor(wpos.xz * 0.17));
            earth = clamp(earth, vec3(0.07), vec3(0.62));
            if (mr < 0.38) return vec4(earth, 0.97);
            if (mr < 0.62) {
              vec3 road = vec3(0.494, 0.439, 0.345);
              float across = (mb - 0.5) * 4.0;
              float rut = zFSmooth(0.22, 0.04, abs(abs(across) - 0.55));
              road *= 1.0 - rut * 0.16;
              road *= 0.94 + 0.1 * zFHash(floor(sp * 1.7));
              return vec4(clamp(road, vec3(0.08), vec3(0.62)), 0.97);
            }
            if (mr > 0.88 && mr < 0.96) {
              vec3 pad = vec3(0.42, 0.36, 0.29) * (0.92 + 0.1 * zFHash(floor(sp * 0.4)));
              return vec4(clamp(pad, vec3(0.08), vec3(0.55)), 0.98);
            }
            vec2 q = zFieldQ(sp);
            vec2 cell = zFieldCell(sp);
            float baulk = zFieldBaulk(sp);
            vec3 col;
            if (mr < 0.82) {
              float fx = mod(sp.x * 0.97 + sp.y * 0.18, 15.0);
              float fy = mod(sp.y * 0.94 - sp.x * 0.12, 10.0);
              if (!(fx == fx)) fx = 0.0;
              float edge = min(min(fx, 15.0 - fx), min(fy, 10.0 - fy));
              baulk = 1.0 - zFSmooth(0.16, 0.48, edge);
              float fur = 0.5 + 0.5 * sin(fy * 2.2);
              col = vec3(0.30, 0.24, 0.17) * (0.84 + 0.26 * max(fur, 0.0));
            } else {
              float kind = zFHash(cell + vec2(0.4, 1.7));
              if (kind < 0.30) {
                float dotp = zFSmooth(0.72, 0.9, zFHash(floor(sp * 1.55)));
                col = vec3(0.604, 0.549, 0.416) * (0.90 + 0.14 * dotp);
              } else if (kind < 0.48 && shore < 300.0) {
                col = vec3(0.561, 0.518, 0.400);
              } else if (kind < 0.74) {
                float fur = 0.5 + 0.5 * sin(q.y * 2.5);
                col = vec3(0.431, 0.357, 0.267) * (0.80 + 0.30 * max(fur, 0.0));
              } else {
                float row = zFSmooth(0.46, 0.06, abs(fract(q.y * 0.52) - 0.5));
                col = mix(vec3(0.478, 0.416, 0.314), vec3(0.33, 0.41, 0.24), row * 0.42);
              }
            }
            float br = 0.94 + 0.12 * zFHash(cell + vec2(8.0, 2.2));
            col *= br;
            col = mix(col, vec3(0.67, 0.61, 0.49), clamp(baulk, 0.0, 1.0) * 0.82);
            if (!(col.r == col.r && col.g == col.g && col.b == col.b)) col = earth;
            return vec4(clamp(col, vec3(0.05), vec3(0.72)), mix(0.94, 0.99, clamp(baulk, 0.0, 1.0)));
          }` : ""}`)
        .replace("#include <normal_fragment_maps>", `
          {
            vec3 nGeom = normalize(vNw);
            float g = uGrain;
            ${o.grain < 0 ? "g = vGrain;" : ""}
            vec3 mapN;
            if (uMode < 0.5 || uMode > 2.5) {
              vec3 bn = pow(abs(nGeom), vec3(uMode > 2.5 ? 1.0 : 4.0));
              float up = uMode > 2.5 ? smoothstep(0.992, 0.9995, abs(nGeom.y)) : bn.y / (bn.x + bn.y + bn.z + 1e-5);
              if (uMode > 2.5) {
                bn = vec3(abs(nGeom.x), 0.0, abs(nGeom.z));
              }
              bn /= bn.x + bn.y + bn.z + 1e-5;
              vec2 uvX = zUvSide(vWorld, vWorld.z, g) / uTile;
              vec2 uvY = vec2(vWorld.x, vWorld.z) / uTile;
              vec2 uvZ = zUvSide(vWorld, vWorld.x, g) / uTile;
              vec3 tx = zUnpack(texture2D(uNormalMap, uvX).xyz);
              vec3 ty = zUnpack(texture2D(uNormalMap, uvY).xyz);
              vec3 tz = zUnpack(texture2D(uNormalMap, uvZ).xyz);
              tx.xy *= uNormalScale; ty.xy *= uNormalScale; tz.xy *= uNormalScale;
              if (uLoess > 0.5) { tx.y *= 0.18; ty.y *= 0.18; tz.y *= 0.18; }
              vec3 Tx = g > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
              vec3 Bx = g > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
              vec3 Nx = vec3(nGeom.x >= 0.0 ? 1.0 : -1.0, 0.0, 0.0);
              vec3 Tz = g > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
              vec3 Bz = g > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
              vec3 Nz = vec3(0.0, 0.0, nGeom.z >= 0.0 ? 1.0 : -1.0);
              vec3 Ny = vec3(0.0, nGeom.y >= 0.0 ? 1.0 : -1.0, 0.0);
              vec3 nX = normalize(Tx * tx.x + Bx * tx.y + Nx * tx.z);
              vec3 nY = normalize(vec3(1.0, 0.0, 0.0) * ty.x + vec3(0.0, 0.0, 1.0) * ty.y + Ny * ty.z);
              vec3 nZ = normalize(Tz * tz.x + Bz * tz.y + Nz * tz.z);
              vec3 sideN = normalize(nX * bn.x + nZ * bn.z + nY * 0.0001);
              mapN = normalize(mix(sideN, nY, clamp(up, 0.0, 1.0)));
            } else {
              vec2 uv = vWorld.xz / uTile;
              vec3 tA = zUnpack(texture2D(uNormalMap, uv).xyz);
              tA.xy *= uNormalScale;
              vec3 nA = normalize(vec3(tA.x, tA.z, tA.y));
              if (uMode > 1.5) {
                vec3 tB = zUnpack(texture2D(uNormalMapB, uv).xyz);
                tB.xy *= uNormalScale;
                vec3 nB = normalize(vec3(tB.x, tB.z, tB.y));
                float nse = zNoise(vWorld.xz * 0.011) * 0.62 + zNoise(vWorld.xz * 0.027 + 3.1) * 0.38;
                float shore = ${o.shore ? "vShore" : "200.0"};
                float t = clamp(shore / 40.0 + (nse - 0.5) * 0.62, 0.0, 1.0);
                mapN = normalize(mix(nB, nA, t));
              } else mapN = nA;
              if (nGeom.y < 0.0) mapN.y = -abs(mapN.y);
              ${o.kind === "ground" ? "mapN = zFieldNormal(mapN, vWorld, vShore);" : ""}
            }
            #ifdef DOUBLE_SIDED
              mapN *= gl_FrontFacing ? 1.0 : -1.0;
            #endif
            normal = normalize(mat3(viewMatrix) * mapN);
          }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          {
            vec3 nGeom = normalize(vNw);
            float g = uGrain;
            ${o.grain < 0 ? "g = vGrain;" : ""}
            vec3 alb;
            float roughTex;
            if (uMode < 0.5 || uMode > 2.5) {
              vec3 bn = pow(abs(nGeom), vec3(uMode > 2.5 ? 1.0 : 4.0));
              float up = uMode > 2.5 ? smoothstep(0.992, 0.9995, abs(nGeom.y)) : bn.y / (bn.x + bn.y + bn.z + 1e-5);
              if (uMode > 2.5) bn = vec3(abs(nGeom.x), 0.0, abs(nGeom.z));
              bn /= bn.x + bn.y + bn.z + 1e-5;
              vec2 uvX = zUvSide(vWorld, vWorld.z, g) / uTile;
              vec2 uvY = vec2(vWorld.x, vWorld.z) / uTile;
              vec2 uvZ = zUvSide(vWorld, vWorld.x, g) / uTile;
              vec3 side = texture2D(uColorMap, uvX).rgb * bn.x + texture2D(uColorMap, uvZ).rgb * bn.z;
              side /= max(bn.x + bn.z, 1e-4);
              vec3 top = texture2D(uColorMap, uvY).rgb;
              alb = mix(side, top, clamp(up, 0.0, 1.0));
              float rs = texture2D(uRoughMap, uvX).g * bn.x + texture2D(uRoughMap, uvZ).g * bn.z;
              rs /= max(bn.x + bn.z, 1e-4);
              float rt = texture2D(uRoughMap, uvY).g;
              roughTex = mix(rs, rt, clamp(up, 0.0, 1.0));
            } else {
              vec2 uv = vWorld.xz / uTile;
              vec3 dirt = texture2D(uColorMap, uv).rgb;
              float rd = texture2D(uRoughMap, uv).g;
              if (uMode > 1.5) {
                vec3 bank = texture2D(uColorMapB, uv).rgb;
                float rb = texture2D(uRoughMapB, uv).g;
                float nse = zNoise(vWorld.xz * 0.011) * 0.62 + zNoise(vWorld.xz * 0.027 + 3.1) * 0.38;
                float shore = ${o.shore ? "vShore" : "200.0"};
                float t = clamp(shore / 40.0 + (nse - 0.5) * 0.62, 0.0, 1.0);
                t = smoothstep(0.0, 1.0, t);
                alb = mix(bank, dirt, t);
                roughTex = mix(rb, rd, t);
              } else {
                alb = dirt;
                roughTex = rd;
              }
            }
            diffuseColor.rgb *= alb * uTint * uGain;
            if (uLoess > 0.5) {
              vec3 loess = vec3(0.40, 0.66, 0.78);
              float along = abs(nGeom.x) > abs(nGeom.z) ? vWorld.z : vWorld.x;
              float tile = max(uTile, 1e-5);
              vec2 uv = vec2(along, vWorld.y) / tile;
              vec3 blur = texture2D(uColorMap, uv).rgb;
              blur += texture2D(uColorMap, uv + vec2(0.0, 0.40 / tile)).rgb;
              blur += texture2D(uColorMap, uv + vec2(0.0, -0.40 / tile)).rgb;
              blur *= 0.333;
              float luma = dot(blur, vec3(0.30, 0.59, 0.11));
              diffuseColor.rgb = mix(vec3(luma), loess, 0.93);
              float broad = zNoise(vWorld.xz * 0.01 + vec2(1.7, 4.2));
              float broad2 = zNoise(vWorld.xz * 0.0032 + 9.0);
              diffuseColor.rgb *= 0.90 + 0.16 * broad + 0.08 * (broad2 - 0.5);
              float repair = smoothstep(0.60, 0.82, zNoise(vWorld.xz * 0.017 + vec2(vWorld.y * 0.008, 3.0)));
              diffuseColor.rgb = mix(diffuseColor.rgb, loess * vec3(1.06, 1.01, 0.94), repair * 0.4);
              float yRel = max(vWorld.y - 0.8, 0.0);
              float acc = 0.0;
              float idx = 0.0;
              float shade = 1.0;
              for (int i = 0; i < 36; i++) {
                float hh = 0.40 + 0.20 * zHash(vec2(idx, 4.7));
                if (yRel < acc + hh) {
                  float local = clamp((yRel - acc) / max(hh, 1e-5), 0.0, 1.0);
                  float band = 0.90 + 0.12 * zHash(vec2(idx, 9.1));
                  float edge = smoothstep(0.0, 0.2, local) * smoothstep(1.0, 0.8, local);
                  shade = mix(1.0, band, edge);
                  break;
                }
                acc += hh;
                idx += 1.0;
              }
              diffuseColor.rgb *= shade;
              float streak = smoothstep(0.88, 0.97, zNoise(vec2(vWorld.x * 0.32 + vWorld.z * 0.32, vWorld.y * 0.03)));
              diffuseColor.rgb *= 1.0 - streak * 0.08 * smoothstep(1.4, 5.5, vWorld.y);
              float wet = 1.0 - smoothstep(0.8, 2.8, vWorld.y);
              diffuseColor.rgb *= mix(1.0, 0.76, wet);
              diffuseColor.rgb = clamp(diffuseColor.rgb, vec3(0.04), vec3(0.82));
            }
            ${o.foot ? "diffuseColor.rgb *= mix(0.80, 1.0, smoothstep(0.0, 1.5, vWorld.y - vFoot));" : ""}
            ${o.kind === "ground" ? `{
              vec4 fc = zFieldColor(diffuseColor.rgb, vShore, vWorld);
              if (fc.a >= 0.0 && fc.r == fc.r && fc.g == fc.g && fc.b == fc.b) {
                diffuseColor.rgb = fc.rgb;
                roughTex = fc.a;
              }
            }` : ""}
            zRough = clamp(roughTex + uRoughBias, 0.045, 1.0);
          }`)
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = zRough;");
    };
    const key = [o.mode, o.tile, o.roughBias, o.grain, o.foot ? 1 : 0, o.shore ? 1 : 0, o.loess ? 1 : 0, o.kind || "", o.kind === "ground" ? "fieldO1b" : ""].join("|");
    mat.customProgramCacheKey = () => "arch-" + key;
    if (o.kind === "ground") mat.precision = "highp";
    mat.needsUpdate = true;
    return mat;
  }

  function makeStrataTex() {
    const H = 2048;
    const SPAN = 20;
    const hash = (n) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const bands = [];
    let y = 0;
    let i = 0;
    while (y < SPAN + 0.6) {
      const h = 0.4 + 0.2 * hash(i + 4.7);
      const shade = 0.97 + 0.06 * hash(i + 9.1);
      bands.push([y, y + h, shade]);
      y += h;
      i++;
    }
    const data = new Uint8Array(H * 4);
    for (let p = 0; p < H; p++) {
      const yy = ((p + 0.5) / H) * SPAN;
      let shade = 1;
      for (let b = 0; b < bands.length; b++) {
        if (yy >= bands[b][0] && yy < bands[b][1]) { shade = bands[b][2]; break; }
      }
      const byte = Math.max(0, Math.min(255, Math.round((shade / 1.08) * 255)));
      data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = byte;
      data[p * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, 1, H, THREE.RGBAFormat);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.unpackAlignment = 1;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function makeWall(maps) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
    });
    mat.precision = "highp";
    mat.userData.kind = "wall";
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uColorMap = { value: maps.color };
      shader.uniforms.uNormalMap = { value: maps.normal };
      shader.uniforms.uRoughMap = { value: maps.rough };
      shader.uniforms.uNormalScale = { value: 1.05 };
      shader.uniforms.uTexSize = { value: /_512/.test(maps.color && maps.color.name) ? 512.0 : 1024.0 };
      mat.userData.dbgUniforms = shader.uniforms;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
          varying vec3 vWorld;
          varying vec3 vNw;`)
        .replace("#include <project_vertex>", `#include <project_vertex>
          vec4 zW = modelMatrix * vec4(position, 1.0);
          #ifdef USE_INSTANCING
            zW = modelMatrix * instanceMatrix * vec4(position, 1.0);
          #endif
          vWorld = zW.xyz;
          vec3 nObj = objectNormal;
          #ifdef USE_INSTANCING
            nObj = mat3(instanceMatrix) * nObj;
          #endif
          vec3 nn = mat3(modelMatrix) * nObj;
          vNw = nn / max(length(nn), 1e-5);`);
      const decl = `
#ifndef HIGH_PRECISION
precision highp float;
#endif
uniform sampler2D uColorMap;
uniform sampler2D uNormalMap;
uniform sampler2D uRoughMap;
uniform float uNormalScale;
uniform float uTexSize;
varying vec3 vWorld;
varying vec3 vNw;
float zRough = 0.93;
vec3 zMapN = vec3(0.0, 1.0, 0.0);
float zHash(vec2 p) {
  vec2 q = mod(p + 1024.0, 2048.0) - 1024.0;
  vec3 p3 = fract(vec3(q.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float zNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = zHash(i);
  float b = zHash(i + vec2(1.0, 0.0));
  float c = zHash(i + vec2(0.0, 1.0));
  float d = zHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec3 nSafe(vec3 v) { return v / max(length(v), 1e-5); }
vec3 zFilt3(sampler2D s, vec2 uv) {
  vec3 sharp = max(texture2D(s, uv).rgb, vec3(0.0));
  float fwU = max(fwidth(uv.x), 1e-6);
  float fwV = max(fwidth(uv.y), 1e-6);
  float lodU = log2(max(fwU * uTexSize, 1.0));
  float lodV = log2(max(fwV * uTexSize, 1.0));
  float lod = max(lodU, lodV);
  float aniso = abs(lodV - lodU);
  vec3 soft = max(texture2DLodEXT(s, uv, clamp(lod, 0.0, 7.0)).rgb, vec3(0.0));
  float t = smoothstep(0.40, 1.55, aniso) * smoothstep(0.25, 1.15, lod);
  return mix(sharp, soft, clamp(t, 0.0, 1.0));
}
float zFiltR(vec2 uv) {
  float sharp = clamp(texture2D(uRoughMap, uv).g, 0.0, 1.0);
  float fwU = max(fwidth(uv.x), 1e-6);
  float fwV = max(fwidth(uv.y), 1e-6);
  float lodU = log2(max(fwU * uTexSize, 1.0));
  float lodV = log2(max(fwV * uTexSize, 1.0));
  float lod = max(lodU, lodV);
  float aniso = abs(lodV - lodU);
  float soft = clamp(texture2DLodEXT(uRoughMap, uv, clamp(lod, 0.0, 7.0)).g, 0.0, 1.0);
  float t = smoothstep(0.40, 1.55, aniso) * smoothstep(0.25, 1.15, lod);
  return mix(sharp, soft, clamp(t, 0.0, 1.0));
}
vec2 localXZ(vec3 p) {
  vec2 q = p.xz - vec2(175.0, -190.0);
  return mod(q + 1024.0, 2048.0) - 1024.0;
}
float finite1(float x) { return (x == x && x >= 0.0 && x <= 1.0) ? x : 0.93; }
vec3 finite3(vec3 c) {
  float ok = float(c.r == c.r && c.g == c.g && c.b == c.b && c.r < 2.0 && c.g < 2.0 && c.b < 2.0);
  return max(c, vec3(0.0)) * ok + vec3(0.392, 0.314, 0.194) * (1.0 - ok);
}
vec3 axisW(vec3 n) {
  vec3 w = abs(n);
  w *= w;
  w *= w;
  return w / max(w.x + w.y + w.z, 1e-5);
}
float alongOf(vec3 n, vec3 p) { return abs(n.x) > abs(n.z) ? p.z : p.x; }
vec3 triColor(float tileU, float tileV, float shift) {
  vec3 n = nSafe(vNw);
  vec3 w = axisW(n);
  float sx = n.x >= 0.0 ? 1.0 : -1.0;
  float sz = n.z >= 0.0 ? 1.0 : -1.0;
  float tu = max(tileU, 1e-5);
  float tv = max(tileV, 1e-5);
  vec2 uvX = vec2((-sx * vWorld.z + shift) / tu, vWorld.y / tv);
  vec2 uvZ = vec2(( sz * vWorld.x + shift) / tu, vWorld.y / tv);
  float topMix = smoothstep(0.992, 0.9995, abs(n.y));
  vec2 uvSteep = vec2((vWorld.x + shift) / tu, vWorld.y / tv);
  vec2 uvPlan = vec2(vWorld.x + shift, vWorld.z) / tu;
  vec2 uvY = mix(uvSteep, uvPlan, topMix);
  vec3 col = zFilt3(uColorMap, uvX) * w.x;
  col += zFilt3(uColorMap, uvY) * w.y;
  col += zFilt3(uColorMap, uvZ) * w.z;
  return max(col, vec3(0.0));
}
float triRough(float tileU, float tileV, float shift) {
  vec3 n = nSafe(vNw);
  vec3 w = axisW(n);
  float sx = n.x >= 0.0 ? 1.0 : -1.0;
  float sz = n.z >= 0.0 ? 1.0 : -1.0;
  float tu = max(tileU, 1e-5);
  float tv = max(tileV, 1e-5);
  vec2 uvX = vec2((-sx * vWorld.z + shift) / tu, vWorld.y / tv);
  vec2 uvZ = vec2(( sz * vWorld.x + shift) / tu, vWorld.y / tv);
  float topMix = smoothstep(0.992, 0.9995, abs(n.y));
  vec2 uvY = mix(vec2((vWorld.x + shift) / tu, vWorld.y / tv), vec2(vWorld.x + shift, vWorld.z) / tu, topMix);
  float r = zFiltR(uvX) * w.x;
  r += zFiltR(uvY) * w.y;
  r += zFiltR(uvZ) * w.z;
  return clamp(r, 0.0, 1.0);
}
vec3 planeN(vec2 uv, vec3 T, vec3 B, vec3 N) {
  vec3 t = zFilt3(uNormalMap, uv) * 2.0 - 1.0;
  t.xy *= uNormalScale;
  t.z = max(t.z, 0.05);
  return T * t.x + B * t.y + N * t.z;
}
vec3 triNormal(float tileU, float tileV, float shift) {
  vec3 n = nSafe(vNw);
  vec3 w = axisW(n);
  float sx = n.x >= 0.0 ? 1.0 : -1.0;
  float sy = n.y >= 0.0 ? 1.0 : -1.0;
  float sz = n.z >= 0.0 ? 1.0 : -1.0;
  float tu = max(tileU, 1e-5);
  float tv = max(tileV, 1e-5);
  vec3 acc = planeN(vec2((-sx * vWorld.z + shift) / tu, vWorld.y / tv), vec3(0.0, 0.0, -sx), vec3(0.0, 1.0, 0.0), vec3(sx, 0.0, 0.0)) * w.x;
  acc += planeN(vec2((sz * vWorld.x + shift) / tu, vWorld.y / tv), vec3(sz, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, sz)) * w.z;
  float topMix = smoothstep(0.992, 0.9995, abs(n.y));
  vec3 side = planeN(vec2((vWorld.x + shift) / tu, vWorld.y / tv), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, sz));
  vec3 top = planeN(vec2(vWorld.x + shift, -sy * vWorld.z) / tu, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, -sy), vec3(0.0, sy, 0.0));
  acc += mix(side, top, topMix) * w.y;
  return nSafe(acc);
}
vec4 banAt(float yRel) {
  float acc = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float hh = 1.55 + 0.40 * zHash(vec2(fi, 2.2));
    if (yRel < acc + hh) return vec4(fi, max(yRel - acc, 0.0), hh, acc);
    acc += hh;
  }
  return vec4(8.0, 0.0, 1.7, acc);
}
vec2 seamInfo(float along, float banId, float fwA) {
  float spacing = 3.05 + 0.85 * zHash(vec2(banId, 6.6));
  float shift = zHash(vec2(banId, 8.8)) * spacing;
  float f = fract((along + shift) / max(spacing, 1e-5));
  float dSeam = min(f, 1.0 - f) * spacing;
  float aa = max(fwA, 1e-4);
  float halfW = 0.022;
  float cov = clamp((halfW - dSeam) / aa + 0.5, 0.0, 1.0);
  float fade = min(1.0, (halfW * 2.0) / aa);
  float toward = f < 0.5 ? -1.0 : 1.0;
  return vec2(cov * fade, toward);
}
vec3 holeInfo(float along, vec4 ban, float vertical, float fwA, float fwY) {
  float hSp = 0.92 + 0.16 * zHash(vec2(ban.x, 3.3));
  float hShift = zHash(vec2(ban.x, 5.1)) * hSp;
  float hx = along + hShift;
  float hc = floor(hx / max(hSp, 1e-5));
  float jitter = (zHash(vec2(hc, ban.x + 17.0)) - 0.5) * 0.22;
  float cx = (hc + 0.5) * hSp - hShift + jitter;
  float keep = step(0.18, zHash(vec2(hc, ban.x + 9.0)));
  float rad = 0.05;
  float hy = 0.07 + (zHash(vec2(hc, ban.x + 2.4)) - 0.5) * 0.04;
  vec2 hp = vec2(along - cx, ban.y - hy);
  float hd = length(hp);
  float aa = max(max(fwA, fwY), 1e-4);
  float core = clamp((rad - hd) / aa + 0.5, 0.0, 1.0);
  float ring = clamp((rad * 1.55 - hd) / aa + 0.5, 0.0, 1.0);
  float cov = max(core, ring * 0.2);
  float fade = min(1.0, (rad * 3.1) / aa);
  return vec3(cov * fade * keep * vertical, hp.x, hp.y);
}
float cornerDist(vec2 p) {
  float d = length(p - vec2(0.0, 0.0));
  d = min(d, length(p - vec2(350.0, 0.0)));
  d = min(d, length(p - vec2(350.0, -380.0)));
  d = min(d, length(p - vec2(90.0, -380.0)));
  d = min(d, length(p - vec2(90.0, -220.0)));
  d = min(d, length(p - vec2(0.0, -220.0)));
  d = min(d, length(p - vec2(103.0, 0.0)));
  d = min(d, length(p - vec2(153.0, 0.0)));
  return d;
}
vec3 wallShade() {
  vec3 nGeom = nSafe(vNw);
  vec2 lp = localXZ(vWorld);
  float mixT = clamp(zNoise(lp * 0.055 + vec2(1.7, 4.2)), 0.0, 1.0);
  vec3 c4 = triColor(4.0, 4.0, 0.0);
  vec3 c11 = triColor(11.0, 4.0, 3.1);
  vec3 col = mix(c4, c11, mix(0.18, 0.62, mixT));
  float along = alongOf(nGeom, vWorld);
  float yRel = max(vWorld.y - 0.8, 0.0);
  float vertical = 1.0 - smoothstep(0.50, 0.86, abs(nGeom.y));
  float fwA = max(fwidth(along), 1e-4);
  float fwY = max(fwidth(vWorld.y), 1e-4);
  vec4 ban = banAt(yRel);
  vec2 seam = seamInfo(along, ban.x, fwA);
  col *= 1.0 - seam.x * vertical * 0.22;
  float dJoint = min(ban.y, max(ban.z - ban.y, 0.0));
  float jcov = clamp((0.018 - dJoint) / max(fwY, 1e-4) + 0.5, 0.0, 1.0);
  jcov *= min(1.0, 0.036 / max(fwY, 1e-4));
  col *= 1.0 - jcov * vertical * 0.07;
  vec3 hole = holeInfo(along, ban, vertical, fwA, fwY);
  col *= mix(1.0, 0.52, clamp(hole.x, 0.0, 1.0));
  float b1 = zNoise(lp * 0.067 + vec2(2.0, 0.4));
  float b2 = zNoise(lp * 0.11 + vec2(8.2, 3.0));
  float b3 = zNoise(lp * 0.185 + vec2(0.6, 5.5));
  float blot = clamp(b1 * 0.48 + b2 * 0.32 + b3 * 0.20, 0.0, 1.0);
  float shaped = smoothstep(0.28, 0.72, blot);
  col *= mix(0.88, 1.12, shaped);
  float luma = max(dot(col, vec3(0.299, 0.587, 0.114)), 1e-5);
  vec3 grayish = mix(col, vec3(luma) * vec3(0.985, 0.995, 1.012), 0.38);
  vec3 warm = col * vec3(1.075, 1.02, 0.90);
  warm *= luma / max(dot(warm, vec3(0.299, 0.587, 0.114)), 1e-5);
  col = mix(grayish, warm, smoothstep(0.26, 0.78, b1));
  float yAbove = vWorld.y - 0.8;
  float wet = (1.0 - smoothstep(1.5, 2.5, max(yAbove, 0.0))) * vertical;
  col *= mix(1.0, 0.78, clamp(wet, 0.0, 1.0));
  float contact = (1.0 - smoothstep(0.0, 0.55, max(yAbove, 0.0))) * vertical;
  vec3 bankFoot = vec3(0.205, 0.162, 0.100);
  col = mix(col, min(col, bankFoot) * (0.94 + 0.12 * shaped), clamp(contact, 0.0, 1.0) * 0.62);
  float slopeFace = smoothstep(0.70, 0.93, abs(nGeom.y));
  float rampX = smoothstep(96.5, 99.2, vWorld.x) * (1.0 - smoothstep(156.8, 159.5, vWorld.x));
  float rampZ = smoothstep(10.3, 11.4, vWorld.z) * (1.0 - smoothstep(15.6, 17.0, vWorld.z));
  float inRamp = clamp(rampX * rampZ * slopeFace, 0.0, 1.0);
  float waterAmt = (1.0 - smoothstep(0.0, 0.75, vWorld.y)) * inRamp;
  col = mix(col, vec3(0.086, 0.064, 0.040), clamp(waterAmt, 0.0, 1.0) * 0.72);
  float sideD = min(abs(vWorld.x - 98.0), abs(vWorld.x - 158.0));
  float sideT = (1.0 - smoothstep(0.0, 2.8, sideD)) * inRamp;
  col = mix(col, vec3(0.230, 0.184, 0.116) * (0.92 + 0.16 * shaped), clamp(sideT, 0.0, 1.0) * 0.78);
  float alk = clamp((0.035 - abs(yRel - 0.6)) / max(fwY, 1e-4) + 0.5, 0.0, 1.0);
  float alkFade = min(1.0, 0.07 / max(fwY, 1e-4));
  float brk = smoothstep(0.40, 0.72, zNoise(vec2(mod(along + 64.0, 512.0) * 0.31, 3.7)));
  col = mix(col, vec3(0.62, 0.60, 0.55), clamp(alk * alkFade * brk * vertical * 0.15, 0.0, 0.15));
  vec3 outW = nSafe(vWorld - vec3(175.0, vWorld.y, -190.0));
  float outer = clamp(dot(nGeom, outW), 0.0, 1.0);
  float cellW = 4.2;
  float cell = floor(along / cellW);
  float center = (cell + 0.22 + 0.56 * zHash(vec2(cell, 1.3))) * cellW;
  float rw = 0.30 + 0.90 * zHash(vec2(cell, 8.1));
  float rd = abs(along - center);
  float streak = 1.0 - smoothstep(rw * 0.45, rw * 0.45 + max(fwA * 1.4, 0.03), rd);
  float rlen = 2.0 + 4.0 * zHash(vec2(cell, 5.5));
  float fromTop = max(12.15 - vWorld.y, 0.0);
  float fade = (1.0 - smoothstep(rlen * 0.18, rlen, fromTop)) * smoothstep(0.0, 0.45, fromTop);
  float slit = 1.0 - smoothstep(0.15, 1.5, abs(fract((along + 1.7) / 7.0) - 0.5) * 7.0);
  float nearCorner = 1.0 - smoothstep(4.0, 18.0, cornerDist(vWorld.xz));
  float need = mix(0.72, 0.28, clamp(max(nearCorner, slit * outer), 0.0, 1.0));
  float on = step(need, zHash(vec2(cell, 2.8)));
  float darken = 0.15 + 0.15 * zHash(vec2(cell, 4.4));
  col *= 1.0 - streak * fade * on * vertical * max(outer, 0.35) * darken;
  float px = floor(along / 11.0);
  float py = floor(yRel / 4.2);
  float ph = zHash(vec2(px + 2.0, py + 3.0));
  float fx = fract(along / 11.0);
  float fy = fract(yRel / 4.2);
  float x0 = 0.16 + 0.16 * zHash(vec2(px, 11.0));
  float x1 = min(0.86, x0 + 0.20 + 0.26 * zHash(vec2(px, 12.0)));
  float y0 = 0.14 + 0.14 * zHash(vec2(py, 13.0));
  float y1 = min(0.88, y0 + 0.22 + 0.26 * zHash(vec2(py, 14.0)));
  float ex = max(fwidth(fx), 0.012);
  float ey = max(fwidth(fy), 0.012);
  float rx = smoothstep(x0 - ex, x0 + ex, fx) * (1.0 - smoothstep(x1 - ex, x1 + ex, fx));
  float ry = smoothstep(y0 - ey, y0 + ey, fy) * (1.0 - smoothstep(y1 - ey, y1 + ey, fy));
  float mend = step(0.84, ph) * rx * ry * vertical;
  float lighter = zHash(vec2(px, py + 20.0));
  vec3 delta = mix(vec3(0.90, 0.88, 0.84), vec3(1.06, 1.03, 0.98), lighter);
  col = mix(col, col * delta, mend * 0.55);
  vec3 mapN = triNormal(4.0, 4.0, 0.0);
  vec3 tangent = abs(nGeom.x) > abs(nGeom.z) ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  mapN = nSafe(mapN + tangent * seam.y * seam.x * vertical * 1.45);
  mapN = nSafe(mapN + vec3(0.0, -1.0, 0.0) * jcov * vertical * 0.22);
  vec3 dent = tangent * hole.y + vec3(0.0, hole.z, 0.0);
  mapN = nSafe(mapN - dent * clamp(hole.x, 0.0, 1.0) * 22.0);
  float rough = triRough(4.0, 4.0, 0.0);
  rough = mix(rough, min(rough, 0.84), clamp(wet, 0.0, 1.0) * 0.45);
  float sr = float(col.r == col.r && col.g == col.g && col.b == col.b);
  float sn = float(mapN.x == mapN.x && mapN.y == mapN.y && mapN.z == mapN.z);
  col = finite3(col * sr + vec3(0.392, 0.314, 0.194) * (1.0 - sr));
  zRough = finite1(rough);
  zMapN = nSafe(mapN * sn + nGeom * (1.0 - sn));
  return col;
}
`;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + decl)
        .replace("#include <color_fragment>", `#include <color_fragment>
          {
            diffuseColor.rgb = wallShade();
          }`)
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = zRough;")
        .replace("#include <normal_fragment_maps>", `{
          vec3 mapN = zMapN;
          #ifdef DOUBLE_SIDED
            mapN *= gl_FrontFacing ? 1.0 : -1.0;
          #endif
          normal = nSafe(mat3(viewMatrix) * mapN);
        }`);
    };
    mat.customProgramCacheKey = () => "wall-earth-w1i";
    mat.needsUpdate = true;
    return mat;
  }

  function makeInnerBank(dirtMap, bankMap) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8C7E64,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
    mat.userData.kind = "innerBank";
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDirtC = { value: dirtMap.color };
      shader.uniforms.uDirtN = { value: dirtMap.normal };
      shader.uniforms.uDirtR = { value: dirtMap.rough };
      shader.uniforms.uBankC = { value: bankMap.color };
      shader.uniforms.uBankN = { value: bankMap.normal };
      shader.uniforms.uBankR = { value: bankMap.rough };
      shader.uniforms.uDirtBase = { value: new THREE.Vector3(0.2623, 0.2086, 0.1274) };
      shader.uniforms.uBankDry = { value: new THREE.Vector3(0.1946, 0.1529, 0.0953) };
      shader.uniforms.uWet = { value: new THREE.Vector3(0.0762, 0.0578, 0.0369) };
      const decl = `
uniform sampler2D uDirtC;
uniform sampler2D uDirtN;
uniform sampler2D uDirtR;
uniform sampler2D uBankC;
uniform sampler2D uBankN;
uniform sampler2D uBankR;
uniform vec3 uDirtBase;
uniform vec3 uBankDry;
uniform vec3 uWet;
varying vec3 vWorld;
varying vec3 vNw;
varying float vWall;
varying float vShore;
float zRough = 0.95;
float zHash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float zNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = zHash(i), b = zHash(i + vec2(1.0, 0.0));
  float c = zHash(i + vec2(0.0, 1.0)), d = zHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec3 nSafe(vec3 v){ return v / max(length(v), 1e-5); }
float finite1(float x){ return (x == x && x >= 0.0 && x <= 1.5) ? x : 0.92; }
vec3 zCol = vec3(0.2623, 0.2086, 0.1274);
vec3 zMapN = vec3(0.0, 0.0, 1.0);
vec3 earthTone(vec3 tex, float avgL, vec3 base){
  float luma = max(dot(max(tex, vec3(0.0)), vec3(0.299, 0.587, 0.114)), 1e-5);
  float k = clamp(luma / max(avgL, 1e-5), 0.78, 1.22);
  return base * k;
}
vec3 bankAlbedo(){
  vec2 uv = vWorld.xz / 4.0;
  vec3 dirtT = earthTone(texture2D(uDirtC, uv).rgb, 0.249, uDirtBase);
  vec3 bankT = earthTone(texture2D(uBankC, uv).rgb, 0.148, uBankDry);
  float n = zNoise(vWorld.xz * 0.045);
  float n2 = zNoise(vWorld.xz * 0.09 + vec2(8.0, 2.2));
  float n3 = zNoise(vWorld.xz * 0.11 + vec2(1.4, 6.0));
  float wobble = (n - 0.5) * 2.4 + (n2 - 0.5) * 0.9;
  float sDist = vShore + wobble;
  float fw = max(fwidth(sDist), 0.04);
  float bankAmt = 1.0 - smoothstep(0.5, 3.5, sDist);
  bankAmt = clamp(bankAmt, 0.0, 1.0);
  vec3 col = mix(dirtT, bankT, bankAmt);
  float macro = clamp(zNoise(vWorld.xz * 0.075 + vec2(1.7, 4.2)) * 0.6 + zNoise(vWorld.xz * 0.042 + vec2(6.0, 2.0)) * 0.4, 0.0, 1.0);
  col *= 0.92 + 0.16 * macro;
  col *= mix(vec3(0.97, 0.99, 1.03), vec3(1.04, 1.015, 0.94), macro);
  float footW = 0.55 + (n3 - 0.5) * 0.28;
  float foot = 1.0 - smoothstep(0.04, max(footW, fw), vWall);
  foot = clamp(foot, 0.0, 1.0);
  col *= 1.0 - foot * 0.25;
  float pathC = 5.0 + (zNoise(vWorld.xz * 0.017 + vec2(2.0, 5.0)) - 0.5) * 2.6;
  float halfW = 0.85 + zNoise(vWorld.xz * 0.031 + vec2(4.0, 1.2)) * 0.4;
  float path = 1.0 - smoothstep(halfW * 0.35, halfW + fw, abs(vWall - pathC));
  path *= smoothstep(2.6, 3.5, vWall);
  path *= smoothstep(2.4, 3.6, vShore);
  path *= 1.0 - bankAmt;
  path = clamp(path, 0.0, 1.0);
  col = mix(col, col * vec3(1.07, 1.05, 1.01), path);
  float under = 1.0 - smoothstep(-1.7, -0.05, vShore);
  under = clamp(under, 0.0, 1.0);
  float wetTop = 1.15 + (zNoise(vWorld.xz * 0.055 + vec2(3.1, 1.4)) - 0.5) * 0.7;
  float wet = 1.0 - smoothstep(0.0, max(wetTop, fw), max(vShore, 0.0));
  wet = clamp(wet, 0.0, 1.0) * (1.0 - under);
  col = mix(col, uWet, wet * 0.94);
  col = mix(col, uWet * vec3(0.55), under);
  vec4 rdS = texture2D(uDirtR, uv);
  vec4 rbS = texture2D(uBankR, uv);
  float rd = max(rdS.r, rdS.g);
  float rb = max(rbS.r, rbS.g);
  float rough = mix(max(rd, 0.92), max(rb, 0.90), bankAmt);
  rough = mix(rough, min(rough, 0.84), path);
  rough = mix(rough, 0.55, wet);
  rough = mix(rough, 0.75, under);
  rough = clamp(rough, 0.50, 1.0);
  vec3 tn = texture2D(uDirtN, uv).xyz * 2.0 - 1.0;
  vec3 bn = texture2D(uBankN, uv).xyz * 2.0 - 1.0;
  vec3 t = mix(tn, bn, bankAmt);
  t.xy *= 0.95;
  t.z = max(t.z, 0.05);
  vec3 N = nSafe(vNw);
  vec3 T = abs(N.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : nSafe(cross(vec3(0.0, 1.0, 0.0), N));
  vec3 B = nSafe(cross(N, T));
  vec3 mapN = nSafe(T * t.x + B * t.y + N * t.z);
  float sr = float(col.r == col.r && col.r >= 0.0 && col.r < 2.0);
  float sg = float(col.g == col.g && col.g >= 0.0 && col.g < 2.0);
  float sb = float(col.b == col.b && col.b >= 0.0 && col.b < 2.0);
  float sn = float(mapN.x == mapN.x && mapN.y == mapN.y && mapN.z == mapN.z);
  float ok = sr * sg * sb * sn;
  col = col * ok + uDirtBase * (1.0 - ok);
  zRough = finite1(rough);
  zMapN = nSafe(mapN * sn + vec3(0.0, 0.0, 1.0) * (1.0 - sn));
  zCol = col;
  return col;
}
`;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aWall;\nattribute float aShore;\nvarying vec3 vWorld;\nvarying vec3 vNw;\nvarying float vWall;\nvarying float vShore;")
        .replace("#include <project_vertex>", `#include <project_vertex>
          vec4 zW = modelMatrix * vec4(position, 1.0);
          vWorld = zW.xyz;
          vWall = aWall;
          vShore = aShore;
          vec3 nn = mat3(modelMatrix) * normal;
          vNw = nn / max(length(nn), 1e-5);`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + decl)
        .replace("#include <normal_fragment_maps>", `{
          vec3 mapN = zMapN;
          #ifdef DOUBLE_SIDED
            mapN *= gl_FrontFacing ? 1.0 : -1.0;
          #endif
          normal = nSafe(mat3(viewMatrix) * mapN);
        }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          {
            diffuseColor.rgb = bankAlbedo();
          }`)
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = zRough;")
        .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
          reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(0.02));
          reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, vec3(0.012));`);
      mat.userData.dbgUniforms = shader.uniforms;
    };
    mat.customProgramCacheKey = () => "inner-bank-w3e";
    mat.needsUpdate = true;
    return mat;
  }

  const wall = makeWall(hangtuMap);
  const innerBank = makeInnerBank(dirtMap, bankMap);
  const hangtu = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: hangtuMap, tile: 8, mode: "strata", kind: "hangtu", normalScale: 0.2, loess: true,
  });
  const hangtuDark = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: hangtuMap, tile: 8, mode: "strata", kind: "hangtu", tint: [0.94, 0.92, 0.88], normalScale: 0.18, loess: true,
  });
  const plaster = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: plasterMap, tile: 3, mode: "tri", kind: "plaster", foot: true, normalScale: 0.85,
  });
  const ground = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide }), {
    maps: dirtMap, mapsB: bankMap, tile: 6, mode: "blend", kind: "ground", shore: true, normalScale: 1,
  });
  const dirt = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide }), {
    maps: dirtMap, tile: 6, mode: "xz", kind: "dirt", normalScale: 1,
  });
  const wood = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: woodMap, tile: 2, mode: "tri", kind: "wood", grain: 0, normalScale: 0.85,
  });
  const woodVert = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: woodMap, tile: 2, mode: "tri", kind: "wood", grain: 1, normalScale: 0.85,
  });
  const woodMixed = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: woodMap, tile: 2, mode: "tri", kind: "wood", grain: -1, normalScale: 0.85,
  });
  const door = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: woodMap, tile: 2, mode: "tri", kind: "door", grain: 1, tint: [0x1c / 255, 0x16 / 255, 0x12 / 255], roughBias: -0.2, gain: 2.4, normalScale: 1,
  });
  const pillar = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: woodMap, tile: 2, mode: "tri", kind: "pillar", grain: 1, tint: [0x9e / 255, 0x2b / 255, 0x1f / 255], roughBias: -0.2, gain: 2.15, normalScale: 1,
  });

  function loadTex(name, kind, px) {
    const key = name + "_" + kind + "_" + px;
    if (cache.has(key)) return cache.get(key);
    const url = urlFor ? urlFor(name, kind, px) : "/textures/" + key + ".webp";
    const tex = loader.load(url);
    tex.name = key;
    tex.wrapS = tex.wrapT = name === "gate_pushou" ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.colorSpace = kind === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = aniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    cache.set(key, tex);
    return tex;
  }

  function withDepthFade(mat, key) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      if (prev) prev(shader);
      const needle = "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;";
      const insert = needle + `
       {
         float zOk = float(vWorld.z == vWorld.z);
         float specZ = clamp((-vWorld.z) * zOk, 0.0, 12.0);
         float dep = clamp(specZ * 0.125, 0.0, 1.0);
         float inside = smoothstep(2.2, 3.0, specZ);
         float k = mix(1.0, mix(1.0, 0.22, clamp(dep, 0.0, 1.0)), inside);
         outgoingLight *= k;
         vec3 floorC = vec3(0.013, 0.008, 0.005);
         outgoingLight = max(outgoingLight, floorC * dep * inside);
         outgoingLight = clamp(outgoingLight, vec3(0.0), vec3(4.0));
       }`;
      shader.fragmentShader = shader.fragmentShader.replace(needle, insert);
    };
    mat.customProgramCacheKey = () => key;
    mat.precision = "highp";
    mat.needsUpdate = true;
    return mat;
  }

  function cloneCompiled(src) {
    const mat = src.clone();
    mat.onBeforeCompile = src.onBeforeCompile;
    return mat;
  }

  const gateSmall = isPhone || !!urlFor;
  const doorPx = gateSmall ? "512" : "1024";
  const pushPx = gateSmall ? "256" : "512";
  const gateDoor = new THREE.MeshStandardMaterial({
    name: "gateDoor",
    color: 0xffffff,
    map: loadTex("gate_door", "color", doorPx),
    normalMap: loadTex("gate_door", "normal", doorPx),
    roughnessMap: loadTex("gate_door", "rough", doorPx),
    roughness: 1,
    metalness: 0,
    normalScale: new THREE.Vector2(1, 1),
  });
  gateDoor.precision = "highp";
  gateDoor.userData.kind = "gateDoor";
  gateDoor.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGateWorld;\nvarying vec3 vGateNw;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 zGate = modelMatrix * vec4(position, 1.0);
        vGateWorld = zGate.xyz;
        vec3 nGate = mat3(modelMatrix) * objectNormal;
        vGateNw = nGate / max(length(nGate), 1e-5);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGateWorld;\nvarying vec3 vGateNw;")
      .replace(
        "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
         {
           float zOk = float(vGateWorld.z == vGateWorld.z);
           float specZ = clamp((-vGateWorld.z) * zOk, 0.0, 12.0);
           vec3 nW = vGateNw / max(length(vGateNw), 1e-5);
           float inward = smoothstep(0.2, 0.65, -nW.z);
           float dep = clamp(specZ * 0.125, 0.0, 1.0);
           float inside = smoothstep(2.2, 3.0, specZ) * inward;
           float k = mix(1.0, mix(1.0, 0.22, dep), inside);
           outgoingLight *= k;
           outgoingLight = max(outgoingLight, vec3(0.013, 0.008, 0.005) * dep * inside);
           outgoingLight = clamp(outgoingLight, vec3(0.0), vec3(4.0));
         }`,
      );
  };
  gateDoor.customProgramCacheKey = () => "gate-door-backfade1";
  const gatePushou = new THREE.MeshStandardMaterial({
    name: "gatePushou",
    color: 0xffffff,
    map: loadTex("gate_pushou", "color", pushPx),
    normalMap: loadTex("gate_pushou", "normal", pushPx),
    roughnessMap: loadTex("gate_pushou", "rough", pushPx),
    roughness: 1,
    metalness: 0.6,
    alphaTest: 0.5,
    normalScale: new THREE.Vector2(1, 1),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  gatePushou.precision = "highp";
  gatePushou.userData.kind = "gatePushou";
  const gateWood = withDepthFade(dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: woodMap, tile: 2, mode: "tri", kind: "gateWood", grain: -1,
    tint: [0x4a / 255, 0x32 / 255, 0x26 / 255], gain: 1.35, normalScale: 0.9,
  }), "gate-wood-fade1");
  gateWood.name = "gateWood";
  const gateWall = withDepthFade(cloneCompiled(wall), "gate-wall-fade1");
  gateWall.name = "gateWall";
  gateWall.userData.kind = "gateWall";
  gateWall.polygonOffset = true;
  gateWall.polygonOffsetFactor = -1;
  gateWall.polygonOffsetUnits = -1;
  const gateFloor = withDepthFade(cloneCompiled(dirt), "gate-floor-fade1");
  gateFloor.name = "gateFloor";
  gateFloor.userData.kind = "gateFloor";
  gateFloor.polygonOffset = true;
  gateFloor.polygonOffsetFactor = -1;
  gateFloor.polygonOffsetUnits = -1;

  // dress / maps are exported so outskirts.js can dress its own materials with the same PBR set.

  const maps = { hangtu: hangtuMap, plaster: plasterMap, dirt: dirtMap, bank: bankMap, wood: woodMap };
  return { hangtu, hangtuDark, plaster, ground, dirt, wood, woodVert, woodMixed, door, pillar, ready, dress, maps, wall, innerBank, gateDoor, gatePushou, gateWood, gateWall, gateFloor };
}
