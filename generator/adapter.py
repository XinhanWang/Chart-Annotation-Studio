"""Chart configuration to renderable and semantic Vega-Lite specifications.

The native sampler supplies observations, styles and axis choices. Explicit
positions preserve grouped offsets, stack endpoints, repeated display labels,
nonuniform numeric x and uncertainty. Observation tables use the same visible
reading order as compact training targets while keeping stable source IDs.

Hatches and reference guides use separate decorative datasets. build_pair fits
plotting domains and complete text before rendering. build_geometry_pair remains
a dependency-free entry point for existing configuration and geometry audits.
"""
from __future__ import annotations

import copy
import datetime as dt
import json
import math
import re
from typing import Any

from ordering import first_seen, visual_rows
from spec_format import format_spec


KINDS = (
    "barh_1", "barh_n", "barv_1", "barv_n", "barv_stack",
    "line_1", "line_n", "scatter_1", "scatter_n", "barline_n",
)
COMPOSITE_KINDS = ("barline_n",)
SERIES_ROLES = ("bar", "line")
SCHEMA = "https://vega.github.io/schema/vega-lite/v6.json"
VERSION = "3.2.0"
DECORATION_PREFIX = "__vsr_decoration_"
DATA_LABEL_PREFIX = DECORATION_PREFIX + "data_label_"


def _plain(value: Any) -> Any:
    """Accept JSON cfgs as well as the numpy values returned by VSR itself."""
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if hasattr(value, "tolist"):
        return _plain(value.tolist())
    if hasattr(value, "item"):
        return _plain(value.item())
    return value


def _number(value: Any, label: str = "value") -> float | int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a finite number, got {value!r}")
    if not math.isfinite(value):
        raise ValueError(f"{label} must be finite, got {value!r}")
    return value


def _at(cfg: dict, plural: str, singular: str, index: int, default: Any) -> Any:
    values = cfg.get(plural)
    if values is not None:
        if index >= len(values):
            raise ValueError(f"{plural} has no value for series {index}")
        return values[index]
    return cfg.get(singular, default)


def _series_names(kind: str, cfg: dict) -> list[str]:
    if kind in {"barh_1", "barv_1", "scatter_1"}:
        return [str(cfg.get("series_name", "Series 1"))]
    names = cfg.get("series_names")
    if names is None:
        count = int(cfg.get("n_series", len(cfg.get("matrix", []))))
        names = [f"Series {i + 1}" for i in range(count)]
    if not names:
        raise ValueError("At least one series is required")
    if "n_series" in cfg and int(cfg["n_series"]) != len(names):
        raise ValueError("n_series and series_names disagree")
    return [str(name) for name in names]


def _label_expr(keys: list[Any], labels: list[Any]) -> str:
    """JSON quoting protects quote/backslash/unicode labels in Vega expressions."""
    # Vega's toString(21.0) is "21", unlike Python's str(21.0).
    def label_key(value):
        if isinstance(value, (int, float)) and not isinstance(value, bool) and float(value).is_integer():
            return str(int(value))
        return str(value)
    mapping = {label_key(k): str(v) for k, v in zip(keys, labels)}
    literal = json.dumps(mapping, ensure_ascii=False, separators=(",", ":"))
    return f"({literal})[toString(datum.value)]"


def _temporal_label(label: str) -> tuple[str | None, str | None]:
    text = str(label).strip()
    if re.fullmatch(r"\d{4}", text):
        return f"{text}-01-01", "year"
    match = re.fullmatch(r"Q([1-4])\s+(\d{4})", text)
    if match:
        return f"{match[2]}-{(int(match[1]) - 1) * 3 + 1:02d}-01", "quarter"
    for pattern in ("%b %Y", "%B %Y"):
        try:
            parsed = dt.datetime.strptime(text, pattern)
            return parsed.strftime("%Y-%m-01"), "month"
        except ValueError:
            pass
    try:
        return dt.date.fromisoformat(text).isoformat(), "day"
    except ValueError:
        return None, None


def _error_at(errors: Any, index: int, count: int) -> tuple[float, float]:
    """Matplotlib's scalar, N-vector and 2xN asymmetric error conventions."""
    if isinstance(errors, (int, float)):
        low = high = errors
    elif len(errors) == 2 and all(isinstance(a, list) for a in errors):
        if any(len(a) != count for a in errors):
            raise ValueError("Asymmetric error lengths do not match observations")
        low, high = errors[0][index], errors[1][index]
    else:
        if len(errors) != count:
            raise ValueError("Error lengths do not match observations")
        low = high = errors[index]
    low, high = _number(low, "error lower"), _number(high, "error upper")
    if low < 0 or high < 0:
        raise ValueError("Error magnitudes must be nonnegative")
    return float(low), float(high)


def _rows(kind: str, cfg: dict, names: list[str]) -> list[dict]:
    rows: list[dict] = []

    def identity(s: int, p: int) -> dict:
        return {"row_id": f"r{len(rows):06d}", "row_index": len(rows),
                "series_id": f"s{s:03d}", "series_index": s,
                "series_name": names[s], "point_index": p}

    if kind in COMPOSITE_KINDS:
        labels = cfg["labels"]
        matrix = cfg["matrix"]
        roles = cfg.get("series_roles")
        if not roles or len(roles) != len(names) or any(role not in SERIES_ROLES for role in roles):
            raise ValueError(f"series_roles must assign one of {SERIES_ROLES} to every series")
        bar_count = roles.count("bar")
        if not bar_count or bar_count == len(roles):
            raise ValueError("A composite chart needs at least one bar and one line series")
        if roles != ["bar"] * bar_count + ["line"] * (len(roles) - bar_count):
            raise ValueError("Composite series roles must list every bar series before every line series")
        if not labels or len(matrix) != len(names) or any(len(v) != len(labels) for v in matrix):
            raise ValueError("Composite matrix, series roles and labels have incompatible shapes")
        width = _number(cfg.get("bar_width", 0.7), "bar width")
        if width <= 0:
            raise ValueError("Bar width must be positive")
        offsets = cfg.get("offsets", [0] * bar_count)
        if len(offsets) != bar_count:
            raise ValueError("offsets and bar series have incompatible lengths")
        errors = cfg.get("yerr")
        if not cfg.get("show_error", errors is not None):
            errors = None
        if errors is not None and len(errors) != bar_count:
            raise ValueError("yerr must supply one error series per bar series")
        for p, label in enumerate(labels):
            for s, values in enumerate(matrix):
                value = _number(values[p], "composite value")
                row = identity(s, p)
                row.update(category_id=f"c{p:04d}", category_index=p, category=str(label),
                           value=value, role=roles[s])
                if roles[s] == "bar":
                    center = p + _number(offsets[s], "bar offset")
                    row.update(category_position=p, plot_category=center,
                               category_lower=center - width / 2, category_upper=center + width / 2,
                               value_lower=0, value_upper=value)
                    row.update(x=str(label), y=value, plot_x=center, plot_y=value,
                               plot_x0=center - width / 2, plot_x1=center + width / 2,
                               plot_y0=0, plot_y1=value)
                    if errors is not None:
                        low, high = _error_at(errors[s], p, len(labels))
                        row.update(error_minus=low, error_plus=high,
                                   error_lower=value - low, error_upper=value + high)
                else:
                    # A line vertex sits on the category position itself; the
                    # degenerate interval keeps one geometry schema per chart.
                    row.update(category_position=p, plot_category=p,
                               category_lower=p, category_upper=p,
                               value_lower=value, value_upper=value)
                    row.update(x=str(label), y=value, plot_x=p, plot_y=value,
                               plot_x0=p, plot_x1=p, plot_y0=value, plot_y1=value)
                rows.append(row)
        return rows
    if kind.startswith("bar"):
        labels = cfg["labels"]
        matrix = [cfg["values"]] if kind.endswith("_1") else cfg["matrix"]
        if not labels or len(matrix) != len(names) or any(len(v) != len(labels) for v in matrix):
            raise ValueError("Bar matrix, series names and labels have incompatible shapes")
        horizontal = kind.startswith("barh")
        stacked = kind == "barv_stack"
        width = _number(cfg.get("bar_height" if horizontal else "bar_width", 0.7))
        if width <= 0:
            raise ValueError("Bar width/height must be positive")
        offsets = cfg.get("offsets", [0] * len(names))
        if len(offsets) != len(names):
            raise ValueError("offsets and series names have incompatible lengths")
        if len(names) > 1 and not stacked and "offsets" not in cfg:
            offsets = [(j - (len(names) - 1) / 2) * width for j in range(len(names))]
        errors = cfg.get("xerr" if horizontal else "yerr")
        if not kind.endswith("_1") and not cfg.get("show_error", errors is not None):
            errors = None
        bottoms = cfg.get("bottoms")
        if bottoms is not None and (len(bottoms) != len(names) or any(len(v) != len(labels) for v in bottoms)):
            raise ValueError("Stack bottoms and matrix have incompatible shapes")
        for p, label in enumerate(labels):
            running = 0.0
            for s, values in enumerate(matrix):
                value = _number(values[p], "bar value")
                row = identity(s, p)
                row.update(category_id=f"c{p:04d}", category_index=p, category=str(label), value=value)
                center = p + (0 if stacked else _number(offsets[s], "bar offset"))
                bottom = _number(bottoms[s][p], "stack bottom") if stacked and bottoms is not None else running if stacked else 0
                top = bottom + value
                row.update(category_position=p, plot_category=center,
                           category_lower=center - width / 2, category_upper=center + width / 2,
                           value_lower=bottom, value_upper=top)
                if horizontal:
                    row.update(x=value, y=str(label), plot_x=value, plot_y=center,
                               plot_x0=bottom, plot_x1=top,
                               plot_y0=center - width / 2, plot_y1=center + width / 2)
                else:
                    row.update(x=str(label), y=value, plot_x=center,
                               plot_y=(bottom + top) / 2 if stacked else value,
                               plot_x0=center - width / 2, plot_x1=center + width / 2,
                               plot_y0=bottom, plot_y1=top)
                if errors is not None:
                    local_errors = errors if kind.endswith("_1") else errors[s]
                    low, high = _error_at(local_errors, p, len(labels))
                    row.update(error_minus=low, error_plus=high,
                               error_lower=top - low, error_upper=top + high)
                rows.append(row)
                running = top
    elif kind.startswith("line"):
        labels = cfg["x_labels"]
        matrix = cfg["matrix"]
        if not labels or len(matrix) != len(names) or any(len(v) != len(labels) for v in matrix):
            raise ValueError("Line matrix, series names and x labels have incompatible shapes")
        mode = cfg.get("x_mode", "numeric")
        if mode not in {"numeric", "categorical", "temporal"}:
            raise ValueError(f"Unsupported line x mode: {mode}")
        xs = cfg["x_values"] if mode == "numeric" else list(range(len(labels)))
        if len(xs) != len(labels):
            raise ValueError("x_values and x_labels have incompatible lengths")
        for p, label in enumerate(labels):
            for s, values in enumerate(matrix):
                x = _number(xs[p], "line x")
                y = _number(values[p], "line y")
                row = identity(s, p)
                row.update(x=x if mode == "numeric" else str(label), x_label=str(label),
                           y=y, value=y, plot_x=x, plot_y=y,
                           category_id=f"c{p:04d}", category_index=p,
                           category=str(label), category_position=p)
                if mode == "temporal":
                    calendar_date, granularity = _temporal_label(str(label))
                    row.update(x_temporal=calendar_date, temporal_granularity=granularity)
                rows.append(row)
    else:
        xs, ys = cfg["x"], cfg["y"]
        if not xs or len(xs) != len(ys):
            raise ValueError("Scatter x and y must be nonempty and have equal lengths")
        counts = cfg.get("counts", [len(xs)])
        starts = cfg.get("starts")
        if starts is None:
            starts = [sum(counts[:i]) for i in range(len(counts))]
        if len(counts) != len(names) or len(starts) != len(names):
            raise ValueError("Scatter counts/starts and series names disagree")
        used: set[int] = set()
        for s, (start, count) in enumerate(zip(starts, counts)):
            if int(start) != start or int(count) != count or start < 0 or count < 1 or start + count > len(xs):
                raise ValueError("Invalid scatter series start/count")
            for p, i in enumerate(range(int(start), int(start + count))):
                if i in used:
                    raise ValueError("Scatter series intervals overlap")
                used.add(i)
                row = identity(s, p)
                x, y = _number(xs[i], "scatter x"), _number(ys[i], "scatter y")
                row.update(source_index=i, x=x, y=y, plot_x=x, plot_y=y)
                rows.append(row)
        if used != set(range(len(xs))):
            raise ValueError("Scatter series intervals leave observations unassigned")
    return rows


def _native(cfg: dict) -> dict:
    return cfg.get("_render_axes") or {}


def _tight_value_domain(lim: list[float], rows: list[dict], kind: str, axis: str) -> list[float]:
    """Pull sampled span padding back onto the drawn bar ends.

    The official samplers pad both value-axis ends by a fraction of the span.
    With signed bars that pads an empty band between the bar ends and the axis
    line, so bar bottoms never touch it even though bars anchor at zero. The
    domain only has to reach the lowest drawn bar end (rects and error caps);
    lines and points keep a small clearance so they never sit on the frame.
    The high end keeps its sampled headroom, and explicit caller domains are
    never tightened.
    """
    horizontal = kind.startswith("barh")
    if not kind.startswith("bar") or axis != ("x" if horizontal else "y"):
        return lim
    bar_ends, other_ends = [], []
    for row in rows:
        ends = [row[f"plot_{axis}0"], row[f"plot_{axis}1"]]
        ends += [row[key] for key in ("error_lower", "error_upper") if key in row]
        if row.get("role", "bar") == "bar":
            bar_ends += ends
        else:
            other_ends += ends
    if not bar_ends:
        return lim
    ordered = sorted(lim)
    span = ordered[1] - ordered[0]
    low = min(bar_ends)
    if other_ends and min(other_ends) < low:
        low = min(other_ends) - 0.04 * span
    ordered[0] = max(ordered[0], low)
    return ordered if lim[0] <= lim[1] else ordered[::-1]


def _limits(cfg: dict, axis: str, rows: list[dict], kind: str) -> list[float]:
    axes = _native(cfg)
    lim = axes.get(f"{axis}lim", axes.get(f"{axis}_lim"))
    sampled = lim is not None
    if lim is None:
        lim = cfg.get(f"{axis}lim", cfg.get(f"{axis}lims"))
    if lim is None:
        category_axis = "y" if kind.startswith("barh") else "x"
        if kind.startswith("bar") and axis == category_axis:
            positions = [r[f"plot_{axis}{suffix}"] for r in rows for suffix in (0, 1)]
            lo, hi = min(positions), max(positions)
            margin = (hi - lo) * 0.05 or 0.5
            lim = [lo - margin, hi + margin]
        else:
            values = [r[f"plot_{axis}"] for r in rows]
            if kind.startswith("bar"):
                values += [0]
                values += [r["value_lower"] for r in rows] + [r["value_upper"] for r in rows]
            lo, hi = min(values), max(values)
            margin = (hi - lo) * 0.05 or max(abs(lo) * 0.05, 0.5)
            lim = [lo - margin, hi + margin]
    if len(lim) != 2:
        raise ValueError(f"{axis} limits must contain two endpoints")
    lim = [float(_number(v, f"{axis} limit")) for v in lim]
    if sampled:
        tight_rows = rows
        if axis == ("x" if kind.startswith("barh") else "y") and kind in COMPOSITE_KINDS \
                and cfg.get("dual_y_axis"):
            # Lines live on their own right-hand scale; the left axis serves bars.
            tight_rows = [row for row in rows if row.get("role", "bar") == "bar"]
        lim = _tight_value_domain(lim, tight_rows, kind, axis)
    if lim[0] == lim[1]:
        raise ValueError(f"{axis} domain must have nonzero extent")
    # Final Matplotlib limits already encode inversion.  Only apply a separate
    # inversion flag when limits did not come from the final render diagnostics.
    if f"{axis}lim" not in axes and f"{axis}_lim" not in axes:
        inverted = axes.get(f"{axis}_inverted", axes.get(f"{axis}axis_inverted", False))
        if inverted and lim[0] < lim[1]:
            lim.reverse()
    return lim


def _axis(cfg: dict, axis: str, kind: str) -> dict:
    style = cfg.get("style", {})
    axes = _native(cfg)
    result: dict[str, Any] = {
        "title": cfg.get(f"{axis}_title", ""),
        "grid": bool(style.get("grid_visible", True)) and cfg.get("grid_axis", style.get("grid_axis", "both")) in {axis, "both"},
        "labelColor": style.get("text_color", "#222222"),
        "titleColor": style.get("text_color", "#222222"),
        "labelFontSize": style.get("tick_size", 11),
        "titleFontSize": style.get("label_size", 12),
        "labelPadding": style.get("tick_pad", 3),
        "titlePadding": style.get("label_pad", 5),
        "gridColor": style.get("grid_color", "#dddddd"),
        "gridOpacity": style.get("grid_alpha", 0.35),
        "gridWidth": style.get("grid_width", 0.7),
        "domain": bool(style.get("spine_visible", True)),
        "domainColor": style.get("spine_color", style.get("text_color", "#222222")),
        "domainWidth": style.get("spine_width", 1),
    }
    if axis == "x":
        result["labelAngle"] = -float(cfg.get("x_rotation", 0))
    category_axis = "y" if kind.startswith("barh") else "x"
    ticks = axes.get(f"{axis}ticks", axes.get(f"{axis}_ticks"))
    tick_labels = axes.get(f"{axis}ticklabels", axes.get(f"{axis}_ticklabels"))
    if kind.startswith("bar") and axis == category_axis:
        ticks = list(range(len(cfg["labels"])))
        tick_labels = cfg["labels"]
    elif kind.startswith("line") and axis == "x":
        if cfg.get("x_mode", "numeric") != "numeric":
            # Every category/calendar label is visible. A sampled or legacy
            # tick subset must never silently remove training evidence.
            ticks = list(range(len(cfg["x_labels"])))
            tick_labels = cfg["x_labels"]
        else:
            ticks = ticks if ticks is not None else cfg.get("tick_positions")
            tick_labels = tick_labels if tick_labels is not None else cfg.get("tick_labels")
    if ticks is not None:
        result["values"] = list(ticks)
    # Numeric Matplotlib labels can be mantissas with an external offset.  Vega
    # formats the real values instead; copying those mantissas loses units.
    categorical_labels = (kind.startswith("bar") and axis == category_axis) or (
        kind.startswith("line") and axis == "x")
    offset = axes.get(f"{axis}_offset_text", axes.get(f"{axis}offset", ""))
    discrete_labels = (kind.startswith("bar") and axis == category_axis) or (
        kind.startswith("line") and axis == "x" and cfg.get("x_mode", "numeric") != "numeric")
    if ticks is not None and tick_labels is not None and categorical_labels and (discrete_labels or not offset):
        if len(ticks) == len(tick_labels):
            result["labelExpr"] = _label_expr(ticks, tick_labels)
            result["labelOverlap"] = False
            result["labelLimit"] = 0
            result["labelBound"] = False
    return result


def _channel(cfg: dict, axis: str, field: str, limits: dict, kind: str) -> dict:
    native = _native(cfg)
    scale_type = native.get(f"{axis}scale", native.get(f"{axis}_scale", "linear"))
    if scale_type not in {"linear", "log", "symlog", "sqrt", "pow", "time", "utc"}:
        raise ValueError(f"Unsupported source {axis} scale: {scale_type}")
    domain = limits[axis]
    scale = {"type": scale_type, "domain": sorted(domain), "nice": False}
    # Logarithmic scales cannot include zero; even zero:false is unsupported
    # by Vega-Lite and causes an otherwise valid chart to require review.
    if scale_type != "log":
        scale["zero"] = False
    scale["reverse"] = domain[0] > domain[1]
    return {"field": field, "type": "quantitative", "title": cfg.get(f"{axis}_title", ""),
            "scale": scale, "axis": _axis(cfg, axis, kind)}


def _palette(cfg: dict, names: list[str]) -> list[str]:
    colors = cfg.get("colors")
    if colors is None:
        color = cfg.get("bar_color", cfg.get("color"))
        colors = [color] if color else cfg.get("style", {}).get("series_colors", ["#4c78a8"])
    if not colors:
        colors = ["#4c78a8"]
    return [colors[i % len(colors)] for i in range(len(names))]


def _color(kind: str, cfg: dict, names: list[str]) -> dict:
    indices = cfg.get("_series_order", list(range(len(names))))
    ids = [f"s{i:03d}" for i in indices]
    ordered_names = [names[i] for i in indices]
    show_legend = cfg.get("show_legend", kind.endswith("_n") or kind == "barv_stack")
    legend: dict | None = None
    if show_legend:
        style = cfg.get("style", {})
        loc = style.get("legend_loc", "upper right")
        orient = "right" if style.get("legend_outside") else {
            "upper right": "top-right", "upper left": "top-left",
            "lower right": "bottom-right", "lower left": "bottom-left",
            "center left": "left", "best": "top-right",
        }.get(loc, "right")
        legend = {"title": None, "labelExpr": _label_expr(ids, ordered_names),
                  "values": ids, "orient": orient,
                  "labelFontSize": style.get("legend_size", 10),
                  "labelColor": style.get("text_color", "#222222"),
                  "columns": style.get("legend_ncol", 1)}
    palette = _palette(cfg, names)
    return {"field": "series_id", "type": "nominal", "sort": None,
            "scale": {"domain": ids, "range": [palette[i] for i in indices]}, "legend": legend}


def _polygon(sides: int, rotation: float = -math.pi / 2, inner: float | None = None) -> str:
    n = sides if inner is None else sides * 2
    points = []
    for i in range(n):
        r = 1 if inner is None or i % 2 == 0 else inner
        theta = rotation + i * 2 * math.pi / n
        points.append((r * math.cos(theta), r * math.sin(theta)))
    return "M" + "L".join(f"{x:.6f},{y:.6f}" for x, y in points) + "Z"


_MARKERS = {
    "o": "circle", ".": "circle", ",": "square", "s": "square",
    "D": "diamond", "d": "diamond", "^": "triangle-up", "v": "triangle-down",
    "<": "triangle-left", ">": "triangle-right", "+": "cross", "P": "cross",
    "x": "M-1,-1L1,1M-1,1L1,-1",
    "X": "M-1,-0.6L-0.6,-1L0,-0.4L0.6,-1L1,-0.6L0.4,0L1,0.6L0.6,1L0,0.4L-0.6,1L-1,0.6L-0.4,0Z",
    "p": _polygon(5), "h": _polygon(6), "H": _polygon(6, 0),
    "*": _polygon(5, inner=0.381966), "|": "M0,-1L0,1", "_": "M-1,0L1,0",
}
_DASHES = {"-": [], "solid": [], "--": [6, 3], "dashed": [6, 3],
           "-.": [6, 3, 1.5, 3], "dashdot": [6, 3, 1.5, 3], ":": [1.5, 2.5], "dotted": [1.5, 2.5]}


def _marker_properties(marker: Any, size: float) -> dict:
    if marker not in _MARKERS:
        raise ValueError(f"Unsupported Matplotlib marker {marker!r}")
    return {"shape": _MARKERS[marker], "filled": marker not in {"x", "+", "|", "_"},
            "size": float(size) * (0.25 if marker == "." else 1)}


def _marker_filter(selection: Any, n: int) -> dict | None:
    if selection is None:
        return None
    if isinstance(selection, int):
        if selection < 1:
            raise ValueError("markevery must be positive")
        return {"filter": f"datum.point_index % {selection} === 0"}
    if isinstance(selection, list):
        indices = [int(i) if int(i) >= 0 else n + int(i) for i in selection]
        if any(i < 0 or i >= n for i in indices):
            raise ValueError("markevery index is outside the line")
        return {"filter": {"field": "point_index", "oneOf": indices}}
    raise ValueError("VSR uses integer markevery; distance-based Matplotlib sampling is unsupported")


def _xy(cfg: dict, kind: str, limits: dict, x: str, y: str) -> dict:
    return {"x": _channel(cfg, "x", x, limits, kind), "y": _channel(cfg, "y", y, limits, kind)}


def _bar_series_layers(kind: str, cfg: dict, s: int, rows: list[dict], names: list[str], limits: dict,
                       selected: list[dict], color: dict, opacity: Any, horizontal: bool) -> list[dict]:
    """One bar series: its rectangles plus optional uncertainty layers."""
    layers: list[dict] = []
    enc = _xy(cfg, kind, limits, "plot_x0", "plot_y0")
    enc.update(x2={"field": "plot_x1"}, y2={"field": "plot_y1"}, color=color,
               detail={"field": "row_id", "type": "nominal"})
    enc["x"]["stack"] = None
    enc["y"]["stack"] = None
    mark = {"type": "bar", "clip": True, "opacity": opacity,
            "stroke": _at(cfg, "edgecolors", "edgecolor", s, _palette(cfg, names)[s]),
            "strokeWidth": _at(cfg, "linewidths", "linewidth", s, 1)}
    layers.append({"name": f"bars_{s}", "transform": selected, "mark": mark, "encoding": enc})
    if any(r["series_index"] == s and "error_lower" in r for r in rows):
        err = _xy(cfg, kind, limits, "error_lower" if horizontal else "plot_category",
                  "plot_category" if horizontal else "error_lower")
        err["x2" if horizontal else "y2"] = {"field": "error_upper"}
        edge = cfg.get("ecolor", cfg.get("style", {}).get("text_color", "#222222"))
        error_style = cfg.get("error_kw") or {}
        layers.append({"name": f"error_interval_{s}", "transform": copy.deepcopy(selected),
                       "mark": {"type": "rule", "clip": True, "color": edge,
                                "strokeWidth": error_style.get("elinewidth", 1)}, "encoding": err})
        for end in ("error_lower", "error_upper"):
            caps = _xy(cfg, kind, limits, end if horizontal else "plot_category",
                       "plot_category" if horizontal else end)
            layers.append({"name": f"{end}_cap_{s}", "transform": copy.deepcopy(selected),
                           "mark": {"type": "tick", "orient": "vertical" if horizontal else "horizontal",
                                    "clip": True, "color": edge, "size": 2 * (cfg.get("capsize") or 3),
                                    "thickness": error_style.get("capthick", 1)}, "encoding": caps})
    return layers


def _single_value_guides(layers: list[dict]) -> None:
    """Keep exactly one left and one right value guide under an independent resolve.

    ``resolve.scale.y = "independent"`` gives every layer its own y scale, and
    Vega draws a guide for each of them. Geometry is unaffected because every
    layer already pins an explicit domain, so only the first bar layer (left)
    and the first line layer (right) keep a visible axis; the rest are muted.
    """
    kept = {"left": False, "right": False}
    for layer in layers:
        channel = layer.get("encoding", {}).get("y")
        if not isinstance(channel, dict) or "axis" not in channel:
            continue
        side = "right" if str(layer.get("name", "")).startswith("line_") else "left"
        if kept[side]:
            channel["axis"] = None
            continue
        kept[side] = True
        if isinstance(channel["axis"], dict):
            channel["axis"]["orient"] = side
    if not kept["right"]:
        raise ValueError("A dual value axis requires at least one visible line layer")


def _line_domain(rows: list[dict]) -> list[float]:
    """Independent right-hand value domain: exactly the line vertices."""
    values = [float(r["plot_y"]) for r in rows if r.get("role") == "line"]
    if not values:
        raise ValueError("A dual value axis requires at least one line series")
    lo, hi = min(values), max(values)
    if lo == hi:
        lo, hi = lo - 1.0, hi + 1.0
    return [lo, hi]


def _line_series_layers(kind: str, cfg: dict, s: int, limits: dict, selected: list[dict],
                        color: dict, opacity: Any, n_points: int) -> list[dict]:
    """One line series: its path plus the optional per-vertex markers."""
    layers: list[dict] = []
    enc = _xy(cfg, kind, limits, "plot_x", "plot_y")
    if cfg.get("dual_y_axis") and "y2" in limits:
        # Bars keep the left value axis; lines own an independent right one.
        enc["y"] = _channel(cfg, "y", "plot_y", {"y": limits["y2"]}, kind)
        right_title = cfg.get("y_title_right")
        if right_title in (None, "", []):
            # An unlabelled secondary axis keeps the shared unit label instead
            # of silently disagreeing with the left-hand one.
            right_title = cfg.get("y_title", "")
        enc["y"]["title"] = right_title
        enc["y"]["axis"] = {**enc["y"]["axis"], "orient": "right", "title": right_title}
    enc.update(color=color, detail={"field": "series_id", "type": "nominal"},
               order={"field": "point_index", "type": "quantitative", "sort": "ascending"})
    line_style = _at(cfg, "linestyles", "linestyle", s, "-")
    if line_style not in {None, "None", "none", "", " "}:
        if line_style not in _DASHES:
            raise ValueError(f"Unsupported line style: {line_style}")
        layers.append({"name": f"line_{s}", "transform": copy.deepcopy(selected),
                       "mark": {"type": "line", "clip": True, "opacity": opacity,
                                "strokeWidth": _at(cfg, "widths", "linewidth", s, 1.8),
                                "strokeDash": _DASHES[line_style]}, "encoding": enc})
    marker = _at(cfg, "markers", "marker", s, None)
    if marker not in {None, "None", "none", "", " "}:
        size = _at(cfg, "marker_sizes", "markersize", s, 6)
        mark = {"type": "point", "clip": True, "opacity": opacity,
                **_marker_properties(marker, float(size) ** 2)}
        point_enc = copy.deepcopy(enc)
        point_enc.pop("order", None)
        point_enc["detail"] = {"field": "row_id", "type": "nominal"}
        sample = _marker_filter(_at(cfg, "markevery", "markevery_value", s, None), n_points)
        layers.append({"name": f"line_markers_{s}", "transform": copy.deepcopy(selected) + ([sample] if sample else []),
                       "mark": mark, "encoding": point_enc})
    return layers


def _main_layers(kind: str, cfg: dict, rows: list[dict], names: list[str], limits: dict) -> list[dict]:
    layers: list[dict] = []
    roles = cfg.get("series_roles", [])
    for s, _ in enumerate(names):
        selected = [{"filter": {"field": "series_id", "equal": f"s{s:03d}"}}]
        color = _color(kind, cfg, names)
        opacity = _at(cfg, "alphas", "alpha", s, 1)
        if kind in COMPOSITE_KINDS:
            # Each series keeps only its own geometry on the shared axes.
            if roles[s] == "bar":
                layers.extend(_bar_series_layers(kind, cfg, s, rows, names, limits, selected, color, opacity, False))
            else:
                layers.extend(_line_series_layers(kind, cfg, s, limits, selected, color, opacity, len(cfg["labels"])))
        elif kind.startswith("bar"):
            layers.extend(_bar_series_layers(kind, cfg, s, rows, names, limits, selected, color, opacity,
                                             kind.startswith("barh")))
        elif kind.startswith("line"):
            layers.extend(_line_series_layers(kind, cfg, s, limits, selected, color, opacity, len(cfg["x_labels"])))
        else:
            marker = _at(cfg, "markers", "marker", s, "o")
            mark = {"type": "point", "clip": True, "opacity": opacity,
                    **_marker_properties(marker, _at(cfg, "sizes", "size", s, 25)),
                    "strokeWidth": _at(cfg, "linewidths", "linewidth", s, 0.5)}
            edge = _at(cfg, "edgecolors", "edgecolor", s, "none")
            # An unfilled x/+ marker must keep its color stroke even if mpl
            # ignored edgecolor='none'.  Filled markers can have no outline.
            if mark["filled"]:
                mark["stroke"] = None if edge == "none" else edge
            enc = _xy(cfg, kind, limits, "plot_x", "plot_y")
            enc.update(color=color, detail={"field": "row_id", "type": "nominal"})
            layers.append({"name": f"scatter_{s}", "transform": selected, "mark": mark, "encoding": enc})
    return layers


def _line_intersection(rect: tuple[float, float, float, float], c: float, slope: int) -> list[tuple[float, float]]:
    x0, y0, x1, y1 = rect
    candidates = [(x0, slope * x0 + c), (x1, slope * x1 + c),
                  ((y0 - c) / slope, y0), ((y1 - c) / slope, y1)]
    points: list[tuple[float, float]] = []
    for x, y in candidates:
        if x0 - 1e-8 <= x <= x1 + 1e-8 and y0 - 1e-8 <= y <= y1 + 1e-8:
            if not any(abs(x - a) + abs(y - b) < 1e-7 for a, b in points):
                points.append((x, y))
    return points[:2]


def _hatch_layers(kind: str, cfg: dict, rows: list[dict], names: list[str], limits: dict,
                  width: float, height: float) -> tuple[list[dict], int]:
    if not kind.startswith("bar"):
        return [], 0
    x0, x1 = limits["x"]
    y0, y1 = limits["y"]
    layers: list[dict] = []
    count = 0
    for s, _ in enumerate(names):
        hatch = _at(cfg, "hatches", "hatch", s, None)
        if not hatch:
            continue
        if any(char not in "/\\|-+xoO.*" for char in hatch):
            raise ValueError(f"Unsupported hatch: {hatch!r}")
        segments: list[dict] = []
        dots: list[dict] = []

        def coord(px: float, py: float) -> tuple[float, float]:
            return x0 + px / width * (x1 - x0), y1 - py / height * (y1 - y0)

        def add_segment(points: list[tuple[float, float]], row_id: str) -> None:
            if len(points) != 2:
                return
            ax, ay = coord(*points[0])
            bx, by = coord(*points[1])
            segments.append({"source_row_id": row_id, "decoration_role": "hatch",
                             "hx": ax, "hy": ay, "hx2": bx, "hy2": by})

        chars = set(hatch)
        spacing = max(3.5, 9 / max(hatch.count(c) for c in chars))
        symbol_size = 16 if "O" in chars else 8
        symbol_stroke_width = 0.65
        # Vega's symbol radius is sqrt(size)/2. Its scenegraph bounds also
        # reserve the default miter-limit (4) times half the stroke width,
        # including for circles. Keep that complete paint bound inside both
        # the source bar and the plot; a fixed 2px center inset was too small.
        symbol_inset = math.sqrt(symbol_size) / 2 + 2 * symbol_stroke_width + 0.25
        for row in rows:
            if row["series_index"] != s:
                continue
            xs = [(row[f"plot_x{j}"] - x0) / (x1 - x0) * width for j in (0, 1)]
            ys = [(y1 - row[f"plot_y{j}"]) / (y1 - y0) * height for j in (0, 1)]
            a, b = max(0.0, min(xs)), min(width, max(xs))
            c, d = max(0.0, min(ys)), min(height, max(ys))
            if a >= b or c >= d:
                continue
            rect = (a, c, b, d)
            if chars & {"/", "x"}:
                for k in range(math.floor((a + c) / spacing), math.ceil((b + d) / spacing) + 1):
                    add_segment(_line_intersection(rect, k * spacing, -1), row["row_id"])
            if chars & {"\\", "x"}:
                for k in range(math.floor((c - b) / spacing), math.ceil((d - a) / spacing) + 1):
                    add_segment(_line_intersection(rect, k * spacing, 1), row["row_id"])
            if chars & {"|", "+"}:
                for k in range(math.ceil(a / spacing), math.floor(b / spacing) + 1):
                    add_segment([(k * spacing, c), (k * spacing, d)], row["row_id"])
            if chars & {"-", "+"}:
                for k in range(math.ceil(c / spacing), math.floor(d / spacing) + 1):
                    add_segment([(a, k * spacing), (b, k * spacing)], row["row_id"])
            if chars & {"o", "O", ".", "*"}:
                for ix in range(math.ceil((a + symbol_inset) / spacing), math.floor((b - symbol_inset) / spacing) + 1):
                    for iy in range(math.ceil((c + symbol_inset) / spacing), math.floor((d - symbol_inset) / spacing) + 1):
                        hx, hy = coord(ix * spacing, iy * spacing)
                        dots.append({"source_row_id": row["row_id"], "decoration_role": "hatch", "hx": hx, "hy": hy})
        edge = _at(cfg, "edgecolors", "edgecolor", s, cfg.get("style", {}).get("text_color", "#222222"))
        if segments:
            enc = _xy(cfg, kind, limits, "hx", "hy")
            enc.update(x2={"field": "hx2"}, y2={"field": "hy2"})
            layers.append({"name": f"{DECORATION_PREFIX}hatch_rules_{s}", "data": {"values": segments},
                           "mark": {"type": "rule", "clip": True, "color": edge, "opacity": 0.85, "strokeWidth": 0.65},
                           "encoding": enc})
        if dots:
            mark = {"type": "point", "shape": _MARKERS["*"] if "*" in chars else "circle",
                    "filled": not bool(chars & {"o", "O"}), "size": symbol_size,
                    "color": edge, "clip": True, "strokeWidth": symbol_stroke_width}
            layers.append({"name": f"{DECORATION_PREFIX}hatch_symbols_{s}", "data": {"values": dots},
                           "mark": mark, "encoding": _xy(cfg, kind, limits, "hx", "hy")})
        count += len(segments) + len(dots)
    return layers, count


def _reference_layers(kind: str, cfg: dict, limits: dict, width: float, height: float) -> list[dict]:
    axes = _native(cfg)
    references = axes.get("reference_lines", axes.get("zero_lines", []))
    result = []
    for i, ref in enumerate(references):
        if isinstance(ref, str):
            ref = {"axis": ref, "value": 0}
        axis = ref.get("axis")
        if axis not in {"x", "y"}:
            continue
        value = _number(ref.get("value", 0))
        lower, upper = sorted(limits[axis])
        # Native axhline/axvline is clipped to the axes.  Omit a reference
        # that is fully invisible, but retain a one-pixel fringe so a stroke
        # touching the boundary is never silently removed.  Source cfg keeps
        # the original reference choice; observation rows are unaffected.
        fringe = (upper - lower) / (width if axis == "x" else height)
        if value < lower - fringe or value > upper + fringe:
            continue
        result.append({"name": f"reference_{axis}_{i}", "data": {"values": [{"reference_value": value}]},
                       "mark": {"type": "rule", "clip": True, "strokeWidth": 1, "opacity": 0.45 if kind.startswith("bar") else 0.35,
                                "color": cfg.get("style", {}).get("text_color", "#222222")},
                       "encoding": {axis: _channel(cfg, axis, "reference_value", limits, kind)}})
    return result


def _relative_luminance(color: Any) -> float:
    """sRGB luminance of a hex color; anything unparseable counts as bright."""
    match = re.fullmatch(r"#([0-9a-fA-F]{6})", str(color).strip())
    if not match:
        return 1.0
    channels = []
    for start in (0, 2, 4):
        value = int(match.group(1)[start:start + 2], 16) / 255
        channels.append(value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def _label_color(cfg: dict, names: list[str], index: int, mode: Any, position: str) -> str:
    """Ink for a printed value: theme text, its own series, or bar contrast."""
    fill = _palette(cfg, names)[index]
    if position == "inside" or mode == "contrast":
        return "#ffffff" if _relative_luminance(fill) < 0.55 else "#1a1a1a"
    if mode == "series":
        return fill
    return cfg.get("style", {}).get("text_color", "#222222")


def _data_label_layers(kind: str, cfg: dict, rows: list[dict], names: list[str], limits: dict) -> list[dict]:
    """Printed values on a composite's bars and line vertices.

    Labels are display geometry: they reuse the observation table, add no rows,
    carry no axis or legend of their own and never reach the compact target.
    Like hatch overlays they are named as decorations, so the renderer audits
    them separately from observations.
    """
    settings = cfg.get("data_labels")
    if kind not in COMPOSITE_KINDS or not isinstance(settings, dict):
        return []
    roles = cfg.get("series_roles", [])
    layers: list[dict] = []

    def annotate(field_x: str, field_y: str, y_limits: dict, options: dict) -> dict:
        encoding = {"x": _channel(cfg, "x", field_x, limits, kind),
                    "y": _channel(cfg, "y", field_y, y_limits, kind),
                    "text": {"field": "value", "type": "quantitative"}}
        if options.get("format"):
            encoding["text"]["format"] = options["format"]
        # Guides stay byte-identical to the annotated geometry's own: a shared
        # scale merges them into the single axis Vega already draws, while an
        # explicit null would switch that axis off for every layer. Under an
        # independent value scale _single_value_guides mutes the extra one.
        return encoding

    for s, _ in enumerate(names):
        role = roles[s] if s < len(roles) else None
        options = settings.get(role)
        if not isinstance(options, dict):
            continue
        own = [{"filter": {"field": "series_id", "equal": f"s{s:03d}"}}]
        series_rows = [row for row in rows if row["series_index"] == s]
        position = options.get("position", "above")
        size = float(options.get("size", 9))
        mark = {"type": "text", "clip": False, "align": "center", "fontSize": size,
                "fontWeight": options.get("weight", "normal"), "fontStyle": "normal",
                "color": _label_color(cfg, names, s, options.get("color", "text"), position)}
        if role == "bar":
            errors = any("error_lower" in row for row in series_rows)
            inside = position == "inside"
            for sign in ("positive", "negative"):
                outward = sign == "positive"
                if not [row for row in series_rows if (row["value"] >= 0) == outward]:
                    continue
                # Bars anchor at zero, so "above" means beyond the outer end:
                # over a positive bar, under a negative one.
                beyond = (not inside) == outward
                anchor = ("error_upper" if outward else "error_lower") if errors else "plot_y1"
                layers.append({
                    "name": f"{DATA_LABEL_PREFIX}bar_{s}_{sign}",
                    "transform": copy.deepcopy(own) + [{"filter": {"field": "value", "gte" if outward else "lt": 0}}],
                    "mark": dict(mark, baseline="bottom" if beyond else "top", dy=-3.0 if beyond else 3.0),
                    "encoding": annotate("plot_category", anchor, limits, options)})
        else:
            marker = _at(cfg, "markers", "marker", s, None)
            radius = float(_at(cfg, "marker_sizes", "markersize", s, 6)) / 2 \
                if marker not in {None, "None", "none", "", " "} else 0.0
            gap = radius + 3.0
            above = position != "below"
            sample = _marker_filter(_at(cfg, "markevery", "markevery_value", s, None), len(cfg["labels"]))
            y_limits = {"y": limits["y2"]} if cfg.get("dual_y_axis") and "y2" in limits else limits
            layers.append({
                "name": f"{DATA_LABEL_PREFIX}line_{s}",
                "transform": copy.deepcopy(own) + ([sample] if sample else []),
                "mark": dict(mark, baseline="bottom" if above else "top", dy=-gap if above else gap),
                "encoding": annotate("plot_x", "plot_y", y_limits, options)})
    return layers


def build_geometry_pair(kind: str, cfg: dict, *, fit_to_data: bool = False) -> tuple[dict, dict, dict]:
    """Return independently renderable full/compact specs and canonical evidence.

    ``cfg['_render_axes']`` retains the existing configuration schema for axis
    limits, ticks, scales, inversion and aspect. No external plotting library
    is involved. ``fit_to_data`` expands unsafe domains before constructing
    marks and hatch geometry; the default retains supplied domains for audits.
    """
    if kind not in KINDS:
        raise ValueError(f"Unsupported chart kind {kind!r}; expected one of {KINDS}")
    cfg = _plain(cfg)
    names = _series_names(kind, cfg)
    rows = _rows(kind, cfg, names)
    limits = {axis: _limits(cfg, axis, rows, kind) for axis in ("x", "y")}
    dual = kind in COMPOSITE_KINDS and bool(cfg.get("dual_y_axis"))
    if dual:
        limits["y2"] = _line_domain(rows)
    style = cfg.get("style", {})
    figsize = style.get("figsize", [8, 5.5])
    width, height = max(240, float(figsize[0]) * 72), max(180, float(figsize[1]) * 72)
    bbox = _native(cfg).get("axes_bbox_bottom_left")
    dpi = _native(cfg).get("dpi", style.get("dpi"))
    if fit_to_data and bbox and dpi and all(math.isfinite(float(v)) and float(v) > 0 for v in bbox[2:]):
        # Style lengths are in points. Use actual axes (not the entire figure)
        # in the same units to retain native text/marker-to-plot proportions.
        width, height = float(bbox[2]) * 72 / float(dpi), float(bbox[3]) * 72 / float(dpi)
    aspect = _native(cfg).get("aspect", "auto")
    equal_aspect = aspect == "equal" or isinstance(aspect, (int, float)) and aspect > 0
    if equal_aspect:
        unit_aspect = 1.0 if aspect == "equal" else float(aspect)
        height = width * abs((limits["y"][1] - limits["y"][0]) / (limits["x"][1] - limits["x"][0])) * unit_aspect
    layers = _main_layers(kind, cfg, rows, names, limits)
    layout_audit = None
    if fit_to_data:
        from plot_layout import fit_plot_layout
        limits, width, height, layout_audit = fit_plot_layout(
            kind, cfg, rows, limits, width, height, layers=layers)
    rows = visual_rows(kind, rows, x_reverse=limits["x"][0] > limits["x"][1],
                       y_reverse=limits["y"][0] > limits["y"][1])
    cfg["_series_order"] = first_seen(rows, "series_index")
    if not cfg.get("show_legend", kind.endswith("_n") or kind == "barv_stack"):
        for visible_index, source_index in enumerate(cfg["_series_order"]):
            names[source_index] = f"Series {visible_index + 1}"
        for row in rows:
            row["series_name"] = names[row["series_index"]]
    layers = _main_layers(kind, cfg, rows, names, limits)
    decoration, decoration_count = _hatch_layers(kind, cfg, rows, names, limits, width, height)
    layers.extend(decoration)
    label_layers = _data_label_layers(kind, cfg, rows, names, limits)
    layers.extend(label_layers)
    layers.extend(_reference_layers(kind, cfg, limits, width, height))
    if not layers:
        raise ValueError("Configuration contains no visible marks")
    if dual:
        _single_value_guides(layers)
    semantic = {
        "kind": kind,
        "x_mode": cfg.get("x_mode", "categorical" if kind.startswith("barv") or kind in COMPOSITE_KINDS else "numeric"),
        "y_mode": "categorical" if kind.startswith("barh") else "numeric",
        "grouping": "stacked" if kind == "barv_stack" else "grouped" if kind in {"barh_n", "barv_n", *COMPOSITE_KINDS} else "series",
        "stack_mode": cfg.get("stack_mode"),
        "category_order": first_seen(rows, "category_id") if "category_id" in rows[0] else [],
        "series_order": first_seen(rows, "series_id"),
        "table_order": "horizontal categories top-to-bottom; other categories/x left-to-right; groups follow positions, stacks top-to-bottom, lines retain series order"
        + ("; bar observations precede line observations" if kind in COMPOSITE_KINDS else ""),
        "source_identity": "row_id, point_index and series_index retain source identity after visual ordering",
        "coordinate_contract": "Explicit source positions; labelExpr supplies category/calendar labels; no implicit aggregation or restacking.",
        "equal_unit_aspect": bool(equal_aspect),
    }
    if cfg.get("x_mode") == "temporal":
        semantic["temporal_spacing"] = "equal calendar periods; x_temporal stores ISO period starts"
    if kind in COMPOSITE_KINDS:
        semantic["series_roles"] = list(cfg.get("series_roles", []))
        semantic["dual_y_axis"] = bool(cfg.get("dual_y_axis"))
        semantic["bar_family"] = cfg.get("bar_family")
        semantic["line_family"] = cfg.get("line_family")
        semantic["coupling"] = cfg.get("coupling")
    full = {
        "$schema": SCHEMA, "description": (
            f"VSR-inspired {kind}: complete observations and uncertainty with fitted plotting domains"
            if fit_to_data else f"VSR {kind}: faithful observations and source coordinate geometry"),
        "width": round(width, 3), "height": round(height, 3),
        "background": style.get("facecolor", "white"),
        "title": {"text": cfg.get("title", ""), "anchor": "start" if cfg.get("title_loc") == "left" else "middle",
                  "fontSize": style.get("title_size", 16), "fontWeight": cfg.get("title_weight", "normal"),
                  "fontStyle": cfg.get("title_style", "normal"), "color": style.get("text_color", "#222222"),
                  "offset": style.get("title_pad", 12)},
        "data": {"values": rows}, "layer": layers,
        "config": {"view": {"fill": style.get("axes_face", "white"), "stroke": None}},
        "usermeta": {"vsr_adapter_version": VERSION, "semantic": semantic},
    }
    if dual:
        ordered = {}
        for key, value in full.items():
            ordered[key] = value
            if key == "layer":
                ordered["resolve"] = {"scale": {"y": "independent"}}
        full = ordered
    full["usermeta"]["presentation"] = {"hatch_geometry_count": decoration_count, "source_dpi": style.get("dpi")}
    capability = [
        {"feature": "observations_and_identity", "status": "preserved", "detail": "One stable row_id per source observation; names are display labels, never grouping keys."},
        {"feature": "source_geometry", "status": "preserved", "detail": "Explicit grouped positions, stack endpoints, line order, numeric domains and optional error intervals."},
        {"feature": "native_styling", "status": "preserved", "detail": "Sampled colors, markers, line styles, fonts, grids and guide preferences are rendered directly with Vega-Lite."},
        {"feature": "render_time_axes", "status": "preserved" if _native(cfg) else "unavailable",
         "detail": "Explicit sampled axis settings used." if _native(cfg) else "Default axis settings derived from the supplied observations."},
    ]
    if decoration_count:
        capability.append({"feature": "hatches", "status": "approximate", "detail": "Deterministic clipped rule/symbol overlays; local decorative data is excluded from observation GT and compact specs."})
    if label_layers:
        capability.append({"feature": "data_labels", "status": "display_only", "detail": "Printed values annotate bars and/or line vertices in the full spec only; the semantic target keeps the same observations with or without them."})
    if cfg.get("x_mode") == "temporal":
        capability.append({"feature": "temporal_x", "status": "preserved", "detail": "Calendar labels and equal-period spacing preserved; ISO dates are metadata, not a fabricated elapsed-time scale."})
    if kind in COMPOSITE_KINDS:
        capability.append({"feature": "composite_roles", "status": "preserved", "detail": "series_role separates grouped bar observations from overlaid line observations sharing one categorical axis and one value axis."})
    source = {
        "adapter_version": VERSION, "kind": kind, "family": cfg.get("family"),
        "row_count": len(rows), "rows": copy.deepcopy(rows),
        "data_ori": [[r["series_name"], r["x"], r["y"]] if not kind.startswith("barh") else
                     [r["series_name"], r["category"], r["value"]] for r in rows],
        "series": [{"series_id": f"s{i:03d}", "series_index": i, "name": names[i]} for i in cfg["_series_order"]],
        "title": cfg.get("title", ""), "x_title": cfg.get("x_title", ""), "y_title": cfg.get("y_title", ""),
        "semantic": copy.deepcopy(semantic), "axes": {"x": {"limits": limits["x"], "title": cfg.get("x_title", "")},
                                        "y": {"limits": limits["y"], "title": cfg.get("y_title", "")}},
        "observation_fields": ["row_id", "row_index", "series_id", "series_name", "series_index", "point_index", "x", "y", "category_id", "category", "value"]
        + (["role"] if kind in COMPOSITE_KINDS else []),
        "derived_fields": ["plot_x", "plot_y", "plot_x0", "plot_x1", "plot_y0", "plot_y1", "plot_category", "category_lower", "category_upper", "value_lower", "value_upper", "error_lower", "error_upper", "x_temporal"],
        "capabilities": capability,
        "decorative_geometry": {"row_count": decoration_count, "data_label_layers": len(label_layers),
                                "included_in_observation_gt": False},
    }
    if layout_audit is not None:
        full['usermeta']['plot_layout'] = copy.deepcopy(layout_audit)
        source['plot_layout'] = copy.deepcopy(layout_audit)
        for item in capability:
            if item['feature'] == 'source_geometry':
                item.update(status='data_preserved_layout_fitted', detail='Source observation positions, stack and error endpoints preserved; plotting domains expand to include paint bounds.')
            elif item['feature'] == 'render_time_axes':
                item.update(status='adapted_for_visibility', detail='Native scales, inversion and guide choices retained; unsafe domain limits expanded before rendering.')
    full = format_spec(full)
    compact = normalize_geometry(full)
    return full, compact, source


def build_pair(kind: str, cfg: dict) -> tuple[dict, dict, dict]:
    """Render-ready full specification and minimal semantic training target."""
    from text_layout import apply_text_layout
    from presentation import apply_presentation
    full, _, source = build_geometry_pair(kind, cfg, fit_to_data=True)
    full['usermeta']['semantic_labels'] = {key: source[key] for key in ('title', 'x_title', 'y_title')}
    full = apply_text_layout(apply_presentation(full, cfg))
    source['presentation'] = copy.deepcopy(full['usermeta']['presentation'])
    source['plot_layout']['final_plot_size'] = [full['width'], full['height']]
    full['usermeta']['plot_layout']['final_plot_size'] = [full['width'], full['height']]
    full = format_spec(full)
    compact = normalize(full)
    source['training_contract'] = 'compact-v5: semantic values, identities, variables, relations and necessary order; presentation exists only in full/preview'
    return full, compact, source


_MARK_STYLE = {
    "color", "fill", "stroke", "opacity", "fillOpacity", "strokeOpacity", "strokeWidth",
    "strokeDash", "strokeDashOffset", "strokeCap", "strokeJoin", "strokeMiterLimit",
    "size", "thickness", "cornerRadius", "cornerRadiusTopLeft", "cornerRadiusTopRight",
    "cornerRadiusBottomLeft", "cornerRadiusBottomRight", "font", "fontSize", "fontStyle",
    "fontWeight", "align", "baseline", "dx", "dy", "tooltip", "cursor", "style",
}
_AXIS_STYLE = {
    "domain", "domainColor", "domainOpacity", "domainWidth", "domainDash", "domainDashOffset",
    "grid", "gridColor", "gridOpacity", "gridWidth", "gridDash", "gridDashOffset", "gridCap",
    "labelColor", "labelFont", "labelFontSize", "labelFontStyle", "labelFontWeight", "labelAngle",
    "labelAlign", "labelBaseline", "labelPadding", "labelLimit", "labelOpacity",
    "tickColor", "tickOpacity", "tickSize", "tickWidth", "tickDash", "tickDashOffset",
    "titleColor", "titleFont", "titleFontSize", "titleFontStyle", "titleFontWeight", "titlePadding",
    "titleLimit", "titleOpacity", "titleAlign", "titleAnchor", "titleAngle", "titleBaseline",
    "offset", "zindex", "minExtent", "maxExtent",
}
_LEGEND_STYLE = {
    "orient", "direction", "columns", "fillColor", "strokeColor", "cornerRadius", "padding",
    "offset", "columnPadding", "rowPadding", "gradientLength", "gradientThickness", "gradientStrokeColor",
    "labelColor", "labelFont", "labelFontSize", "labelFontStyle", "labelFontWeight", "labelLimit",
    "labelOpacity", "labelOffset", "titleColor", "titleFont", "titleFontSize", "titleFontStyle",
    "titleFontWeight", "titlePadding", "symbolFillColor", "symbolStrokeColor", "symbolSize",
    "symbolStrokeWidth", "symbolOpacity", "symbolOffset", "symbolType", "legendX", "legendY",
}


def normalize_geometry(full: dict) -> dict:
    """Remove presentation without editing observations or semantic structures.

    This is a context-aware projection, not recursive key deletion: a data column
    named ``color``/``title``/``size`` and a transform containing those names remain
    byte-for-byte equivalent Python values.  The projection is idempotent.
    """
    result = copy.deepcopy(full)
    keep_dimensions = bool(result.get("usermeta", {}).get("semantic", {}).get("equal_unit_aspect"))

    def clean_view(spec: dict) -> dict:
        for key in ("background", "padding", "autosize"):
            spec.pop(key, None)
        if not keep_dimensions:
            spec.pop("width", None)
            spec.pop("height", None)
        title = spec.get("title")
        if isinstance(title, dict):
            spec["title"] = {k: v for k, v in title.items() if k in {"text", "subtitle"}}
        if isinstance(spec.get("mark"), dict):
            spec["mark"] = {k: v for k, v in spec["mark"].items() if k not in _MARK_STYLE}
        for channel, definition in list(spec.get("encoding", {}).items()):
            if not isinstance(definition, dict):
                continue
            if channel in {"color", "fill", "stroke", "opacity", "size", "strokeWidth", "strokeDash"} and "value" in definition and "condition" not in definition:
                del spec["encoding"][channel]
                continue
            if isinstance(definition.get("axis"), dict):
                definition["axis"] = {k: v for k, v in definition["axis"].items() if k not in _AXIS_STYLE}
            if isinstance(definition.get("legend"), dict):
                definition["legend"] = {k: v for k, v in definition["legend"].items() if k not in _LEGEND_STYLE}
            if channel in {"color", "fill", "stroke", "shape", "size", "opacity", "strokeDash", "strokeWidth"} and isinstance(definition.get("scale"), dict):
                definition["scale"].pop("range", None)
                definition["scale"].pop("scheme", None)
        for key in ("layer", "hconcat", "vconcat", "concat"):
            if key in spec:
                spec[key] = [clean_view(child) for child in spec[key]
                             if not str(child.get("name", "")).startswith(DECORATION_PREFIX)]
        if "spec" in spec:
            spec["spec"] = clean_view(spec["spec"])
        config = spec.get("config")
        if isinstance(config, dict):
            for key in list(config):
                if key in {"background", "font", "padding", "autosize"}:
                    config.pop(key)
                    continue
                if not isinstance(config[key], dict):
                    continue
                remove = _AXIS_STYLE if key.startswith("axis") else _LEGEND_STYLE if key == "legend" else _MARK_STYLE
                config[key] = {k: v for k, v in config[key].items() if k not in remove}
                if not config[key]:
                    config.pop(key)
            if not config:
                spec.pop("config")
        metadata = spec.get("usermeta")
        if isinstance(metadata, dict):
            metadata.pop("presentation", None)
        return spec

    return format_spec(clean_view(result))


def normalize(full: dict) -> dict:
    """Canonical compact-v5 GT; internal geometry never enters the target."""
    from compact import normalize as semantic_normalize
    return semantic_normalize(full)
