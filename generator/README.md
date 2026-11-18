# Vega-Lite-DG

面向“图表图像 → Vega-Lite JSON”的原生数据生成管线。Python 负责采样数据与视觉参数，直接构建 Vega-Lite JSON；唯一绘图链是 **Vega-Lite 6.5.0 → Vega 6.4.0 SVG → Resvg 2.6.2 PNG**。生成无需 GPU 或 LLM API。

每个样本对应三份主要产物：`full.vl.json` 是完整绘图规格，`chart.png` 是其实际渲染图像，`compact.vl.json` 是训练用 GT。训练 GT 不含显示排版。`compact_display.render_spec()` 派生 `compact.preview.vl.json`，再渲染为 `compact.svg/png` 用于显示核查；预览规格从不写入训练答案。

## 支持范围

| 类型键 | 图表 |
|---|---|
| `barh_1` / `barh_n` | 单系列 / 分组横向柱状图 |
| `barv_1` / `barv_n` | 单系列 / 分组纵向柱状图 |
| `barv_stack` | 绝对值或百分比堆叠纵向柱状图 |
| `line_1` / `line_n` | 单系列 / 多系列折线图 |
| `scatter_1` / `scatter_n` | 单系列 / 多系列散点图 |
| `barline_n` | 分组柱状图与折线共用一条类别轴的复合图 |

复合图 `barline_n` 在同一类别轴上叠加 1–4 组柱与 1–3 条折线，柱/线数据族独立采样，并由 `coupling` 声明两者的统计关系（独立、比例、残差、占比、共同趋势、偏移带）；折线包络锚定在柱的数值范围内，保证共享值轴可读。轴设计维度同样参与采样：双 y 轴（折线独立右轴）、值轴/类别轴换侧、刻度密度与数字格式、轴标题锚点等；双轴 GT 用 `resolve.scale.y = "independent"` 加嵌套柱组表达，不写数值域。GT 数据行用 `series_role` 区分 `bar` 与 `line`，柱行带分组偏移与误差上下限，折线行只保留连接顺序。柱顶/柱内与折线点旁的数值标注按样本采样（约 44% 的图不标注），字号按每个值实际占用的槽宽自适应，过密的图自动不标；标注只存在于完整规格与训练图像，语义 GT 保持不变。详见 [docs/composite-barline-20261112.md](docs/composite-barline-20261112.md)。

保留了数据族、样式配置、字体、配色、误差棒、柱形纹理、标记/线型、非线性与反向轴、参考线、等比例散点布局、长文字布局和质量检查。折线支持类别、等间隔时间标签和数值 x。所有可选数据族列在 `generation/controls.py`，每个图族的公式位于 `generation/bars.py`、`lines.py` 或 `scatter.py`。

**训练数据的顺序按图片可见顺序写入 `data.values`。** 横向类别从上到下，纵向类别和 x 位置从左到右；组内按位置排列，堆叠按从上到下排列。同 x 的折线记录保持系列顺序。类别、系列和分组偏移通道均使用 `sort: null`。反向轴会改变表中可见顺序，但 GT 不保留绘图朝向 `scale.reverse`；必要的路径/堆叠关系由显式字段保存。

类别/时间标签折线强制显示全部标签，历史配置里稀疏的 tick 子集不会删掉类别。没有图例时，每个系列按首次可见顺序命名为 `Series 1`、`Series 2`、`Series 3`……；单系列同样使用 `Series 1`，GT 保持图例隐藏。可见图例保留原名称。

## 安装与运行

以下命令在开发机 Linux、Python 3.10、Node.js 22+ 环境执行。Python 和 npm 依赖分别记录在 `requirements.txt`、`package.json`。

```sh
cd /mnt/shared-storage-user/mineru2-shared/users/wangxinhan/proj/data_generation/vsr_v1
python3 -m pip install -r requirements.txt
npm install
python3 bootstrap.py
python3 pipeline.py generate --config configs/smoke.json --output runs/my_smoke
python3 pipeline.py validate --output runs/my_smoke
```

`bootstrap.py` 下载并校验 `assets/fonts/` 内的项目字体，写入字体家族、字重、字形与 SHA-256 的 `fonts.manifest.json`。已有相同字体可复用。字体元数据由 fontTools 读取，不依赖 Matplotlib。Schema 从已安装的 Vega-Lite 包读取。

服务器 Node 位于父目录 `.runtime/node` 时，管线会自动使用它；也可以传 `--node /path/to/node`。在新环境安装旧版 PyYAML 5.4.1 如需源码构建，应准备相应编译依赖；已部署环境可直接复用。

```sh
# 九类各 50 个候选；接受数量以 validation.json 为准
python3 pipeline.py generate --config configs/production.json --output runs/my_production

# 相同版本、相同配置的断点恢复
python3 pipeline.py generate --config configs/production.json --output runs/my_production --resume

# 用历史运行保存的采样数据重新构建当前规格与图像
python3 pipeline.py reproject --source runs/old_run --output runs/reprojected
```

新运行必须使用空目录。不要在同一输出目录并发运行。`--resume` 会检查生成器版本、GT 合约和配置指纹，防止混合不同语义的样本。历史版本需用 `reproject` 写入新目录；它读取已保存的 `config.json` 与可选展示快照，不重新采样。

只准备重新投影的 JSON、稍后渲染时，以下独立渲染命令使用开发机 runtime；普通安装可将 `../.runtime/node` 换为 `node`：

```sh
python3 pipeline.py reproject --source runs/old_run --output runs/reprojected --prepare-only
../.runtime/node render.mjs --input runs/reprojected/render-jobs.json --out runs/reprojected/render-report.json --target-side 1036
python3 pipeline.py validate --output runs/reprojected
```

## 控制采样

`controls.all` 为通用设置，同名 `controls.<类型>` 优先。例子中的隐藏图例与类别折线均可直接强制：

```json
{
  "seed": 20261110,
  "counts": {"line_n": 8, "barh_n": 8},
  "controls": {
    "all": {"show_legend": false, "profile": "publication_clean"},
    "line_n": {"point_count": 12, "series_count": 3, "x_mode": "categorical", "family": "oscillating"},
    "barh_n": {"category_count": 6, "series_count": 3, "show_error": true, "hatch": "/"}
  },
  "workers": 2,
  "target_side": 1036
}
```

常用控制包含 `category_count`、`point_count`、`series_count`、`family`、`profile`、`x_mode`、`stack_mode`、`show_error`、`hatch`、`show_legend`、`x_inverted/y_inverted`、`x_scale/y_scale`、`reference_lines`、`style` 与复合图的 `data_labels`。控制取值可以是列表，按样本序号轮转，使一次生成覆盖多种类别数或标注策略（见 `configs/composite_diversity.json`）。适用类型、取值和兼容别名见 [管线约定](docs/pipeline-contract.md)。无效的类型组合会明确报错。随机性使用每样本独立种子，同一生成器版本、种子、控制项和字体资源得到相同配置。

复合图 Q6–Q12 多样性配置及可复现命令见 [专项说明](docs/composite-diversity-q6-q12.md)：`configs/composite_diversity.json` 仅生成 60 张柱＋折线图，覆盖刻度显隐、X 标签类型、Y 数字/百分比、数值标注、点标记及三档数据量；`python -m workflow.composite_diversity --run runs/<批次>` 从实际 SVG 生成覆盖报告与筛选图库。

## 模块入口

| 文件/目录 | 职责 |
|---|---|
| `pipeline.py` | `generate` / `validate` / `reproject` CLI 与调度 |
| `generation/` | 原VSR静态纯参数函数、完整词表、样式规则、独立随机源与原生合约整合 |
| `adapter.py` | 原生数据与视觉参数转完整 Vega-Lite |
| `ordering.py`、`compact.py` | 可见顺序、最小 GT、观察投影 |
| `presentation.py`、`plot_layout.py`、`text_layout.py` | 字体/图例、绘图区、完整文字布局 |
| `workflow/` | 配置、文件读写、质量门与训练导出 |
| `render.mjs` | 官方编译、独立子进程渲染、几何证据与恢复 |

原 VSR 的 Matplotlib 绘图、原生 PNG/标注生成、resize/anchor 打包与重放链已移除。`native.py` 仅为旧 Python 调用提供兼容入口；旧配置中的 `native` / `postprocess_native` 不再生成额外图像，启用时会提示弃用。已有历史文件由 `reproject` 读取，不会被覆盖。当前1.2静态移植VSR的完整纯参数规则，按实际原版采样器核对数值、文本及关联；完整类别显示、隐藏系列命名、显式控制和Vega布局作为有记录的差异，不承诺跨渲染器像素一致。

## 验证与产物

```sh
# 普通安装
VSR_TEXT_TEST_MODULES="$PWD/node_modules" python3 -m unittest discover -s tests -v

# 开发机使用父目录 runtime 与 npm 包
PATH="$PWD/../.runtime:$PATH" VSR_TEXT_TEST_MODULES="$PWD/../node_modules" python3 -m unittest discover -s tests -v
```

测试覆盖十种图表、全部声明的数据族、强制控制、禁用 Matplotlib 导入时的确定性、实际 SVG/场景图中的类别和记录顺序、完整类别标签、隐藏图例命名、重复观察、特殊折线路径、堆叠与误差几何、历史配置重投影和恢复版本限制。缺少 Node、Vega 包或字体时，相关集成测试会明确 skip；不能将带 skip 的本地结果视作完整渲染验证。

新生成的成功样本保留完整/精简 JSON、SVG/PNG、`config.json`、`sampling.json`、`source.json`、`generation.json`、几何文件、`plot-layout.json`、`text-audit.json` 和 `render-record.json`。历史重投影仅继承源目录已有的 `sampling.json` 等历史证据，不会补造。运行级 `validation.json` 记录接受/拒绝情况；训练读取 `manifest.jsonl` / `train.jsonl` 中的接受样本，失败记录在 `rejected.jsonl`。拒收非零时命令返回非零。

自动质量门核对官方 Schema、语义投影、真实观察数量、重复行、坐标与缩放、文本完整性和严重裁切；它不能证明所有文字都无相互遮挡。完整约定与边界见 [docs/pipeline-contract.md](docs/pipeline-contract.md)。

## 2026-11-11 样式恢复与独立 SVG 字体

字体与样式恢复阶段版本为 `vega-lite-native/1.1`，当前采样版本为 `vega-lite-native/1.2`。旧版本保存的配置可用 `reproject` 投影到新目录；不同采样器版本不能混用 `generate --resume`。原 16 个基准字体文件维持采样池，新增字形文件仅服务于同家族粗体/斜体，不改变基准字体抽样权重。

`render.mjs` 导出完整与精简 SVG 时调用 `font_embedding.py`：遍历所有文字角色，校验实际字形、字体哈希和许可，写入 `@font-face` data URI 与许可元数据；保留可选择和搜索的 `<text>`。Resvg 从 SVG 自带字节加载字体，关闭系统字体加载。`--rasterizer sharp` 因尚未实现相同的字体隔离契约而明确拒绝。未获许可、缺字、缺少实际字形或不支持的字体声明会明确报错。

DejaVu/Noto 采用字形子集；URW 保持原字节并附完整上游源码归档和 AGPL 声明，因此使用 URW 的 SVG 明显更大。SVG 中的版权元数据属于字体分发所需信息；不需要网络或本机字体路径来显示。字体角色的请求、真实匹配与剩余差异见 `usermeta.presentation.font_roles` 以及 SVG `vsr-font-licenses` 元数据。

实施前对照：`docs/style-diversity-baseline-20261111.md`、`docs/svg-font-baseline-20261111.md`。实际统计、渲染图库与隔离字体证据汇总见 `docs/style-font-delivery-20261111.md`。

在开发机运行包含实际字体渲染的回归检查：

```sh
PATH="$PWD/../.runtime:$PATH" VSR_TEXT_TEST_MODULES="$PWD/../node_modules" VSR_FONT_INTEGRATION=1 python3 -m unittest discover -s tests -v
```

## VSR 数据与文本分布恢复（2026-11-11）

当前生成器版本为 `vega-lite-native/1.2`。默认生产使用 `generation/vsr_samplers/` 的九类原版纯参数函数和 `generation/vsr_text.py`：原 family 权重、数量分段、图类尺度分布、族内全部公式与分支、排序、多线共享基曲线、多散点局部族混合、随机舍入、标题模板、轴标题缺省、系列名及完整词表均保留。数据和标题的默认逻辑不再使用1.0/1.1的均匀族采样和12指标固定标题模板。旧版本的验证记录保留为历史证据。

每个样本使用独立 Python Random 和 NumPy RandomState；生产无需Matplotlib，不运行旧脚本或读取history。可显式指定counts、family、profile等controls。显式 `stack_mode=percent` 仍保证段值总和100；默认自然percent样本保留原版随机舍入后的值。全部类别标签显示、隐藏图例系列按可见顺序编号、SVG内嵌字体和恢复/重投影继续保留。

同版本恢复使用 `generate --resume`；1.1及更早的保存配置使用 `reproject` 到新目录，避免混采。修改前清单见 `docs/vsr-alignment-baseline-20261111.md`，数值和文本移植说明见 `docs/vsr-numeric-restoration-20261111.md`、`docs/vsr-text-restoration-20261111.md`，实际对照与交付证据见 `docs/vsr-alignment-delivery-20261111.md`。


## Compact-v4：语义 GT 与预览分离

保留观察数值、可见类别/系列名称、语义标题与单位、分组/堆叠/误差区间、非线性尺度及必要的路径/堆叠顺序。颜色通道的字段分组关系不是装饰，不能删除；只删除具体颜色范围。重复标签保留原文字，使用 \*_instance 字段表达独立身份，编码引用身份字段。隐藏的单匿名 Series 1 删除重复系列列及颜色通道。

移除字体、画布尺寸、轴/图例排版、刻度选择、标签表达式及旋转、背景、具体颜色、单点折线的可见性补丁。预览从语义 GT 的深拷贝派生默认显示设置；数据表及行序完全相同。严格的 v4 规范校验和幂等规范化拒绝混入 v3 显示字段；历史 v3 可显式解码用于迁移审计。

只清理历史 GT、完全不重画 full 的入口：

```bash
python3 pipeline.py reproject --source runs/old_run --output runs/new_compact_v4 --compact-only
```

这一路径复制保存的 full/config/source/PNG/SVG/geometry 等证据，逐文件验证 SHA-256，重新生成 compact、预览规格及训练 JSONL；不调用采样器或渲染器。旧 compact 图像不以当前名称复制，以免误认为新 GT 的渲染结果。运行报告明确标记预览未渲染，并只验收复用的 full 图像；普通 generate/reproject 仍实际渲染 full 与 compact-preview。当前 GT 合约是 compact-v5，与采样器版本独立；旧运行不能直接 generate --resume 混入新 GT。

验收与剩余边界见 docs/compact-v4-delivery-20261111.md 和 docs/compact-v4-independent-audit-20261111.md。

Vega-Lite output uses object marks (`{"type":"bar"}`). Unit views follow `title → data → mark → encoding → other keys`; layered views follow `title → data → encoding → layer → other keys`, including nested layers. Absent keys are skipped. Assistant JSON in `train.jsonl` preserves this order. Historical string marks are accepted and normalized; observation values are preserved and hash serialization remains independent.

Shared semantic channels live in the layered target's top-level `encoding`; layer encodings contain overrides such as error interval endpoints. Output syntax follows the [unified GT template](https://aicarrier.feishu.cn/docx/S5yKdnAPoobj5Zxdi2Ych9sLnSG).
