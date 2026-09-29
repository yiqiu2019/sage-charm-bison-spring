# 赵王城 · 真实材质纹理包（来源 ambientCG，CC0）

每种材质 3 张图 × 2 种尺寸：*_color / *_normal / *_rough，_1024（桌面）和 _512（手机）。全部可无缝平铺。

## 加载设置
- color 贴图：colorSpace = SRGBColorSpace；normal、rough：NoColorSpace
- wrapS / wrapT = RepeatWrapping；开 mipmap；anisotropy = renderer.capabilities.getMaxAnisotropy()（手机上限 4）
- normal 是 OpenGL 格式（NormalGL），three.js 直接用，normalScale 默认 1
- rough 贴图接到 roughnessMap，roughness 设为 1

## 贴图坐标
- 墙、台、阙等竖直面：用世界坐标做盒式/三平面投影（triplanar），不要用几何体自带 UV，否则长墙会拉伸
- 地面：用世界坐标 XZ 投影
- 下表"平铺尺寸"指一张贴图在世界里覆盖多大

## 材质分配
| 材质 | 用在哪里 | 平铺尺寸 | 备注 |
|---|---|---|---|
| hangtu 夯土 | 城墙、内岸夯土坡、阙前斜坡岸、营垒墙 | 4×4 | 横向层理已画在贴图里，每层约 0.25；贴图的"上"必须对准世界 Y 轴向上，层理保持水平 |
| plaster 白灰 | 阙台、龙台各层、角楼台、将台、二三号台、宅院院墙 | 3×3 | 已调成暖白 #E8DFCC 附近；暗红色带仍用单独的几何或颜色；墙脚往上 1.5 在着色器里逐渐压暗 20% |
| dirt 泥土 | 大道、门前空地、广场、城内地面、田间空地 | 6×6 | |
| bank 岸地 | 外岸离水边 0–40 的地面 | 6×6 | 与 dirt 用低频噪声混合过渡，不要出现直线分界 |
| wood 旧木 | 木桥桥面、栏杆、桥墩、码头 | 2×2 | 木纹方向：桥面木板横跨桥宽；桥墩竖直 |
| wood（染色） | 门扇（黑漆）、程序生成的红柱 | 2×2 | 用 wood 的 normal 和 rough，颜色贴图乘以黑漆 #1C1612 或丹漆 #9E2B1F，漆面 roughness 再降 0.2 |
