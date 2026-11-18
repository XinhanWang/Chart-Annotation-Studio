# 第三方来源

VSR 上游：https://github.com/InternLM/VSR ，固定提交 `1fd040346add205ffbada9748273cad3bc9159e5`。许可证 Apache License 2.0，完整保留于 [vendor/VSR/LICENSE](vendor/VSR/LICENSE)。

`generation/vsr_samplers/*.py` 静态移植九个原脚本的纯参数函数及其必要常量，保留原数量、数据族、尺度、数值公式、条件分支、排序与系列关联。`generation/vsr_text.py` 移植原 common 的文本与纯数学函数；`generation/words.txt` 是原词表，保留顺序、重复项及原 max_length 过滤规则。`generation/style_rules.py` 是原样式规则的纯RGB实现。各文件记录来源；这些移植不包含原Matplotlib绘图、像素标注或后处理链。

`generation/vsr_runtime.py` 将静态函数绑定至每样本独立的 Python Random 和 NumPy RandomState，`generation/core.py` 在原参数上添加显式controls、原生坐标、完整类别标签及隐藏系列命名等当前合约。生产过程不读取 history/vendor 的旧代码，不导入Matplotlib。same-seed参数对照、允许差异与实际接受范围见 `docs/vsr-alignment-delivery-20261111.md`；参数对齐不意味着跨渲染器像素相同。

Vega-Lite、Vega、Resvg 的固定 npm 版本见 package.json。字体由 bootstrap.py 准备；SVG携带实际字形、版权和许可，字体分发规则见 [docs/font-licenses/README.md](docs/font-licenses/README.md)。字体元数据和子集使用fontTools，不需要Matplotlib。

设计参考：[ChartCoder](https://github.com/thunlp/ChartCoder/tree/main/data_generator)、[Vega-Lite 官方示例](https://vega.github.io/vega-lite/examples/)。没有引入这些项目的数据集或安装目录。
