# 样式恢复与 SVG 内嵌字体交付 — 2026-11-11

验证记录时间：2026-11-11T11:26:03.404115+08:00。代码已修改于 h.pjlab.org.cn 的本项目工作区；未提交或推送。保留原有重构改动及运行产物。检查时源码备份：`history/style-font-20261111/source-at-inspection.tar.gz`。

## 实际完成

原生 Vega-Lite/Vega → SVG → Resvg 架构保留。`generation/style_rules.py` 恢复原版 30 个基础调色板、八种颜色生成模式、profile/系列数条件概率和关联；`generation/template_styles.py`、bars/lines/scatter/core 恢复专门采样、图例 1–3 列、背景、字号、标题字重/斜体、尺寸、旋转、网格、轴刻度、线型、标记、纹理、误差及参考线变化。不是仅补样式名称。样式 worker 的冻结参考测试对照原版实际函数：2460 个完整 canvas 摘要、2400 个 profile 选择；另有重构前后 450 配置诊断。正式代码无 Matplotlib import，旧 Matplotlib 仅用于独立基线审计。

原 16 个字体文件保持均匀抽样池；新增真实粗斜体等支持文件后共 33 个 face，支持文件不增加基础抽样权重。样式采样版本升为 `vega-lite-native/1.1`；不同版本的 generate/resume 明确拒绝混用，历史数据继续可重投影。

实施前清单：[样式对照](style-diversity-baseline-20261111.md)、[字体角色检查](svg-font-baseline-20261111.md)。最终自然频率、范围、关键组合、拒收及真实图像证据：[独立多样性报告](style-diversity-validation-20261111.md)。后者区分随机采样与定向验证、配置统计与实际渲染；不以取值种数推断视觉等价。

旧版与新版均每类请求1000次，共各9000次；旧版8995成功、5个RGBA错误，新版9000成功。逐类 profile 的样本频率总变差为0.0270–0.0570，字体为0.0575–0.0731；这些是实测频差，不是分布等价的统计证明。样式名称之外，完整字段频数、范围、分位数及关键组合均保留。新旧实际渲染各306次：自然覆盖144、随机36、定向126（cohort可能重叠，不能当作306个去重样本）；旧306 rendered，新305 rendered、1 review。唯一review是定向line_1的域外零参考线被裁剪，主线未被列为裁剪；该图留作审计证据，没有被计为质量门通过。生产450另行全过。

已实际查看折线、堆叠柱、散点、图例维度contact，另查看暗色折线原图和浏览器/Resvg对应样例。暗色原图可辨；缩图可能使细字更弱。未做全部306图逐张人工验收。

## 正式集成结果

|运行|请求|接受|拒收|证据|
|---|---:|---:|---:|---|
|新样本，每类50|450|450|0|runs/style_font_v7_production/validation.json 与 integration-audit.json|
|历史样本，每类3|27|27|0|runs/style_font_v7_reproject/validation.json 与 integration-audit.json|

108 项回归全部通过，包含实际编译、可见顺序、全部类别标签、隐藏图例系列命名、恢复/重投影、字体与渲染器检查；日志 `diagnostics/style-font-regression-verified-20261111.log`。早期 Node16 和不支持 fontBuffers 的失败日志保留，未当作通过。

生产审计实际检查 900 个完整/精简 SVG 的字体数据、可搜索 text、无外部字体资源，166 张隐藏图例的系列名和全部训练 GT；训练 JSONL 与 compact 文件逐一相等。27 个历史配置字节均等于原文件，27 个 compact JSON 均等于此前 native_v6 重投影，恢复运行复用 27 个缓存，无重新采样。

## 字体嵌入与隔离证据

`font_embedding.py` 遍历所有实际文字角色及继承属性，匹配真实 family/weight/style，检查 cmap、fsType、文件与许可哈希，生成 @font-face data URI、许可 metadata，保留 text/tspan。精简 SVG 独立处理。generic sans-serif/serif/monospace 的明确解析记录在 metadata；未知字体、缺字、未经核实的许可或不支持的声明明确拒绝。

本地 Windows + Edge Edg/157.0.4341.42，空浏览器配置；目标字体未安装，远程项目字体路径不可访问；CDP 禁网并阻断外部资源。9 家族、33 face 的独立探针，以及九类完整/精简共18个实际图表全部实测：每个非空文字节点的 CSS.getPlatformFontsForNode 均为 isCustomFont=true，外部资源请求为0。全部去掉 font-face 的负对照均不再使用 custom font。regular、bold、italic、bold-italic 和 − μ × 10⁻³ α β Ω ± ∞ ≤ ≥ H₂O 等字符有探针、截图与逐字符覆盖记录。

18 个图表浏览器实际文字框均未越出画布，浏览器与 PNG 画布尺寸均一致；按像素比较存在抗锯齿/栅格化差异，平均绝对通道差范围 0.439–3.782/255，不能声称像素一致。逐图尺寸、差异和框检查：`deliveries/style_font_20261111/compatibility-audit.json`。

Resvg 2.6.2 实测不接受 fontBuffers；正式链从 SVG data URI 解码字节到 mode0700 临时目录，再仅加载临时字体，系统字体关闭，finally 清理。运行时正/负能力探针用于阻止失效回退。Sharp 因未满足同样契约明确拒绝。SVG 本身只含 data URI，显示时不依赖项目路径、外部字体网站或网络。

### 体积与许可

DejaVu/Noto 子集包含实际字符、版权和许可。URW 原字体字节不修改，SVG metadata 内附固定上游完整归档与 AGPL，不依赖仅限 PS/PDF 的例外；因此 URW SVG 约15MB。已校验字体与归档对应，未验证上游 OTF 的逐字节重建，也不将该实现表述为绝对法律保证。许可与再分发边界：[字体许可说明](font-licenses/README.md)。

18 个实际图表的嵌入 SVG 范围 75,316–15,179,413 bytes；去掉字体及许可 metadata 后为 11,160–244,514 bytes。逐图记录在 compatibility-audit.json，不把字体源码归档开销误算为字形子集失败。

## 查看与复现

- 新旧图库：`deliveries/style_diversity_audit_20261111/`，按类型与维度组织；独立报告列出最终文件。
- 可直接离线打开：`deliveries/style_font_20261111/chart-samples/*.svg` 与 `font-probes/*.svg`。without-fonts 文件仅为负对照，不能当作正式分发样例。
- 浏览器证据与可复现脚本：`deliveries/style_font_20261111/browser-evidence/`，含环境检查、CDP 审计、实际使用字体、框宽度、负对照和截图。
- 图像与 GT 正式产物：`runs/style_font_v7_production/`；历史重投影：`runs/style_font_v7_reproject/`。
- 回归：`PATH="$PWD/../.runtime:$PATH" VSR_TEXT_TEST_MODULES="$PWD/../node_modules" VSR_FONT_INTEGRATION=1 python3 -m unittest discover -s tests -v`。
- 生产：`python3 pipeline.py generate --config configs/production.json --output runs/my_new_run`；同版本恢复追加 `--resume`；历史投影须新目录。

## 尚存差异

Noto Mono 只有真实400/normal，粗/斜请求仍采样但明确记录解析到现有 face；其他家族有对应真实变体。URW 部分 face 不含上标负号/下标2等；探针报告显式列出不支持字符，正式遇到缺字拒绝，不静默替换。完整字符差异见 glyph-probe-report.json。

图例 shadow 尚未实现；框角、best 位置、外侧布局、图例列填充顺序、纹理覆盖、物理 mark/DPI 映射和 Matplotlib tight_layout/科学计数格式存在近似。原生数据族与计数分布保留，故与原版的系列数条件总体分布仍可能不同。字体嵌入不修正 Vega 缺少 node-canvas 时的估算文字测量；已用18个浏览器样例实测画布边界，但未证明全部随机组合无重叠或完全可读。不得把本次测试通过或样式数量恢复表述为新旧像素/视觉分布完全等价。
