# compact-v4 独立审计（2026-11-11）

状态：main ready 后执行完整验收，结果 **PASS**。

旧目录 `/mnt/shared-storage-user/mineru2-shared/users/wangxinhan/proj/data_generation/vsr_v1/runs/vsr_aligned_v8_production`，450 套；9099 文件 SHA-256/bytes 已于 2026-11-11T09:16:08.874302+00:00 冻结在 `runs/compact_v4_audit_20261111/before.json`。

旧 compact 实际文件 1,518,315 bytes；规范序列化 849,485 bytes。

真实覆盖：`{"named_single": 37, "duplicates": 37, "error": 24, "anonymous_single": 163, "stack": 50, "path": 1}`。

`before-fields.json` 逐字段记录样本频率、出现次数、类型及 UTF-8 字节；父子字段字节重叠，不能相加为总节省。

已独立核对旧 450 套：旧 v3 解码与原 full 观测值及保存的 scenegraph 像素读取顺序逐行完全一致（`old-pixel-reference-check.json`），不调用 production 投影函数。

验收范围：450 行序保持、v3/v4 独立 Canonical 解码、重复标签身份、mark/type/单位/层和误差/stack/path 关系、完整固定版本 schema、全部训练 JSONL 与样本 GT 一致、旧文件不变和新 full/config/PNG 逐份复用。只允许删除隐藏单匿名 Series 1 与无意义绘图朝向及显示配置。

边界：本批旧 GT 没有非线性 scale 或 reverse，不能用这 450 套证明这些 edge；定向 fixture 由 worker 负责，本审计会分别标注真实覆盖和未覆盖项。未重采样、未重画 full、未导入 production 投影函数。

## 完整验收结果

实际 compact 文件 1,518,315 → 1,292,608 bytes（new/old=0.851344）；规范 JSON 849,485 → 720,540 bytes（new/old=0.848208）。

逐项计数：

- `anonymous_single_redundancy_removed:pass`：163
- `baseline_file_unchanged:pass`：9099
- `encoding_field_exists:pass`：1338
- `exact_sample_ids:pass`：1
- `layer_field_exists:pass`：48
- `no_display_or_unapproved_transform_fields:pass`：450
- `old_gt_matches_full_source_and_pixel_order:pass`：450
- `ordered_canonical_rows_and_identity:pass`：450
- `pinned_schema:pass`：450
- `quantitative_type:pass`：623
- `reused_chart.1036.png:pass`：450
- `reused_chart.png:pass`：450
- `reused_chart.svg:pass`：450
- `reused_config.json:pass`：450
- `reused_full.vl.json:pass`：450
- `reused_sampling.json:pass`：450
- `reused_source.json:pass`：450
- `semantic_encoding_mark_units_relations:pass`：450
- `train_equals_v4:pass`：450
- `train_exact_ids_once:pass`：1
- `train_image_is_old_full_png:pass`：450
- `training_jsonl_present:pass`：1

真实删减字段（样本数/出现次数/原 value bytes；父子不可相加）：

| 字段 | 样本数 | 原次数 | 新次数 | 原 value bytes |
|---|---:|---:|---:|---:|
| `$.data.values[].series` | 450 | 11350 | 8409 | 124156 |
| `$.encoding.color` | 450 | 450 | 287 | 30270 |
| `$.encoding.color.field` | 450 | 450 | 287 | 3600 |
| `$.encoding.color.legend` | 450 | 450 | 0 | 4620 |
| `$.encoding.color.legend.title` | 282 | 282 | 0 | 1128 |
| `$.encoding.color.sort` | 450 | 450 | 287 | 1800 |
| `$.encoding.color.type` | 450 | 450 | 287 | 4050 |
| `$.encoding.x.axis` | 228 | 228 | 0 | 55109 |
| `$.encoding.x.axis.labelBound` | 228 | 228 | 0 | 1140 |
| `$.encoding.x.axis.labelExpr` | 26 | 26 | 0 | 4779 |
| `$.encoding.x.axis.labelLimit` | 228 | 228 | 0 | 228 |
| `$.encoding.x.axis.labelOverlap` | 228 | 228 | 0 | 1140 |
| `$.encoding.x.axis.values` | 228 | 228 | 0 | 34944 |
| `$.encoding.x.title` | 450 | 450 | 393 | 5504 |
| `$.encoding.y.axis` | 100 | 100 | 0 | 23958 |
| `$.encoding.y.axis.labelBound` | 100 | 100 | 0 | 500 |
| `$.encoding.y.axis.labelExpr` | 11 | 11 | 0 | 2742 |
| `$.encoding.y.axis.labelLimit` | 100 | 100 | 0 | 100 |
| `$.encoding.y.axis.labelOverlap` | 100 | 100 | 0 | 500 |
| `$.encoding.y.axis.values` | 100 | 100 | 0 | 14473 |
| `$.encoding.y.title` | 450 | 450 | 397 | 5488 |

发现项：

无上述检查的失败项。

证据：`result.json`、`sample-details.json`、`field-removals.json`、`before.json` 位于本审计 runs 目录。哈希相等证明已交付字节复用；不单独证明整个执行历史从未启动 renderer。此脚本不渲染、不改生产文件。
