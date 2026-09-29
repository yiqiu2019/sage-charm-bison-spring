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
    const url = urlFor ? urlFor(name, kind, size) : "/textures/" + key + ".jpg";
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
          }`)
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
            ${o.foot ? "diffuseColor.rgb *= mix(0.80, 1.0, smoothstep(0.0, 1.5, vWorld.y - vFoot));" : ""}
            zRough = clamp(roughTex + uRoughBias, 0.045, 1.0);
          }`)
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = zRough;");
    };
    const key = [o.mode, o.tile, o.roughBias, o.grain, o.foot ? 1 : 0, o.shore ? 1 : 0, o.kind || ""].join("|");
    mat.customProgramCacheKey = () => "arch-" + key;
    mat.needsUpdate = true;
    return mat;
  }

  const hangtu = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: hangtuMap, tile: 4, mode: "strata", kind: "hangtu", normalScale: 1,
  });
  const hangtuDark = dress(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), {
    maps: hangtuMap, tile: 4, mode: "strata", kind: "hangtu", tint: [0.78, 0.74, 0.66], normalScale: 1,
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

  return { hangtu, hangtuDark, plaster, ground, dirt, wood, woodVert, woodMixed, door, pillar, ready };
}
