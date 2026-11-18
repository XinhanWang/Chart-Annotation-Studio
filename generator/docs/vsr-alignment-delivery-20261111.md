# VSR 数据与文本分布恢复交付 — 2026-11-11

验证时间：2026-11-11T16:11:10.285896+08:00。项目：h.pjlab.org.cn:/mnt/shared-storage-user/mineru2-shared/users/wangxinhan/proj/data_generation/vsr_v1。起点b92f317，原工作区干净；原源码及测试备份保存在 `history/vsr-distribution-20261111/source-before.tar.gz`。已有运行产物保留，新运行另建目录。

## 恢复内容

生成器升级为 `vega-lite-native/1.2`。官方基线固定为 InternLM/VSR `1fd040346add205ffbada9748273cad3bc9159e5`。完整静态移植九个原脚本的141个sample_config可达纯参数函数及常量，源码/AST与原版逐函数核对。删除1.0/1.1中已废弃的简化 bars/lines/scatter/labels 模块，避免两套默认数据规则混用。

- 数据族：恢复原权重，包含归一化权重而非把所有族改为等概率。
- 数量和尺度：恢复各模板类别/点数区间及其概率、系列数权重、图类专属scale表和扰动，散点数量与family的条件关联。
- 数值公式：原族内完整分支、峰谷/异常/稀疏结构、随机舍入、族相关类别排序；多线共享基曲线与各系列扰动、多散点局部族混合/点数分配及变换。
- 文本：原主标题模板、模板权重、时间/编码/配对/短语组合、轴标题12%缺省及单位池、标签模式、系列名12种候选。恢复原466550行词表，字节SHA-256 `39a4ead879cc8283de87f2ec58e7b4b340d6caa724db1b52a91dccf2f273c5e7`，保持原顺序/重复项及max_length=12过滤。默认不再使用12指标固定标题、8模式均匀类别标签或全family均匀抽样。
- 随机性：每样本独立Python Random与NumPy RandomState，保留原样本内调用顺序；并行/交错采样实测可重现，不改全局随机状态。

原生Vega-Lite/Vega/Resvg、内嵌字体、可选择text、GT可见顺序、重复显示名身份、隐藏图例Series编号、全部类别文字可见均保留。正式生产启用禁止Matplotlib导入的检查，不运行旧绘图脚本、不读取history/vendor中的运行代码。

修改前清单：[vsr-alignment-baseline-20261111.md](vsr-alignment-baseline-20261111.md)。源码移植和逐函数证据：[数值恢复](vsr-numeric-restoration-20261111.md)、[文本恢复](vsr-text-restoration-20261111.md)。独立分布、原始错误与图像对照：[独立验证报告](vsr-distribution-validation-20261111.md)。

## 实际执行结果

|检查|实际结果|证据|
|---|---|---|
|冻结原版采样函数参考|1188份完整配置和最终RNG状态一致，141函数源码/AST对应|tests/fixtures/vsr_samplers/、tests/test_vsr_sampler_sources.py|
|原版文本参考|858输出/类型/RNG用例，6×10000次参考概率采样|tests/test_vsr_text.py、tests/vsr_text_fixtures.py|
|独立九类同seed对照|每类1000请求，共9000；原版成功的8996份raw参数全部精确一致|runs/vsr_distribution_audit_20261111/afterraw/oracle-summary.json|
|实际core输出|numeric_exact=8996、text_exact=8996，合约附加字段另行处理|runs/vsr_distribution_audit_20261111/after/oracle-summary.json|
|真实生产|九类各50，共450/450接受，0拒收|runs/vsr_aligned_v8_production/validation.json|
|字体和GT审计|900份SVG含内嵌字体；训练JSONL逐份等于compact；168张隐藏图例命名核对|同目录integration-audit.json|
|历史重投影|27/27接受，27份配置字节与GT保持一致|runs/vsr_aligned_v8_reproject/|
|缓存恢复|重投影27个全部复用，无重采样|diagnostics/vsr-alignment-reproject-resume-20261111.log|
|完整回归|130项全部通过、0跳过，含真实编译/PNG字体渲染|diagnostics/vsr-alignment-regression-final-20261111.log|

原版4个异常请求没有当作成对通过；原始错误与新实现额外结果由独立报告记录。不能把9000次请求写成9000份原版成功样本。精确对照涵盖数值和文字参数及其关联，不仅是family名称或边际频率。

## 必须保留的差异和控制扩展

1. 以上精确性是固定资源和参考协议下的参数层结论；原版Matplotlib与原生Vega布局/字体度量/像素不会完全相同。全部类别标签显示替代原版thinning，长标签可增加画布、换行或改变绘图区占比。
2. core添加generator_version、kind、n_series等调度字段和显式native axes；隐藏图例系列按当前可见顺序规范命名。新增字段/名字变化不重写观察数值。原空轴标题保持缺省，不填造变量名。
3. 原版自然percent堆叠保留原始随机舍入后段值，不强制改数据使总和精确100；显式 `stack_mode=percent` 是现有native控制扩展，仍保证总和100并同步bottoms。
4. 原版自然折线至少8点；显式point_count=1/2属于native扩展。piecewise原函数需至少3点，控制扩展以原3点曲线插值到请求长度；默认规则不经过该路径。单点强制保留可见标记。
5. 显式show_error/hatch/show_legend/style及scale/参考线控制继续直接生效；自然采样不走这些覆盖。历史1.1及更早的run不能与1.2混合generate/resume，使用reproject到新目录。
6. Noto Mono缺真实粗斜体、图例shadow未实现、纹理/物理尺寸和自动布局等前次已知渲染差异仍有明确记录。SVG字体许可与URW源码metadata的体积处理维持前次验证方案。本轮没有把全部图像重新做隔离浏览器逐字体验收；字体组件未修改，已执行真实渲染回归及全900份生产SVG嵌入检查。
7. 生产质量门不等于所有随机组合的人工可读性证明。图库的原版、新版、修改前与定向配额、任何review/拒收须按独立报告实际数值理解，不将未通过样本计为通过。

## 使用与交付

```sh
python3 pipeline.py generate --config configs/production.json --output runs/my_vsr_aligned_run
# 同版本、相同配置恢复：追加 --resume
python3 pipeline.py reproject --source runs/old_run --output runs/reprojected_new
PATH="$PWD/../.runtime:$PATH" VSR_TEXT_TEST_MODULES="$PWD/../node_modules" VSR_FONT_INTEGRATION=1 python3 -m unittest discover -s tests -v
```

可视化对照：`deliveries/vsr_distribution_audit_20261111/`；新生产图库和独立SVG示例：`deliveries/vsr_alignment_20261111/`。全量旧/新/修改前参数统计与oracle在 `runs/vsr_distribution_audit_20261111/`。生产和历史运行均保留原目录。
