# 生成、GT 与渲染约定

当前生成器为 `vega-lite-native/1.2`，GT 合约为 `compact-v5`。样本经过“数据/样式采样 → 完整 Vega-Lite → 精简 GT → 两份独立渲染 → 质量门 → 训练导出”。Matplotlib 与 VSR 原生图像不再参与新样本生成。

## 采样接口

```python
from generation import generate_chart
from adapter import build_pair

sample = generate_chart("line_n", 20261110, "runs/example/sample", {
    "point_count": 12,
    "series_count": 3,
    "x_mode": "categorical",
    "show_legend": False,
})
full, compact, source = build_pair("line_n", sample["config"])
```

`generate_chart` 只采样并保存 `config.json` 与 `sampling.json`，返回 `config`、`sample_seed` 和 `diagnostics`。它不创建图片。已有上述采样文件时拒绝覆盖。`build_pair` 不修改输入配置；完整 JSON 的 `data.values` 与 `source.rows` 是同一套观察。

`generation/controls.py` 声明九种基础图表、`barline_n` 复合图、数据族和style profile。`vsr_samplers/` 静态保留原VSR纯采样函数，`vsr_text.py` 和 `words.txt` 保留文本与词表；`vsr_runtime.py` 绑定每样本独立Python Random/NumPy RandomState及已有纯RGB样式规则；`core.py` 整合显式控制、GT与坐标合约。不导入旧绘图、history、Matplotlib，不通过绘图反推观察数据。

| 控制 | 适用范围与含义 |
|---|---|
| `category_count` | 柱图类别数 |
| `point_count` | 折线每条线的点数；散点总点数 |
| `series_count` | `_1` 固定为 1；普通 `_n` 为 2–5；堆叠为 2–6 |
| `family` | 必须属于该类型在 `FAMILIES` 中声明的数据族 |
| `profile` | 声明的视觉 profile；`dense_scatter_family` 仅用于散点 |
| `x_mode` | 折线的 `numeric` / `categorical` / `temporal` |
| `stack_mode` | 堆叠柱图的 `absolute` / `percent` |
| `show_error` | 非堆叠柱图误差棒，布尔值 |
| `hatch` | 柱形纹理：null、`/`、`\`、`|`、`-`、`+`、`x`、`o`、`O`、`.`、`*` |
| `show_legend` | 是否显示图例，布尔值 |
| `x_inverted` / `y_inverted` | 坐标反向，布尔值 |
| `x_scale` / `y_scale` | `linear` / `log` / `symlog` / `sqrt`；数据与尺度必须兼容 |
| `reference_lines` | `[{"axis": "x"或"y", "value": 有限数值}]` |
| `style` | 样式字典覆盖 |
| `bar_series_count` / `line_series_count` | 仅复合图：柱/折线系列数，1–4 与 1–3 |
| `bar_family` / `line_family` | 仅复合图：柱、折线各自的数据族；`family` 写作 `柱族+折线族` |
| `coupling` | 仅复合图：折线相对柱的统计关系 |
| `dual_y_axis` | 仅复合图：折线使用独立右值轴，柱保留左值轴；GT 以 `resolve.scale.y = "independent"` 表达 |
| `y_axis_orient` / `x_axis_orient` | 仅复合图：值轴 left/right、类别轴 bottom/top；双轴时值轴固定 left |
| `axis_design` | 仅复合图：`y_tick_count`、`y_tick_format`、`y_axis_offset`、`y_title_anchor`、`x_title_anchor`、`x_label_align` |
| `y_title_right` | 仅复合图：右值轴单位名，双轴时必填非空字符串语义（采样保证非空） |
| `data_labels` | 仅复合图：`true` / `false` / `{"bar": 布尔, "line": 布尔}`，强制柱或折线数值标注开关；缺省约 56% 的样本自然带标注。字号按槽宽自适应，过密的图自动不标 |

`scatter_n.point_count` 在 `4 × series_count + 4` 到 48 之间，表示所有系列合计。类别坐标必须使用线性位置尺度；对数轴要求有效正值，平方根轴要求非负值。无效组合明确报错，不隐式丢弃观察。

控制项取值也可以是列表：列表按样本序号轮转取值（`index % len`），使一次运行同时覆盖多种类别数、系列数、coupling 或标注策略；标量含义不变。解析后的控制进入采样、`sampling.json` 与 resume 指纹，每个样本仍可复现；空列表或嵌套列表在加载配置时明确报错。示例见 `configs/composite_diversity.json`。

旧别名 `n_points`、`n_categories`、`n_series`、`style_profile` 仍可使用；与规范名冲突时拒绝。`max_attempts` 为旧配置兼容项，强制控制直接应用，新采样没有旧版拒绝重采样循环。参数含义和验证以 `generation/controls.py` 为准。

## GT 表与可见顺序

训练 GT 的 `data.values` 是实际读取顺序，不依赖隐藏的排序列表：

- 横向柱图：类别从上到下，组内柱子从上到下。
- 纵向柱图：类别从左到右，分组柱子从左到右。
- 堆叠柱图：类别从左到右，每组片段从上到下。
- 折线：x 从左到右，同一 x 的记录保持稳定系列顺序。
- 散点：x 从左到右，同 x 时 y 从上到下，完全相同的观察保留重复次数。
- 复合图：先按角色（柱在前、折线在后），角色内按类别位置与 x 位置排列；柱行的分组偏移与折线行的连接顺序互不影响。

反向坐标按照实际屏幕方向计算上述顺序。原始 `row_id`、`series_index`、`point_index` 保留在完整规格与证据文件，不因排序重写身份。类别/系列/偏移的 nominal 或 ordinal 通道统一设置 `sort: null`，按 `data.values` 第一次出现顺序建立域。数值轴反向属性属于可见语义，会保留在 GT。

通常，柱图每行是 `category/value/series`，折线和散点每行是 `x/y/series`。GT 不包含生产 ID、像素坐标、字体配色或原绘图区范围。必要的可重绘信息例外如下：

- 误差区间用 `lower/upper` 表示，GT 以柱图加显式 rule 图层重绘。
- 堆叠增加 `stack_order` 维护片段连接关系；异常基线或非普通正负累计堆叠改用显式 `start/end`，避免被重新堆叠成不同形状。
- 非单调折线路径在按可见 x 排序后，以 `path_order` 保留原连接。反向遍历但边相同的路径不必新增该列。
- 重复类别/系列名称采用同一字段内的整数身份与 `labelExpr` 显示原文字，避免相同名称被错误合并。审计投影可添加 `*_instance` 区分这些身份；这些审计字段不写入 GT。

`normalize(full)` 构造 GT，`normalize(compact)` 幂等。`project_rows(full) == semantic_rows(compact)` 比较的是同一可见顺序下的观察、重复身份和必要连接信息。只有视觉样式变化而可见语义不变时，GT 才保持一致；改变坐标方向、图例可见性等会相应改变 GT。

## 复合图 barline_n

复合采样器位于 `generation/composites/`，不复制官方公式：`vsr_runtime.composite_namespace` 把 `barv_n` 与 `line_n` 的官方闭包绑定到共享同一种子流的兄弟命名空间，复合模块只负责组合。柱矩阵取自官方柱族，折线矩阵先由官方折线族生成，再经 `couple_lines` 按 `coupling` 与柱建立关系，最后由 `fit_line_envelope` 施加一次共享仿射变换，把折线放回柱的数值包络内——仿射不改变比例、残差、秩、占比与偏移带等关系形状。柱参考量只取与柱同量级的每类别归约（均值、最大、最小、极差或某一柱系列），避免求和之类聚合把柱压扁。

GT 在 compact-v5 中以图层表达角色：柱层（多柱系列时带 `xOffset`）、可选的误差 rule 层（仅当存在 `lower/upper`）、折线层，每层用 `transform` 的 `series_role` 过滤。`series_role` 只出现在复合图 GT 行中；九种基础图的规范字节保持不变。完整规格由 `adapter.py` 按角色分别生成柱与折线图层，图例符号按角色取柱块或线段。

`series_count` 在复合图中表示柱与折线之和（2–7），可与 `bar_series_count` / `line_series_count` 组合，冲突时明确报错。`x_mode` 固定为 `categorical`，不接受数值或时间控制。

## 类别标签与隐藏图例

类别型及等间隔时间标签折线，完整规格会显式设置所有类别刻度。历史配置中的 `tick_positions` 或 `_render_axes.xticks` 稀疏子集不会覆盖完整类别集合。GT 同样列出全部类别并关闭自动标签省略。时间标签按相等日历周期占位，日期元数据不会擅自变成按实际时间差排布的连续轴。

无图例时，原始不可见名称不进入训练答案。系列按表中首次出现顺序命名为 `Series 1`、`Series 2`……；单系列也保留 `series: "Series 1"`。完整规格与 GT 都隐藏图例，`Series N` 作为答案中的约定身份，而不是伪造图片中存在的文字。显示图例时保留其真实名称和重复名称身份。

单点折线必须保留可见点标记，避免只有一条无长度线而看不到观察。标记子采样仅作用于图形标记，不删掉数据行或类别标签。

## 布局与渲染

`plot_layout.py` 根据点、柱端点、堆叠端点和误差上下限扩展安全坐标范围，为标记、线宽和端帽保留像素空间；已有足够的范围保持不变。非线性轴在变换空间计算边距。等比例散点通过扩大绘图区保持比例，无法合法映射的数据明确失败。每例的 `plot-layout.json` 保存调整证据。

值轴基线贴合：官方采样器按 span 比例给值轴两端加外padding，带正负值的柱图会在柱端与轴线之间留下空带。构建时 `adapter._tight_value_domain` 把采样域收回到柱矩形端点（含误差帽），`plot_layout._anchor_clearances` 在该侧极值是裸柱矩形端点时只保留半个柱描边的余量，使柱的绘制边缘正好落在轴线上、且 scenegraph paint 边界不越过 plot clip；误差帽、折线顶点和点图元保留paint余量，折线/点更低时值轴仍为其让出空间。config/controls 显式指定的域不收紧；值轴高端保留采样 headroom。该规则作用于全部含柱类型（含 `barline_n`），横向柱状图对称作用于 x 轴。

`presentation.py` 将采样的字体、网格、线型、刻度和图例样式映射到 Vega-Lite。字体文件经 fontTools 读取真实元数据。`text_layout.py` 关闭默认截断，按词换行并增加留白；原始标题/变量名保留用于 GT 投影。全部类别标签显式保留，长标签仍需结合图像检查其可读性。

渲染使用固定版本的官方 Vega-Lite `compile`、Vega `View.toSVG()`，再由 Resvg 栅格化。完整与精简规格独立编译、渲染。字体来源为 `assets/fonts/` 与 `fonts.manifest.json`，输出记录保存文件哈希。

renderer 默认使用两个隔离 Node 子进程，每批最多十个样本，单批超时为 180 秒。失败批次拆分重试，成功结果保留。恢复时核对输入、运行环境、字体和输出 SHA-256；变化或缺失的输出重绘。常用参数为 `--workers`、`--chunk-size`、`--child-timeout-ms`、`--target-side`、`--resize-mode contain|stretch`、`--no-resume`。renderer 进程数独立于 Python 采样进程数。

## 质量门与训练导出

运行目录保存 `run.json`、候选 `generation-manifest.json`、`render-jobs.json`、`render-report.json`、`validation.json`、接受/拒绝清单与训练 JSONL。新生成的成功样本保存：

| 产物 | 用途 |
|---|---|
| `full.vl.json`、`chart.svg/png` | 完整规格与训练输入 |
| `compact.vl.json`、`compact.svg/png` | GT 与独立重绘 |
| `config.json`、`sampling.json`、`generation.json` | 可复查的采样参数、种子和控制 |
| `source.json` | 原始观察身份、可见顺序和能力记录 |
| `geometry.json`、`compact.geometry.json` 及缩放版本 | 实际场景图图元和坐标 |
| `plot-layout.json`、`text-audit.json`、`render-record.json` | 布局、文字与输出完整性检查 |

历史重投影仅继承源目录已有的 `sampling.json` 等历史证据，不会补造缺失的采样来源文件。

质量门检查两份官方 Schema、投影一致与幂等、场景图真实观察数量和重复次数、图像尺寸、有限坐标、缩放一致性、实际 SVG 文字、渲染警告及严重裁切。数据图元不能靠删除越界观察通过检查。完整与 GT 的视觉样式可不同，但类别、观察及连接信息必须一致。

`counts` 表示候选数。只有接受样本写入 `manifest.jsonl` / `train.jsonl`；拒收原因写入 `rejected.jsonl`。生成、渲染或验证失败会使命令返回非零。自动检查不能认证所有视觉可读性，也不代表复现了论文历史 800K 数据或未公开质量过滤器。

## 迁移与兼容

旧 VSR Matplotlib 生成器、PNG/像素标注、resize/anchor 打包、原生展示重放已移除。新运行不创建 `native.png`、`native.annotation.json`、`native_outputs/` 或 `native_packaged/`。`native.py.generate_native` 作为薄兼容入口委托 `generation.generate_chart`，其旧 `render` 参数不产生绘图行为。

旧运行配置中的 `native` / `postprocess_native` 可读取，启用时提示已移除并忽略。`--resume` 要求生成器版本、GT 合约和规范化配置均相同；旧版本运行使用 `reproject` 到新目录。重投影直接读取保存的 `config.json` 和可选 `presentation.native.json`，保留旧数据与可用展示快照，重新构建当前 JSON/图像。`--recover-native-presentation` 已不支持，不能重做 Matplotlib 捕获。

图族、文字与风格多样性来自原VSR实际采样规则及显式控制。参数层按实际原版采样oracle核对；相同生成器版本、种子、控制和资源可重现。完整类别标签、隐藏系列名、显式controls和原生布局是记录的合约扩展，不承诺Matplotlib/Vega像素一致。VSR 的设计归属与许可证保留在 `THIRD_PARTY.md` 和 `vendor/VSR/LICENSE`。
