# Ordinary stacked bars

Vertical stacks use x categories from left to right; within each category, data.values runs from the lowest visible segment to the highest. Horizontal stacks (barh_stack) use y categories from top to bottom; within each category, data.values runs from the leftmost segment to the rightmost. Axis reversal affects physical order, not source values.

value is the segment amount, not its cumulative endpoint. Measurement records and project backups may keep start/end, with value = end - start. For ordinary zero-based stacks, the compact GT panel, single-file export and ZIP export all use category, value, stack_order, series (plus identity fields only when needed), stack: zero and order bound to stack_order. Measurement endpoints are not copied into that GT. Historical endpoint GT is converted to this canonical form when its boundaries match cumulative segment amounts. Only an explicitly imported non-zero origin or non-cumulative interval GT that requires endpoints retains the explicit start/end form allowed by the specification; it omits stack_order and binds end/start to the value axis/value-axis-2. Shared boundaries must agree exactly.

For N segments, click the first start, N-1 shared boundaries, and the final end: N+1 clicks. Series follow bottom-to-top or left-to-right order; after the last segment the next category starts with a fresh start click. Undo, reload, calibration changes and boundary edits preserve adjacent segments.

barh_stack is provided by sample_horizontal_stack, registered in KINDS and smoke/production configs. New production uses absolute stacks only. Historical vertical percent GT is retained as ordinary already-normalized values; this release adds no percentage annotation workflow.

Encoding priority: x → y → xOffset → yOffset → other positional channels → color → remaining channels.

## Input order instructions

The type selector shows the current recording order. Instructions next to the series and category inputs stay visible when bulk input is collapsed. Vertical stacks: series bottom to top, categories left to right. Horizontal stacks: series left to right, categories top to bottom. Grouped vertical bars: series within each group left to right; grouped horizontal bars: top to bottom. Line/scatter series follow first visible appearance when scanning left to right, breaking ties top to bottom. Ordinal line categories run left to right. Missing readable legends use Series 1, Series 2 in that order.

A manually clicked start boundary, including small measurement offsets from zero, remains measurement evidence; annotation exports use segment lengths and canonical cumulative stacking. The explicit endpoint preservation mode is only enabled when importing a GT whose interval placement requires it.
