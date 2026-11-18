# VSR 数据及文本恢复：修改前清单

基线：官方归档 vsr-source.tar.gz，InternLM/VSR 1fd040346add205ffbada9748273cad3bc9159e5。已核查其 common、barv_1/barv_n、line_n、scatter_1/scatter_n 与重构前 8b2ca38 vendor 字节一致。当前起点 b92f317，工作区干净；备份 history/vsr-distribution-20261111/source-before.tar.gz。

必须恢复：各模板 family/数量/尺度分段权重；每族完整数值公式和分支、human_round/maybe_int、族相关排序；多线共享基曲线和扰动、多散点局部族混合与分配；原标题、轴标题缺省、词表与标签/系列名模式；原sample_config的调用关联和RNG顺序。禁止保留固定12指标标题、全族均匀抽样等简化作为默认生产。

实施方式：静态移植纯参数函数和必要常量，逐样本独立 Python Random 与 NumPy RandomState 绑定；不导入Matplotlib、history或vendor，不运行旧绘图脚本。已有纯RGB style_rules继续使用原样式规则。原大词表完整携带，不截词汇种类或去重权重。

保留约束：原生Vega-Lite/Vega/Resvg、字体嵌入、全部类别文字可见、GT可见顺序、隐藏图例Series编号、显式controls、恢复/历史重投影。不可为仿旧而重引入类别标签thinning。原始稀疏tick记录可保留供比对，最终类别guide全显示。

验证：独立实际原版采样oracle；九类同等配额自然频率/范围与条件关联；所有族和稀有文本分支定向覆盖；真实SVG/PNG及GT质量门；版本化避免旧run静默混采。剩余差异必须区分数据默认规则、显式控制扩展和渲染布局。
