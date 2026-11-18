"""Static sampling closure from official VSR 1fd0403: gen_line_1.py.

Functions are verbatim source slices. Shared common functions and WORDS/FONT_POOL
are supplied by the per-sample runtime namespace; importing never samples or loads
assets. No renderer, I/O, CLI, or legacy module is imported.
"""


from __future__ import annotations


import random
import numpy as np


SOURCE_REVISION = '1fd040346add205ffbada9748273cad3bc9159e5'


SOURCE_FILE = 'chart_generation/gen_line_1.py'


SAMPLER_FUNCTIONS = ('sample_point_count', 'sample_series_count', 'sample_x_mode', 'sample_family', 'sample_scale', 'finalize_series', 'build_x_axis', '_thin_ticks', 'make_base_curve', 'generate_matrix', 'finalize_x_numeric', 'sample_config')


SAMPLER_CONSTANTS = ('MONTHS',)


COMMON_FUNCTIONS = ('choose_weighted', 'human_round', 'maybe_int_or_float', 'padded_limits', 'sample_axis_title', 'sample_canvas', 'sample_label', 'sample_series_name', 'sample_title', 'series_color')


INJECTED_GLOBALS = ('FONT_POOL', 'WORDS', 'choose_weighted', 'human_round', 'maybe_int_or_float', 'padded_limits', 'sample_axis_title', 'sample_canvas', 'sample_label', 'sample_series_name', 'sample_title', 'series_color')


__all__ = ('sample_point_count', 'sample_series_count', 'sample_x_mode', 'sample_family', 'sample_scale', 'finalize_series', 'build_x_axis', '_thin_ticks', 'make_base_curve', 'generate_matrix', 'finalize_x_numeric', 'sample_config', 'MONTHS')


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def sample_point_count() -> int:
    low, high = choose_weighted(
        [(6, 8), (9, 12), (13, 16), (17, 22), (23, 30)],
        [0.12, 0.22, 0.24, 0.24, 0.18],
    )
    return random.randint(low, high)


def sample_series_count() -> int:
    return 1


def sample_x_mode() -> str:
    return choose_weighted(["categorical", "temporal", "numeric"], [0.48, 0.28, 0.24])


def sample_family() -> str:
    return choose_weighted(
        ["parallel_trend", "oscillating", "piecewise", "random_walk", "spike_event", "decay", "crossing", "seasonal", "mean_reverting", "logistic", "sawtooth"],
        [0.14, 0.16, 0.13, 0.13, 0.10, 0.08, 0.07, 0.05, 0.03, 0.03, 0.08],
    )


def sample_scale() -> float:
    return choose_weighted(
        [0.4, 1.0, 2.5, 6.0, 15.0, 35.0, 80.0],
        [0.05, 0.18, 0.20, 0.18, 0.16, 0.13, 0.10],
    ) * random.uniform(0.78, 1.28)


def finalize_series(series_list: list[np.ndarray]) -> list[list[float | int]]:
    out: list[list[float | int]] = []
    for series in series_list:
        values: list[float | int] = []
        for value in series:
            if abs(float(value)) < 1e-12:
                values.append(0)
                continue
            rounded = human_round(float(value))
            values.append(maybe_int_or_float(float(rounded)) if isinstance(rounded, float) else rounded)
        out.append(values)
    return out


def build_x_axis(n_points: int, mode: str) -> tuple[list[float], list[str], list[float], list[str]]:
    if mode == "categorical":
        x = list(range(n_points))
        label_kind = choose_weighted(
            ["word", "phrase", "month", "quarter", "year", "hybrid", "code", "compound", "abbr", "slug"],
            [0.17, 0.17, 0.16, 0.14, 0.12, 0.12, 0.04, 0.04, 0.02, 0.02],
        )
        labels = [sample_label(label_kind) for _ in range(n_points)]
        step = 1 if n_points <= 10 else 2 if n_points <= 16 else 3
        tick_positions = [x[i] for i in range(0, n_points, step)]
        tick_labels = [labels[i] for i in range(0, n_points, step)]
        if tick_positions[-1] != x[-1]:
            tick_positions.append(x[-1])
            tick_labels.append(labels[-1])
        return x, labels, tick_positions, tick_labels

    if mode == "temporal":
        granularity = choose_weighted(["month", "quarter", "year"], [0.56, 0.24, 0.20])
        if granularity == "month":
            start_year = random.randint(2018, 2026)
            start_month = random.randint(0, 11)
            x = list(range(n_points))
            labels = []
            for i in range(n_points):
                idx = start_month + i
                labels.append(f"{MONTHS[idx % 12]} {start_year + idx // 12}")
        elif granularity == "quarter":
            start_year = random.randint(2018, 2026)
            start_quarter = random.randint(0, 3)
            x = list(range(n_points))
            labels = []
            for i in range(n_points):
                idx = start_quarter + i
                labels.append(f"Q{idx % 4 + 1} {start_year + idx // 4}")
        else:
            start_year = random.randint(2012, 2022)
            x = list(range(n_points))
            labels = [str(start_year + i) for i in range(n_points)]
        step = 1 if n_points <= 10 else 2 if n_points <= 16 else 3
        tick_positions = [x[i] for i in range(0, n_points, step)]
        tick_labels = [labels[i] for i in range(0, n_points, step)]
        if tick_positions[-1] != x[-1]:
            tick_positions.append(x[-1])
            tick_labels.append(labels[-1])
        return x, labels, tick_positions, tick_labels

    start = sample_scale() * random.uniform(0.2, 1.4)
    steps = np.abs(np.random.lognormal(mean=0.0, sigma=random.uniform(0.08, 0.28), size=n_points - 1))
    steps *= sample_scale() * random.uniform(0.4, 2.2)
    x_values = [start]
    for step in steps:
        x_values.append(x_values[-1] + float(step))
    if random.random() < 0.24:
        offset = float(np.mean(x_values))
        x_values = [x - offset for x in x_values]
    x_values = [float(human_round(x)) if abs(x) < 1e4 else float(human_round(x)) for x in x_values]

    tick_count = min(n_points, random.randint(4, 7))
    tick_positions = np.linspace(min(x_values), max(x_values), tick_count).tolist()
    tick_labels = []
    for value in tick_positions:
        rounded = human_round(float(value))
        tick_labels.append(str(maybe_int_or_float(float(rounded)) if isinstance(rounded, float) else rounded))
    labels = [str(maybe_int_or_float(v) if abs(v - round(v)) < 1e-8 else round(v, 2)) for v in x_values]
    return x_values, labels, tick_positions, tick_labels


def _thin_ticks(positions: list[float], labels: list[str], step: int) -> tuple[list[float], list[str]]:
    step = max(1, int(step))
    if step <= 1 or len(positions) <= 2:
        return positions, labels
    indices = list(range(0, len(positions), step))
    if indices[-1] != len(positions) - 1:
        indices.append(len(positions) - 1)
    return [positions[i] for i in indices], [labels[i] for i in indices]


def make_base_curve(n: int, family: str) -> np.ndarray:
    t = np.linspace(0.0, 1.0, n)
    if family == "parallel_trend":
        mode = choose_weighted(["rise", "fall", "flat", "curve", "sawtooth"], [0.28, 0.22, 0.22, 0.18, 0.10])
        if mode == "rise":
            base = 0.7 + 1.6 * t
        elif mode == "fall":
            base = 2.0 - 1.3 * t
        elif mode == "flat":
            base = np.ones(n) * random.uniform(0.9, 1.6)
        else:
            base = 0.8 + 0.7 * np.sin(np.pi * t) ** 2 + 0.35 * t
        return base * sample_scale()

    if family == "crossing":
        base = (t - 0.5) * sample_scale() * 1.6
        base += np.sin(np.pi * t) * sample_scale() * 0.12
        return base

    if family == "oscillating":
        freq = random.uniform(0.9, 2.6)
        phase = random.uniform(0, np.pi)
        trend = (t - 0.5) * sample_scale() * random.uniform(-0.2, 0.4)
        return np.sin(2 * np.pi * freq * t + phase) * sample_scale() + trend

    if family == "piecewise":
        break_count = random.randint(1, min(3, max(1, n - 2)))
        breakpoints = sorted(random.sample(range(1, n - 1), break_count))
        control_x = [0] + breakpoints + [n - 1]
        control_y = []
        level = random.uniform(0.4, 1.2) * sample_scale()
        for idx in range(len(control_x)):
            if idx == 0:
                control_y.append(level)
            else:
                level += random.uniform(-0.45, 0.75) * sample_scale()
                control_y.append(level)
        base = np.interp(np.arange(n), control_x, control_y)
        return base

    if family == "random_walk":
        drift = random.uniform(-0.16, 0.18) * sample_scale()
        steps = np.random.normal(drift, sample_scale() * random.uniform(0.08, 0.22), n)
        return np.cumsum(steps)

    if family == "spike_event":
        baseline = np.ones(n) * random.uniform(0.5, 1.6) * sample_scale()
        baseline += (t - 0.5) * sample_scale() * random.uniform(-0.25, 0.25)
        spikes = np.zeros(n)
        for idx in random.sample(range(n), random.randint(1, max(1, n // 4))):
            spikes[idx] += sample_scale() * random.uniform(0.8, 2.6) * random.choice([-1, 1])
        return baseline + spikes

    if family == "sawtooth":
        cycles = random.uniform(2.0, 5.0)
        phase = random.uniform(0.0, 1.0)
        raw = np.mod(t * cycles + phase, 1.0)
        raw = raw if random.random() < 0.5 else 1.0 - raw
        base = 0.42 + raw * random.uniform(0.85, 1.25)
        if random.random() < 0.45:
            base += (t - 0.5) * random.uniform(-0.3, 0.35)
        return base * sample_scale()

    if family == "seasonal":
        freq = random.uniform(0.8, 2.4)
        phase = random.uniform(0, np.pi)
        base = 1.0 + 0.28 * np.sin(2 * np.pi * freq * t + phase) + 0.12 * np.sin(4 * np.pi * freq * t + phase / 2)
        if random.random() < 0.55:
            base += (t - 0.5) * random.uniform(-0.3, 0.5)
        return base * sample_scale()

    if family == "logistic":
        slope = random.uniform(4.0, 10.0)
        midpoint = random.uniform(0.25, 0.75)
        direction = random.choice([-1, 1])
        base = 1.0 / (1.0 + np.exp(-direction * slope * (t - midpoint)))
        return (0.35 + 1.25 * base) * sample_scale()

    if family == "mean_reverting":
        return np.ones(n) * sample_scale() * random.uniform(0.85, 1.45)

    if family == "sawtooth":
        cycles = random.uniform(2.0, 5.0)
        phase = random.uniform(0.0, 1.0)
        raw = np.mod(t * cycles + phase, 1.0)
        raw = raw if random.random() < 0.5 else 1.0 - raw
        base = 0.42 + raw * random.uniform(0.85, 1.25)
        if random.random() < 0.45:
            base += (t - 0.5) * random.uniform(-0.3, 0.35)
        return base * sample_scale()

    return np.ones(n) * sample_scale()


def generate_matrix(n_series: int, n_points: int, family: str) -> np.ndarray:
    t = np.linspace(0.0, 1.0, n_points)
    base = make_base_curve(n_points, family)
    matrix: list[np.ndarray] = []

    if family == "parallel_trend":
        for _ in range(n_series):
            scale = random.uniform(0.84, 1.18)
            offset = float(base.mean()) * random.uniform(-0.16, 0.18)
            noise = np.random.normal(0.0, max(float(np.std(base)) * random.uniform(0.03, 0.07), sample_scale() * 0.015), n_points)
            matrix.append(base * scale + offset + noise)
    elif family == "crossing":
        slopes = np.linspace(-1.0, 1.0, n_series) + np.random.normal(0.0, 0.12, n_series)
        amp = max(float(np.abs(base).mean()), sample_scale())
        centered = base - float(base.mean())
        for slope in slopes:
            intercept = amp * random.uniform(0.65, 1.35)
            noise = np.random.normal(0.0, amp * random.uniform(0.03, 0.08), n_points)
            matrix.append(intercept + slope * (t - 0.5) * amp * random.uniform(0.9, 1.7) + centered * random.uniform(0.25, 0.55) + noise)
    elif family == "oscillating":
        for s in range(n_series):
            phase = random.uniform(0, np.pi) + s * random.uniform(0.25, 0.9)
            amp = random.uniform(0.75, 1.35) * sample_scale()
            freq = random.uniform(0.8, 2.2)
            trend = (t - 0.5) * sample_scale() * random.uniform(-0.18, 0.35)
            noise = np.random.normal(0.0, amp * random.uniform(0.02, 0.07), n_points)
            matrix.append(np.sin(2 * np.pi * freq * t + phase) * amp + trend + noise)
    elif family == "piecewise":
        breakpoints = sorted(random.sample(range(1, n_points - 1), random.randint(1, min(3, n_points - 2))))
        control_x = [0] + breakpoints + [n_points - 1]
        for s in range(n_series):
            control_y = []
            level = random.uniform(0.5, 1.3) * sample_scale()
            for idx in range(len(control_x)):
                if idx == 0:
                    control_y.append(level)
                else:
                    level += random.uniform(-0.6, 0.8) * sample_scale()
                    control_y.append(level + s * random.uniform(-0.18, 0.18) * sample_scale())
            base_series = np.interp(np.arange(n_points), control_x, control_y)
            if random.random() < 0.4 and n_points >= 3:
                start = random.randint(0, max(0, n_points - 3))
                stop = random.randint(start + 2, n_points)
                plateau = slice(start, stop)
                base_series[plateau] = np.mean(base_series[plateau])
            matrix.append(base_series + np.random.normal(0.0, sample_scale() * random.uniform(0.02, 0.07), n_points))
    elif family == "random_walk":
        for _ in range(n_series):
            drift = random.uniform(-0.18, 0.18) * sample_scale()
            steps = np.random.normal(drift, sample_scale() * random.uniform(0.08, 0.20), n_points)
            series = np.cumsum(steps)
            if random.random() < 0.4:
                series += np.linspace(0, sample_scale() * random.uniform(-0.3, 0.3), n_points)
            matrix.append(series)
    elif family == "spike_event":
        spike_positions = sorted(random.sample(range(n_points), random.randint(1, max(1, n_points // 3))))
        for _ in range(n_series):
            baseline = np.ones(n_points) * random.uniform(0.4, 1.4) * sample_scale()
            baseline += (t - 0.5) * sample_scale() * random.uniform(-0.2, 0.3)
            series = baseline + np.random.normal(0.0, sample_scale() * random.uniform(0.03, 0.08), n_points)
            for pos in spike_positions:
                series[pos] += sample_scale() * random.uniform(0.7, 2.8) * random.choice([-1, 1])
            if random.random() < 0.35:
                extra_pos = random.randrange(n_points)
                series[extra_pos] += sample_scale() * random.uniform(1.5, 3.5)
            matrix.append(series)
    elif family == "sawtooth":
        cycles = random.uniform(2.0, 5.0)
        base_phase = random.uniform(0.0, 1.0)
        for s in range(n_series):
            phase = base_phase + s * random.uniform(0.08, 0.35)
            raw = np.mod(t * cycles + phase, 1.0)
            raw = raw if random.random() < 0.5 else 1.0 - raw
            series = (0.42 + raw * random.uniform(0.85, 1.25)) * sample_scale() * random.uniform(0.8, 1.25)
            if random.random() < 0.45:
                series += (t - 0.5) * sample_scale() * random.uniform(-0.15, 0.3)
            matrix.append(series + np.random.normal(0.0, sample_scale() * random.uniform(0.02, 0.06), n_points))
    elif family == "seasonal":
        for s in range(n_series):
            freq = random.uniform(0.8, 2.5)
            phase = random.uniform(0, np.pi) + s * random.uniform(0.18, 0.8)
            amp = random.uniform(0.75, 1.35) * sample_scale()
            series = np.sin(2 * np.pi * freq * t + phase) * amp
            series += 0.35 * np.sin(4 * np.pi * freq * t + phase / 2) * amp
            if random.random() < 0.6:
                series += (t - 0.5) * sample_scale() * random.uniform(-0.25, 0.45)
            matrix.append(series + np.random.normal(0.0, amp * random.uniform(0.02, 0.07), n_points))
    elif family == "mean_reverting":
        for _ in range(n_series):
            mean_level = sample_scale() * random.uniform(0.6, 1.8)
            theta = random.uniform(0.12, 0.28)
            noise_scale = sample_scale() * random.uniform(0.05, 0.16)
            series = np.empty(n_points)
            series[0] = mean_level + random.uniform(-0.6, 0.6) * mean_level
            for idx in range(1, n_points):
                series[idx] = series[idx - 1] + theta * (mean_level - series[idx - 1]) + np.random.normal(0.0, noise_scale)
            if random.random() < 0.35:
                series += np.linspace(0.0, sample_scale() * random.uniform(-0.25, 0.25), n_points)
            matrix.append(series)
    elif family == "logistic":
        for _ in range(n_series):
            slope = random.uniform(4.0, 10.0)
            midpoint = random.uniform(0.25, 0.75)
            direction = random.choice([-1, 1])
            curve = 1.0 / (1.0 + np.exp(-direction * slope * (t - midpoint)))
            curve = (0.35 + 1.25 * curve) * sample_scale()
            if random.random() < 0.4:
                curve += np.sin(2 * np.pi * random.uniform(0.8, 2.2) * t + random.uniform(0, np.pi)) * sample_scale() * random.uniform(0.04, 0.14)
            matrix.append(curve + np.random.normal(0.0, sample_scale() * random.uniform(0.02, 0.06), n_points))
    elif family == "decay":
        for _ in range(n_series):
            start = sample_scale() * random.uniform(0.8, 1.8)
            decay_rate = random.uniform(1.2, 4.5)
            series = start * np.exp(-decay_rate * t)
            if random.random() < 0.5:
                series = series[::-1]
            if random.random() < 0.45:
                series += np.sin(2 * np.pi * random.uniform(0.8, 2.6) * t + random.uniform(0, np.pi)) * sample_scale() * random.uniform(0.05, 0.18)
            if random.random() < 0.3:
                series += np.linspace(0.0, sample_scale() * random.uniform(-0.25, 0.25), n_points)
            matrix.append(series + np.random.normal(0.0, sample_scale() * random.uniform(0.02, 0.07), n_points))
    else:
        return generate_matrix(n_series, n_points, "parallel_trend")

    return np.array(matrix)


def finalize_x_numeric(x_values: list[float]) -> list[float | int]:
    out: list[float | int] = []
    for value in x_values:
        if abs(value) < 1e-12:
            out.append(0)
            continue
        rounded = human_round(float(value))
        out.append(maybe_int_or_float(float(rounded)) if isinstance(rounded, float) else rounded)
    return out


def sample_config() -> dict:
    n_points = sample_point_count()
    n_series = sample_series_count()
    family = sample_family()
    x_mode = sample_x_mode()

    x_values, x_labels, tick_positions, tick_labels = build_x_axis(n_points, x_mode)
    max_tick_label_len = max((len(label) for label in tick_labels), default=0)
    if x_mode != "numeric":
        extra_step = 1
        if max_tick_label_len > 12 or len(tick_labels) > 6:
            extra_step = 2
        if max_tick_label_len > 18 or len(tick_labels) > 8:
            extra_step = 3
        if max_tick_label_len > 24 or len(tick_labels) > 10:
            extra_step = 4
        if extra_step > 1:
            tick_positions, tick_labels = _thin_ticks(tick_positions, tick_labels, extra_step)
    matrix = generate_matrix(n_series, n_points, family)
    matrix = finalize_series(matrix)

    style = sample_canvas("line", series_count=n_series)
    fig_w, fig_h = style["figsize"]
    fig_w = min(max(fig_w, 6.2 + 0.16 * n_points + 0.06 * max_tick_label_len), 12.2)
    fig_h = min(max(fig_h, 4.4 + 0.08 * n_series), 8.4)
    style["figsize"] = (fig_w, fig_h)

    flat_values = [float(v) for row in matrix for v in row]
    ylim = padded_limits(flat_values, include_zero=False, pad=(0.06, 0.14))
    if all(v >= 0 for v in flat_values) and family in {"parallel_trend", "piecewise", "spike_event"} and random.random() < 0.42:
        ylim = (0.0, ylim[1])

    if x_mode == "numeric":
        xlim = padded_limits(x_values, include_zero=False, pad=(0.05, 0.12))
    else:
        xlim = (-0.5, n_points - 0.5)

    marker_choices = [None, "o", "s", "^", "D", "v", "<", ">", "p", "*", "x", "."]
    line_styles = ["-", "-", "-", "-", "--", "-.", ":"]
    markers = []
    styles = []
    marker_sizes = []
    markevery = []
    alphas = []
    widths = []
    for _ in range(n_series):
        marker = choose_weighted(marker_choices, [0.40, 0.16, 0.10, 0.08, 0.07, 0.07, 0.04, 0.03, 0.02, 0.01, 0.01, 0.01])
        if marker is None and random.random() < 0.35:
            marker = None
        markers.append(marker)
        styles.append(random.choice(line_styles))
        marker_sizes.append(random.uniform(4.0, 8.5) if n_points <= 16 else random.uniform(3.5, 6.5))
        markevery.append(None if marker is None or n_points <= 9 else random.randint(2, 4))
        alphas.append(random.uniform(0.82, 0.98))
        widths.append(random.uniform(1.25, 2.3))

    if x_mode == "numeric":
        x_rotation = choose_weighted([0, 15, 30, 45], [0.4, 0.25, 0.2, 0.15])
    elif max_tick_label_len > 18 or len(tick_labels) > 8:
        x_rotation = choose_weighted([30, 45, 60], [0.18, 0.34, 0.48])
    elif max_tick_label_len > 12 or len(tick_labels) > 6:
        x_rotation = choose_weighted([15, 30, 45], [0.22, 0.38, 0.40])
    else:
        x_rotation = choose_weighted([0, 15, 30], [0.46, 0.32, 0.22])
    x_ha = "center" if x_rotation == 0 else "right"

    return {
        "font_path": random.choice(FONT_POOL),
        "style": style,
        "family": family,
        "x_mode": x_mode,
        "n_series": n_series,
        "show_legend": random.random() < 0.18,
        "x_values": finalize_x_numeric(x_values) if x_mode == "numeric" else x_values,
        "x_labels": x_labels,
        "tick_positions": tick_positions,
        "tick_labels": tick_labels,
        "matrix": matrix,
        "x_title": sample_axis_title("x", "line"),
        "y_title": sample_axis_title("y", "line"),
        "title": sample_title("line"),
        "title_loc": random.choice(["left", "center"]),
        "title_weight": choose_weighted(["normal", "bold"], [0.74, 0.26]),
        "title_style": choose_weighted(["normal", "italic"], [0.86, 0.14]),
        "series_names": [sample_series_name(i) for i in range(n_series)],
        "colors": [series_color(style["series_colors"], i) for i in range(n_series)],
        "markers": markers,
        "linestyles": styles,
        "marker_sizes": marker_sizes,
        "markevery": markevery,
        "alphas": alphas,
        "widths": widths,
        "ylim": ylim,
        "xlim": xlim,
        "x_rotation": x_rotation,
        "x_ha": x_ha,
        "grid_axis": choose_weighted(["y", "both", "x"], [0.50, 0.35, 0.15]) if x_mode == "numeric" else choose_weighted(["y", "both", "x"], [0.62, 0.25, 0.13]),
    }
