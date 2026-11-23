# Ordinary stacked bars

Vertical stacks use x categories from left to right; within each category, data.values runs from the lowest visible segment to the highest. Horizontal stacks (barh_stack) use y categories from top to bottom; within each category, data.values runs from the leftmost segment to the rightmost. Axis reversal affects physical order, not source values.

value is the segment amount, not its cumulative endpoint. Measurement records and project backups may keep start/end, with value = end - start. For ordinary zero-based stacks, the compact GT panel, single-file export and ZIP export all use category, value, stack_order, series (plus identity fields only when needed), stack: zero and order bound to stack_order. Measurement endpoints are not copied into that GT. Historical endpoint GT is converted to this canonical form when its boundaries match cumulative segment amounts. Only an explicitly imported non-zero origin or non-cumulative interval GT that requires endpoints retains the explicit start/end form allowed by the specification; it omits stack_order and binds end/start to the value axis/value-axis-2. Shared boundaries must agree exactly.

For N segments, click the first start, N-1 shared boundaries, and the final end: N+1 clicks. Series follow bottom-to-top or left-to-right order; after the last segment the next category starts with a fresh start click. Undo, reload, calibration changes and boundary edits preserve adjacent segments.

Historical zero-stack GT with an ordinary numeric title can still be imported as an ordinary stack. The application accepts recorded values and preserves their scale.

Encoding priority: x → y → xOffset → yOffset → other positional channels → color → remaining channels.

## Input order instructions

The type selector shows the current recording order. Instructions next to the series and category inputs stay visible when bulk input is collapsed. Vertical stacks: series bottom to top, categories left to right. Horizontal stacks: series left to right, categories top to bottom. Grouped vertical bars: series within each group left to right; grouped horizontal bars: top to bottom. Line/scatter series follow first visible appearance when scanning left to right, breaking ties top to bottom. Ordinal line categories run left to right. Missing readable legends use Series 1, Series 2 in that order.

A manually clicked start boundary, including small measurement offsets from zero, remains measurement evidence; annotation exports use segment lengths and canonical cumulative stacking. The explicit endpoint preservation mode is only enabled when importing a GT whose interval placement requires it.

## 百分比堆叠

原图有明确百分比含义时，在「柱状图」下选择「纵向百分比堆叠」或「横向百分比堆叠」。百分比含义不明确的图请选择普通堆叠，按原图数值轴测量。连续取点固定逐类别推进。纵向在类别内从下到上、横向从左到右填写系列。

- 原图有直接标注的百分数时，在数据表直接填写，例如 70% 填 70。手填值按输入精度保存，重新取点或校准时优先。清空手填值可恢复自动计算。
- 先按原图数值校准两个刻度，再标注各段的起止点。初始数值取各段的端点差值。原图已有百分比轴时，以百分数填写刻度值。

选中目标后可用「取段起点」或「取段终点」指定端点。每个类别的第一段默认先取起点，后续段默认沿用上一可见段的终点，直接取本段终点。缺少系列时可点击「跳过缺失系列」。端点保留两位小数，自动段占比按原始端点的差值计算后舍入到两位小数。

「数据记录」的「端点差值」显示每段起止值的绝对差。可在「按类别自动计算比值」逐项勾选或取消，也可「全选」或「全不选」。新类别默认关闭。

「类别高度」位于数值轴校准下方。用逐项勾选、全选或全不选指定要使用整柱高度的类别。高度可用与端点差值相同的单位手填，或点击「原图取点」，依次选取整柱起点和终点。开启「高度一致」后，按类别顺序使用首个勾选项的高度，其余勾选项自动沿用。关闭后可继续使用各自此前记录的高度。

开启自动比值后，每段占比等于舍入前的端点差值除以整柱高度，再乘 100。类别高度留空或取消勾选时，使用已记录段的差值合计作分母。整柱高度已知时，只要单段的端点差值有效，就能计算该段的占比。自动结果保留两位小数，手填占比优先。关闭自动比值会恢复直接差值。含历史系列高度的旧项目在使用原有分母时保留其计算方式，填写整柱高度后按段端点差值计算。

精简 GT 使用 `bar`、`stack: "zero"`、`stack_order`、百分数 `value` 以及现有类别和系列字段。数值轴标题只填写原图的标题，无标题则留空。各类别合计按实际记录保留，偏离 100% 时仅提示核对。类别高度、共享设置、比值开关、端点差值及测量证据随工程保存。导入已知具有百分比含义的 GT 时，可先选择对应方向的百分比子类。未指定子类时，导入仍识别历史示例的 `Share (%)` 标题。
