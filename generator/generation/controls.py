"""Supported chart families and explicit generation controls."""
from __future__ import annotations

KINDS = ("barh_1", "barh_n", "barv_1", "barv_n", "barv_stack", "line_1", "line_n", "scatter_1", "scatter_n")
COMPOSITE_KINDS = ("barline_n",)
KINDS = KINDS + COMPOSITE_KINDS
BAR_SINGLE_FAMILIES = ("balanced", "heavy_tail", "ordered", "signed_mix", "sparse", "log_spread", "clustered", "alternating", "bimodal", "staircase", "plateau")
BAR_MULTI_FAMILIES = ("parallel", "crossing", "dominant", "mixed_scale", "composition", "sparse", "signed", "alternating", "bimodal", "staircase", "plateau")
STACK_FAMILIES = ("balanced", "dominant", "sparse", "layered", "front_loaded", "back_loaded", "switchback", "fragmented")
LINE_FAMILIES = ("parallel_trend", "crossing", "oscillating", "piecewise", "random_walk", "spike_event", "decay", "seasonal", "mean_reverting", "logistic", "sawtooth")
SCATTER_FAMILIES = ("clustered", "multi_cluster", "correlated", "curved", "ring", "heteroskedastic", "fan", "stripe", "stepwise", "bimodal", "outliers", "spiral", "crescent", "grid", "bridge", "hourglass")
# A composite family names the two official families it composes, so every
# grouped-bar family can carry every line family on the shared category axis.
COMPOSITE_FAMILIES = tuple(f"{bar}+{line}" for bar in BAR_MULTI_FAMILIES for line in LINE_FAMILIES)
COUPLINGS = ("independent", "proportional", "residual", "percent_of_bar", "shared_trend", "offset_band")
BAR_SERIES_RANGE = (1, 4)
LINE_SERIES_RANGE = (1, 3)
SERIES_ROLES = ("bar", "line")
PROFILES = ("chromatic", "publication_clean", "colorful_analytic", "presentation_emphasis", "dashboard_dense", "monochrome_minimal", "editorial", "compact_report", "dark_contrast", "dense_scatter_family")
FAMILIES = {kind: (STACK_FAMILIES if kind == "barv_stack" else COMPOSITE_FAMILIES if kind == "barline_n" else BAR_SINGLE_FAMILIES if kind.startswith("bar") and kind.endswith("_1") else BAR_MULTI_FAMILIES if kind.startswith("bar") else LINE_FAMILIES if kind.startswith("line") else SCATTER_FAMILIES) for kind in KINDS}
HATCHES = (None, "/", "\\", "|", "-", "+", "x", "o", "O", ".", "*")
COMPOSITE_DIVERSITY_CONTROLS = {"x_axis_mode", "y_axis_mode", "x_tick_label_type", "y_tick_label_type", "show_markers"}


def normalize_controls(kind, controls):
    if kind not in KINDS:
        raise ValueError(f"Unknown chart type {kind!r}; expected one of {KINDS}")
    if controls is not None and not isinstance(controls, dict):
        raise ValueError("controls must be an object")
    c = dict(controls or {})
    for old, new in {"n_points": "point_count", "n_categories": "category_count", "n_series": "series_count", "style_profile": "profile"}.items():
        if old in c:
            if new in c and c[old] != c[new]:
                raise ValueError(f"Conflicting controls: {old} and {new}")
            c[new] = c.pop(old)
    accepted = {"point_count", "category_count", "series_count", "family", "x_mode", "stack_mode", "profile", "style", "show_error", "hatch", "max_attempts", "show_legend", "x_inverted", "y_inverted", "x_scale", "y_scale", "reference_lines", "bar_series_count", "line_series_count", "bar_family", "line_family", "coupling", "dual_y_axis", "y_axis_orient", "x_axis_orient", "axis_design", "y_title_right", "data_labels"}
    accepted |= COMPOSITE_DIVERSITY_CONTROLS
    unknown = set(c) - accepted
    if unknown:
        raise ValueError(f"Unknown generation controls: {sorted(unknown)}")
    if "family" in c and c["family"] not in FAMILIES[kind]:
        raise ValueError(f"Invalid family for {kind}: {c['family']!r}")
    if set(c) & COMPOSITE_DIVERSITY_CONTROLS:
        if kind not in COMPOSITE_KINDS:
            raise ValueError("Composite diversity controls apply only to barline_n")
        for axis in ("x", "y"):
            key = f"{axis}_axis_mode"
            if key in c and c[key] not in {"visible", "no_ticks", "no_labels", "hidden"}:
                raise ValueError(f"{key} must be visible/no_ticks/no_labels/hidden")
        for key, choices in (("x_tick_label_type", {"numbers", "dates", "text", "percent"}),
                             ("y_tick_label_type", {"numbers", "percent"})):
            if key in c and c[key] not in choices:
                raise ValueError(f"{key} must be one of {sorted(choices)}")
        if "show_markers" in c and not isinstance(c["show_markers"], bool):
            raise ValueError("show_markers must be a boolean")
    if kind == "barline_n":
        if "bar_family" in c and c["bar_family"] not in BAR_MULTI_FAMILIES:
            raise ValueError(f"Invalid bar family for {kind}: {c['bar_family']!r}")
        if "line_family" in c and c["line_family"] not in LINE_FAMILIES:
            raise ValueError(f"Invalid line family for {kind}: {c['line_family']!r}")
        if "coupling" in c and c["coupling"] not in COUPLINGS:
            raise ValueError(f"coupling must be one of {COUPLINGS}")
        if "dual_y_axis" in c and not isinstance(c["dual_y_axis"], bool):
            raise ValueError(f"{kind} requires dual_y_axis to be a boolean")
        if "y_axis_orient" in c and c["y_axis_orient"] not in {"left", "right"}:
            raise ValueError(f"{kind} requires y_axis_orient to be left/right")
        if "x_axis_orient" in c and c["x_axis_orient"] not in {"bottom", "top"}:
            raise ValueError(f"{kind} requires x_axis_orient to be bottom/top")
        if "y_title_right" in c and not isinstance(c["y_title_right"], str):
            raise ValueError(f"{kind} requires y_title_right to be a string")
        if "axis_design" in c:
            design = c["axis_design"]
            if not isinstance(design, dict):
                raise ValueError(f"{kind} requires axis_design to be an object")
            unknown = set(design) - {"y_tick_count", "y_tick_format", "y_axis_offset",
                                     "y_title_anchor", "x_title_anchor", "x_label_align"}
            if unknown:
                raise ValueError(f"Unknown axis_design keys: {sorted(unknown)}")
            count = design.get("y_tick_count")
            if count is not None and (isinstance(count, bool) or not isinstance(count, int) or not 2 <= count <= 12):
                raise ValueError(f"{kind} requires y_tick_count in [2, 12] or null")
            if design.get("y_tick_format") not in {None, "~s", ",~f"}:
                raise ValueError(f"{kind} requires y_tick_format to be null, ~s or ,~f")
            offset = design.get("y_axis_offset", 0)
            if isinstance(offset, bool) or not isinstance(offset, int) or not 0 <= offset <= 24:
                raise ValueError(f"{kind} requires y_axis_offset in [0, 24]")
            for key in ("y_title_anchor", "x_title_anchor"):
                if design.get(key) not in {None, "middle", "start", "end"}:
                    raise ValueError(f"{kind} requires {key} to be middle/start/end")
            if design.get("x_label_align") not in {None, "center", "left", "right"}:
                raise ValueError(f"{kind} requires x_label_align to be center/left/right")
        if "data_labels" in c:
            request = c["data_labels"]
            if isinstance(request, dict):
                unknown = set(request) - set(SERIES_ROLES)
                if unknown:
                    raise ValueError(f"Unknown data_labels keys: {sorted(unknown)}")
                if not request or any(not isinstance(value, bool) for value in request.values()):
                    raise ValueError(f"{kind} requires each data_labels role to be a boolean")
            elif request is not None and not isinstance(request, bool):
                raise ValueError(f"{kind} requires data_labels to be a boolean or an object of bar/line booleans")
        if "family" in c and ("bar_family" in c or "line_family" in c):
            bar_part, line_part = c["family"].split("+", 1)
            if c.get("bar_family", bar_part) != bar_part or c.get("line_family", line_part) != line_part:
                raise ValueError(f"family {c['family']!r} conflicts with bar_family/line_family")
        for key, (lo, hi) in (("bar_series_count", BAR_SERIES_RANGE), ("line_series_count", LINE_SERIES_RANGE)):
            if key in c and (isinstance(c[key], bool) or not isinstance(c[key], int) or not lo <= c[key] <= hi):
                raise ValueError(f"{kind} requires {key} in [{lo}, {hi}]")
        if "series_count" in c:
            counts = {key: c[key] for key in ("bar_series_count", "line_series_count") if key in c}
            if len(counts) == 2 and c["series_count"] != sum(counts.values()):
                raise ValueError("series_count must equal bar_series_count + line_series_count")
            elif len(counts) == 1:
                (key, value), = counts.items()
                other = "line_series_count" if key == "bar_series_count" else "bar_series_count"
                implied = c["series_count"] - value
                bounds = BAR_SERIES_RANGE if other == "bar_series_count" else LINE_SERIES_RANGE
                if not bounds[0] <= implied <= bounds[1]:
                    raise ValueError(f"series_count={c['series_count']} implies {other}={implied} outside {list(bounds)}")
    if "data_labels" in c and kind not in COMPOSITE_KINDS:
        raise ValueError(f"data_labels applies only to {COMPOSITE_KINDS}, not {kind}")
    if "category_count" in c and not kind.startswith("bar"):
        raise ValueError("category_count applies only to bar templates")
    if "point_count" in c and kind.startswith("bar"):
        raise ValueError("Use category_count for bar templates")
    for key in ("point_count", "category_count", "series_count", "max_attempts"):
        if key in c and (isinstance(c[key], bool) or not isinstance(c[key], int) or c[key] <= 0):
            raise ValueError(f"{key} must be a positive integer")
    if c.get("max_attempts", 1) > 10000:
        raise ValueError("max_attempts must be in [1, 10000]")
    if "series_count" in c:
        if kind.endswith("_1"):
            lo, hi = 1, 1
        elif kind in COMPOSITE_KINDS:
            lo, hi = BAR_SERIES_RANGE[0] + LINE_SERIES_RANGE[0], BAR_SERIES_RANGE[1] + LINE_SERIES_RANGE[1]
        else:
            lo, hi = 2, 6 if kind == "barv_stack" else 5
        if not lo <= c["series_count"] <= hi:
            raise ValueError(f"{kind} requires series_count in [{lo}, {hi}]")
    if kind == "scatter_n" and "point_count" in c:
        minimum = 4 * c.get("series_count", 2) + 4
        if not minimum <= c["point_count"] <= 48:
            raise ValueError(f"scatter_n point_count is the total across series and must be in [{minimum}, 48]")
    if "x_mode" in c and (not kind.startswith("line") or c["x_mode"] not in {"numeric", "categorical", "temporal"}):
        raise ValueError("x_mode is numeric/categorical/temporal and applies only to line templates")
    if "stack_mode" in c and (kind != "barv_stack" or c["stack_mode"] not in {"absolute", "percent"}):
        raise ValueError("stack_mode is absolute/percent and applies only to barv_stack")
    if "profile" in c and (c["profile"] not in PROFILES or (c["profile"] == "dense_scatter_family" and not kind.startswith("scatter"))):
        raise ValueError(f"Invalid profile for {kind}")
    if "show_error" in c and (not kind.startswith("bar") or kind == "barv_stack" or not isinstance(c["show_error"], bool)):
        raise ValueError("show_error is a boolean for non-stacked bars")
    if "hatch" in c and (not kind.startswith("bar") or c["hatch"] not in HATCHES):
        raise ValueError("hatch must be a supported bar pattern")
    if "style" in c and not isinstance(c["style"], dict):
        raise ValueError("style must be a dictionary of style overrides")
    for key in ("show_legend", "x_inverted", "y_inverted"):
        if key in c and not isinstance(c[key], bool):
            raise ValueError(f"{key} must be a boolean")
    for axis in ("x", "y"):
        if f"{axis}_scale" in c and c[f"{axis}_scale"] not in {"linear", "log", "symlog", "sqrt"}:
            raise ValueError(f"{axis}_scale must be linear, log, symlog or sqrt")
    if "reference_lines" in c:
        if not isinstance(c["reference_lines"], list):
            raise ValueError("reference_lines must be a list of {axis, value} objects")
        for ref in c["reference_lines"]:
            if not isinstance(ref, dict) or set(ref) != {"axis", "value"} or ref["axis"] not in {"x", "y"} or isinstance(ref["value"], bool) or not isinstance(ref["value"], (int, float)):
                raise ValueError("Each reference line requires axis x/y and numeric value")
    return c
