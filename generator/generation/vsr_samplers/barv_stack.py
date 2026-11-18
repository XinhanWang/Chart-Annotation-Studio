"""Static sampling closure from official VSR 1fd0403: gen_barv_stack.py.

Functions are verbatim source slices. Shared common functions and WORDS/FONT_POOL
are supplied by the per-sample runtime namespace; importing never samples or loads
assets. No renderer, I/O, CLI, or legacy module is imported.
"""


from __future__ import annotations


import random
import numpy as np


SOURCE_REVISION = '1fd040346add205ffbada9748273cad3bc9159e5'


SOURCE_FILE = 'chart_generation/gen_barv_stack.py'


SAMPLER_FUNCTIONS = ('sample_category_count', 'sample_category_label', 'sample_scale', 'base_curve', 'sample_stack_family', 'sample_stack_mode', 'generate_stack_matrix', 'reorder_stack_categories', 'sample_config', 'finalize_matrix')


SAMPLER_CONSTANTS = ()


COMMON_FUNCTIONS = ('choose_weighted', 'human_round', 'maybe_int_or_float', 'padded_limits', 'sample_axis_title', 'sample_canvas', 'sample_label', 'sample_series_name', 'sample_title', 'series_color')


INJECTED_GLOBALS = ('FONT_POOL', 'WORDS', 'choose_weighted', 'human_round', 'maybe_int_or_float', 'padded_limits', 'sample_axis_title', 'sample_canvas', 'sample_label', 'sample_series_name', 'sample_title', 'series_color')


__all__ = ('sample_category_count', 'sample_category_label', 'sample_scale', 'base_curve', 'sample_stack_family', 'sample_stack_mode', 'generate_stack_matrix', 'reorder_stack_categories', 'sample_config', 'finalize_matrix')


def sample_category_count() -> int:
    low, high = choose_weighted(
        [(4, 6), (7, 9), (10, 12), (13, 16)],
        [0.27, 0.32, 0.25, 0.16],
    )
    return random.randint(low, high)


def sample_category_label() -> str:
    kind = choose_weighted(
        ["word", "phrase", "month", "quarter", "year", "hybrid", "numeric", "code", "compound", "abbr", "slug", "ordinal", "paired"],
        [0.16, 0.17, 0.14, 0.11, 0.09, 0.15, 0.06, 0.05, 0.04, 0.03, 0.03, 0.01, 0.01],
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


def sample_stack_family() -> str:
    return choose_weighted(
        ["balanced", "dominant", "sparse", "layered", "front_loaded", "back_loaded", "switchback", "fragmented"],
        [0.24, 0.20, 0.14, 0.16, 0.09, 0.07, 0.05, 0.05],
    )


def sample_stack_mode() -> str:
    return choose_weighted(["absolute", "percent"], [0.72, 0.28])


def generate_stack_matrix(n_series: int, n_categories: int, family: str, mode: str) -> np.ndarray:
    totals = np.abs(base_curve(n_categories, centered=False))
    totals += sample_scale() * random.uniform(0.15, 0.55)
    if mode == "percent":
        totals = np.ones(n_categories, dtype=float) * 100.0
    else:
        if random.random() < 0.45:
            totals = totals * np.linspace(random.uniform(0.75, 0.95), random.uniform(1.05, 1.55), n_categories)
        if random.random() < 0.25:
            totals = totals[::-1]

    if family == "layered":
        start = np.random.dirichlet(np.full(n_series, random.uniform(0.9, 2.0)))
        end = np.random.dirichlet(np.full(n_series, random.uniform(0.9, 2.0)))
        matrix: list[np.ndarray] = []
        for idx, total in enumerate(totals):
            t = idx / max(1, n_categories - 1)
            fractions = (1.0 - t) * start + t * end
            fractions += np.random.normal(0.0, random.uniform(0.01, 0.05), n_series)
            fractions = np.clip(fractions, 0, None)
            if float(fractions.sum()) <= 0:
                fractions = np.full(n_series, 1.0 / n_series)
            fractions /= fractions.sum()
            matrix.append(fractions * total)
        return np.array(matrix).T

    if family == "front_loaded":
        start_alpha = np.linspace(2.4, 0.7, n_series)
        end_alpha = np.linspace(0.7, 1.8, n_series)
        matrix = []
        for idx, total in enumerate(totals):
            mix = idx / max(1, n_categories - 1)
            alpha = (1.0 - mix) * start_alpha + mix * end_alpha
            alpha = np.clip(alpha * random.uniform(0.85, 1.25), 0.18, None)
            fractions = np.random.dirichlet(alpha)
            if random.random() < 0.18:
                fractions[random.randrange(n_series)] += random.uniform(0.05, 0.18)
                fractions = np.clip(fractions, 0, None)
                fractions /= fractions.sum()
            matrix.append(fractions * total)
        return np.array(matrix).T

    if family == "back_loaded":
        start_alpha = np.linspace(0.7, 1.8, n_series)
        end_alpha = np.linspace(2.4, 0.7, n_series)
        matrix = []
        for idx, total in enumerate(totals):
            mix = idx / max(1, n_categories - 1)
            alpha = (1.0 - mix) * start_alpha + mix * end_alpha
            alpha = np.clip(alpha * random.uniform(0.85, 1.25), 0.18, None)
            fractions = np.random.dirichlet(alpha)
            if random.random() < 0.18:
                fractions[random.randrange(n_series)] += random.uniform(0.05, 0.18)
                fractions = np.clip(fractions, 0, None)
                fractions /= fractions.sum()
            matrix.append(fractions * total)
        return np.array(matrix).T

    if family == "switchback":
        start_alpha = np.linspace(2.0, 0.8, n_series)
        mid_alpha = np.roll(start_alpha[::-1], 1)
        end_alpha = np.linspace(0.8, 2.0, n_series)
        matrix = []
        for idx, total in enumerate(totals):
            mix = idx / max(1, n_categories - 1)
            if mix < 0.5:
                alpha = (1.0 - mix * 2.0) * start_alpha + (mix * 2.0) * mid_alpha
            else:
                alpha = (1.0 - (mix - 0.5) * 2.0) * mid_alpha + ((mix - 0.5) * 2.0) * end_alpha
            alpha = np.clip(alpha * random.uniform(0.85, 1.20), 0.18, None)
            fractions = np.random.dirichlet(alpha)
            if random.random() < 0.22:
                pivot = random.randrange(n_series)
                fractions[pivot] += random.uniform(0.06, 0.20)
                fractions = np.clip(fractions, 0, None)
                fractions /= fractions.sum()
            matrix.append(fractions * total)
        return np.array(matrix).T

    if family == "fragmented":
        matrix = []
        for total in totals:
            alpha = random.uniform(0.35, 0.95)
            fractions = np.random.dirichlet(np.full(n_series, alpha))
            mask = np.random.rand(n_series) < random.uniform(0.30, 0.65)
            if mask.any():
                fractions = fractions * mask
            if float(fractions.sum()) <= 0:
                fractions[random.randrange(n_series)] = 1.0
            fractions = fractions / fractions.sum()
            if random.random() < 0.38:
                fractions[random.randrange(n_series)] += random.uniform(0.10, 0.28)
                fractions = np.clip(fractions, 0, None)
                fractions /= fractions.sum()
            column = total * fractions
            if random.random() < 0.22:
                column += np.random.normal(0.0, max(float(total) * 0.01, 0.01), n_series)
                column = np.clip(column, 0, None)
            matrix.append(column)
        return np.array(matrix).T

    matrix = []
    for total in totals:
        if family == "balanced":
            alpha = random.uniform(1.5, 3.6)
            fractions = np.random.dirichlet(np.full(n_series, alpha))
        elif family == "dominant":
            alpha = random.uniform(0.40, 0.95)
            fractions = np.random.dirichlet(np.full(n_series, alpha))
            dominant_idx = random.randrange(n_series)
            fractions[dominant_idx] += random.uniform(0.20, 0.55)
            if random.random() < 0.34:
                fractions[random.randrange(n_series)] *= random.uniform(0.20, 0.60)
            fractions = np.clip(fractions, 0, None)
            fractions /= fractions.sum()
        else:
            alpha = random.uniform(0.35, 0.90)
            fractions = np.random.dirichlet(np.full(n_series, alpha))
            mask = np.random.rand(n_series) < random.uniform(0.45, 0.75)
            if mask.any():
                fractions = fractions * mask
            if float(fractions.sum()) <= 0:
                fractions[random.randrange(n_series)] = 1.0
            fractions = fractions / fractions.sum()
            if random.random() < 0.28:
                fractions[random.randrange(n_series)] += random.uniform(0.08, 0.22)
                fractions = np.clip(fractions, 0, None)
                fractions /= fractions.sum()

        column = total * fractions
        if random.random() < 0.18:
            column += np.random.normal(0.0, max(float(total) * 0.01, 0.01), n_series)
            column = np.clip(column, 0, None)
            if float(column.sum()) <= 0:
                column = np.full(n_series, float(total) / n_series)
        matrix.append(column)

    return np.array(matrix).T


def reorder_stack_categories(labels: list[str], matrix: np.ndarray, family: str, mode: str) -> tuple[list[str], np.ndarray]:
    totals = matrix.sum(axis=0)
    order = list(range(matrix.shape[1]))
    if mode == "percent":
        if random.random() < 0.45:
            order.sort(key=lambda idx: totals[idx], reverse=random.random() < 0.5)
        elif random.random() < 0.2:
            random.shuffle(order)
    else:
        if family in {"balanced", "dominant", "front_loaded", "back_loaded", "switchback"} and random.random() < 0.55:
            order.sort(key=lambda idx: totals[idx], reverse=True)
        elif family in {"layered", "fragmented"} and random.random() < 0.35:
            order.sort(key=lambda idx: totals[idx], reverse=random.random() < 0.5)
        elif random.random() < 0.18:
            random.shuffle(order)
    return [labels[i] for i in order], matrix[:, order]


def sample_config() -> dict:
    n_categories = sample_category_count()
    n_series = choose_weighted([2, 3, 4, 5, 6], [0.22, 0.27, 0.24, 0.17, 0.10])
    family = sample_stack_family()
    mode = sample_stack_mode()

    labels = [sample_category_label() for _ in range(n_categories)]
    matrix = generate_stack_matrix(n_series, n_categories, family, mode)
    labels, matrix = reorder_stack_categories(labels, matrix, family, mode)

    style = sample_canvas("barv", series_count=n_series)
    fig_w, fig_h = style["figsize"]
    max_label_len = max((len(label) for label in labels), default=8)
    fig_w = min(max(fig_w, 6.0 + 0.12 * n_categories + 0.05 * max_label_len), 11.8)
    fig_h = min(max(fig_h, 4.8 + 0.14 * n_series), 8.6)
    style["figsize"] = (fig_w, fig_h)

    bar_width = random.uniform(0.58, 0.80)
    if n_categories > 10:
        bar_width = random.uniform(0.52, 0.72)
    matrix_final = finalize_matrix(matrix)
    matrix_final_arr = np.array(matrix_final, dtype=float)
    stack_totals = matrix_final_arr.sum(axis=0)
    ylim = padded_limits(stack_totals.tolist(), include_zero=True, pad=(0.06, 0.16))
    ylim = (0.0, max(ylim[1], float(np.max(stack_totals)) * 1.06))

    if n_categories > 10 or max_label_len > 10:
        x_rotation = choose_weighted([20, 30, 40, 50, 60], [0.10, 0.22, 0.24, 0.22, 0.22])
    else:
        x_rotation = choose_weighted([0, 10, 15, 25], [0.38, 0.22, 0.20, 0.20])
    x_ha = "center" if x_rotation == 0 else "right"

    bottoms = np.cumsum(np.vstack([np.zeros(n_categories), matrix_final_arr[:-1]]), axis=0)

    return {
        "font_path": random.choice(FONT_POOL),
        "style": style,
        "family": family,
        "stack_mode": mode,
        "n_series": n_series,
        "labels": labels,
        "matrix": matrix_final,
        "bottoms": bottoms.tolist(),
        "bar_width": bar_width,
        "x_title": sample_axis_title("x", "barv"),
        "y_title": "Share (%)" if mode == "percent" else sample_axis_title("y", "barv"),
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
        "ylims": ylim,
        "x_rotation": x_rotation,
        "x_ha": x_ha,
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
