"""Static sampling closure from official VSR 1fd0403: gen_barh_n.py.

Functions are verbatim source slices. Shared common functions and WORDS/FONT_POOL
are supplied by the per-sample runtime namespace; importing never samples or loads
assets. No renderer, I/O, CLI, or legacy module is imported.
"""


from __future__ import annotations


import random
import numpy as np


SOURCE_REVISION = '1fd040346add205ffbada9748273cad3bc9159e5'


SOURCE_FILE = 'chart_generation/gen_barh_n.py'


SAMPLER_FUNCTIONS = ('sample_category_count', 'sample_series_count', 'sample_category_label', 'sample_scale', 'base_curve', 'generate_matrix', 'reorder_categories', 'sample_config', 'finalize_matrix')


SAMPLER_CONSTANTS = ()


COMMON_FUNCTIONS = ('choose_weighted', 'human_round', 'maybe_int_or_float', 'padded_limits', 'sample_axis_title', 'sample_canvas', 'sample_label', 'sample_series_name', 'sample_title', 'series_color')


INJECTED_GLOBALS = ('FONT_POOL', 'WORDS', 'choose_weighted', 'human_round', 'maybe_int_or_float', 'padded_limits', 'sample_axis_title', 'sample_canvas', 'sample_label', 'sample_series_name', 'sample_title', 'series_color')


__all__ = ('sample_category_count', 'sample_series_count', 'sample_category_label', 'sample_scale', 'base_curve', 'generate_matrix', 'reorder_categories', 'sample_config', 'finalize_matrix')


def sample_category_count() -> int:
    low, high = choose_weighted(
        [(4, 6), (7, 9), (10, 12), (13, 16)],
        [0.27, 0.32, 0.25, 0.16],
    )
    return random.randint(low, high)


def sample_series_count() -> int:
    return choose_weighted([2, 3, 4, 5], [0.32, 0.33, 0.22, 0.13])


def sample_category_label() -> str:
    kind = choose_weighted(
        ["word", "phrase", "month", "quarter", "year", "hybrid", "numeric", "code", "compound", "abbr", "slug", "ordinal", "paired"],
        [0.15, 0.19, 0.10, 0.10, 0.08, 0.15, 0.06, 0.05, 0.04, 0.03, 0.03, 0.01, 0.01],
    )
    return sample_label(kind)


def sample_scale() -> float:
    return choose_weighted(
        [0.2, 0.6, 1.0, 2.0, 4.0, 8.0, 15.0, 30.0, 60.0],
        [0.04, 0.08, 0.18, 0.18, 0.16, 0.13, 0.10, 0.08, 0.05],
    ) * random.uniform(0.8, 1.25)


def base_curve(n: int, centered: bool = False) -> np.ndarray:
    t = np.linspace(0.0, 1.0, n)
    mode = choose_weighted(
        ["flat", "rise", "fall", "wave", "hump", "step"],
        [0.18, 0.22, 0.18, 0.18, 0.14, 0.10],
    )
    scale = sample_scale()

    if centered:
        baseline = np.zeros(n)
        if mode == "flat":
            curve = baseline + np.random.normal(0.0, scale * 0.10, n)
        elif mode == "rise":
            curve = (t - 0.5) * scale * 1.8
        elif mode == "fall":
            curve = (0.5 - t) * scale * 1.8
        elif mode == "wave":
            curve = np.sin(2 * np.pi * random.uniform(0.8, 2.0) * t + random.uniform(0, np.pi)) * scale * 0.9
        elif mode == "hump":
            curve = np.exp(-((t - 0.5) / random.uniform(0.18, 0.28)) ** 2) * scale - scale * 0.45
        else:
            step_at = random.randint(1, max(1, n - 2))
            curve = np.where(np.arange(n) >= step_at, scale * 0.9, -scale * 0.35)
        return curve

    if mode == "flat":
        curve = np.ones(n) * scale * random.uniform(0.75, 1.15)
    elif mode == "rise":
        curve = (0.7 + 1.2 * t) * scale
    elif mode == "fall":
        curve = (1.9 - 1.1 * t) * scale
    elif mode == "wave":
        curve = (1.0 + 0.25 * np.sin(2 * np.pi * random.uniform(0.8, 2.2) * t + random.uniform(0, np.pi))) * scale
    elif mode == "hump":
        curve = (0.7 + 0.7 * np.exp(-((t - 0.45) / random.uniform(0.18, 0.28)) ** 2)) * scale
    else:
        step_at = random.randint(1, max(1, n - 2))
        curve = np.where(np.arange(n) >= step_at, scale * 1.35, scale * 0.75)
    return curve


def generate_matrix(n_series: int, n_categories: int, family: str) -> np.ndarray:
    t = np.linspace(-1.0, 1.0, n_categories)
    centered = family == "signed"
    base = base_curve(n_categories, centered=centered)

    if family == "composition":
        total = np.maximum(base, 0) + sample_scale() * 0.2
        alpha = random.uniform(0.8, 2.2)
        columns = []
        for total_value in total:
            fractions = np.random.dirichlet(np.full(n_series, alpha))
            column = total_value * fractions
            if random.random() < 0.2:
                column += np.random.normal(0.0, max(total_value * 0.02, 0.02), n_series)
            column = np.clip(column, 0, None)
            if float(column.sum()) <= 0:
                column = np.full(n_series, total_value / n_series)
            columns.append(column)
        return np.array(columns).T

    matrix: list[np.ndarray] = []
    if family == "parallel":
        for _ in range(n_series):
            scale = random.uniform(0.84, 1.22)
            offset = float(base.mean()) * random.uniform(-0.12, 0.18)
            noise = np.random.normal(0.0, np.maximum(np.abs(base) * random.uniform(0.02, 0.06), sample_scale() * 0.012), n_categories)
            matrix.append(base * scale + offset + noise)
    elif family == "crossing":
        slopes = np.linspace(-0.95, 0.95, n_series) + np.random.normal(0.0, 0.12, n_series)
        central = float(np.abs(base).mean() or sample_scale())
        for slope in slopes:
            intercept = central * random.uniform(0.65, 1.35)
            noise = np.random.normal(0.0, central * random.uniform(0.03, 0.08), n_categories)
            series = intercept + slope * t * central * random.uniform(0.8, 1.6) + 0.25 * (base - float(base.mean())) + noise
            matrix.append(series)
    elif family == "dominant":
        dominant_idx = random.randrange(n_series)
        for s in range(n_series):
            if s == dominant_idx:
                scale = random.uniform(2.5, 5.5)
            else:
                scale = random.uniform(0.35, 1.05)
            offset = float(base.mean()) * random.uniform(-0.08, 0.12)
            noise = np.random.normal(0.0, np.maximum(np.abs(base) * random.uniform(0.02, 0.06), sample_scale() * 0.01), n_categories)
            matrix.append(base * scale + offset + noise)
    elif family == "mixed_scale":
        scales = sorted(random.uniform(0.55, 4.5) for _ in range(n_series))
        for scale in scales:
            offset = float(base.mean()) * random.uniform(-0.08, 0.12)
            noise = np.random.normal(0.0, np.maximum(np.abs(base) * random.uniform(0.02, 0.05), sample_scale() * 0.01), n_categories)
            matrix.append(base * scale + offset + noise)
    elif family == "sparse":
        for _ in range(n_series):
            scale = random.uniform(0.75, 1.45)
            series = base * scale + np.random.normal(0.0, np.maximum(np.abs(base) * random.uniform(0.02, 0.05), sample_scale() * 0.01), n_categories)
            mask = np.random.rand(n_categories) < random.uniform(0.18, 0.42)
            series = np.where(mask, 0.0, series)
            if random.random() < 0.25:
                spike_idx = random.randrange(n_categories)
                series[spike_idx] += sample_scale() * random.uniform(0.8, 3.0)
            matrix.append(series)
    elif family == "signed":
        center = sample_scale() * random.uniform(0.35, 0.9)
        base_centered = base_curve(n_categories, centered=True) * random.uniform(0.8, 1.3)
        for _ in range(n_series):
            offset = random.uniform(-center * 0.55, center * 0.55)
            slope = random.uniform(-1.0, 1.0)
            noise = np.random.normal(0.0, center * random.uniform(0.05, 0.12), n_categories)
            matrix.append(base_centered * random.uniform(0.6, 1.35) + slope * t * center * 0.9 + offset + noise)
    elif family == "alternating":
        center = sample_scale() * random.uniform(0.65, 1.5)
        shift = random.randint(0, 1)
        pattern = np.where((np.arange(n_categories) + shift) % 2 == 0, 1.0, -1.0)
        for s in range(n_series):
            scale = random.uniform(0.65, 1.35)
            offset = random.uniform(-0.25, 0.25) * center
            slope = random.uniform(-0.25, 0.25) * center
            noise = np.random.normal(0.0, center * random.uniform(0.03, 0.08), n_categories)
            matrix.append(pattern * center * random.uniform(0.45, 1.05) * scale + slope * t + offset + noise)
    elif family == "bimodal":
        centers = np.sort(np.random.uniform(-0.7, 0.7, 2))
        bump_width = random.uniform(0.18, 0.34)
        shape = np.zeros(n_categories)
        for center in centers:
            shape += np.exp(-((t - center) / bump_width) ** 2)
        shape /= max(float(shape.max()), 1e-6)
        for _ in range(n_series):
            scale = random.uniform(0.55, 1.55)
            offset = float(base.mean()) * random.uniform(-0.10, 0.14)
            series = shape * sample_scale() * random.uniform(0.9, 1.6) * scale + offset
            series += np.random.normal(0.0, sample_scale() * random.uniform(0.02, 0.06), n_categories)
            if random.random() < 0.30:
                series = np.roll(series, random.randint(-1, 1))
            matrix.append(series)
    elif family == "staircase":
        step_count = min(choose_weighted([2, 3, 4, 5], [0.24, 0.32, 0.26, 0.18]), n_categories)
        boundaries = sorted(random.sample(range(1, n_categories), step_count - 1)) if step_count > 1 else []
        sizes = []
        last = 0
        for boundary in boundaries + [n_categories]:
            sizes.append(boundary - last)
            last = boundary
        start_level = sample_scale() * random.uniform(0.35, 1.0)
        end_level = start_level + sample_scale() * random.uniform(0.8, 3.2)
        levels = np.linspace(start_level, end_level, step_count)
        if random.random() < 0.5:
            levels = levels[::-1]
        for _ in range(n_series):
            series: list[float] = []
            for level, size in zip(levels, sizes):
                block = np.ones(size) * level + np.random.normal(0.0, max(abs(level) * 0.05, sample_scale() * 0.015), size)
                series.extend(block.tolist())
            if len(series) < n_categories:
                series.extend([series[-1]] * (n_categories - len(series)))
            series = series[:n_categories]
            if random.random() < 0.26:
                series[random.randrange(n_categories)] += sample_scale() * random.uniform(0.8, 2.8)
            matrix.append(np.array(series))
    elif family == "plateau":
        left = sample_scale() * random.uniform(0.45, 1.05)
        plateau = left * random.uniform(1.4, 3.0)
        right = left * random.uniform(0.7, 1.4)
        start = random.randint(1, max(1, n_categories // 3))
        end = random.randint(max(start + 1, n_categories // 2), max(start + 1, n_categories - 1)) if n_categories > 2 else n_categories
        shape = np.interp(np.arange(n_categories), [0, start, max(start + 1, end - 1), n_categories - 1], [left, plateau, plateau, right])
        for _ in range(n_series):
            scale = random.uniform(0.65, 1.35)
            offset = float(base.mean()) * random.uniform(-0.10, 0.10)
            series = shape * scale + offset + np.random.normal(0.0, sample_scale() * random.uniform(0.02, 0.06), n_categories)
            if random.random() < 0.22:
                series[random.randrange(n_categories)] += sample_scale() * random.uniform(0.7, 2.2)
            matrix.append(series)
    else:
        return generate_matrix(n_series, n_categories, "parallel")

    return np.array(matrix)


def reorder_categories(labels: list[str], matrix: np.ndarray, family: str) -> tuple[list[str], np.ndarray]:
    totals = matrix.sum(axis=0)
    order = list(range(matrix.shape[1]))

    if family in {"parallel", "dominant"}:
        if random.random() < 0.35:
            order.sort(key=lambda idx: totals[idx], reverse=True)
    elif family == "crossing":
        if random.random() < 0.5:
            order.sort(key=lambda idx: matrix[0, idx], reverse=True)
    elif family == "mixed_scale":
        order.sort(key=lambda idx: abs(totals[idx]), reverse=random.random() < 0.5)
    elif family == "composition":
        if random.random() < 0.72:
            order.sort(key=lambda idx: totals[idx], reverse=True)
    elif family == "sparse":
        order.sort(key=lambda idx: (totals[idx] <= 0, abs(totals[idx])), reverse=False)
    elif family == "signed":
        if random.random() < 0.5:
            order.sort(key=lambda idx: (totals[idx] < 0, abs(totals[idx])))
    elif family == "alternating":
        pass
    elif family in {"bimodal", "staircase", "plateau"}:
        if random.random() < 0.45:
            order.sort(key=lambda idx: totals[idx], reverse=random.random() < 0.5)
        elif random.random() < 0.2:
            random.shuffle(order)
    else:
        if random.random() < 0.25:
            random.shuffle(order)

    labels_out = [labels[i] for i in order]
    matrix_out = matrix[:, order]
    return labels_out, matrix_out


def sample_config() -> dict:
    n_categories = sample_category_count()
    n_series = sample_series_count()
    family = choose_weighted(
        ["parallel", "crossing", "dominant", "mixed_scale", "composition", "sparse", "signed", "alternating", "bimodal", "staircase", "plateau"],
        [0.18, 0.15, 0.12, 0.11, 0.10, 0.08, 0.08, 0.08, 0.04, 0.03, 0.03],
    )

    labels = [sample_category_label() for _ in range(n_categories)]
    matrix = generate_matrix(n_series, n_categories, family)
    labels, matrix = reorder_categories(labels, matrix, family)

    style = sample_canvas("barh", series_count=n_series)
    fig_w, fig_h = style["figsize"]
    max_label_len = max((len(label) for label in labels), default=8)
    fig_w = min(max(fig_w, 6.8 + 0.12 * n_categories + 0.08 * max_label_len), 13.0)
    fig_h = min(max(fig_h, 4.8 + 0.20 * n_categories + 0.04 * max_label_len), 9.8)
    style["figsize"] = (fig_w, fig_h)

    group_height = random.uniform(0.68, 0.84)
    bar_height = group_height / (n_series + 0.25)
    offsets = [(i - (n_series - 1) / 2) * bar_height for i in range(n_series)]

    flat_values = [float(v) for v in matrix.flatten()]
    xlims = padded_limits(flat_values, include_zero=True, pad=(0.07, 0.18))
    if all(v >= 0 for v in flat_values):
        xlims = (0.0, xlims[1])
    if all(v <= 0 for v in flat_values):
        xlims = (xlims[0], 0.0)

    xerr = None
    error_kw = None
    if random.random() < 0.16:
        xerr = []
        for series in matrix:
            errs = [abs(v) * random.uniform(0.05, 0.14) + random.uniform(0.0, 0.25) for v in series]
            xerr.append(errs)
        error_kw = {
            "elinewidth": random.uniform(0.8, 1.5),
            "capthick": random.uniform(0.8, 1.5),
        }

    return {
        "font_path": random.choice(FONT_POOL),
        "style": style,
        "family": family,
        "n_series": n_series,
        "labels": labels,
        "matrix": finalize_matrix(matrix),
        "group_height": group_height,
        "bar_height": bar_height,
        "offsets": offsets,
        "x_title": sample_axis_title("y", "barh"),
        "y_title": sample_axis_title("x", "barh"),
        "title": sample_title("bar"),
        "title_loc": random.choice(["left", "center"]),
        "title_weight": choose_weighted(["normal", "bold"], [0.72, 0.28]),
        "title_style": choose_weighted(["normal", "italic"], [0.85, 0.15]),
        "series_names": [sample_series_name(i) for i in range(n_series)],
        "colors": [series_color(style["series_colors"], i) for i in range(n_series)],
        "edgecolors": [
            style["text_color"] if random.random() < 0.28 else series_color(style["series_colors"], i)
            for i in range(n_series)
        ],
        "alphas": [random.uniform(0.78, 0.98) for _ in range(n_series)],
        "hatches": [None if random.random() < 0.72 else random.choice(["/", "\\", "|", "-", "+", "x", "o", "O", ".", "*"]) for _ in range(n_series)],
        "xlims": xlims,
        "show_error": xerr is not None,
        "xerr": xerr,
        "error_kw": error_kw,
    }


def finalize_matrix(matrix: np.ndarray) -> list[list[float | int]]:
    out: list[list[float | int]] = []
    for row in matrix:
        series: list[float | int] = []
        for value in row:
            if abs(float(value)) < 1e-12:
                series.append(0)
                continue
            rounded = human_round(float(value))
            series.append(maybe_int_or_float(float(rounded)) if isinstance(rounded, float) else rounded)
        out.append(series)
    return out
