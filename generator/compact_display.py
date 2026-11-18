"""Derive independently renderable previews from compact v4 semantic targets.

No file IO and no data mutation: callers may serialize the result as
compact.preview.vl.json. Display defaults never become training labels.
"""
from __future__ import annotations

from collections import Counter
import copy
import json

from compact import validate_target


def render_spec(compact: dict) -> dict:
    """Return a fresh Vega-Lite preview with identical observation data/order."""
    validate_target(compact)
    result = copy.deepcopy(compact)
    rows = result["data"]["values"]
    enc = result["encoding"]
    for channel, d in enc.items():
        if channel not in {"x2", "y2", "order", "xOffset", "yOffset"}:
            d.setdefault("title", None)
        f = d["field"]
        discrete = d.get("type") in {"nominal", "ordinal"}
        if channel in {"x", "y"} and discrete:
            d["axis"] = {"values": list(dict.fromkeys(r[f] for r in rows)),
                         "labelOverlap": False, "labelLimit": 0, "labelBound": False}
        if f.endswith("_instance") and channel in {"x", "y", "color"}:
            labels = {r[f]: r[f.removesuffix("_instance")] for r in rows}
            expr = json.dumps(labels, ensure_ascii=False, separators=(",", ":")) + "[datum.value]"
            d.setdefault("legend" if channel == "color" else "axis", {})["labelExpr"] = expr
        if channel == "color":
            d.setdefault("legend", {}).update(title=None, labelLimit=0)
    def strip_titles(node: dict) -> None:
        # A role layer may restate the value channel for a secondary axis; its
        # unit label is display text and is stripped exactly like the top level.
        for definition in (node.get("encoding") or {}).values():
            if isinstance(definition, dict) and "title" in definition:
                definition["title"] = None
        for child in node.get("layer", []):
            strip_titles(child)

    for layer in result.get("layer", []):
        strip_titles(layer)
    mark = result.get("mark")
    if mark == "line" or isinstance(mark, dict) and mark.get("type") == "line":
        series = enc.get("color", {}).get("field")
        counts = Counter(r[series] if series else None for r in rows)
        if 1 in counts.values():
            result["mark"] = {"type": "line"} if isinstance(mark, str) else mark
            result["mark"]["point"] = True
    return result
