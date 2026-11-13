# Ordinary stacked bars

Vertical stacks use x categories from left to right; within each category, data.values runs from the lowest visible segment to the highest. Horizontal stacks (barh_stack) use y categories from top to bottom; within each category, data.values runs from the leftmost segment to the rightmost. Axis reversal affects physical order, not source values.

value is the segment amount, not its cumulative endpoint. Explicit boundaries use start and end, with value = end - start. Otherwise stack_order and stack: zero preserve placement independently of the row sequence. Shared boundaries must agree exactly.

For N segments, click the first start, N-1 shared boundaries, and the final end: N+1 clicks. Series follow bottom-to-top or left-to-right order; after the last segment the next category starts with a fresh start click. Undo, reload, calibration changes and boundary edits preserve adjacent segments.

barh_stack is provided by sample_horizontal_stack, registered in KINDS and smoke/production configs. New production uses absolute stacks only. Historical vertical percent GT is retained as ordinary already-normalized values; this release adds no percentage annotation workflow.

Encoding priority: x → y → xOffset → yOffset → other positional channels → color → remaining channels.
