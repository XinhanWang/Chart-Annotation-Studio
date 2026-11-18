"""Composite sampler: grouped vertical bars with overlaid lines on one category axis.

Bar and line numbers come from the official VSR closures (``gen_barv_n`` and
``gen_line_n``), which ``vsr_runtime`` binds into sibling namespaces sharing this
sample's RNG stream. This module only composes them: it couples the line values
to the bar envelope, samples the composite presentation and returns one
configuration. Shared common functions and WORDS/FONT_POOL are supplied by the
per-sample runtime namespace; importing never samples or loads assets. No
renderer, I/O, CLI, or legacy module is imported.
"""


from __future__ import annotations


import random
import numpy as np


SOURCE_REVISION = 'native-composite/1.0'


SOURCE_FILE = 'generation/composites/barline_n.py'


SAMPLER_FUNCTIONS = ('sample_category_count', 'sample_bar_series_count', 'sample_line_series_count', 'sample_bar_family', 'sample_line_family', 'sample_coupling', 'bar_reference', 'couple_lines', 'fit_line_envelope', 'sample_dual_y_axis', 'sample_y_axis_orient', 'sample_x_axis_orient', 'sample_axis_design', 'sample_secondary_axis_title', 'label_format', 'sample_data_labels', 'sample_config')


SAMPLER_CONSTANTS = ('SECONDARY_TITLE_FALLBACKS', 'BAR_SERIES_CHOICES', 'BAR_SERIES_WEIGHTS', 'LINE_SERIES_CHOICES', 'LINE_SERIES_WEIGHTS', 'BAR_FAMILY_CHOICES', 'BAR_FAMILY_WEIGHTS', 'LINE_FAMILY_CHOICES', 'LINE_FAMILY_WEIGHTS', 'COUPLING_CHOICES', 'COUPLING_WEIGHTS', 'MARKER_CHOICES', 'MARKER_WEIGHTS', 'LINE_STYLE_CHOICES', 'HATCH_CHOICES', 'DATA_LABEL_MODES', 'DATA_LABEL_WEIGHTS', 'BAR_LABEL_POSITIONS', 'LINE_LABEL_POSITIONS', 'DATA_LABEL_COLORS', 'BAR_LABEL_DENSITY_LIMIT', 'LINE_LABEL_DENSITY_LIMIT', 'FORCED_LABEL_DENSITY_LIMIT')


COMMON_FUNCTIONS = ('choose_weighted', 'human_round', 'maybe_int_or_float', 'padded_limits', 'sample_axis_title', 'sample_canvas', 'sample_series_name', 'sample_title', 'series_color')


INJECTED_GLOBALS = ('FONT_POOL', 'SECONDARY_TITLE_FALLBACKS', 'WORDS', 'bar_finalize_matrix', 'bar_generate_matrix', 'bar_reorder_categories', 'bar_sample_category_label', 'choose_weighted', 'human_round', 'line_generate_matrix', 'maybe_int_or_float', 'padded_limits', 'sample_axis_title', 'sample_canvas', 'sample_series_name', 'sample_title', 'series_color')


__all__ = ('sample_category_count', 'sample_bar_series_count', 'sample_line_series_count', 'sample_bar_family', 'sample_line_family', 'sample_coupling', 'bar_reference', 'couple_lines', 'fit_line_envelope', 'sample_dual_y_axis', 'sample_y_axis_orient', 'sample_x_axis_orient', 'sample_axis_design', 'sample_secondary_axis_title', 'label_format', 'sample_data_labels', 'sample_config', 'BAR_SERIES_CHOICES', 'BAR_SERIES_WEIGHTS', 'LINE_SERIES_CHOICES', 'LINE_SERIES_WEIGHTS', 'BAR_FAMILY_CHOICES', 'BAR_FAMILY_WEIGHTS', 'LINE_FAMILY_CHOICES', 'LINE_FAMILY_WEIGHTS', 'COUPLING_CHOICES', 'COUPLING_WEIGHTS', 'MARKER_CHOICES', 'MARKER_WEIGHTS', 'LINE_STYLE_CHOICES', 'HATCH_CHOICES', 'DATA_LABEL_MODES', 'DATA_LABEL_WEIGHTS', 'BAR_LABEL_POSITIONS', 'LINE_LABEL_POSITIONS', 'DATA_LABEL_COLORS', 'BAR_LABEL_DENSITY_LIMIT', 'LINE_LABEL_DENSITY_LIMIT', 'FORCED_LABEL_DENSITY_LIMIT')


BAR_SERIES_CHOICES = [1, 2, 3, 4]
BAR_SERIES_WEIGHTS = [0.34, 0.33, 0.22, 0.11]
LINE_SERIES_CHOICES = [1, 2, 3]
LINE_SERIES_WEIGHTS = [0.56, 0.31, 0.13]
BAR_FAMILY_CHOICES = ["parallel", "crossing", "dominant", "mixed_scale", "composition", "sparse", "signed", "alternating", "bimodal", "staircase", "plateau"]
BAR_FAMILY_WEIGHTS = [0.18, 0.15, 0.12, 0.11, 0.10, 0.08, 0.08, 0.08, 0.04, 0.03, 0.03]
LINE_FAMILY_CHOICES = ["parallel_trend", "crossing", "oscillating", "piecewise", "random_walk", "spike_event", "decay", "seasonal", "mean_reverting", "logistic", "sawtooth"]
LINE_FAMILY_WEIGHTS = [0.16, 0.14, 0.13, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.03, 0.06]
COUPLING_CHOICES = ["independent", "proportional", "residual", "percent_of_bar", "shared_trend", "offset_band"]
COUPLING_WEIGHTS = [0.22, 0.20, 0.16, 0.14, 0.14, 0.14]
MARKER_CHOICES = [None, "o", "s", "^", "D", "v", "<", ">", "p", "*", "x", "."]
MARKER_WEIGHTS = [0.34, 0.18, 0.11, 0.09, 0.07, 0.07, 0.04, 0.03, 0.02, 0.02, 0.02, 0.01]
LINE_STYLE_CHOICES = ["-", "-", "-", "-", "--", "-.", ":"]
HATCH_CHOICES = ["/", "\\", "|", "-", "+", "x", "o", "O", ".", "*"]
# Printed values are display-only variety: some composites annotate their bars
# and/or line vertices, others stay clean. Density caps below keep one printed
# value per slot readable; an explicit control may relax them.
DATA_LABEL_MODES = [None, "bar", "line", "both"]
DATA_LABEL_WEIGHTS = [0.44, 0.19, 0.18, 0.19]
BAR_LABEL_POSITIONS = ["above", "inside"]
LINE_LABEL_POSITIONS = ["above", "below"]
DATA_LABEL_COLORS = ["text", "series", "contrast"]
BAR_LABEL_DENSITY_LIMIT = 24
LINE_LABEL_DENSITY_LIMIT = 24
FORCED_LABEL_DENSITY_LIMIT = 40


def sample_category_count() -> int:
    low, high = choose_weighted(
        [(4, 6), (7, 9), (10, 12), (13, 16)],
        [0.24, 0.31, 0.27, 0.18],
    )
    return random.randint(low, high)


def sample_bar_series_count() -> int:
    return choose_weighted(BAR_SERIES_CHOICES, BAR_SERIES_WEIGHTS)


def sample_line_series_count() -> int:
    return choose_weighted(LINE_SERIES_CHOICES, LINE_SERIES_WEIGHTS)


def sample_bar_family() -> str:
    return choose_weighted(BAR_FAMILY_CHOICES, BAR_FAMILY_WEIGHTS)


def sample_line_family() -> str:
    return choose_weighted(LINE_FAMILY_CHOICES, LINE_FAMILY_WEIGHTS)


def sample_coupling() -> str:
    return choose_weighted(COUPLING_CHOICES, COUPLING_WEIGHTS)


def bar_reference(bar_matrix: np.ndarray) -> np.ndarray:
    """Collapse the bar series into the per-category signal lines relate to.

    Every mode reduces one category to a value of the bars' own magnitude, so a
    coupled line can never inherit an aggregate scale (a sum over four bar
    series, say) that would squash the bars on the shared value axis. Dispersion
    modes need at least two series; a single bar series references itself.
    """
    mode = choose_weighted(["mean", "max", "min", "range", "series"], [0.32, 0.18, 0.14, 0.16, 0.20])
    if mode == "series" or bar_matrix.shape[0] < 2:
        return bar_matrix[random.randrange(bar_matrix.shape[0])]
    if mode == "mean":
        return bar_matrix.mean(axis=0)
    if mode == "max":
        return bar_matrix.max(axis=0)
    if mode == "min":
        return bar_matrix.min(axis=0)
    return bar_matrix.max(axis=0) - bar_matrix.min(axis=0)


def fit_line_envelope(rows: list[np.ndarray], center: float, spread: float) -> np.ndarray:
    """One shared affine map keeps every line readable against the bars.

    Affine maps preserve each coupling's shape (proportionality, residuals,
    ranks, ratios and bands are all invariant up to scale/shift), so the
    relation between bars and lines survives while the shared value axis stays
    legible. ``center``/``spread`` come from the bars, so they alone decide where
    the lines sit; a small per-series jitter separates multiple lines again.
    """
    stacked = np.asarray(rows, dtype=float)
    span = float(stacked.max() - stacked.min())
    if not np.isfinite(span) or span <= 0:
        span = 1.0
    # Couplings are stated on their own scale (percent_of_bar is a 0-100 share),
    # so drop that raw level before scaling: only `offset` may place the lines.
    factor = spread * random.uniform(0.80, 1.40) / span
    offset = center + spread * random.uniform(-0.45, 0.65)
    out = []
    for row in stacked - float(stacked.mean()):
        jitter = spread * random.uniform(-0.12, 0.12) if len(rows) > 1 else 0.0
        out.append(row * factor + offset + jitter)
    return np.array(out)


def couple_lines(bar_matrix: np.ndarray, line_matrix: np.ndarray, coupling: str) -> np.ndarray:
    """Give the line series an explicit statistical relation to the bars."""
    bar_matrix = np.asarray(bar_matrix, dtype=float)
    line_matrix = np.asarray(line_matrix, dtype=float)
    n_line, n_points = line_matrix.shape
    reference = bar_reference(bar_matrix)
    # Anchor the envelope on the bars, not on `reference` (whose magnitude
    # depends on the reduction mode): the reference supplies the coupling shape
    # only, so lines always live inside the bars' own value range.
    center = float(bar_matrix.mean())
    spread = float(np.abs(bar_matrix - center).max())
    if not np.isfinite(spread) or spread <= 0:
        spread = max(abs(center), 1.0)
    noise = lambda low, high: np.random.normal(0.0, spread * random.uniform(low, high), n_points)

    raw: list[np.ndarray] = []
    for row in line_matrix:
        if coupling == "proportional":
            slope = random.uniform(0.35, 1.45) * (random.choice([-1.0, 1.0]) if random.random() < 0.18 else 1.0)
            raw.append(slope * reference + center * (1 - slope) + noise(0.02, 0.10))
        elif coupling == "residual":
            half = random.randint(1, max(1, min(n_points // 2, 3)))
            window = 2 * half + 1
            padded = np.concatenate((np.full(half, reference[0]), reference, np.full(half, reference[-1])))
            smooth = np.convolve(padded, np.ones(window) / window, mode="valid")
            raw.append((reference - smooth[:n_points]) * random.uniform(0.8, 2.4) + noise(0.0, 0.05))
        elif coupling == "percent_of_bar":
            total = bar_matrix.sum(axis=0)
            picked = bar_matrix[random.randrange(bar_matrix.shape[0])]
            usable = np.abs(total) > 1e-9
            share = np.where(usable, 100.0 * picked / np.where(usable, total, 1.0), 0.0)
            raw.append(share + np.random.normal(0.0, random.uniform(0.2, 1.5), n_points))
        elif coupling == "shared_trend":
            ranks = np.empty(n_points, dtype=float)
            ranks[np.argsort(reference)] = np.arange(n_points)
            raw.append(ranks - (n_points - 1) / 2 + noise(0.02, 0.10))
        elif coupling == "offset_band":
            factor = random.uniform(0.70, 1.30)
            band = spread * random.uniform(0.25, 0.85) * random.choice([-1.0, 1.0])
            raw.append(factor * reference + center * (1 - factor) + band + noise(0.0, 0.04))
        else:
            raw.append(row)
    return fit_line_envelope(raw, center, spread)


def sample_dual_y_axis() -> bool:
    """Lines on an independent right-hand value axis, bars on the left one."""
    return random.random() < 0.30


def sample_y_axis_orient() -> str:
    return "right" if random.random() < 0.12 else "left"


def sample_x_axis_orient() -> str:
    return "top" if random.random() < 0.12 else "bottom"


def sample_axis_design() -> dict:
    """Tick density, label formats and axis furniture; display-only variety."""
    return {
        "y_tick_count": choose_weighted([None, 4, 6, 8, 10], [0.45, 0.13, 0.16, 0.14, 0.12]),
        "y_tick_format": choose_weighted([None, "~s", ",~f"], [0.72, 0.14, 0.14]),
        "y_axis_offset": choose_weighted([0, 4, 8, 12], [0.60, 0.18, 0.12, 0.10]),
        "y_title_anchor": choose_weighted(["middle", "start", "end"], [0.60, 0.25, 0.15]),
        "x_title_anchor": choose_weighted(["middle", "start", "end"], [0.60, 0.25, 0.15]),
        "x_label_align": choose_weighted([None, "center", "left", "right"], [0.55, 0.15, 0.15, 0.15]),
    }


SECONDARY_TITLE_FALLBACKS = ("Value", "Rate", "Index", "Ratio", "Delta", "Score", "Share")


def sample_secondary_axis_title() -> str:
    """Name the independent right-hand value axis.

    A secondary axis is only readable when it labels its own unit, so the
    shared title sampler's occasional ``None`` is replaced by a plain name.
    """
    return sample_axis_title("y", "line") or random.choice(SECONDARY_TITLE_FALLBACKS)


def label_format(values) -> str:
    """Pick a short d3 format so a printed value stays inside its own slot.

    Significant-digit formats keep the magnitude readable without switching to
    exponent notation for the values composites actually produce.
    """
    magnitude = max([abs(float(value)) for value in values] or [0.0])
    if magnitude >= 1000:
        return choose_weighted([".0f", ",.0f"], [0.62, 0.38])
    if magnitude >= 100:
        return choose_weighted([".0f", ".1f", ",.0f", ".4~g"], [0.40, 0.24, 0.20, 0.16])
    if magnitude >= 10:
        return choose_weighted([".1f", ".0f", ".4~g"], [0.46, 0.28, 0.26])
    if magnitude >= 1:
        return choose_weighted([".2f", ".1f", ".3~g"], [0.40, 0.34, 0.26])
    return choose_weighted([".3~g", ".2f"], [0.62, 0.38])


def _printed_length(value: float, fmt: str) -> int:
    """Approximate glyph count of one d3-formatted value."""
    if fmt in (None, ""):
        text = str(value)
    elif fmt == ".0f":
        text = f"{value:.0f}"
    elif fmt == ",.0f":
        text = f"{value:,.0f}"
    elif fmt == ".1f":
        text = f"{value:.1f}"
    elif fmt == ",.1f":
        text = f"{value:,.1f}"
    elif fmt == ".2f":
        text = f"{value:.2f}"
    elif fmt == ".3~g":
        text = f"{value:.3g}"
    elif fmt == ".4~g":
        text = f"{value:.4g}"
    else:
        text = str(value)
    return len(text)


def _label_size(values, fmt: str, slot_px: float, preferred: float):
    """Preferred font, capped by the widest printed value's own slot."""
    longest = max([_printed_length(float(value), fmt) for value in values] or [1])
    roomiest = None
    for size in (10.6, 9.6, 8.6, 7.6, 6.6):
        if 0.62 * size * longest + 2 <= slot_px:
            roomiest = size
            break
    if roomiest is None:
        return None
    return min(preferred, roomiest)


def sample_data_labels(n_categories: int, n_bar: int, n_line: int, matrix, ylim,
                       fig_w: float, group_width: float, request=None):
    """Sample printed value labels for the bars and/or the line vertices.

    Returns None when the chart stays unannotated. Labels are presentation: the
    semantic target keeps the observations either way, so the same data renders
    labelled or clean. Font sizes shrink to the slot a value occupies, and an
    explicit ``request`` may relax the density caps but never the slot width.
    """
    mode = choose_weighted(DATA_LABEL_MODES, DATA_LABEL_WEIGHTS)
    wanted = {"bar": mode in ("bar", "both"), "line": mode in ("line", "both")}
    forced = set()
    if request is False:
        return None
    if request is True:
        if not any(wanted.values()):
            wanted = {"bar": True, "line": True}
        forced = {role for role, on in wanted.items() if on}
    elif isinstance(request, dict):
        unknown = set(request) - {"bar", "line"}
        if unknown:
            raise ValueError(f"data_labels accepts only bar/line keys, got {sorted(unknown)}")
        if any(not isinstance(value, bool) for value in request.values()):
            raise ValueError("data_labels roles must be booleans")
        wanted.update(request)
        forced = {role for role, value in request.items() if value}
    elif request is not None:
        raise ValueError("data_labels must be a boolean or an object of bar/line booleans")

    values = np.asarray(matrix, dtype=float)
    bar_values = [float(value) for value in values[:n_bar].flatten()]
    line_values = [float(value) for value in values[n_bar:].flatten()]
    span = float(ylim[1]) - float(ylim[0]) or 1.0
    # An inside label needs a bar taller than the glyph it carries.
    inside_fits = min([abs(value) for value in bar_values] or [0.0]) >= 0.22 * span
    caps = {"bar": BAR_LABEL_DENSITY_LIMIT, "line": LINE_LABEL_DENSITY_LIMIT}
    for role in forced:
        caps[role] = FORCED_LABEL_DENSITY_LIMIT
    if n_categories * n_bar > caps["bar"]:
        wanted["bar"] = False
    if n_categories * n_line > caps["line"]:
        wanted["line"] = False
    plot_width = float(fig_w) * 72
    bar_slot = plot_width * float(group_width) / max(1, n_categories * n_bar)
    line_slot = plot_width / max(1, n_categories * n_line)

    result = {}
    if wanted["bar"]:
        fmt = label_format(bar_values)
        size = _label_size(bar_values, fmt, bar_slot, random.uniform(7.6, 10.6))
        if size is not None:
            position = choose_weighted(BAR_LABEL_POSITIONS, [0.62, 0.38]) if inside_fits else "above"
            # Contrast ink only works on the bar fill itself; outside the bar a
            # label sits on the plot background and uses theme or series ink.
            color = "contrast" if position == "inside" else choose_weighted(DATA_LABEL_COLORS[:2], [0.62, 0.38])
            result["bar"] = {
                "position": position,
                "format": fmt,
                "size": round(size, 2),
                "color": color,
                "weight": choose_weighted(["normal", "bold"], [0.72, 0.28]),
            }
    if wanted["line"]:
        fmt = label_format(line_values)
        size = _label_size(line_values, fmt, line_slot, random.uniform(7.6, 10.6))
        if size is not None:
            result["line"] = {
                "position": choose_weighted(LINE_LABEL_POSITIONS, [0.66, 0.34]),
                "format": fmt,
                "size": round(size, 2),
                "color": choose_weighted(DATA_LABEL_COLORS[:2], [0.56, 0.44]),
                "weight": choose_weighted(["normal", "bold"], [0.70, 0.30]),
            }
    return result or None


def sample_config() -> dict:
    n_categories = sample_category_count()
    n_bar = sample_bar_series_count()
    n_line = sample_line_series_count()
    n_series = n_bar + n_line
    bar_family = sample_bar_family()
    line_family = sample_line_family()
    coupling = sample_coupling()

    labels = [bar_sample_category_label() for _ in range(n_categories)]
    bar_matrix = bar_generate_matrix(n_bar, n_categories, bar_family)
    labels, bar_matrix = bar_reorder_categories(labels, bar_matrix, bar_family)
    line_matrix = couple_lines(bar_matrix, line_generate_matrix(n_line, n_categories, line_family), coupling)
    matrix = bar_finalize_matrix(np.vstack((np.asarray(bar_matrix, dtype=float), line_matrix)))

    title_kind = random.choice(["bar", "line"])
    style = sample_canvas(random.choice(["barv", "line"]), series_count=n_series)
    fig_w, fig_h = style["figsize"]
    max_label_len = max((len(label) for label in labels), default=8)
    fig_w = min(max(fig_w, 6.2 + 0.18 * n_categories + 0.05 * max_label_len), 12.0)
    fig_h = min(max(fig_h, 4.8 + 0.10 * n_series), 8.4)
    style["figsize"] = (fig_w, fig_h)

    group_width = random.uniform(0.62, 0.82)
    bar_width = group_width / (n_bar + 0.25)
    offsets = [(i - (n_bar - 1) / 2) * bar_width for i in range(n_bar)]

    flat_values = [float(v) for v in np.asarray(matrix, dtype=float).flatten()]
    ylim = padded_limits(flat_values, include_zero=True, pad=(0.07, 0.18))
    if all(v >= 0 for v in flat_values):
        ylim = (0.0, ylim[1])
    if all(v <= 0 for v in flat_values):
        ylim = (ylim[0], 0.0)

    if n_categories > 8 or max_label_len > 8:
        x_rotation = choose_weighted([20, 30, 40, 50, 60], [0.14, 0.22, 0.24, 0.22, 0.18])
    else:
        x_rotation = choose_weighted([0, 10, 15, 25], [0.34, 0.22, 0.22, 0.22])
    x_ha = "center" if x_rotation == 0 else "right"

    dual_y_axis = sample_dual_y_axis()
    y_axis_orient = "left" if dual_y_axis else sample_y_axis_orient()
    x_axis_orient = sample_x_axis_orient()
    axis_design = sample_axis_design()
    if x_rotation != 0:
        # Rotated labels keep the rotation-driven alignment; a second align
        # choice would fight it.
        axis_design["x_label_align"] = None

    yerr = None
    error_kw = None
    capsize = None
    if random.random() < 0.18:
        yerr = [[abs(v) * random.uniform(0.05, 0.14) + random.uniform(0.0, 0.25) for v in row] for row in matrix[:n_bar]]
        error_kw = {"elinewidth": random.uniform(0.8, 1.5), "capthick": random.uniform(0.8, 1.5)}
        capsize = random.randint(2, 5)

    markers, linestyles, marker_sizes, markevery, widths = [], [], [], [], []
    for _ in range(n_bar):
        markers.append(None)
        linestyles.append(None)
        marker_sizes.append(None)
        markevery.append(None)
        widths.append(None)
    for _ in range(n_line):
        marker = choose_weighted(MARKER_CHOICES, MARKER_WEIGHTS)
        markers.append(marker)
        linestyles.append(random.choice(LINE_STYLE_CHOICES))
        marker_sizes.append(random.uniform(4.0, 8.5))
        markevery.append(None if marker is None or n_categories <= 9 else random.randint(2, 4))
        widths.append(random.uniform(1.35, 2.6))

    data_labels = sample_data_labels(n_categories, n_bar, n_line, matrix, ylim, fig_w, group_width)

    colors = [series_color(style["series_colors"], i) for i in range(n_series)]
    return {
        "font_path": random.choice(FONT_POOL),
        "style": style,
        "family": f"{bar_family}+{line_family}",
        "bar_family": bar_family,
        "line_family": line_family,
        "coupling": coupling,
        "x_mode": "categorical",
        "dual_y_axis": dual_y_axis,
        "y_axis_orient": y_axis_orient,
        "x_axis_orient": x_axis_orient,
        "axis_design": axis_design,
        "data_labels": data_labels,
        "y_title_right": sample_secondary_axis_title() if dual_y_axis else None,
        "n_series": n_series,
        "n_bar_series": n_bar,
        "n_line_series": n_line,
        "series_roles": ["bar"] * n_bar + ["line"] * n_line,
        "labels": labels,
        "matrix": matrix,
        "group_width": group_width,
        "bar_width": bar_width,
        "offsets": offsets,
        "x_title": sample_axis_title("x", title_kind),
        "y_title": sample_axis_title("y", title_kind),
        "title": sample_title(title_kind),
        "title_loc": random.choice(["left", "center"]),
        "title_weight": choose_weighted(["normal", "bold"], [0.72, 0.28]),
        "title_style": choose_weighted(["normal", "italic"], [0.85, 0.15]),
        "series_names": [sample_series_name(i) for i in range(n_series)],
        "colors": colors,
        "edgecolors": [
            style["text_color"] if random.random() < 0.28 else colors[i]
            for i in range(n_series)
        ],
        "alphas": [random.uniform(0.78, 0.98) for _ in range(n_series)],
        "hatches": [None if random.random() < 0.72 else random.choice(HATCH_CHOICES) for _ in range(n_bar)] + [None] * n_line,
        "markers": markers,
        "linestyles": linestyles,
        "marker_sizes": marker_sizes,
        "markevery": markevery,
        "widths": widths,
        "linewidths": [random.uniform(0.6, 1.6) for _ in range(n_bar)] + widths[n_bar:],
        "ylims": ylim,
        "x_rotation": x_rotation,
        "x_ha": x_ha,
        "grid_axis": choose_weighted(["y", "both", "x"], [0.56, 0.30, 0.14]),
        "show_legend": random.random() >= 0.32,
        "show_error": yerr is not None,
        "yerr": yerr,
        "error_kw": error_kw,
        "capsize": capsize,
    }
