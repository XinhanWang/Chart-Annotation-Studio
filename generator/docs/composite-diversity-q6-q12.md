# 复合图 Q6–Q12 多样性优化

本次只处理 `barline_n`（同图柱状＋折线）。在工作区原有复合图实现上增补显式控制，九类基础图默认采样仍由冻结回归检查。

## 代码路径

`pipeline.py` 读取配置，经 `workflow.config.resolve_controls` 按样本序号轮转列表；`generation.vsr_runtime` 将官方柱/折线采样闭包绑定到同一独立随机流；`generation/composites/barline_n.py` 组合数值、coupling 与呈现；`generation/core.py` 应用显式控制；`adapter.py` 构建角色几何与 compact GT；`presentation.py` 设置最终轴；`render.mjs` 实际渲染，`workflow.validation` 核验后导出训练对。

新增 `generation/composites/diversity.py` 处理 X 标签及百分比缩放；`workflow/composite_diversity.py` 审计实际 SVG 并生成可筛选图库。

## 新增控制

| 控制 | 取值 |
|---|---|
| `x_axis_mode` / `y_axis_mode` | `visible`、`no_ticks`（只隐藏短刻度）、`no_labels`（只隐藏刻度文字）、`hidden`（刻度/文字/标题/网格全隐藏） |
| `x_tick_label_type` | `numbers`、`dates`、`text`、`percent` |
| `y_tick_label_type` | `numbers`、`percent` |
| `show_markers` | true / false，作用于全部折线 |

所有新增控制仅对复合图有效；省略时保留原采样。双轴的 Y 显隐和格式同时作用于左右两侧。百分比将 matrix、yerr、域同步缩放成比例，再以 `.0%` 显示；数据标注也使用百分比。X 数字、年月、百分比为等间距有序类别标签，GT 仍是类别轴，不代表连续数值/时间轴。显示控制不进入语义 GT；改变标签或实际数值则如实进入 GT。

Q9 日期/文本类别轴未实现；当前纵柱以零为基线，Y 是数值量。Q6/Q7 审计口径为是否出现短刻度；无文字但保留短刻度时为 A。Q12 统计柱子＋折线顶点，marker 不重复计数，30 归 B，31 起归 C。折线无 marker 时仍按其顶点计数，此口径在图库说明中公开。

## 配置与执行

`configs/composite_diversity.json`：60 张，1–4 组柱、1–3 条折线；数据量分三档各20张。不同长度轮转降低同一维度被绑定到另一维度的风险，但这不是全因子或统计独立的设计。默认样式、字体、误差与纹理仍随机采样。若扩大数量，可将 `counts.barline_n` 改为 240 或更多。

```sh
cd /home/liuxingchen/Vega-Lite-DG
RAYON_NUM_THREADS=1 python pipeline.py generate --config configs/composite_diversity.json --output runs/my_composite_batch
python -m workflow.composite_diversity --run runs/my_composite_batch
```

本机使用项目父目录 `.runtime/node`（Node 22）。系统 Node 16 不支持当前 Vega-Lite。Resvg 线程探针在默认配置下曾卡住，因此本批用 `RAYON_NUM_THREADS=1`。字体嵌入的 Node 同步管道也出现超时：改为私有临时文件描述符传输并在 finally 清理，保留字体检查、许可资料与输出内容。

## 实际结果

最终运行：`runs/composite_q6_q12_v2_20261113`，60/60 接受，0 拒绝；54 个柱族＋线族组合、9 个样式 profile、24 张双轴。每张包含 PNG/SVG、完整规格、compact GT、采样与检查证据；训练对位于 `train.jsonl`。

| 问题 | 实际 SVG 覆盖 |
|---|---|
| Q6 | A: 45 / B: 15 |
| Q7 | A: 43 / B: 17 |
| Q8 | A: 6 / B: 6 / C: 12 / D: 6 / E: 30 |
| Q9 | A: 19 / D: 15 / E: 26 |
| Q10 | A: 24 / B: 36 |
| Q11 | A: 26 / B: 34 |
| Q12 | A: 20 / B: 20 / C: 20 |

覆盖来源：`diversity-report.json`，含每张答案、实际轴文字、短刻度数、marker 数、标注数及数据量。图库：`gallery.html`，可按 Q6–Q12 多条件筛选，点击图片或 JSON 查看原始产物。实际抽查前8张包括分组多折线、负值、双轴、隐藏标签、隐藏整轴及百分比标注。

全量回归：196 项，194 通过、2 跳过；跳过项为需显式开启的字体/历史迁移集成测试。本批另已实际执行60张 full 与 compact-preview 的官方渲染及质量门。`git diff --check` 通过。自动检查与局部图像抽查不保证所有文字互不遮挡。

早期中断运行 `runs/composite_q6_q12_20261113` 仅供故障证据，未作为本次交付结果。


## 零基线对齐修复（2026-11-13）

原样例 `barline_n-000005` 的折线点标注把全图 Y 轴下限从 0 扩到 -0.0558575，造成约 19 个绘图像素的柱底空隙。`plot_layout.py` 现按柱、折线、各自标注的实际锚点分别建立像素余量约束，求同时满足各约束的最小域；双轴左侧只计算柱、右侧只计算折线。示例基线偏移降至 0.659px，仅为柱边线的亚像素余量，柱底视觉上贴住底框。靠近零点的 marker/标注、负值及跨零误差仍保留所需空间，不把负数据截断到零。

已保存同一批数据的修复版：`runs/composite_q6_q12_baseline_fixed_20261113`。60 张重新渲染，60 接受、0 拒绝；17 张的显示域得到调整，全部采样配置与 compact GT 保持完全一致。修复版 `gallery.html` 可筛选查看，样例 000005 对应 `samples/barline_n-000005/chart.1036.png`。

新增三项回归覆盖内部折线标注时基线贴框、零点附近 marker/标注的空间、双轴折线不同数量级/符号不影响柱轴。全量 199 项测试，197 通过、2 跳过。
