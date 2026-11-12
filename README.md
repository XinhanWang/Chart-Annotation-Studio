# Chart Annotation Studio

Scientific chart annotation with pixel calibration, interactive measurements and compact Vega-Lite GT export.


## 误差棒 GT

精简 Vega-Lite JSON 统一输出 `mark: {"type": "errorbar"}` 原生复合标记，不再把误差棒导出为 `rule`。`lower`/`upper` 为绝对数值上下界；纵向柱图使用 `y`/`y2`，横向柱图使用 `x`/`x2`。分组误差棒继承系列及类别 offset，堆叠图的误差区间设为 `stack: null`。端帽外观不进入精简 GT。

可兼容导入历史 `bar + rule` 区间，但再次导出会统一转换为 `bar + errorbar`；数据数值、系列与顺序不变。

回归测试（Node.js 22+，不需要联网或安装依赖）：

```powershell
node tests/errorbar.cjs
```
