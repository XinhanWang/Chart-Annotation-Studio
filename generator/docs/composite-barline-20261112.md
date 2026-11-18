# 复合图 barline_n 交付 — 2026-11-12

## 结论与范围

新增第 10 种图表结构 `barline_n`：同一类别轴上叠加 1–4 组纵向柱与 1–3 条折线。GT 合约升级为 compact-v5，采样版本仍为 `vega-lite-native/1.2`，投影版本 3.2.0。九种基础图的采样、规范与 GT 字节保持不变；`series_role` 只出现在复合图 GT 行中。

## 扩展点

| 位置 | 职责 |
|---|---|
| `generation/composites/barline_n.py` | 复合采样器：系列数、双数据族、coupling、柱参考量、折线包络、画布与呈现参数 |
| `generation/composites/__init__.py` | 复合类型注册表 `KINDS` |
| `generation/controls.py` | `COMPOSITE_KINDS`、`COMPOSITE_FAMILIES`（121 个柱族×折线族组合）、`COUPLINGS`、系列数范围与冲突校验 |
| `generation/vsr_runtime.py` | `composite_namespace` 把 `barv_n`/`line_n` 官方闭包绑进共享同一种子流的兄弟命名空间；`composite_controls` 拆分 `family`/`series_count` |
| `generation/core.py` | x 反向、刻度样式、误差/纹理只作用于柱系列、角色长度校验 |
| `adapter.py` | 按角色生成柱/折线图层、GT 行几何、语义能力 `composite_roles` |
| `ordering.py` | 可见顺序：角色优先（柱→折线），角色内按类别与 x 位置 |
| `compact.py` | compact-v5 的 `ROLE_FILTERS`、角色图层规范与校验 |
| `presentation.py` / `plot_layout.py` / `workflow/validation.py` | 折线图例符号、回退图元、审计键与主类型 |

复合模块不复制官方公式：柱矩阵来自官方 `bar_generate_matrix`，折线矩阵来自官方 `line_generate_matrix`，复合层只做组合。官方九类的 `test_official_sources_and_function_closures_are_exact` 等冻结测试不受影响。

## 数据多样性

- 柱族 11 种 × 折线族 11 种 = 121 个组合，全部合法 `family`；`bar_family`/`line_family` 可单独强制。
- `coupling` 六种：`independent`、`proportional`、`residual`、`percent_of_bar`、`shared_trend`、`offset_band`，表达折线相对柱的统计关系。
- 柱 1–4 组、折线 1–3 条；`series_count` 为两者之和（2–7），可再拆分为 `bar_series_count`/`line_series_count`。
- 呈现继承基础图全部维度：调色板/字体/画布、柱纹理、折线标记与线型、误差棒（仅柱）、图例显隐、反向轴、网格轴、参考线。

## 可读性合约

`couple_lines` 先按 `coupling` 生成折线原始形状，`fit_line_envelope` 再施加一次共享仿射变换。仿射保持比例、残差、秩、占比与偏移带等关系形状，只把折线放回柱的数值包络：`center`/`spread` 取自柱矩阵本身，柱参考量只取与柱同量级的每类别归约（均值、最大、最小、极差或某一柱系列），求和之类会压扁柱的聚合不再使用。

1400 个采样（6 种 coupling × 多种系列/类别数）实测：折线均值与柱均值偏差 ≤ 0.68×柱跨度；折线跨度/柱跨度落在 [0.18, 2.28]，其中极端值来自 `human_round` 对柱跨度的取整，而非包络本身。柱跨度退化（近乎恒定的柱）时只校验放置不变量。

图例遮挡合约：复合图的内部图例先做遮挡探测（`presentation._unoccluded_legend_placement`，阈值 `LEGEND_OCCLUSION_LIMIT = 0.02`）。探测把柱矩形（含误差帽）、折线顶点与线段投影到最终像素空间；采样位置只有不覆盖任何图元时才保留，否则让位给占用最小的角，四角都不空时图例移出绘图区（`orient: right`）。探测盒按估计图例尺寸的 1.1×/1.6× 放大，以覆盖 Vega 实际行高与外框。决策记录在 `source.json` 的 `presentation.legend.reason`（`source_location` / `composite_least_occupied_corner` / `composite_no_unoccupied_corner`）。九种基础图的图例行为保持不变。

## 轴设计多样性（增补）

在共享类别轴之外，复合图新增一组只作用于 `barline_n` 的轴设计维度，九种基础图的采样与 GT 字节不受影响：

- `dual_y_axis`（p=0.30）：折线改用独立的右值轴，柱保留左值轴；开启时 `y_axis_orient` 固定为 `left`，避免两条值轴同侧。
- `y_axis_orient`（right p=0.12，仅非双轴）与 `x_axis_orient`（top p=0.12）：值轴/类别轴换侧。
- `axis_design`：`y_tick_count`（None/4/6/8/10）、`y_tick_format`（None/`~s`/`,~f`）、`y_axis_offset`（0/4/8/12）、`y_title_anchor`、`x_title_anchor`、`x_label_align`；x 标签已旋转时 `x_label_align` 强制为 None，避免与旋转对齐冲突。
- `y_title_right`：右轴单位名，由 `sample_secondary_axis_title` 采样，保证非空，使两条值轴的单位始终可区分。

双轴全量规格：`resolve.scale.y = "independent"`，`adapter._single_value_guides` 只保留首个柱图层（左）与首个折线图层（右）的值轴 guide，其余图层 `axis: null`——否则 Vega 会为每个独立 scale 各画一条轴。右轴域由 `adapter._line_domain` 取折线顶点极值，再经 `plot_layout` 的像素余量拟合；左轴收紧时排除折线行。

双轴 GT 语法（compact-v5 增补，`compact.normalize`/`validate_canonical`）：顶层 `resolve: {"scale": {"y": "independent"}}`；柱与其误差条收进一个嵌套组 `{"transform": [bar_filter], "layer": [...]}` 共享左 scale，折线层独立；折线层仅在右轴单位与左轴不同时重述 `encoding.y = {"field": "value", "type": "quantitative", "title": ...}`。GT 不写数值域：Vega 由过滤后的折线行自行推导右轴域，与九类基础图"GT 不含显示域"的约定一致。非复合目标出现 `resolve` 一律拒绝。

## 数值标注多样性（2026-11-13 增补）

复合图新增“柱/折线是否印出数值”的显示维度，训练输入图像因此同时包含带标注与干净的图，而语义 GT 完全不变：

| 位置 | 职责 |
|---|---|
| `generation/composites/barline_n.py` | `sample_data_labels`：标注开关（none/bar/line/both，权重 0.44/0.19/0.18/0.19）、位置（柱 above/inside、折线 above/below）、d3 数字格式、字重、墨色（text/series/contrast） |
| `generation/controls.py` | `data_labels` 控制：`true` / `false` / `{"bar": 布尔, "line": 布尔}`，仅复合图可用 |
| `adapter.py` | `_data_label_layers`：以 `__vsr_decoration_data_label_*` 装饰层复用观察表印字；`clip: false`、不建图例、轴定义与被标注几何逐字节相同（共享轴合并，`axis: null` 会关掉整条共享轴） |
| `plot_layout.py` | `_label_clearance`：柱外/折线标注在值轴方向预留字高余量；双轴折线域同样受益 |
| `presentation.py` | 标注墨色参与图例遮挡探测；字体按所选字体族解析真实字面并记入 `font_roles.data_label` |

可读性规则：字号在 6.6–10.6 间连续采样，但不得超过“最宽印字 × 0.62 + 2px ≤ 槽宽”；柱槽宽 = 绘图宽 × group_width / (类别数 × 柱系列数)，折线槽宽 = 绘图宽 / (类别数 × 折线系列数)。放不下就降字号，仍放不下则该角色不标；`inside` 还要求最矮柱不低于值域跨度的 22%。`contrast` 墨色只用于柱内标注。强制 `data_labels: true` 可放宽密度上限（40 槽），但不放宽槽宽规则。

证据：`source.json` 的 `decorative_geometry.data_label_layers` 与 `capabilities` 的 `data_labels: display_only`；`usermeta.presentation.data_labels` 记录采样结果并随 `source.presentation` 落盘。12 例强制标注与 36 例轮转配置批量均 0 拒绝。

## 一次生成的多样性配置（2026-11-13 增补）

`workflow/config.resolve_controls` 允许控制取值写成列表，按样本序号轮转（`index % len`），解析结果进入采样、`sampling.json` 与 resume 指纹。`configs/composite_diversity.json` 用 240 个复合图样本同时覆盖 10 种类别数 × 6 种系列数 × 6 种 coupling × 双轴开关 × 6 种标注策略；family、profile、纹理、误差、图例、轴设计与字体仍按原分布自然采样。36 例探针实测：类别数 4–16 各 3–4 例，双轴 12 例，标注 none/bar/line/both 分别为 11/4/10/11。

## 实际执行结果

| 检查 | 结果 |
|---|---|
| 全量回归 | 192 项通过 / 0 失败 / 2 跳过（含 5 项数值标注测试与 2 项列表控制测试） |
| smoke（十类各 1） | 10/10 接受，0 拒绝，合约 compact-v5 |
| `barline_n` 随机批量 12 | 12/12 接受；11 个不同柱族+折线族组合，双轴 3 例、x 轴 top 1 例、值轴 right 1 例 |
| 基础柱状图批量 24（锚定余量调整后） | 24/24 接受；全非负数据的柱仍正好贴住值轴基线 |
| 新增定向测试 `tests/test_composite_barline.py` | 21 项通过：采样确定性、角色/几何、compact-v5 图层、非规范目标拒绝、预览数据一致、双轴 GT 语法与轴设计多样性 |
| 双轴批量 6（`dual_y_axis: true` 强制） | 6/6 接受；右轴独立域、左柱右线双 guide、x 轴 top/bottom 与刻度设计均出现 |
| 视觉抽查 | 分组柱+误差棒+双折线、反向轴+隐藏图例、单柱+虚线等组合均正常 |
| 数值标注批量（强制 `data_labels: true`，12 例） | 12/12 接受；柱外/柱内/折线上下、双轴与共享轴、正负混排均出现 |
| 多样性配置探针（轮转列表，36 例） | 36/36 接受；类别数、系列数、coupling、双轴与标注策略覆盖见上节 |

## 剩余边界

- 复合图暂不支持数值/时间 x（`x_mode` 固定 `categorical`），不支持堆叠柱与折线组合。
- 折线包络与图例遮挡探测保证共享值轴可读、图例不盖图元，但不认证所有文字相互遮挡；质量门与图像抽查仍是必要补充。
- 新 coupling 或新几何组合（如柱+散点）按同一扩展点添加：注册 `KINDS`、补 `COMPOSITE_BASES`、实现采样器与角色图层即可，无需改动官方闭包。
