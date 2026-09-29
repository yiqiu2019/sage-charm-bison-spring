# 赵王城 · 城外环境模型包

每个模型三个版本：
- *_lod0.glb：近处，贴图 1024，桌面用
- *_lod1.glb：中距离，同样的几何，贴图 512；手机版最近一级用它
- *_lod2.glb：远处，几百面，无贴图，用顶点色

加载：GLTFLoader + MeshoptDecoder（three/addons/libs/meshopt_decoder.module.js）；lod0/lod1 用了 EXT_texture_webp；带 KHR_materials_specular 的，specularIntensity 设为 0.5。lod2 用顶点色，材质开 vertexColors。

切换距离：桌面 lod0 <60，lod1 60–150，lod2 150–260，260 以外隐藏；手机 lod1 <80，lod2 80–220，220 以外隐藏。用 THREE.LOD 或按距离切换 InstancedMesh 批次。

| 文件 | 内容 | 原始尺寸 (X×Y×Z) | 正面 | 缩放 | 缩放后 |
|---|---|---|---|---|---|
| hut | 茅草屋 | 0.87×0.64×0.69 | +Z（门） | 5.8 | 约 5.0×3.7×4.0 |
| barrack | 营房 | 1.14×0.23×0.39 | +Z（一排门） | 17.6 | 约 20×4.1×6.9 |
| hall | 贵族正堂（含台基） | 0.98×0.38×0.70 | +Z（台阶） | 14.3 | 约 14×5.5×10 |
| horse | 马 | 0.85×0.84×0.67 | 头朝 −X | 2.3 | 高约 1.9 |
| cow | 黄牛（低头吃草） | 0.34×0.57×1.06 | 头朝 +Z | 2.1 | 长约 2.2 |
| guard | 守门卫兵（持戈） | 0.51×1.10×0.36 | +Z | 2.15 | 人高约 1.7，戈顶约 2.4 |

三角面：hut 6k / barrack 7k / hall 10k / horse 8k / cow 8k / guard 12k（lod0、lod1 相同）；lod2 约 175–1100。

摆放时每个实例随机：绕 Y 轴旋转、整体缩放 ±10%、墙面和屋顶偏色 ±8%（用 instanceColor 乘到颜色上）。营房模型缩短到 8 米左右，可当贵族宅院的仓房或马厩。
