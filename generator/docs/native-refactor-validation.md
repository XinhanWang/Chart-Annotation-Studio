# 原生 Vega-Lite 重构验证记录

验证时间：2026-11-11T00:33:20.570742+08:00

目标：`h.pjlab.org.cn:/mnt/shared-storage-user/mineru2-shared/users/wangxinhan/proj/data_generation/vsr_v1`。
修改已落到开发机工作区；未提交或推送 Git。修改前基线：`8b2ca381c33f5e52506c442c1c5a8c9e49f45a94`。

## 对应四项要求

1. 新增 `generation/` 和 `workflow/`，分别负责数据与样式采样、任务调度与验证。`pipeline.py` 为 CLI 调度，`adapter.py` 生成完整 Vega-Lite，`render.mjs` 使用 Vega-Lite/Vega/Resvg 渲染。原 VSR Matplotlib 绘图和相关标注/重放链已移除，`native.py` 仅保留兼容入口。正式生成过程启用了禁止导入 Matplotlib 的检查。
2. `ordering.py` 将 GT `data.values` 按可见位置排列：横向从上到下，纵向/x 从左到右；组内按位置，堆叠段从上到下。离散编码 `sort: null`。全规格、GT 和训练 JSONL 的记录顺序一致；质量门与实际渲染坐标核对。必要的堆叠/特殊折线路径字段保留以维持几何。
3. 类别和等间隔时间标签折线强制保留全部标签；历史稀疏 tick 设置不再删标签，禁用自动避让隐藏和文本截断。边界集包含 24 类、5 系列折线以及单点折线。
4. 隐藏图例的系列按首次可见顺序命名 `Series 1`、`Series 2`、`Series 3` 等；单系列也使用 `Series 1`。209 张正式样本已逐一核对。

## 验证结果

- 96 项测试全部通过，0 失败、0 跳过；包含实际官方编译与 SVG/场景图验证。
- `git diff --check` 通过；同步状态中的源码 SHA-256 与开发机全部一致。
- 正式样本 450 张，每类 50 张，GT 内容均不重复；训练 JSONL 的 GT 与对应 `compact.vl.json` 逐一一致。
- 106 种可选图表类型/数据族组合均有测试；450 张随机样本实际覆盖 102 种组合、全部 10 种样式和 16 种字体。
- 正式样本含 35 张误差棒、137 张纹理柱形、59 张参考线图；折线 x 模式为 47 张类别、32 张时间标签、21 张数值。覆盖线性、symlog 和 log 轴。
- 断点恢复复用 448 张缓存渲染；另外两张在修复 log 轴不兼容的 zero 设置后重绘，GT 和观察值保持不变。

| 运行目录（`runs/` 下） | 请求 | 接受 | 拒收 |
|---|---:|---:|---:|
| `native_vl_v6_production` | 450 | 450 | 0 |
| `native_vl_v6_reproject_final` | 27 | 27 | 0 |
| `native_vl_v6_edges` | 9 | 9 | 0 |
| `native_vl_v6_single_point` | 1 | 1 | 0 |

## 使用与查看

```sh
cd /mnt/shared-storage-user/mineru2-shared/users/wangxinhan/proj/data_generation/vsr_v1
python3 pipeline.py generate --config configs/smoke.json --output runs/my_native_smoke
python3 pipeline.py generate --config configs/production.json --output runs/my_native_production
```

输出目录须新建；同一运行恢复时追加 `--resume`。历史配置使用 `python3 pipeline.py reproject --source runs/old_run --output runs/reprojected`，详情见 `README.md` 与 `docs/pipeline-contract.md`。

- 正式样例：`deliveries/native_vl_v6/production/gallery.html`，每类一张，内嵌图像、完整 JSON 和训练 GT。
- 边界样例：`deliveries/native_vl_v6/edges/gallery.html`。
- 机器可读验证：`diagnostics/native-v6-verification.json`，含源码哈希、覆盖情况和各运行的验证结果。
- 完整测试日志：`diagnostics/native-refactor-tests-final.log`。
- 原文件备份：`history/native-vl-refactor-20261110/`，保留各次修改前的受影响文件。

## 边界

保留了图族/样式控制、字体、配色、误差棒、纹理、线型/标记、反向与非线性轴、参考线、等比例散点、历史重投影、恢复与质量门。按要求移除的旧 Matplotlib PNG、专用标注导出和重放输出不再生成。新采样器不保证旧 VSR 同种子产生相同数据或像素；历史数据可从已保存配置重投影，并保留原生成器来源。

自动检查覆盖文本完整性、严重裁切、几何、可见顺序与观察数量；不能保证所有随机种子的文字或图例完全不互相遮挡。已人工查看九类 smoke 图及选定边界图，不能替代全量审美评估。
