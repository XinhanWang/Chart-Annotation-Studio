"""Preserve complete display text in full Vega-Lite specs.

This module only changes presentation: data, transforms, scale definitions and
label identities stay intact. Vega's default axis/legend limits silently add an
ellipsis; zero disables that behavior. Wrapped labelExpr values use native Vega
text arrays. No JavaScript expression is evaluated by this module.
"""
from __future__ import annotations

import copy
import json
import math
import re
import textwrap
import xml.etree.ElementTree as ET
from typing import Any

_MAPPING = re.compile(r"^\((\{.*\})\)\[toString\(datum\.value\)\]$", re.DOTALL)


def _number(value: Any, default: float) -> float:
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) and value > 0 else default


def _lines(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return str(value).splitlines() or [""]


def _wrap(value: Any, pixels: float, font_size: float) -> Any:
    if value is None or isinstance(value, dict):
        return value
    # Match/exceed Vega's no-canvas estimate, with a wider allowance for CJK.
    # Long indivisible tokens remain complete; pad autosize grows their canvas.
    unit = font_size if any(ord(c) >= 0x2E80 for c in str(value)) else 0.8 * font_size
    columns = max(8, math.floor(pixels / max(1, unit)))
    lines: list[str] = []
    for line in _lines(value):
        lines.extend(textwrap.wrap(line, columns, break_long_words=False, break_on_hyphens=False,
                                   replace_whitespace=False, drop_whitespace=True) or [""])
    return lines if len(lines) > 1 else lines[0]


def _width(value: Any, font_size: float) -> float:
    return max((sum(1.0 if ord(c) >= 0x2E80 else 0.8 for c in line) * font_size
                for line in _lines(value)), default=0)


def _mapping(expression: Any) -> dict[str, Any] | None:
    if not isinstance(expression, str) or not (match := _MAPPING.fullmatch(expression)):
        return None
    try:
        value = json.loads(match[1])
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        return None


def _wrap_mapping(guide: dict, pixels: float, size: float) -> list[Any]:
    mapping = _mapping(guide.get("labelExpr"))
    if mapping is None:
        return []
    # Python str(21.0) is "21.0", while Vega/JS toString(21.0) is "21".
    # Preserve the original keys and add equivalent numeric tick aliases.
    for tick in guide.get("values", []):
        if isinstance(tick, (int, float)) and not isinstance(tick, bool) and math.isfinite(tick) and tick == int(tick):
            alias = str(int(tick))
            if alias not in mapping and str(tick) in mapping:
                mapping[alias] = mapping[str(tick)]
    wrapped = {key: _wrap(value, pixels, size) for key, value in mapping.items()}
    guide["labelExpr"] = "(" + json.dumps(wrapped, ensure_ascii=False, separators=(",", ":")) + ")[toString(datum.value)]"
    return list(wrapped.values())


def apply_text_layout(full: dict, *, min_padding: float = 16, max_label_width: float = 240) -> dict:
    """Return a full spec with complete title/axis/legend display text.

    Known adapter label mappings are wrapped at word boundaries; arbitrary
    expressions are retained verbatim and still get unlimited labels. Existing
    null/false axes and legends stay disabled. The function is deterministic,
    idempotent, dependency-free, and never changes an observation or scale.
    """
    if not isinstance(full, dict):
        raise TypeError("full must be a Vega-Lite object")
    if not (math.isfinite(min_padding) and min_padding >= 0 and math.isfinite(max_label_width) and max_label_width > 0):
        raise ValueError("Padding and maximum label width must be finite and nonnegative/positive")
    result = copy.deepcopy(full)
    config = result.setdefault("config", {})
    for guide in ("axis", "legend"):
        config.setdefault(guide, {}).update(labelLimit=0, titleLimit=0)
    config.setdefault("title", {}).update(limit=0)
    config["legend"].update(labelOverlap=False, symbolLimit=0)
    result["autosize"] = {"type": "pad", "contains": "content", "resize": True}
    padding = result.get("padding", 0)
    if isinstance(padding, dict):
        result["padding"] = {side: max(min_padding, float(padding.get(side, 0))) for side in ("left", "right", "top", "bottom")}
    elif isinstance(padding, (int, float)):
        result["padding"] = max(min_padding, padding)
    else:
        result["padding"] = min_padding

    def visit(node: dict, width: float, height: float) -> tuple[float, float]:
        width = _number(node.get("width"), width)
        height = _number(node.get("height"), height)
        needed_width, needed_height = width, height
        title = node.get("title")
        if title is not None:
            if isinstance(title, (str, list)):
                title = node["title"] = {"text": title}
            if isinstance(title, dict):
                size = _number(title.get("fontSize"), 13)
                title["limit"] = 0
                if "text" in title:
                    title["text"] = _wrap(title["text"], max(200, min(width, 800)), size)
                if "subtitle" in title:
                    title["subtitle"] = _wrap(title["subtitle"], max(200, min(width, 800)), _number(title.get("subtitleFontSize"), 12))
                title.setdefault("lineHeight", math.ceil(size * 1.3))
        encoding = node.get("encoding", {})
        for channel_name, channel in encoding.items():
            if not isinstance(channel, dict):
                continue
            if channel_name in {"x", "y"}:
                if channel.get("axis", {}) is None or channel.get("axis") is False:
                    continue
                axis = channel.setdefault("axis", {})
                axis.update(labelLimit=0, titleLimit=0)
                if channel.get("type") in {"nominal", "ordinal"}:
                    axis.update(labelOverlap=False, labelBound=False)
                size = _number(axis.get("labelFontSize"), _number(config["axis"].get("labelFontSize"), 10))
                mapping = _mapping(axis.get("labelExpr"))
                count = len(mapping) if mapping else 0
                wrap_width = min(max_label_width, max(100, width / max(1, count) - 14)) if channel_name == "x" else max_label_width
                angled = channel_name == "x" and abs(float(axis.get("labelAngle", 0))) >= 10
                # Preserve the sampled rotation. Autosize includes the complete
                # angled text; the conservative spacing uses text line height,
                # not full word width projected onto x (parallel labels interleave).
                wrapped = _wrap_mapping(axis, 1e9 if angled else wrap_width, size)
                if angled and count:
                    angle = math.radians(abs(float(axis["labelAngle"])))
                    needed_width = max(needed_width, count * (size * 1.25 / max(0.17, abs(math.sin(angle))) + 4))
                if wrapped:
                    axis["labelOverlap"] = False
                    axis["labelLineHeight"] = math.ceil(size * 1.25)
                    max_lines = max(len(_lines(value)) for value in wrapped)
                    # Multi-line x labels read horizontally; reserve enough
                    # category spacing without modifying scale/domain values.
                    if channel_name == "x" and max_lines > 1 and not angled:
                        axis["labelAngle"] = 0
                        needed_width = max(needed_width, count * (max(_width(value, size) for value in wrapped) + 14))
                    elif channel_name == "y" and max_lines > 1:
                        needed_height = max(needed_height, count * (max_lines * axis["labelLineHeight"] + 8))
                    axis["maxExtent"] = max(_number(axis.get("maxExtent"), 200), max_lines * axis["labelLineHeight"] + 32, max_label_width + 32)
                axis_title = axis.get("title", channel.get("title"))
                if axis_title is not None:
                    axis["title"] = _wrap(axis_title, width if channel_name == "x" else height,
                                          _number(axis.get("titleFontSize"), 11))
            if channel_name in {"color", "fill", "stroke", "shape", "size", "strokeDash", "opacity"}:
                if channel.get("legend", {}) is None or channel.get("legend") is False:
                    continue
                legend = channel.setdefault("legend", {})
                legend.update(labelLimit=0, titleLimit=0, labelOverlap=False, symbolLimit=0)
                size = _number(legend.get("labelFontSize"), _number(config["legend"].get("labelFontSize"), 10))
                mapping = _mapping(legend.get("labelExpr"))
                longest = max((_width(value, size) for value in (mapping or {}).values()), default=0)
                wrapped = _wrap_mapping(legend, max_label_width, size)
                if longest > max_label_width:
                    # An internal legend cannot request extra outer space.
                    # Keep large legends outside the plot to avoid text loss.
                    legend.update(orient="right", columns=1, rowPadding=max(6, _number(legend.get("rowPadding"), 6)))
                    legend.pop("legendX", None)
                    legend.pop("legendY", None)
                    presentation = result.get("usermeta", {}).get("presentation", {})
                    if isinstance(presentation.get("legend"), dict):
                        presentation["legend"].update(chosen="right", columns=1, reason="space_for_complete_legend")
                if legend.get("title") is not None:
                    legend["title"] = _wrap(legend["title"], max_label_width, _number(legend.get("titleFontSize"), 11))
        for child in node.get("layer", []):
            if isinstance(child, dict):
                child_width, child_height = visit(child, width, height)
                needed_width, needed_height = max(needed_width, child_width), max(needed_height, child_height)
        return needed_width, needed_height

    width, height = _number(result.get("width"), 300), _number(result.get("height"), 300)
    new_width, new_height = visit(result, width, height)
    if result.get("usermeta", {}).get("semantic", {}).get("equal_unit_aspect"):
        scale = max(new_width / width, new_height / height)
        new_width, new_height = width * scale, height * scale
    if new_width > width:
        result["width"] = math.ceil(new_width)
    if new_height > height:
        result["height"] = math.ceil(new_height)
    return result


fix_text_layout = apply_text_layout


def audit_text(spec: dict, svg_text: str) -> dict:
    """Audit actual SVG text/tspans against labels the spec promises to show.

    Only explicit axis ``values`` require complete tick coverage: an automatic
    tick chooser may legitimately choose fewer values. Explicit legend values,
    or its finite domain with symbolLimit=0, require coverage. Unicode content
    is compared after removing whitespace so native line wrapping is harmless.
    Arbitrary label expressions are not evaluated. This audit complements the
    renderer's bounds audit; it cannot prove glyph visibility from SVG alone.
    """
    def key(value: Any) -> str:
        return re.sub(r"\s+", "", "".join(_lines(value)))

    errors: list[str] = []
    unsupported: list[str] = []
    expected: dict[str, set[str]] = {}
    original: dict[tuple[str, str], Any] = {}

    def add(role: str, value: Any) -> None:
        if value is None or isinstance(value, dict) or not key(value):
            return
        expected.setdefault(role, set()).add(key(value))
        original[role, key(value)] = value

    for offset in spec.get("usermeta", {}).get("presentation", {}).get("axis_offsets", {}).values():
        add("mark", offset)

    def visit(node: dict, inherited_values: list[dict]) -> None:
        values = node.get("data", {}).get("values", inherited_values)
        title = node.get("title")
        if isinstance(title, (str, list)):
            add("title-text", title)
        elif isinstance(title, dict):
            add("title-text", title.get("text"))
            add("title-subtitle", title.get("subtitle"))
        for name, channel in node.get("encoding", {}).items():
            if not isinstance(channel, dict):
                continue
            if name in {"x", "y"} and channel.get("axis", {}) is not None and channel.get("axis") is not False:
                axis = channel.get("axis", {})
                add("axis-title", axis.get("title", channel.get("title")))
                mapping = _mapping(axis.get("labelExpr"))
                ticks = axis.get("values")
                if axis.get("labels", True) and mapping and isinstance(ticks, list):
                    for value in ticks:
                        domain = channel.get("scale", {}).get("domain")
                        if isinstance(value, (int, float)) and isinstance(domain, list) and len(domain) == 2 and all(isinstance(v, (int, float)) for v in domain):
                            if value < min(domain) or value > max(domain):
                                continue
                        label = mapping.get(str(value))
                        if label is None and isinstance(value, (int, float)):
                            label = mapping.get(str(int(value))) if float(value).is_integer() else None
                        if label is not None:
                            add("axis-label", label)
                elif axis.get("labelExpr") and mapping is None:
                    unsupported.append(f"{name}.axis.labelExpr is not a literal adapter mapping")
            if name in {"color", "fill", "stroke", "shape", "size", "strokeDash", "opacity"} and channel.get("legend", {}) is not None and channel.get("legend") is not False:
                legend = channel.get("legend", {})
                add("legend-title", legend.get("title", channel.get("title")))
                mapping = _mapping(legend.get("labelExpr"))
                ids = legend.get("values")
                limit = legend.get("symbolLimit", spec.get("config", {}).get("legend", {}).get("symbolLimit", 30))
                if ids is None and limit == 0:
                    ids = channel.get("scale", {}).get("domain")
                    if ids is None and channel.get("type") in {"nominal", "ordinal"} and channel.get("field"):
                        ids = list(dict.fromkeys(row[channel["field"]] for row in values if channel["field"] in row))
                if isinstance(ids, list):
                    if isinstance(limit, (int, float)) and limit > 0:
                        ids = ids[:int(limit)]
                    for value in ids:
                        if mapping is not None and str(value) in mapping:
                            add("legend-label", mapping[str(value)])
                        elif not legend.get("labelExpr") and channel.get("type") in {"nominal", "ordinal"}:
                            add("legend-label", value)
                elif legend.get("labelExpr") and mapping is None:
                    unsupported.append(f"{name}.legend.labelExpr is not a literal adapter mapping")
        for child in node.get("layer", []):
            if isinstance(child, dict):
                visit(child, values)

    visit(spec, [])
    visible: dict[str, list[str]] = {}
    raw_visible: list[dict] = []
    try:
        root = ET.fromstring(svg_text)
    except ET.ParseError as error:
        return {"passed": False, "errors": [f"SVG XML parse error: {error}"], "expected_count": sum(map(len, expected.values()))}

    def svg_visit(element: ET.Element, role: str = "unknown", hidden: bool = False) -> None:
        classes = element.get("class", "").split()
        roles = [value[5:] for value in classes if value.startswith("role-")]
        if roles:
            role = roles[-1]
        hidden = hidden or element.get("display") == "none" or element.get("visibility") == "hidden" or element.get("opacity") == "0"
        if element.tag.rsplit("}", 1)[-1] == "text" and not hidden:
            value = "".join(element.itertext())
            visible.setdefault(role, []).append(key(value))
            raw_visible.append({"role": role, "text": value})
        for child in element:
            svg_visit(child, role, hidden)

    svg_visit(root)
    for role, labels in expected.items():
        present = set(visible.get(role, []))
        for label in sorted(labels - present):
            errors.append(f"Missing or shortened SVG {role}: {original[role, label]!r}")
    # An ellipsis present in source content is permitted; renderer-inserted
    # truncation is not. Titles/guide labels can be audited independently of
    # their scenegraph item.text, which retains the pre-truncation source.
    expected_all = set().union(*expected.values()) if expected else set()
    new_ellipses = [item for item in raw_visible if "\u2026" in item["text"] and key(item["text"]) not in expected_all]
    for item in new_ellipses:
        errors.append(f"Unexpected SVG ellipsis in {item['role']}: {item['text']!r}")
    return {"passed": not errors, "errors": errors,
            "expected_count": sum(map(len, expected.values())), "visible_text_count": len(raw_visible),
            "expected_by_role": {role: len(labels) for role, labels in expected.items()},
            "visible_by_role": {role: len(labels) for role, labels in visible.items()},
            "new_ellipsis_count": len(new_ellipses), "unsupported_expressions": sorted(set(unsupported)),
            "comparison": "Unicode characters preserved, whitespace ignored across native SVG tspans; only declared ticks/legend values require coverage"}
