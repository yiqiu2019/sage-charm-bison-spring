# 柳条贴图集

- willow_strands_1024.png：桌面版；willow_strands_512.png：手机版。RGBA，背景透明。
- 一张图里并排 5 枝柳条，每枝从贴图顶端垂下。各枝的 UV 范围见 willow_strands_uv.json（u0/u1 左右，v_top/v_bottom 上下，按 three.js 默认 flipY 的 v 方向）。
- 透明区域的颜色已向外扩展，开 mipmap 后边缘不会出现白边或黑边。
- 材质建议：MeshStandardMaterial，alphaTest 0.4，side DoubleSide，transparent false（用 alphaTest 而不是半透明混合，避免排序问题）；桌面可开 alphaToCoverage 让边缘更柔和。
