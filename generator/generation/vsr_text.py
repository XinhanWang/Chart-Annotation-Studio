"""Original VSR text and pure math helpers, with offline local word loading.

Source: VSR 1fd040346add205ffbada9748273cad3bc9159e5,
chart_generation/common.py (byte-identical to vendor at 8b2ca38).
Selected function signatures and bodies are copied verbatim. The word loader
has an outer local cache so runtime rebinding leaves it safely module-bound. No rendering,
font setup, network access, or runtime dependency on vendor/history is needed.

For sample-local RNG, clone the sampling functions with types.FunctionType
into ONE shared namespace containing random.Random and rebound helper names.
load_words can remain this module's local cached loader (or be a closure).
"""
from __future__ import annotations

import math
import random
from functools import lru_cache
from pathlib import Path
from typing import Iterable

BASE_DIR = Path(__file__).resolve().parent
ROOT = BASE_DIR
WORD_FILE = ROOT / "words.txt"
WORDS_CANDIDATES = [WORD_FILE]
_WORDS_CACHE: dict[tuple[str, int], list[str]] = {}

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


QUARTERS = ["Q1", "Q2", "Q3", "Q4"]


SERIES_TAGS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]


UNITS = [
    "",
    " (%)",
    " (ms)",
    " (k)",
    " (USD)",
    " (GB)",
    " (°C)",
    " (rpm)",
    " (ops/s)",
    " (Hz)",
    " (kg)",
    " (km)",
    " (samples)",
    " (events)",
    " (req/s)",
    " (MB)",
    " (ppm)",
    " (px)",
]


def resolve_existing(candidates: Iterable[Path]) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return next(iter(candidates))


@lru_cache(maxsize=None)
def load_words(path: Path | None = None, max_length: int = 12) -> list[str]:
    if path is None:
        path = resolve_existing(WORDS_CANDIDATES)
    cache_key = (str(path), max_length)
    cached = _WORDS_CACHE.get(cache_key)
    if cached is not None:
        return cached
    with Path(path).open("r", encoding="utf-8") as f:
        words = [line.strip() for line in f if 0 < len(line.strip()) <= max_length]
    _WORDS_CACHE[cache_key] = words
    return words


def choose_weighted(items: list, weights: list[float]):
    return random.choices(items, weights=weights, k=1)[0]


def human_round(value: float) -> float | int:
    if value == 0:
        return 0

    abs_value = abs(value)
    if abs_value >= 1000:
        step = random.choice([1, 2, 5, 10, 20, 50, 100])
    elif abs_value >= 100:
        step = random.choice([1, 2, 5, 10])
    elif abs_value >= 10:
        step = random.choice([0.1, 0.2, 0.5, 1, 2])
    elif abs_value >= 1:
        step = random.choice([0.01, 0.05, 0.1, 0.2, 0.5])
    else:
        step = random.choice([0.001, 0.005, 0.01, 0.02])

    rounded = round(value / step) * step
    if step >= 1 and random.random() < 0.8:
        return int(round(rounded))
    if step < 1:
        decimals = max(0, int(round(-math.log10(step))))
        return round(rounded, decimals)
    return round(rounded, 0)


def sample_word() -> str:
    words = load_words()
    return random.choice(words)


def sample_phrase(min_words: int = 1, max_words: int = 3) -> str:
    count = random.randint(min_words, max_words)
    return " ".join(sample_word().capitalize() for _ in range(count))


def sample_label(kind: str | None = None) -> str:
    if kind is None:
        kind = choose_weighted(
            ["word", "phrase", "year", "quarter", "month", "hybrid", "numeric", "code", "compound", "abbr", "slug", "ordinal", "paired"],
            [0.19, 0.16, 0.09, 0.08, 0.09, 0.13, 0.06, 0.07, 0.07, 0.05, 0.04, 0.02, 0.05],
        )

    if kind == "word":
        word = sample_word()
        return word.capitalize() if random.random() < 0.45 else word
    if kind == "phrase":
        return sample_phrase(2, 4)
    if kind == "year":
        return str(random.randint(2016, 2026))
    if kind == "quarter":
        return f"{random.choice(QUARTERS)} {random.randint(2019, 2026)}"
    if kind == "month":
        month = random.choice(MONTHS)
        if random.random() < 0.5:
            return month
        return f"{month}-{random.randint(19, 26):02d}"
    if kind == "hybrid":
        return f"{sample_word().capitalize()} {random.randint(1, 99)}"
    if kind == "numeric":
        v = random.choice([random.randint(0, 99), random.uniform(0, 99), random.uniform(100, 999)])
        return str(human_round(v))
    if kind == "code":
        return f"{random.choice(SERIES_TAGS)}{random.randint(1, 99)}"
    if kind == "compound":
        left = sample_word().capitalize()
        right = sample_word().capitalize()
        return f"{left}-{right}" if random.random() < 0.55 else f"{left} / {right}"
    if kind == "abbr":
        parts = [sample_word() for _ in range(random.randint(2, 4))]
        return "".join(part[0].upper() for part in parts if part)
    if kind == "slug":
        parts = [sample_word().lower() for _ in range(random.randint(2, 3))]
        sep = random.choice(["-", "_"])
        suffix = str(random.randint(1, 99)) if random.random() < 0.35 else ""
        return sep.join(parts) + suffix
    if kind == "ordinal":
        value = random.randint(1, 24)
        suffix = "th" if 10 <= value % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(value % 10, "th")
        return f"{value}{suffix}"
    if kind == "paired":
        left = sample_word().capitalize()
        right = sample_word().capitalize()
        return f"{left} {random.choice(['vs', '&', 'and'])} {right}"
    return sample_word()


def sample_series_name(index: int) -> str:
    pool = [
        f"Series {index + 1}",
        SERIES_TAGS[index % len(SERIES_TAGS)],
        f"{sample_word().capitalize()} {index + 1}",
        f"{sample_word().capitalize()}",
        f"{sample_word().capitalize()}-{sample_word().capitalize()}",
        f"{sample_word().capitalize()} / {sample_word().capitalize()}",
        f"{sample_word().upper()}_{index + 1}",
        f"Group {index + 1}",
        f"Batch {index + 1}",
        f"Run {index + 1}",
        f"Trial {index + 1}",
        f"Layer {index + 1}",
    ]
    return random.choice(pool)


def sample_title(chart_kind: str | None = None) -> str:
    if chart_kind == "scatter":
        patterns = ["short", "paired", "phrase", "temporal", "code"]
        weights = [0.26, 0.22, 0.22, 0.16, 0.14]
    elif chart_kind == "line":
        patterns = ["phrase", "temporal", "paired", "trend", "short"]
        weights = [0.30, 0.18, 0.16, 0.20, 0.16]
    elif chart_kind and chart_kind.startswith("bar"):
        patterns = ["short", "phrase", "paired", "temporal", "compact"]
        weights = [0.25, 0.28, 0.18, 0.12, 0.17]
    else:
        patterns = ["phrase", "paired", "short", "temporal", "code"]
        weights = [0.28, 0.22, 0.22, 0.16, 0.12]

    pattern = choose_weighted(patterns, weights)
    if pattern == "short":
        return sample_label(kind=choose_weighted(["word", "hybrid", "abbr"], [0.62, 0.25, 0.13])).capitalize()
    if pattern == "phrase":
        return " ".join(sample_label(kind="word").capitalize() for _ in range(random.randint(2, 4)))
    if pattern == "paired":
        left = sample_label(kind=choose_weighted(["word", "phrase", "abbr"], [0.45, 0.35, 0.20]))
        right = sample_label(kind=choose_weighted(["word", "phrase", "abbr"], [0.45, 0.35, 0.20]))
        return f"{left.capitalize()} {random.choice(['/', 'vs', '&'])} {right.capitalize()}"
    if pattern == "temporal":
        return random.choice(
            [
                f"{random.randint(2016, 2026)}",
                f"{random.choice(MONTHS)} {random.randint(2018, 2026)}",
                f"{random.choice(QUARTERS)} {random.randint(2018, 2026)}",
                f"{random.randint(2018, 2026)}-{random.randint(18, 26):02d}",
            ]
        )
    if pattern == "code":
        return f"{sample_label('abbr')} {random.randint(1, 99)}"
    if pattern == "trend":
        head = sample_label(kind=choose_weighted(["word", "phrase"], [0.72, 0.28])).capitalize()
        tail = random.choice(["Trend", "Profile", "Shift", "Pattern", "View"])
        return f"{head} {tail}"
    if pattern == "compact":
        return f"{sample_label(kind=choose_weighted(['word', 'code', 'hybrid'], [0.48, 0.34, 0.18])).capitalize()} {random.choice(['I', 'II', 'III', 'IV'])}"
    return sample_phrase(1, 3)


def sample_axis_title(axis: str, chart_kind: str) -> str | None:
    if random.random() < 0.12:
        return None

    if axis == "x":
        options = [
            "Time",
            "Index",
            "Category",
            "Year",
            "Month",
            "Batch",
            "Condition",
            "Iteration",
            "Phase",
            "Window",
            "Segment",
            "Sample",
            "Region",
            "Scenario",
            "Group",
            "Lane",
            "Step",
            "Feature",
            "Channel",
            "Bin",
            "Bucket",
            "Class",
            "Type",
            "Band",
            "Stage",
        ]
    else:
        options = [
            "Value",
            "Count",
            "Score",
            "Rate",
            "Throughput",
            "Latency",
            "Magnitude",
            "Frequency",
            "Volume",
            "Intensity",
            "Error",
            "Gap",
            "Load",
            "Demand",
            "Density",
            "Change",
            "Spread",
            "Signal",
            "Target",
            "Baseline",
            "Share",
            "Utilization",
            "Revenue",
            "Units",
            "Score",
        ]

    base = random.choice(options)
    unit = random.choice(UNITS)
    if chart_kind == "scatter" and axis == "y" and random.random() < 0.35:
        unit = random.choice([" (ms)", " (px)", " (dB)", " (%)", ""])
    if chart_kind.startswith("bar") and axis == "y" and random.random() < 0.35:
        unit = random.choice([" (k)", " (%)", " (USD)", ""])
    return f"{base}{unit}".strip()


def padded_limits(
    values: Iterable[float],
    include_zero: bool = False,
    symmetric: bool = False,
    pad: tuple[float, float] = (0.06, 0.15),
) -> tuple[float, float]:
    clean = [float(v) for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))]
    if not clean:
        return (-1.0, 1.0)

    lo = min(clean)
    hi = max(clean)
    span = hi - lo
    if span == 0:
        span = max(abs(lo), abs(hi), 1.0)
    margin = span * random.uniform(*pad)
    lo -= margin
    hi += margin

    if include_zero:
        lo = min(lo, 0.0)
        hi = max(hi, 0.0)

    if symmetric:
        bound = max(abs(lo), abs(hi))
        lo = -bound
        hi = bound

    return lo, hi


def series_color(series_colors: list[str], index: int) -> str:
    if not series_colors:
        return "#1f77b4"
    return series_colors[index % len(series_colors)]


def maybe_int_or_float(value: float) -> float | int:
    if abs(value - round(value)) < 1e-10 and random.random() < 0.8:
        return int(round(value))
    return value
