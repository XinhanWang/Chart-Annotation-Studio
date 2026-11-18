# Compact-v4 语义 GT 清理交付 — 2026-11-11

## 结论与范围

本轮接续“full 用于绘图，compact 用作训练 GT”的要求。代码修改于开发机本项目工作区，保留已有未提交修改；本轮不改采样分布或字体池、不重画历史 full。代码尚未提交/推送。

已完成严格 compact-v4 投影、独立预览模块、生产/验证/恢复链路及无渲染迁移入口。GT 合约 compact-v4；采样版本仍 vega-lite-native/1.2，投影版本 3.0.0。这三个标识承担不同职责。

## 保留与删除

保留 data.values 中的原数值与可见文字、标题与轴变量/单位、图表类型、分组偏移、系列字段关系、误差 lower/upper、堆叠零基线或显式 start/end、必要 path_order/stack_order、离散 sort:null，以及 log/pow/sqrt/symlog 的适用参数。重复类别或系列名称采用文字 + *_instance 身份字段，不再依赖 axis/legend.labelExpr。

删除字体、画布尺寸/背景、具体颜色、轴/图例布局与刻度选择、标签格式与旋转、绘图朝向 scale.reverse、单点折线 point=True 显示补丁。163 套隐藏单匿名系列删除 Series 1 列和冗余 color 通道；多个隐藏系列仍保留稳定身份，具名可见单系列仍保留名字。color.field 与 xOffset/yOffset 是分组关系，不作为装饰删除。

compact_display.render_spec() 从 GT 深拷贝生成 compact.preview.vl.json；观察表和顺序严格相同。标签完整显示、重复身份到文字映射、抑制默认标题和单点可见性仅在预览层。训练 JSONL 只读取 compact.vl.json。原尺寸检查发现默认 preview 图例会截断长名称；仅在显示层增加 legend.labelLimit=0，并通过实际 SVG 全名称断言，GT 不含该字段。

## 实际执行结果

| 检查 | 结果 |
|---|---|
| 旧 v3 → 新 v4，九类各 50 | 450/450 接受，0 拒绝 |
| 独立 v3/v4 解码、数据/身份/行序、变量/单位/结构关系 | 450/450 通过 |
| 旧 full/config/source/chart.png/chart.1036.png/chart.svg/sampling 逐份字节复用 | 各 450/450 SHA-256 相等 |
| 原目录冻结文件不变 | 9,099/9,099 哈希相等 |
| 训练答案等于新版 compact，输入图是原 full PNG | 450/450 |
| 新生成（九类各 3），full 与 preview 实际渲染 | 27/27 接受，0 拒绝 |
| 新生成字体 data URI + 搜索文本、答案/GT、preview data 相等 | 27 套、54 个 SVG |
| 回归 | 157 项全部通过 |
| 独立审计故障注入 | 8 种语义修改均被检测 |

compact 实际文件 1,518,315 → 1,292,608 bytes，减少 14.87%；规范 JSON 849,485 → 720,540 bytes，减少 15.18%。这是同 450 套、同观察表的比较，不由重采样造成。字段删减逐项证据在 field-removals.json；父子字段字节重叠，不能相加为总节省。

真实覆盖：{
  "named_single": 37,
  "duplicates": 37,
  "error": 24,
  "anonymous_single": 163,
  "stack": 50,
  "path": 1
}。450 套没有非线性轴或 reverse；其能力由定向测试覆盖，不能把批量结果说成这些特性已有自然样本验收。定向测试包括全部四种非线性尺度、重复标签、重复观察、乱序路径、任意堆叠基线和非对称误差、常规 preview 实际 Vega 编译与 SVG。

## 无重画迁移与复现

Linux 开发机项目根目录：

```bash
python3 pipeline.py reproject --source runs/old_run --output runs/new_compact_v4 --compact-only
python3 pipeline.py validate --output runs/new_compact_v4
PATH="$PWD/../.runtime:$PATH" VSR_TEXT_TEST_MODULES="$PWD/../node_modules" VSR_FONT_INTEGRATION=1 python3 -m unittest discover -s tests -v
```

compact-only 读取保存 full，不调用采样器或渲染器，复制并验证 full 证据，写新 GT、preview 规格及训练答案。迁移的 preview 未渲染，报告显式标记 false；不复制旧 compact PNG/SVG 为当前输出。generate --resume 只能用于相同合约/采样版本的生成运行，不能恢复 projection/migration 运行。实际迁移目录 runs/compact_v4_production；新生成目录 runs/compact_v4_fresh_20261111。

## 验证过程与边界

初次回归 148 项中有 4 个失败、10 个错误：旧测试假定 compact error layer 有 name；旧端点通道方向期望未更新；两项原几何测试把 visibility-fitted full 当作未经调整的原几何。本轮分别检查语义端点、改用无装饰 name 判断、明确原始几何与拟合后布局，并保留数据不可变断言。最终日志不是初次失败日志。

初次无渲染迁移的验收仍要求 compact PNG，导致 450 套拒绝；已修复 full-only 验证的图片列表，现有迁移目录重新验收 450/450。新增真实 render→migration→重复 validate 回归，确认无旧 compact 图也能通过且不调用重采样/重画。失败日志保留在 history/compact-v4-resume-20261111/。

迁移初始 run.command 继承旧生成命令，已单独纠正为实际迁移命令并保留 source_command；provenance-correction.json 记录前后元数据，不改变样本文件。独立审计 result.json 保存原始验收快照，当前运行元数据另存 current-migration-run.json。

本轮没有消除原先记录的 Vega 与 Matplotlib 布局/字体测量/纹理近似，也不声称 production_no_clip_v3 的像素等价。字体嵌入实现未改；历史 SVG 字节一致。新 SVG 字体检查是结构证据，不替代此前字体隔离浏览器审计。未逐张人工检查全部 450 张；新图联系表与例图实际查看记录随交付。

## 交付内容

comparison.html 为离线自含图库（历史 full + v3/v4 GT，新生成 full + compact-preview）。examples/ 提供完整的前后 GT 和 PNG；fresh-contact.png 为九类新图联系表。changes.patch 与 code-changes.tar.gz 包含工作区修改；数值/样式/font 既有实现与产物保留。
