# VSR 数据与文本恢复独立验证（2026-11-11）

九类各 1000 次，共 9000 个固定 seed。当前 runtime raw 与真正 core 配置均在官方可返回参数的 **8996/8996** 对上全字典精确一致；数值及文本差异为 **0**。其余 **4** 次是原版 RGBA 越界，保留完整错误，不补抽、不吞错、不记为通过。

原版来自 `vsr-source.tar.gz` 的 `1fd040346add205ffbada9748273cad3bc9159e5`，before 从 Git `b92f317a344fa9c6b0906972bf3678a2b5979321` 导出，均为不可变快照。after 在 main 明确同意后运行；边界修复后再次用当前 runtime 重跑 raw 和 core 全部 9000 请求。

当前 runtime SHA-256：`9d3e97c003389ee23818bc66257e9f90ea61b37260071e0ecfaf7b6b6f74f3d6`。`final-runtime-oracle.json` 同时记录全部源文件哈希、短 piecewise 控制验证和 source/live_generation 未改变检查。四个旧简化模块已由 main 删除，历史 before 快照保留；最终文件清单不把它们算作当前默认实现。

| 类型 | 官方可比较 | raw 精确 | core 精确 | b92before 不同 | 观测词 token 种类 官方 / before |
|---|---:|---:|---:|---:|---:|
| barh_1 | 999 | 999 | 999 | 999 | 15205 / 928 |
| barh_n | 1000 | 1000 | 1000 | 1000 | 13278 / 689 |
| barv_1 | 1000 | 1000 | 1000 | 1000 | 15150 / 928 |
| barv_n | 999 | 999 | 999 | 999 | 12427 / 689 |
| barv_stack | 1000 | 1000 | 1000 | 1000 | 12765 / 748 |
| line_1 | 999 | 999 | 999 | 999 | 11596 / 6298 |
| line_n | 1000 | 1000 | 1000 | 1000 | 11550 / 5493 |
| scatter_1 | 1000 | 1000 | 1000 | 1000 | 2098 / 25 |
| scatter_n | 999 | 999 | 999 | 999 | 3440 / 33 |

raw 只规范字体路径 basename，不放宽任何数字或原始文本。core 另核验原字段保持，并逐项验证 n_series、show_legend、系列别名、show_error、轴域别名、category 轴域、style_family 的确定性推导；隐藏图例仅允许中性的 Series/Group 编号。新增 native axes 与版本字段逐行留档。未知字段、丢失原字段、任意数值微扰、可见系列名或文本变化均失败。

本 oracle 使用数值精确相等（无容差），逐项比较数组长度/元素、矩阵/共享曲线、误差、堆叠 bottoms、scatter 分组 counts/starts/local families，以及 labels、x_labels、tick_labels、标题、轴标题和系列名。允许 JSON 数字的 int/float 同值表示。它证明这组 seed 的参数复现，不证明所有可能 seed，也不声称跨渲染器像素相同。

自然统计包含 family/数量/系列数/x_mode/stack_mode/标题模板/空轴/legend/error/尺度分桶/实际数值分位数/稀疏度、family×数量×系列联合分布及相关系数和交叉次数。定向选出 **225** 对，覆盖 **106** 个 kind-family 组合、全部官方标题模板、稀疏/符号/数量/数值幅度/文本长度极值与多系列共享曲线；逐例保存实际数组、文本及共享 latent，而非只列字段名。

官方词表字节与恢复词表相同：`39a4ead879cc8283de87f2ec58e7b4b340d6caa724db1b52a91dccf2f273c5e7`；按官方长度规则加载 392136 个词。各类实际观测文本 token 数见表（包含日期、代码等合成 token，不能当作词表词条数）。

标题模式额外采用 `sample_title` 返回帧的真实 pattern 重放观察，避免把 paired/compact 内部的 label 类型误当标题模式；原始采样文件保留，正确模式以 `title-annotations.json` 为准，summary 已按该注释重算。

实图采用每类相同 6 个 seed，官方、before、after 各 54 张，合计 162 张；全部实际渲染并核验 sampler replay。HTML 并排链接真实 PNG；逐图保存 source 数值/文本/SVG 文本检查。after 隔离快照最初遗漏 font-licenses 运行依赖，补齐该审计快照后重渲染，原始失败日志仍保留，未修改生产代码。图像展示与参数精确为不同证据层；布局/完整轴标签/native axes 的有意扩展不要求与原生 Matplotlib 像素一致。

显式 controls 属扩展：当前 runtime 另验 line_1/line_n × point_count 1/2 × piecewise 共 4 案例，形状及有限值通过；这是原自然范围外的兼容性，不算原版精确 oracle。用户另行运行的 450 production、完整 suite、27 reproject 与字体链不计入本独立验证的执行结果。

证据根目录：`runs/vsr_distribution_audit_20261111/`。主证据为 `final-runtime-oracle.json{,l}`、各 label 的 `samples.jsonl / summary.json / metadata.json / oracle-summary.json`、`directed-results.json`、`paired-feature-evidence.json`、`official-errors.json`、`render-data-text-checks.json`、`comparison.html`、快照及哈希清单。脚本在 `diagnostics/vsr_distribution_audit_20261111*.py`；不编辑生产源码。

原版 RGBA 错误 seed：barh_1/20261535, barv_n/20261607, line_1/20261812, scatter_n/20261956.

具体恢复样例（均为 seed 20261111；数组为前几个实际值，完整值保存在逐例 JSON）：

| 类型 | 官方与 after 标题 | b92before 标题 | 官方与 after 数值片段 | b92before 数值片段 |
|---|---|---|---|---|
| barh_1 | Doggrel Farmhold | Production Comparison | `[58, 54.6, 49.0, 45, 40.4]` | `[0.0, 0.09895, 0.0, 0.0, 0.11784]` |
| barh_n | Pachometer vs Tenible | Capacity Comparison | `[8.0, 8.0, 8.3, 9.4, 10]` | `[0.0, 0.0, 580.03, 710.35, 0.0]` |
| barv_1 | Doggrel Farmhold | Production Comparison | `[58, 54.6, 49.0, 45, 40.4]` | `[0.0, 0.09895, 0.0, 0.0, 0.11784]` |
| barv_n | Lichis Lifeways Procyoninae | Capacity Comparison | `[12, 12, 12, 12, 12]` | `[0.0, 0.0, 580.03, 710.35, 0.0]` |
| barv_stack | Teas II | Capacity Comparison | `[0, 0, 65.8, 18, 92]` | `[5.5122, 57.329, 0.86015, 204.82, 8.2315]` |
| line_1 | Furil 3 | Production Trend | `[1.58, 1.7, 1.7, 2, 2.2]` | `[0.018659, 0.033968, 0.0020072, 0.018631, 0.038338]` |
| line_n | 2024-18 | Capacity Trend | `[3.09, 3.3, 3.9, 4.6, 5]` | `[1.6481, 1.6176, 1.6907, 1.7624, 1.7901]` |
| scatter_1 | Stan amebean haldis vs Flitching fuzzily | Production Relationship | `[-0.56, -0.32, -0.68, -0.74, -0.4]` | `[0.039255, 0.14953, 0.14921, 0.099092, -0.0062125]` |
| scatter_n | Psize Backdown Stoning Synectic |  | `[0.3, -0.08, 2.0, 2.0, -0.936]` | `[0.066538, 1.251, -2.9712, 1.4289, 3.2589]` |

四个 RGBA 异常发生在 common._adjust_lightness → matplotlib.colors.to_hex / to_rgba；完整 traceback 见 official-errors.json。原始错误均为 `ValueError: RGBA values should be within 0-1 range`。after 四例可返回参数，但官方没有完整配置，因此不把这些结果计为同种子精确 oracle。

静态移植核对：九个 sampler 模块内 141 个函数均找到原版定义，函数 AST 141/141 精确一致，证据见 static-sampler-ast.json。该检查与同种子运行证据互补。
