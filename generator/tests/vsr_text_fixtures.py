"""Pinned VSR 1fd0403 test-only source and behavior oracles.

Extracted and executed directly from the official vsr-source.tar.gz archive;
no import of generation.vsr_text, Matplotlib, vendor or history was used.
Stored as Python constants to follow the repository test-source allowlist.
"""

REFERENCE_SOURCE = r'''# Exact selected constants and functions from the official archive.
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
'''

ORACLE_JSON = r'''{
  "metadata": {
    "upstream_revision": "1fd040346add205ffbada9748273cad3bc9159e5",
    "common_sha256": "344fed1da3e148823c2bb5b7c115c2f4ad1210c4038baa88d77943b16dfeb624",
    "words_sha256": "39a4ead879cc8283de87f2ec58e7b4b340d6caa724db1b52a91dccf2f273c5e7",
    "words_bytes": 4862985,
    "words_lines": 466550,
    "default_max_length": 12,
    "default_filtered_entries": 392136,
    "reference_excerpt_sha256": "84277f7c4e4c280f65df2b905533e9b08d0e7b00d870e349735dee124e0ec359",
    "fixture_origin": "Direct AST selection and execution of official common.py from pinned vsr-source.tar.gz; no imports of generation.vsr_text or Matplotlib.",
    "python_version": "3.10.12"
  },
  "cases": [
    {
      "id": "sample_word-0-0",
      "seed": 0,
      "name": "sample_word",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "\"maze's\""
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "sample_phrase-1-0",
      "seed": 0,
      "name": "sample_phrase",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Nephrolithic Art-colored'"
      },
      "random_state_sha256": "b736210573ceb4359844f7a130cd20f3235217e0a0ebc316d9702faece62cfc6"
    },
    {
      "id": "sample_phrase-2-0",
      "seed": 0,
      "name": "sample_phrase",
      "args": [
        2,
        4
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Nephrolithic Art-colored Giggly'"
      },
      "random_state_sha256": "511198ce2289b2d0685fe74749704ac413e69bff767bf81282ae3faf55b886cc"
    },
    {
      "id": "sample_phrase-3-0",
      "seed": 0,
      "name": "sample_phrase",
      "args": [
        0,
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "''"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "sample_phrase-4-0",
      "seed": 0,
      "name": "sample_phrase",
      "args": [
        1,
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "\"Maze's Nephrolithic Art-colored Giggly Proddle Pink-violet Molder\""
      },
      "random_state_sha256": "bf666e430870370643c50861b8d75ffb1d2abefaa40a4d36562545f5293b7e10"
    },
    {
      "id": "sample_label-5-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Nephrolithic-Art-colored'"
      },
      "random_state_sha256": "cd5ba3d5ca878fac8e0a00c2db023b55e7277e0be9976ed12ffcb259090a584f"
    },
    {
      "id": "sample_label-6-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "word"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "\"maze's\""
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "sample_label-7-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "phrase"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Nephrolithic Art-colored Giggly'"
      },
      "random_state_sha256": "511198ce2289b2d0685fe74749704ac413e69bff767bf81282ae3faf55b886cc"
    },
    {
      "id": "sample_label-8-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "year"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'2022'"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "sample_label-9-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "quarter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q4 2025'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_label-10-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "month"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Jul-25'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_label-11-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "hybrid"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "\"Maze's 98\""
      },
      "random_state_sha256": "e3895720aac41a9188374cf066d681f8f3a92e01696d625f8a263babd022b22f"
    },
    {
      "id": "sample_label-12-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "numeric"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'76'"
      },
      "random_state_sha256": "bf666e430870370643c50861b8d75ffb1d2abefaa40a4d36562545f5293b7e10"
    },
    {
      "id": "sample_label-13-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "code"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'G98'"
      },
      "random_state_sha256": "e3895720aac41a9188374cf066d681f8f3a92e01696d625f8a263babd022b22f"
    },
    {
      "id": "sample_label-14-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "compound"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "\"Maze's-Nephrolithic\""
      },
      "random_state_sha256": "511198ce2289b2d0685fe74749704ac413e69bff767bf81282ae3faf55b886cc"
    },
    {
      "id": "sample_label-15-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "abbr"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'NAG'"
      },
      "random_state_sha256": "511198ce2289b2d0685fe74749704ac413e69bff767bf81282ae3faf55b886cc"
    },
    {
      "id": "sample_label-16-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "slug"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'nephrolithic_art-colored_giggly'"
      },
      "random_state_sha256": "f0e5d355accf012ada22d683ee192bd72a83812b79e62cae16b929d3cdefd279"
    },
    {
      "id": "sample_label-17-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "ordinal"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'13th'"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "sample_label-18-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "paired"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "\"Maze's vs Nephrolithic\""
      },
      "random_state_sha256": "b736210573ceb4359844f7a130cd20f3235217e0a0ebc316d9702faece62cfc6"
    },
    {
      "id": "sample_label-19-0",
      "seed": 0,
      "name": "sample_label",
      "args": [
        "unknown"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "\"maze's\""
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "sample_series_name-20-0",
      "seed": 0,
      "name": "sample_series_name",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Art-colored-Giggly'"
      },
      "random_state_sha256": "db5fc2c3741eb7c2721db5350765c787a886df957781874e65e68ef7b513fc01"
    },
    {
      "id": "sample_series_name-21-0",
      "seed": 0,
      "name": "sample_series_name",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Art-colored-Giggly'"
      },
      "random_state_sha256": "db5fc2c3741eb7c2721db5350765c787a886df957781874e65e68ef7b513fc01"
    },
    {
      "id": "sample_series_name-22-0",
      "seed": 0,
      "name": "sample_series_name",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Art-colored-Giggly'"
      },
      "random_state_sha256": "db5fc2c3741eb7c2721db5350765c787a886df957781874e65e68ef7b513fc01"
    },
    {
      "id": "sample_series_name-23-0",
      "seed": 0,
      "name": "sample_series_name",
      "args": [
        11
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Art-colored-Giggly'"
      },
      "random_state_sha256": "db5fc2c3741eb7c2721db5350765c787a886df957781874e65e68ef7b513fc01"
    },
    {
      "id": "sample_series_name-24-0",
      "seed": 0,
      "name": "sample_series_name",
      "args": [
        12
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Art-colored-Giggly'"
      },
      "random_state_sha256": "db5fc2c3741eb7c2721db5350765c787a886df957781874e65e68ef7b513fc01"
    },
    {
      "id": "sample_series_name-25-0",
      "seed": 0,
      "name": "sample_series_name",
      "args": [
        99
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Art-colored-Giggly'"
      },
      "random_state_sha256": "db5fc2c3741eb7c2721db5350765c787a886df957781874e65e68ef7b513fc01"
    },
    {
      "id": "sample_title-26-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q4 2024'"
      },
      "random_state_sha256": "976614fe8847a246328644b61142c566e858b743247f24f71accc1be6a0728ac"
    },
    {
      "id": "sample_title-27-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q4 2024'"
      },
      "random_state_sha256": "976614fe8847a246328644b61142c566e858b743247f24f71accc1be6a0728ac"
    },
    {
      "id": "sample_title-28-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Nephrolithic 6'"
      },
      "random_state_sha256": "b736210573ceb4359844f7a130cd20f3235217e0a0ebc316d9702faece62cfc6"
    },
    {
      "id": "sample_title-29-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'G6 III'"
      },
      "random_state_sha256": "511198ce2289b2d0685fe74749704ac413e69bff767bf81282ae3faf55b886cc"
    },
    {
      "id": "sample_title-30-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'G6 III'"
      },
      "random_state_sha256": "511198ce2289b2d0685fe74749704ac413e69bff767bf81282ae3faf55b886cc"
    },
    {
      "id": "sample_title-31-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        "barv_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'G6 III'"
      },
      "random_state_sha256": "511198ce2289b2d0685fe74749704ac413e69bff767bf81282ae3faf55b886cc"
    },
    {
      "id": "sample_title-32-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        "line_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q4 2024'"
      },
      "random_state_sha256": "976614fe8847a246328644b61142c566e858b743247f24f71accc1be6a0728ac"
    },
    {
      "id": "sample_title-33-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        "scatter_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q4 2024'"
      },
      "random_state_sha256": "976614fe8847a246328644b61142c566e858b743247f24f71accc1be6a0728ac"
    },
    {
      "id": "sample_title-34-0",
      "seed": 0,
      "name": "sample_title",
      "args": [
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q4 2024'"
      },
      "random_state_sha256": "976614fe8847a246328644b61142c566e858b743247f24f71accc1be6a0728ac"
    },
    {
      "id": "sample_axis_title-35-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "x",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-36-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "x",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-37-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-38-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-39-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "x",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-40-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "y",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score'"
      },
      "random_state_sha256": "cd71912e2e308c8c207bc0badafe7fca89dcadd52f6323f144fad039a6f703ba"
    },
    {
      "id": "sample_axis_title-41-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "y",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-42-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score'"
      },
      "random_state_sha256": "51194349a3fa22ff959e342e3d63fbe2b81c9573e4781e739ca0b606fd094a91"
    },
    {
      "id": "sample_axis_title-43-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score'"
      },
      "random_state_sha256": "51194349a3fa22ff959e342e3d63fbe2b81c9573e4781e739ca0b606fd094a91"
    },
    {
      "id": "sample_axis_title-44-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "y",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-45-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "z",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-46-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "z",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-47-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-48-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "sample_axis_title-49-0",
      "seed": 0,
      "name": "sample_axis_title",
      "args": [
        "z",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (events)'"
      },
      "random_state_sha256": "f8cfc82ede829cd2520874e5d543ba831c5fe6a8170fe9dbb8dd51c51d08fe1b"
    },
    {
      "id": "human_round-50-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "human_round-51-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        1e-05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-52-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-53-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        0.099
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.1"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-54-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        0.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-55-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-56-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        1.2345
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.2"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-57-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        9.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-58-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        10
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "10"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-59-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        10.05
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "10"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-60-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        99.99
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "100"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-61-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "100"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-62-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        123.45
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "120"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-63-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-64-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "e3895720aac41a9188374cf066d681f8f3a92e01696d625f8a263babd022b22f"
    },
    {
      "id": "human_round-65-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        1234.567
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1200"
      },
      "random_state_sha256": "e3895720aac41a9188374cf066d681f8f3a92e01696d625f8a263babd022b22f"
    },
    {
      "id": "human_round-66-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-67-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -0.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-1.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-68-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-1.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-69-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -9.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "human_round-70-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -10
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-10"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-71-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -99.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-100"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-72-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-100"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-73-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "d4738a3174d4ea5b7958d3b8932b352d32dc8d1e1b6a502a3d7608221c083eba"
    },
    {
      "id": "human_round-74-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "e3895720aac41a9188374cf066d681f8f3a92e01696d625f8a263babd022b22f"
    },
    {
      "id": "human_round-75-0",
      "seed": 0,
      "name": "human_round",
      "args": [
        -12345
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-12300"
      },
      "random_state_sha256": "e3895720aac41a9188374cf066d681f8f3a92e01696d625f8a263babd022b22f"
    },
    {
      "id": "padded_limits-76-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-77-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-78-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-79-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-80-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-81-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-82-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-83-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-84-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-85-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "padded_limits-86-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-0.13599796663725433, 0.13599796663725433)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-87-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.13599796663725433, 0.13599796663725433)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-88-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.13599796663725433, 0.13599796663725433)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-89-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.13599796663725433, 0.13599796663725433)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-90-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.2, 0.2)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-91-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(2.592006100088237, 3.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-92-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 3.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-93-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.407993899911763, 3.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-94-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.407993899911763, 3.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-95-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(2.4, 3.6)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-96-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-3.407993899911763, -2.592006100088237)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-97-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.407993899911763, 0.0)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-98-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.407993899911763, 3.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-99-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.407993899911763, 3.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-100-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.6, -2.4)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-101-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-0.08798373309803464, 10.087983733098035)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-102-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.08798373309803464, 10.087983733098035)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-103-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.087983733098035, 10.087983733098035)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-104-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.087983733098035, 10.087983733098035)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-105-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.6000000000000001, 10.6)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-106-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-10.087983733098035, 0.08798373309803464)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-107-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.087983733098035, 0.08798373309803464)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-108-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.087983733098035, 10.087983733098035)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-109-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.087983733098035, 10.087983733098035)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-110-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.6, 0.6000000000000001)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-111-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-5.631975599647052, 9.631975599647053)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-112-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.631975599647052, 9.631975599647053)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-113-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.631975599647053, 9.631975599647053)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-114-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.631975599647053, 9.631975599647053)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-115-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-6.4, 10.4)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-116-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(1.592006100088237, 5.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-117-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 5.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-118-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.407993899911763, 5.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-119-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.407993899911763, 5.407993899911763)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-120-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(1.4, 5.6)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-121-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-13599796.66372542, 113599796.66372544)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-122-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-13599796.66372542, 113599796.66372544)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-123-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-113599796.66372544, 113599796.66372544)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-124-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-113599796.66372544, 113599796.66372544)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "padded_limits-125-0",
      "seed": 0,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-19999999.999999985, 120000000.0)"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "series_color-126-0",
      "seed": 0,
      "name": "series_color",
      "args": [
        [],
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#1f77b4'"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "series_color-127-0",
      "seed": 0,
      "name": "series_color",
      "args": [
        [
          "#123456"
        ],
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#123456'"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "series_color-128-0",
      "seed": 0,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        2
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'red'"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "series_color-129-0",
      "seed": 0,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'blue'"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "maybe_int_or_float-130-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "maybe_int_or_float-131-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "maybe_int_or_float-132-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        -2
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "maybe_int_or_float-133-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        1.0
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "maybe_int_or_float-134-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.00000000001"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "maybe_int_or_float-135-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        2.0000000002
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.0000000002"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "maybe_int_or_float-136-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        2.5
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.5"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "maybe_int_or_float-137-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        -2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-2.00000000001"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "maybe_int_or_float-138-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        1e-12
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1e-12"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "maybe_int_or_float-139-0",
      "seed": 0,
      "name": "maybe_int_or_float",
      "args": [
        1e-09
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1e-09"
      },
      "random_state_sha256": "d6c9a7bf243a1a6354991df096c14a8395587a0b4571f57c21ba5d08bfce0ba2"
    },
    {
      "id": "choose_weighted-140-0",
      "seed": 0,
      "name": "choose_weighted",
      "args": [
        [
          "a",
          "b",
          "c"
        ],
        [
          0.2,
          0.3,
          0.5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'c'"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "choose_weighted-141-0",
      "seed": 0,
      "name": "choose_weighted",
      "args": [
        [
          1,
          2,
          3
        ],
        [
          0,
          0,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "3"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "choose_weighted-142-0",
      "seed": 0,
      "name": "choose_weighted",
      "args": [
        [
          "x",
          "y"
        ],
        [
          8,
          2
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'y'"
      },
      "random_state_sha256": "801d8c5d79551fe1218277b85a96a720ca13b9aa5cd3be1f9ba83bf238bb1c54"
    },
    {
      "id": "sample_word-0-1",
      "seed": 1,
      "name": "sample_word",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'commendador'"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "sample_phrase-1-1",
      "seed": 1,
      "name": "sample_phrase",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Schizoid'"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "sample_phrase-2-1",
      "seed": 1,
      "name": "sample_phrase",
      "args": [
        2,
        4
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Schizoid Bejumbled'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_phrase-3-1",
      "seed": 1,
      "name": "sample_phrase",
      "args": [
        0,
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "''"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "sample_phrase-4-1",
      "seed": 1,
      "name": "sample_phrase",
      "args": [
        1,
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Schizoid Bejumbled'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_label-5-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Bejumbled'"
      },
      "random_state_sha256": "fbe18d8eb2fcc4e90e9d1e5e3c79eceec7e0d1adf70c6d64642e986d23171e55"
    },
    {
      "id": "sample_label-6-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "word"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'commendador'"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "sample_label-7-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "phrase"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Schizoid Bejumbled'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_label-8-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "year"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'2018'"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "sample_label-9-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "quarter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q2 2020'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_label-10-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "month"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Mar-20'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_label-11-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "hybrid"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Commendador 73'"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "sample_label-12-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "numeric"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'17.0'"
      },
      "random_state_sha256": "df1540b88960824cced04034ec1c6bc08a3e704dbf502c8ab0b77ee28b256cd0"
    },
    {
      "id": "sample_label-13-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "code"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'C73'"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "sample_label-14-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "compound"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Commendador / Schizoid'"
      },
      "random_state_sha256": "77e364b9fb2143e18e6eece9907126e33bab31ec0d7f72505c1c12e9ae61c19c"
    },
    {
      "id": "sample_label-15-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "abbr"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'SB'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_label-16-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "slug"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'schizoid_bejumbled98'"
      },
      "random_state_sha256": "928748b60cbb73a75b2639acffd0019d4ca7b30cfd7552bcd7f21321c8708bcc"
    },
    {
      "id": "sample_label-17-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "ordinal"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'5th'"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "sample_label-18-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "paired"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Commendador vs Schizoid'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_label-19-1",
      "seed": 1,
      "name": "sample_label",
      "args": [
        "unknown"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'commendador'"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "sample_series_name-20-1",
      "seed": 1,
      "name": "sample_series_name",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Group 0'"
      },
      "random_state_sha256": "0674990d2b4e974ddced85e8d7690ba8666c6ee403600ab8365245f197e3aaf4"
    },
    {
      "id": "sample_series_name-21-1",
      "seed": 1,
      "name": "sample_series_name",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Group 1'"
      },
      "random_state_sha256": "0674990d2b4e974ddced85e8d7690ba8666c6ee403600ab8365245f197e3aaf4"
    },
    {
      "id": "sample_series_name-22-1",
      "seed": 1,
      "name": "sample_series_name",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Group 2'"
      },
      "random_state_sha256": "0674990d2b4e974ddced85e8d7690ba8666c6ee403600ab8365245f197e3aaf4"
    },
    {
      "id": "sample_series_name-23-1",
      "seed": 1,
      "name": "sample_series_name",
      "args": [
        11
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Group 12'"
      },
      "random_state_sha256": "0674990d2b4e974ddced85e8d7690ba8666c6ee403600ab8365245f197e3aaf4"
    },
    {
      "id": "sample_series_name-24-1",
      "seed": 1,
      "name": "sample_series_name",
      "args": [
        12
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Group 13'"
      },
      "random_state_sha256": "0674990d2b4e974ddced85e8d7690ba8666c6ee403600ab8365245f197e3aaf4"
    },
    {
      "id": "sample_series_name-25-1",
      "seed": 1,
      "name": "sample_series_name",
      "args": [
        99
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Group 100'"
      },
      "random_state_sha256": "0674990d2b4e974ddced85e8d7690ba8666c6ee403600ab8365245f197e3aaf4"
    },
    {
      "id": "sample_title-26-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Geddes Outbound'"
      },
      "random_state_sha256": "6af584108e18d638ee4b8a961be93013e6d36602d2390f219f0fb2f935e547c0"
    },
    {
      "id": "sample_title-27-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Bejumbled 33'"
      },
      "random_state_sha256": "df1540b88960824cced04034ec1c6bc08a3e704dbf502c8ab0b77ee28b256cd0"
    },
    {
      "id": "sample_title-28-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Geddes Outbound'"
      },
      "random_state_sha256": "6af584108e18d638ee4b8a961be93013e6d36602d2390f219f0fb2f935e547c0"
    },
    {
      "id": "sample_title-29-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Bejumbled 33'"
      },
      "random_state_sha256": "df1540b88960824cced04034ec1c6bc08a3e704dbf502c8ab0b77ee28b256cd0"
    },
    {
      "id": "sample_title-30-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Bejumbled 33'"
      },
      "random_state_sha256": "df1540b88960824cced04034ec1c6bc08a3e704dbf502c8ab0b77ee28b256cd0"
    },
    {
      "id": "sample_title-31-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        "barv_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Bejumbled 33'"
      },
      "random_state_sha256": "df1540b88960824cced04034ec1c6bc08a3e704dbf502c8ab0b77ee28b256cd0"
    },
    {
      "id": "sample_title-32-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        "line_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Geddes Outbound'"
      },
      "random_state_sha256": "6af584108e18d638ee4b8a961be93013e6d36602d2390f219f0fb2f935e547c0"
    },
    {
      "id": "sample_title-33-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        "scatter_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Geddes Outbound'"
      },
      "random_state_sha256": "6af584108e18d638ee4b8a961be93013e6d36602d2390f219f0fb2f935e547c0"
    },
    {
      "id": "sample_title-34-1",
      "seed": 1,
      "name": "sample_title",
      "args": [
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Geddes Outbound'"
      },
      "random_state_sha256": "6af584108e18d638ee4b8a961be93013e6d36602d2390f219f0fb2f935e547c0"
    },
    {
      "id": "sample_axis_title-35-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "x",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-36-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "x",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-37-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-38-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-39-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "x",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Stage (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-40-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "y",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (%)'"
      },
      "random_state_sha256": "b1a0232a265b1ff873d07dd4d665fbdb8c7caa7a4b0fc4096730c2d875ddeaf8"
    },
    {
      "id": "sample_axis_title-41-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "y",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-42-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score'"
      },
      "random_state_sha256": "b1a0232a265b1ff873d07dd4d665fbdb8c7caa7a4b0fc4096730c2d875ddeaf8"
    },
    {
      "id": "sample_axis_title-43-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score'"
      },
      "random_state_sha256": "b1a0232a265b1ff873d07dd4d665fbdb8c7caa7a4b0fc4096730c2d875ddeaf8"
    },
    {
      "id": "sample_axis_title-44-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "y",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-45-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "z",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-46-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "z",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-47-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-48-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "sample_axis_title-49-1",
      "seed": 1,
      "name": "sample_axis_title",
      "args": [
        "z",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Score (ms)'"
      },
      "random_state_sha256": "0aa8a62a3b5f9325a04245fd29245f97285a9516d39038594d248d78c34fa0c3"
    },
    {
      "id": "human_round-50-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "human_round-51-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        1e-05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-52-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.01"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-53-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        0.099
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.1"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-54-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        0.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-55-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-56-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        1.2345
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.2"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-57-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        9.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-58-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-59-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        10.05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-60-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        99.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "100.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-61-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "100"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "human_round-62-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        123.45
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "124"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "human_round-63-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "human_round-64-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "human_round-65-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        1234.567
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1234"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "human_round-66-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-0.01"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-67-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -0.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-0.99"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-68-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-1.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-69-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -9.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-70-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-71-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -99.9
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-100.0"
      },
      "random_state_sha256": "218050b35a283c54e80a7febad79a4a13659ab59524dba9bb0adf7c0716a01ac"
    },
    {
      "id": "human_round-72-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-100"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "human_round-73-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "human_round-74-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "human_round-75-1",
      "seed": 1,
      "name": "human_round",
      "args": [
        -12345
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-12344"
      },
      "random_state_sha256": "c7121d3279d5d61c9b59cf77dd6fd11c4b3a8a49e169d26de2816b1012ce0a39"
    },
    {
      "id": "padded_limits-76-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-77-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-78-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-79-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-80-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-81-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-82-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-83-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-84-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-85-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "padded_limits-86-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-0.07209278197011611, 0.07209278197011611)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-87-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.07209278197011611, 0.07209278197011611)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-88-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.07209278197011611, 0.07209278197011611)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-89-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.07209278197011611, 0.07209278197011611)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-90-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.2, 0.2)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-91-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(2.7837216540896517, 3.2162783459103483)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-92-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 3.2162783459103483)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-93-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.2162783459103483, 3.2162783459103483)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-94-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.2162783459103483, 3.2162783459103483)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-95-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(2.4, 3.6)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-96-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-3.2162783459103483, -2.7837216540896517)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-97-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.2162783459103483, 0.0)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-98-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.2162783459103483, 3.2162783459103483)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-99-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.2162783459103483, 3.2162783459103483)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-100-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.6, -2.4)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-101-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(0.42325774423907114, 9.576742255760928)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-102-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 9.576742255760928)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-103-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.576742255760928, 9.576742255760928)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-104-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.576742255760928, 9.576742255760928)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-105-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.6000000000000001, 10.6)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-106-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-9.576742255760928, -0.42325774423907114)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-107-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.576742255760928, 0.0)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-108-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.576742255760928, 9.576742255760928)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-109-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.576742255760928, 9.576742255760928)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-110-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.6, 0.6000000000000001)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-111-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-4.865113383641393, 8.865113383641393)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-112-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-4.865113383641393, 8.865113383641393)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-113-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-8.865113383641393, 8.865113383641393)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-114-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-8.865113383641393, 8.865113383641393)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-115-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-6.4, 10.4)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-116-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(1.7837216540896517, 5.216278345910348)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-117-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 5.216278345910348)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-118-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.216278345910348, 5.216278345910348)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-119-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.216278345910348, 5.216278345910348)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-120-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(1.4, 5.6)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-121-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-7209278.197011599, 107209278.1970116)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-122-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-7209278.197011599, 107209278.1970116)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-123-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-107209278.1970116, 107209278.1970116)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-124-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-107209278.1970116, 107209278.1970116)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "padded_limits-125-1",
      "seed": 1,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-19999999.999999985, 120000000.0)"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "series_color-126-1",
      "seed": 1,
      "name": "series_color",
      "args": [
        [],
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#1f77b4'"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "series_color-127-1",
      "seed": 1,
      "name": "series_color",
      "args": [
        [
          "#123456"
        ],
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#123456'"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "series_color-128-1",
      "seed": 1,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        2
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'red'"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "series_color-129-1",
      "seed": 1,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'blue'"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "maybe_int_or_float-130-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "maybe_int_or_float-131-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "maybe_int_or_float-132-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        -2
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "maybe_int_or_float-133-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        1.0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "maybe_int_or_float-134-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "2"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "maybe_int_or_float-135-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        2.0000000002
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.0000000002"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "maybe_int_or_float-136-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        2.5
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.5"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "maybe_int_or_float-137-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        -2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "maybe_int_or_float-138-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        1e-12
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "maybe_int_or_float-139-1",
      "seed": 1,
      "name": "maybe_int_or_float",
      "args": [
        1e-09
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1e-09"
      },
      "random_state_sha256": "e913369d83d6cd342920e99153c95cfb67b4b3e3291a0cc3a4ccada3a45fa348"
    },
    {
      "id": "choose_weighted-140-1",
      "seed": 1,
      "name": "choose_weighted",
      "args": [
        [
          "a",
          "b",
          "c"
        ],
        [
          0.2,
          0.3,
          0.5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'a'"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "choose_weighted-141-1",
      "seed": 1,
      "name": "choose_weighted",
      "args": [
        [
          1,
          2,
          3
        ],
        [
          0,
          0,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "3"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "choose_weighted-142-1",
      "seed": 1,
      "name": "choose_weighted",
      "args": [
        [
          "x",
          "y"
        ],
        [
          8,
          2
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'x'"
      },
      "random_state_sha256": "854f236a0365c3be89cf22126cc1875b69bebc8287c3d4143a2ded3d520fe79a"
    },
    {
      "id": "sample_word-0-7",
      "seed": 7,
      "name": "sample_word",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'intrusion'"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "sample_phrase-1-7",
      "seed": 7,
      "name": "sample_phrase",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Crisey Microtomic'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_phrase-2-7",
      "seed": 7,
      "name": "sample_phrase",
      "args": [
        2,
        4
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Crisey Microtomic Thank'"
      },
      "random_state_sha256": "e105004fd397c887c46992ddd4b2e4769ffbe457f0ebfb09e7c5a38559e74452"
    },
    {
      "id": "sample_phrase-3-7",
      "seed": 7,
      "name": "sample_phrase",
      "args": [
        0,
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "''"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "sample_phrase-4-7",
      "seed": 7,
      "name": "sample_phrase",
      "args": [
        1,
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Crisey Microtomic Thank'"
      },
      "random_state_sha256": "e105004fd397c887c46992ddd4b2e4769ffbe457f0ebfb09e7c5a38559e74452"
    },
    {
      "id": "sample_label-5-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'2018'"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "sample_label-6-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "word"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'intrusion'"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "sample_label-7-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "phrase"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Crisey Microtomic Thank'"
      },
      "random_state_sha256": "e105004fd397c887c46992ddd4b2e4769ffbe457f0ebfb09e7c5a38559e74452"
    },
    {
      "id": "sample_label-8-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "year"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'2021'"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "sample_label-9-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "quarter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q3 2021'"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "sample_label-10-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "month"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Jun-25'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_label-11-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "hybrid"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Intrusion 20'"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "sample_label-12-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "numeric"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'41.0'"
      },
      "random_state_sha256": "f2fab6a4a1d47dd1f63d54e292513661a1d102512b6a3be29db6c739e806fa97"
    },
    {
      "id": "sample_label-13-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "code"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'F20'"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "sample_label-14-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "compound"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Intrusion-Crisey'"
      },
      "random_state_sha256": "e105004fd397c887c46992ddd4b2e4769ffbe457f0ebfb09e7c5a38559e74452"
    },
    {
      "id": "sample_label-15-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "abbr"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'CMT'"
      },
      "random_state_sha256": "e105004fd397c887c46992ddd4b2e4769ffbe457f0ebfb09e7c5a38559e74452"
    },
    {
      "id": "sample_label-16-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "slug"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'crisey-microtomic-thank69'"
      },
      "random_state_sha256": "bb680d668852fa180d4f17d61f6633f9773f29f880025e5d2bdfdd2cbd3aeed5"
    },
    {
      "id": "sample_label-17-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "ordinal"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'11th'"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "sample_label-18-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "paired"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Intrusion & Crisey'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_label-19-7",
      "seed": 7,
      "name": "sample_label",
      "args": [
        "unknown"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'intrusion'"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "sample_series_name-20-7",
      "seed": 7,
      "name": "sample_series_name",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'L'"
      },
      "random_state_sha256": "3675c5208e20549cf0683a28782aa045cd0557d6a2d5ca74389210c2e56e2a0e"
    },
    {
      "id": "sample_series_name-21-7",
      "seed": 7,
      "name": "sample_series_name",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'A'"
      },
      "random_state_sha256": "3675c5208e20549cf0683a28782aa045cd0557d6a2d5ca74389210c2e56e2a0e"
    },
    {
      "id": "sample_series_name-22-7",
      "seed": 7,
      "name": "sample_series_name",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'B'"
      },
      "random_state_sha256": "3675c5208e20549cf0683a28782aa045cd0557d6a2d5ca74389210c2e56e2a0e"
    },
    {
      "id": "sample_series_name-23-7",
      "seed": 7,
      "name": "sample_series_name",
      "args": [
        11
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'L'"
      },
      "random_state_sha256": "3675c5208e20549cf0683a28782aa045cd0557d6a2d5ca74389210c2e56e2a0e"
    },
    {
      "id": "sample_series_name-24-7",
      "seed": 7,
      "name": "sample_series_name",
      "args": [
        12
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'A'"
      },
      "random_state_sha256": "3675c5208e20549cf0683a28782aa045cd0557d6a2d5ca74389210c2e56e2a0e"
    },
    {
      "id": "sample_series_name-25-7",
      "seed": 7,
      "name": "sample_series_name",
      "args": [
        99
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'D'"
      },
      "random_state_sha256": "3675c5208e20549cf0683a28782aa045cd0557d6a2d5ca74389210c2e56e2a0e"
    },
    {
      "id": "sample_title-26-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Thank / Ls'"
      },
      "random_state_sha256": "f931e265fc781de0a72f044c3259699cbfbdf6c48e130ca64053e55aa9a6ec75"
    },
    {
      "id": "sample_title-27-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Thank / Ls'"
      },
      "random_state_sha256": "f931e265fc781de0a72f044c3259699cbfbdf6c48e130ca64053e55aa9a6ec75"
    },
    {
      "id": "sample_title-28-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'2018'"
      },
      "random_state_sha256": "f931e265fc781de0a72f044c3259699cbfbdf6c48e130ca64053e55aa9a6ec75"
    },
    {
      "id": "sample_title-29-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Microtomic Bismuthite'"
      },
      "random_state_sha256": "bb680d668852fa180d4f17d61f6633f9773f29f880025e5d2bdfdd2cbd3aeed5"
    },
    {
      "id": "sample_title-30-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Microtomic Bismuthite'"
      },
      "random_state_sha256": "bb680d668852fa180d4f17d61f6633f9773f29f880025e5d2bdfdd2cbd3aeed5"
    },
    {
      "id": "sample_title-31-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        "barv_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Microtomic Bismuthite'"
      },
      "random_state_sha256": "bb680d668852fa180d4f17d61f6633f9773f29f880025e5d2bdfdd2cbd3aeed5"
    },
    {
      "id": "sample_title-32-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        "line_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Thank / Ls'"
      },
      "random_state_sha256": "f931e265fc781de0a72f044c3259699cbfbdf6c48e130ca64053e55aa9a6ec75"
    },
    {
      "id": "sample_title-33-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        "scatter_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Thank / Ls'"
      },
      "random_state_sha256": "f931e265fc781de0a72f044c3259699cbfbdf6c48e130ca64053e55aa9a6ec75"
    },
    {
      "id": "sample_title-34-7",
      "seed": 7,
      "name": "sample_title",
      "args": [
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Thank / Ls'"
      },
      "random_state_sha256": "f931e265fc781de0a72f044c3259699cbfbdf6c48e130ca64053e55aa9a6ec75"
    },
    {
      "id": "sample_axis_title-35-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "x",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Month (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-36-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "x",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Month (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-37-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Month (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-38-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Month (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-39-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "x",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Month (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-40-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "y",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f916b630f485bf02678c2f6a3b8978a862efdfd2081da65c02a75787d1afa105"
    },
    {
      "id": "sample_axis_title-41-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "y",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-42-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f916b630f485bf02678c2f6a3b8978a862efdfd2081da65c02a75787d1afa105"
    },
    {
      "id": "sample_axis_title-43-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f916b630f485bf02678c2f6a3b8978a862efdfd2081da65c02a75787d1afa105"
    },
    {
      "id": "sample_axis_title-44-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "y",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-45-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "z",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-46-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "z",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-47-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-48-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "sample_axis_title-49-7",
      "seed": 7,
      "name": "sample_axis_title",
      "args": [
        "z",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Throughput (samples)'"
      },
      "random_state_sha256": "f9a2c682f3e0e5cadd0a512fa733a7785f111f6426a17f81f064241ae3a9d977"
    },
    {
      "id": "human_round-50-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "human_round-51-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        1e-05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-52-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-53-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        0.099
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.1"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-54-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        0.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-55-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-56-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        1.2345
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.2"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-57-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        9.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-58-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-59-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        10.05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-60-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        99.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "100.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-61-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "100"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "human_round-62-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        123.45
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "125"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "human_round-63-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "human_round-64-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "human_round-65-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        1234.567
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1235"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "human_round-66-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-67-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -0.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-0.99"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-68-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-1.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-69-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -9.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-70-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-71-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -99.9
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-100.0"
      },
      "random_state_sha256": "1830f2b9d84c43b9fa6f322135febfee8fa8743449332548392698a8ed6defce"
    },
    {
      "id": "human_round-72-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-100"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "human_round-73-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "human_round-74-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "human_round-75-7",
      "seed": 7,
      "name": "human_round",
      "args": [
        -12345
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-12345"
      },
      "random_state_sha256": "3229cfc4b6373b3678a195100708880a421889b68a819fc115cbe92aa108acc0"
    },
    {
      "id": "padded_limits-76-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-77-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-78-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-79-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-80-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-81-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-82-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-83-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-84-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-85-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "padded_limits-86-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-0.08914494883498461, 0.08914494883498461)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-87-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.08914494883498461, 0.08914494883498461)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-88-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.08914494883498461, 0.08914494883498461)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-89-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.08914494883498461, 0.08914494883498461)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-90-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.2, 0.2)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-91-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(2.732565153495046, 3.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-92-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 3.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-93-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.267434846504954, 3.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-94-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.267434846504954, 3.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-95-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(2.4, 3.6)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-96-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-3.267434846504954, -2.732565153495046)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-97-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.267434846504954, 0.0)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-98-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.267434846504954, 3.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-99-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.267434846504954, 3.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-100-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.6, -2.4)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-101-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(0.2868404093201231, 9.713159590679878)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-102-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 9.713159590679878)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-103-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.713159590679878, 9.713159590679878)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-104-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.713159590679878, 9.713159590679878)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-105-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.6000000000000001, 10.6)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-106-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-9.713159590679878, -0.2868404093201231)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-107-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.713159590679878, 0.0)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-108-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.713159590679878, 9.713159590679878)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-109-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.713159590679878, 9.713159590679878)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-110-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.6, 0.6000000000000001)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-111-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-5.069739386019815, 9.069739386019815)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-112-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.069739386019815, 9.069739386019815)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-113-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.069739386019815, 9.069739386019815)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-114-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.069739386019815, 9.069739386019815)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-115-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-6.4, 10.4)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-116-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(1.7325651534950461, 5.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-117-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 5.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-118-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.267434846504954, 5.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-119-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.267434846504954, 5.267434846504954)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-120-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(1.4, 5.6)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-121-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-8914494.88349845, 108914494.88349846)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-122-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-8914494.88349845, 108914494.88349846)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-123-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-108914494.88349846, 108914494.88349846)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-124-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-108914494.88349846, 108914494.88349846)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "padded_limits-125-7",
      "seed": 7,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-19999999.999999985, 120000000.0)"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "series_color-126-7",
      "seed": 7,
      "name": "series_color",
      "args": [
        [],
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#1f77b4'"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "series_color-127-7",
      "seed": 7,
      "name": "series_color",
      "args": [
        [
          "#123456"
        ],
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#123456'"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "series_color-128-7",
      "seed": 7,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        2
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'red'"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "series_color-129-7",
      "seed": 7,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'blue'"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "maybe_int_or_float-130-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "maybe_int_or_float-131-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "maybe_int_or_float-132-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        -2
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "maybe_int_or_float-133-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        1.0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "maybe_int_or_float-134-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "2"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "maybe_int_or_float-135-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        2.0000000002
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.0000000002"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "maybe_int_or_float-136-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        2.5
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.5"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "maybe_int_or_float-137-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        -2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "maybe_int_or_float-138-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        1e-12
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "maybe_int_or_float-139-7",
      "seed": 7,
      "name": "maybe_int_or_float",
      "args": [
        1e-09
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1e-09"
      },
      "random_state_sha256": "e9c954504f0ab33be368c2fd7e814a91a5324d67e695f4a74d12fbe3c072b5d2"
    },
    {
      "id": "choose_weighted-140-7",
      "seed": 7,
      "name": "choose_weighted",
      "args": [
        [
          "a",
          "b",
          "c"
        ],
        [
          0.2,
          0.3,
          0.5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'b'"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "choose_weighted-141-7",
      "seed": 7,
      "name": "choose_weighted",
      "args": [
        [
          1,
          2,
          3
        ],
        [
          0,
          0,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "3"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "choose_weighted-142-7",
      "seed": 7,
      "name": "choose_weighted",
      "args": [
        [
          "x",
          "y"
        ],
        [
          8,
          2
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'x'"
      },
      "random_state_sha256": "640f871d57b7033650f6185c881d6edba010e5bba67808bfaa58b4a5dcc00d6a"
    },
    {
      "id": "sample_word-0-42",
      "seed": 42,
      "name": "sample_word",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'tadpole'"
      },
      "random_state_sha256": "933f4fbe8adb58fb0881e9f79ebc0f22e0bf284d86ba954d91edbe9324bb29c4"
    },
    {
      "id": "sample_phrase-1-42",
      "seed": 42,
      "name": "sample_phrase",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chandul Ananism Wordier'"
      },
      "random_state_sha256": "a712a7fa797464354c988b9c95de50d8709bbad87c7b78ca2ca4acdfd0cb6d37"
    },
    {
      "id": "sample_phrase-2-42",
      "seed": 42,
      "name": "sample_phrase",
      "args": [
        2,
        4
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chandul Ananism Wordier Guzzledom'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_phrase-3-42",
      "seed": 42,
      "name": "sample_phrase",
      "args": [
        0,
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "''"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "sample_phrase-4-42",
      "seed": 42,
      "name": "sample_phrase",
      "args": [
        1,
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chandul Ananism Wordier Guzzledom Freest Faint-green'"
      },
      "random_state_sha256": "a01bac0ad3dcd62595fe5e2a86e572ffdc2e8bbada7c2a17f5051e1f68b165ef"
    },
    {
      "id": "sample_label-5-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Ananism 95'"
      },
      "random_state_sha256": "a712a7fa797464354c988b9c95de50d8709bbad87c7b78ca2ca4acdfd0cb6d37"
    },
    {
      "id": "sample_label-6-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "word"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole'"
      },
      "random_state_sha256": "0af852c88917f91d8401aa32f20cfc2bfcbbf76e951c6d9b19673190ccc19848"
    },
    {
      "id": "sample_label-7-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "phrase"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chandul Ananism Wordier Guzzledom'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_label-8-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "year"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'2026'"
      },
      "random_state_sha256": "933f4fbe8adb58fb0881e9f79ebc0f22e0bf284d86ba954d91edbe9324bb29c4"
    },
    {
      "id": "sample_label-9-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "quarter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q1 2019'"
      },
      "random_state_sha256": "0af852c88917f91d8401aa32f20cfc2bfcbbf76e951c6d9b19673190ccc19848"
    },
    {
      "id": "sample_label-10-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "month"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Nov'"
      },
      "random_state_sha256": "0af852c88917f91d8401aa32f20cfc2bfcbbf76e951c6d9b19673190ccc19848"
    },
    {
      "id": "sample_label-11-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "hybrid"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole 15'"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "sample_label-12-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "numeric"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'81.0'"
      },
      "random_state_sha256": "a01bac0ad3dcd62595fe5e2a86e572ffdc2e8bbada7c2a17f5051e1f68b165ef"
    },
    {
      "id": "sample_label-13-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "code"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'K15'"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "sample_label-14-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "compound"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole-Chandul'"
      },
      "random_state_sha256": "a712a7fa797464354c988b9c95de50d8709bbad87c7b78ca2ca4acdfd0cb6d37"
    },
    {
      "id": "sample_label-15-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "abbr"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'CAWG'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_label-16-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "slug"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'ananism_wordier18'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_label-17-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "ordinal"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'21st'"
      },
      "random_state_sha256": "933f4fbe8adb58fb0881e9f79ebc0f22e0bf284d86ba954d91edbe9324bb29c4"
    },
    {
      "id": "sample_label-18-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "paired"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole vs Chandul'"
      },
      "random_state_sha256": "0af852c88917f91d8401aa32f20cfc2bfcbbf76e951c6d9b19673190ccc19848"
    },
    {
      "id": "sample_label-19-42",
      "seed": 42,
      "name": "sample_label",
      "args": [
        "unknown"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'tadpole'"
      },
      "random_state_sha256": "933f4fbe8adb58fb0881e9f79ebc0f22e0bf284d86ba954d91edbe9324bb29c4"
    },
    {
      "id": "sample_series_name-20-42",
      "seed": 42,
      "name": "sample_series_name",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole 0'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_series_name-21-42",
      "seed": 42,
      "name": "sample_series_name",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole 1'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_series_name-22-42",
      "seed": 42,
      "name": "sample_series_name",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole 2'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_series_name-23-42",
      "seed": 42,
      "name": "sample_series_name",
      "args": [
        11
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole 12'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_series_name-24-42",
      "seed": 42,
      "name": "sample_series_name",
      "args": [
        12
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole 13'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_series_name-25-42",
      "seed": 42,
      "name": "sample_series_name",
      "args": [
        99
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Tadpole 100'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_title-26-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Guzzledom'"
      },
      "random_state_sha256": "a01bac0ad3dcd62595fe5e2a86e572ffdc2e8bbada7c2a17f5051e1f68b165ef"
    },
    {
      "id": "sample_title-27-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Wordier Faint-green'"
      },
      "random_state_sha256": "138549b4c8ce9f3212c624ace202b69d9f0c39a517bad79b6f39be5a47ece575"
    },
    {
      "id": "sample_title-28-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Guzzledom & Carnauba'"
      },
      "random_state_sha256": "23d1102b3e4d543250a83eee36943682a98d36edb680eab1996a7d44f725529b"
    },
    {
      "id": "sample_title-29-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Guzzledom & Carnauba'"
      },
      "random_state_sha256": "23d1102b3e4d543250a83eee36943682a98d36edb680eab1996a7d44f725529b"
    },
    {
      "id": "sample_title-30-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Guzzledom & Carnauba'"
      },
      "random_state_sha256": "23d1102b3e4d543250a83eee36943682a98d36edb680eab1996a7d44f725529b"
    },
    {
      "id": "sample_title-31-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        "barv_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Guzzledom & Carnauba'"
      },
      "random_state_sha256": "23d1102b3e4d543250a83eee36943682a98d36edb680eab1996a7d44f725529b"
    },
    {
      "id": "sample_title-32-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        "line_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Guzzledom'"
      },
      "random_state_sha256": "a01bac0ad3dcd62595fe5e2a86e572ffdc2e8bbada7c2a17f5051e1f68b165ef"
    },
    {
      "id": "sample_title-33-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        "scatter_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Guzzledom'"
      },
      "random_state_sha256": "a01bac0ad3dcd62595fe5e2a86e572ffdc2e8bbada7c2a17f5051e1f68b165ef"
    },
    {
      "id": "sample_title-34-42",
      "seed": 42,
      "name": "sample_title",
      "args": [
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Guzzledom'"
      },
      "random_state_sha256": "a01bac0ad3dcd62595fe5e2a86e572ffdc2e8bbada7c2a17f5051e1f68b165ef"
    },
    {
      "id": "sample_axis_title-35-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "x",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Time (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-36-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "x",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Time (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-37-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Time (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-38-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Time (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-39-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "x",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Time (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-40-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "y",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (px)'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_axis_title-41-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "y",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-42-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (%)'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_axis_title-43-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (%)'"
      },
      "random_state_sha256": "75359d1dff98710e0baeeec0cbec8e245611f38180c4e1bb5d3575f605c255ef"
    },
    {
      "id": "sample_axis_title-44-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "y",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-45-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "z",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-46-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "z",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-47-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-48-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "sample_axis_title-49-42",
      "seed": 42,
      "name": "sample_axis_title",
      "args": [
        "z",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Value (ops/s)'"
      },
      "random_state_sha256": "83f8fd4e0ce7f2bd288c0836dda6f35bf0e9f231ef2cc98fbceb44bca04b3af4"
    },
    {
      "id": "human_round-50-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "human_round-51-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        1e-05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-52-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.005"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-53-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        0.099
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.099"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-54-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        0.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.999"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-55-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-56-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        1.2345
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.23"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-57-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        9.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-58-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-59-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        10.05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-60-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        99.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "100.0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-61-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "100"
      },
      "random_state_sha256": "a712a7fa797464354c988b9c95de50d8709bbad87c7b78ca2ca4acdfd0cb6d37"
    },
    {
      "id": "human_round-62-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        123.45
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "123"
      },
      "random_state_sha256": "a712a7fa797464354c988b9c95de50d8709bbad87c7b78ca2ca4acdfd0cb6d37"
    },
    {
      "id": "human_round-63-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "a712a7fa797464354c988b9c95de50d8709bbad87c7b78ca2ca4acdfd0cb6d37"
    },
    {
      "id": "human_round-64-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "0af852c88917f91d8401aa32f20cfc2bfcbbf76e951c6d9b19673190ccc19848"
    },
    {
      "id": "human_round-65-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        1234.567
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1250"
      },
      "random_state_sha256": "0af852c88917f91d8401aa32f20cfc2bfcbbf76e951c6d9b19673190ccc19848"
    },
    {
      "id": "human_round-66-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-0.005"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-67-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -0.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-0.99"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-68-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-1.0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-69-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -9.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-9.99"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-70-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-71-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -99.9
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-99.9"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "human_round-72-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-100"
      },
      "random_state_sha256": "a712a7fa797464354c988b9c95de50d8709bbad87c7b78ca2ca4acdfd0cb6d37"
    },
    {
      "id": "human_round-73-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "a712a7fa797464354c988b9c95de50d8709bbad87c7b78ca2ca4acdfd0cb6d37"
    },
    {
      "id": "human_round-74-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "0af852c88917f91d8401aa32f20cfc2bfcbbf76e951c6d9b19673190ccc19848"
    },
    {
      "id": "human_round-75-42",
      "seed": 42,
      "name": "human_round",
      "args": [
        -12345
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-12350"
      },
      "random_state_sha256": "0af852c88917f91d8401aa32f20cfc2bfcbbf76e951c6d9b19673190ccc19848"
    },
    {
      "id": "padded_limits-76-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-77-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-78-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-79-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-80-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-81-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-82-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-83-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-84-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-85-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "padded_limits-86-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-0.11754841186120954, 0.11754841186120954)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-87-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.11754841186120954, 0.11754841186120954)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-88-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.11754841186120954, 0.11754841186120954)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-89-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.11754841186120954, 0.11754841186120954)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-90-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.2, 0.2)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-91-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(2.6473547644163715, 3.3526452355836285)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-92-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 3.3526452355836285)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-93-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.3526452355836285, 3.3526452355836285)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-94-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.3526452355836285, 3.3526452355836285)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-95-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(2.4, 3.6)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-96-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-3.3526452355836285, -2.6473547644163715)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-97-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.3526452355836285, 0.0)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-98-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.3526452355836285, 3.3526452355836285)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-99-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.3526452355836285, 3.3526452355836285)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-100-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.6, -2.4)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-101-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(0.05961270511032368, 9.940387294889677)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-102-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 9.940387294889677)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-103-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.940387294889677, 9.940387294889677)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-104-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.940387294889677, 9.940387294889677)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-105-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.6000000000000001, 10.6)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-106-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-9.940387294889677, -0.05961270511032368)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-107-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.940387294889677, 0.0)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-108-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.940387294889677, 9.940387294889677)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-109-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.940387294889677, 9.940387294889677)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-110-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.6, 0.6000000000000001)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-111-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-5.410580942334514, 9.410580942334514)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-112-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.410580942334514, 9.410580942334514)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-113-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.410580942334514, 9.410580942334514)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-114-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.410580942334514, 9.410580942334514)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-115-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-6.4, 10.4)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-116-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(1.6473547644163715, 5.352645235583629)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-117-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 5.352645235583629)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-118-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.352645235583629, 5.352645235583629)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-119-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.352645235583629, 5.352645235583629)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-120-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(1.4, 5.6)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-121-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-11754841.186120942, 111754841.18612096)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-122-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-11754841.186120942, 111754841.18612096)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-123-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-111754841.18612096, 111754841.18612096)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-124-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-111754841.18612096, 111754841.18612096)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "padded_limits-125-42",
      "seed": 42,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-19999999.999999985, 120000000.0)"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "series_color-126-42",
      "seed": 42,
      "name": "series_color",
      "args": [
        [],
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#1f77b4'"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "series_color-127-42",
      "seed": 42,
      "name": "series_color",
      "args": [
        [
          "#123456"
        ],
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#123456'"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "series_color-128-42",
      "seed": 42,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        2
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'red'"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "series_color-129-42",
      "seed": 42,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'blue'"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "maybe_int_or_float-130-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "maybe_int_or_float-131-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "maybe_int_or_float-132-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        -2
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "maybe_int_or_float-133-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        1.0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "maybe_int_or_float-134-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "2"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "maybe_int_or_float-135-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        2.0000000002
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.0000000002"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "maybe_int_or_float-136-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        2.5
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.5"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "maybe_int_or_float-137-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        -2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "maybe_int_or_float-138-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        1e-12
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "maybe_int_or_float-139-42",
      "seed": 42,
      "name": "maybe_int_or_float",
      "args": [
        1e-09
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1e-09"
      },
      "random_state_sha256": "0a894bf75b44d051aae9a43e50e8a0f18c9175a5c57e6d381012960d2519ef98"
    },
    {
      "id": "choose_weighted-140-42",
      "seed": 42,
      "name": "choose_weighted",
      "args": [
        [
          "a",
          "b",
          "c"
        ],
        [
          0.2,
          0.3,
          0.5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'c'"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "choose_weighted-141-42",
      "seed": 42,
      "name": "choose_weighted",
      "args": [
        [
          1,
          2,
          3
        ],
        [
          0,
          0,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "3"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "choose_weighted-142-42",
      "seed": 42,
      "name": "choose_weighted",
      "args": [
        [
          "x",
          "y"
        ],
        [
          8,
          2
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'x'"
      },
      "random_state_sha256": "bdedcc4c7a9f74e5ea606ab4d06580993127d0cc5a5e326bd9d4e442fe281dc8"
    },
    {
      "id": "sample_word-0-2026",
      "seed": 2026,
      "name": "sample_word",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chubb'"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "sample_phrase-1-2026",
      "seed": 2026,
      "name": "sample_phrase",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Insalivation'"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_phrase-2-2026",
      "seed": 2026,
      "name": "sample_phrase",
      "args": [
        2,
        4
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Insalivation Precedently'"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "sample_phrase-3-2026",
      "seed": 2026,
      "name": "sample_phrase",
      "args": [
        0,
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "''"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "sample_phrase-4-2026",
      "seed": 2026,
      "name": "sample_phrase",
      "args": [
        1,
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Insalivation'"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_label-5-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'precedently'"
      },
      "random_state_sha256": "49ff76c795c344a634ae9ead010976fc29dceb2202e0fe6af4767034f9dea716"
    },
    {
      "id": "sample_label-6-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "word"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chubb'"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "sample_label-7-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "phrase"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Insalivation Precedently'"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "sample_label-8-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "year"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'2017'"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "sample_label-9-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "quarter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q1 2024'"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_label-10-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "month"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Feb'"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "sample_label-11-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "hybrid"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chubb 41'"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_label-12-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "numeric"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'955'"
      },
      "random_state_sha256": "75e1a0ffe48077e1f1064ad241a922c4e0fe24776e31a9e4053d6596615644a2"
    },
    {
      "id": "sample_label-13-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "code"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'B41'"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_label-14-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "compound"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chubb-Insalivation'"
      },
      "random_state_sha256": "16e91f92288e9bb4cb6e47bb4347682ca28e69c3b12ad56fae328ad420394916"
    },
    {
      "id": "sample_label-15-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "abbr"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'IP'"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "sample_label-16-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "slug"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'insalivation-precedently'"
      },
      "random_state_sha256": "75e1a0ffe48077e1f1064ad241a922c4e0fe24776e31a9e4053d6596615644a2"
    },
    {
      "id": "sample_label-17-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "ordinal"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'4th'"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "sample_label-18-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "paired"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chubb and Insalivation'"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "sample_label-19-2026",
      "seed": 2026,
      "name": "sample_label",
      "args": [
        "unknown"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Chubb'"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "sample_series_name-20-2026",
      "seed": 2026,
      "name": "sample_series_name",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Run 0'"
      },
      "random_state_sha256": "1a1bfbc602985661376c9e87ca9ce1414d4e750124a61a5e4cfe124a8645af90"
    },
    {
      "id": "sample_series_name-21-2026",
      "seed": 2026,
      "name": "sample_series_name",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Run 1'"
      },
      "random_state_sha256": "1a1bfbc602985661376c9e87ca9ce1414d4e750124a61a5e4cfe124a8645af90"
    },
    {
      "id": "sample_series_name-22-2026",
      "seed": 2026,
      "name": "sample_series_name",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Run 2'"
      },
      "random_state_sha256": "1a1bfbc602985661376c9e87ca9ce1414d4e750124a61a5e4cfe124a8645af90"
    },
    {
      "id": "sample_series_name-23-2026",
      "seed": 2026,
      "name": "sample_series_name",
      "args": [
        11
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Run 12'"
      },
      "random_state_sha256": "1a1bfbc602985661376c9e87ca9ce1414d4e750124a61a5e4cfe124a8645af90"
    },
    {
      "id": "sample_series_name-24-2026",
      "seed": 2026,
      "name": "sample_series_name",
      "args": [
        12
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Run 13'"
      },
      "random_state_sha256": "1a1bfbc602985661376c9e87ca9ce1414d4e750124a61a5e4cfe124a8645af90"
    },
    {
      "id": "sample_series_name-25-2026",
      "seed": 2026,
      "name": "sample_series_name",
      "args": [
        99
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Run 100'"
      },
      "random_state_sha256": "1a1bfbc602985661376c9e87ca9ce1414d4e750124a61a5e4cfe124a8645af90"
    },
    {
      "id": "sample_title-26-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies Caroch Smokejumper Nephrotic'"
      },
      "random_state_sha256": "136fdd6b8537da49076473f4bd4cce51d8100840aafde73260c8f0983d89dbf9"
    },
    {
      "id": "sample_title-27-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies'"
      },
      "random_state_sha256": "e58006ba181c58b9e96c41c1bac3439ac92bc4adf10357eeec141b44fb08239c"
    },
    {
      "id": "sample_title-28-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies Caroch Smokejumper Nephrotic'"
      },
      "random_state_sha256": "136fdd6b8537da49076473f4bd4cce51d8100840aafde73260c8f0983d89dbf9"
    },
    {
      "id": "sample_title-29-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies'"
      },
      "random_state_sha256": "e58006ba181c58b9e96c41c1bac3439ac92bc4adf10357eeec141b44fb08239c"
    },
    {
      "id": "sample_title-30-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies'"
      },
      "random_state_sha256": "e58006ba181c58b9e96c41c1bac3439ac92bc4adf10357eeec141b44fb08239c"
    },
    {
      "id": "sample_title-31-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        "barv_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies'"
      },
      "random_state_sha256": "e58006ba181c58b9e96c41c1bac3439ac92bc4adf10357eeec141b44fb08239c"
    },
    {
      "id": "sample_title-32-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        "line_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies Caroch Smokejumper Nephrotic'"
      },
      "random_state_sha256": "136fdd6b8537da49076473f4bd4cce51d8100840aafde73260c8f0983d89dbf9"
    },
    {
      "id": "sample_title-33-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        "scatter_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies Caroch Smokejumper Nephrotic'"
      },
      "random_state_sha256": "136fdd6b8537da49076473f4bd4cce51d8100840aafde73260c8f0983d89dbf9"
    },
    {
      "id": "sample_title-34-2026",
      "seed": 2026,
      "name": "sample_title",
      "args": [
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Progenies Caroch Smokejumper Nephrotic'"
      },
      "random_state_sha256": "136fdd6b8537da49076473f4bd4cce51d8100840aafde73260c8f0983d89dbf9"
    },
    {
      "id": "sample_axis_title-35-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "x",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-36-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "x",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-37-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-38-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-39-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "x",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-40-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "y",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-41-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "y",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-42-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-43-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-44-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "y",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-45-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "z",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-46-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "z",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-47-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-48-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_axis_title-49-2026",
      "seed": 2026,
      "name": "sample_axis_title",
      "args": [
        "z",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "NoneType",
        "repr": "None"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "human_round-50-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "human_round-51-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        1e-05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-52-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.005"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-53-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        0.099
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.099"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-54-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        0.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.999"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-55-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-56-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        1.2345
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.23"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-57-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        9.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-58-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-59-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        10.05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-60-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        99.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "100.0"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-61-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "100"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "human_round-62-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        123.45
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "123"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "human_round-63-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "human_round-64-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "human_round-65-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        1234.567
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1235"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "human_round-66-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-0.005"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-67-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -0.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-0.99"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-68-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-1.0"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-69-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -9.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-9.99"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-70-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-71-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -99.9
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-99.9"
      },
      "random_state_sha256": "01bd2d485402c6fc0048f5280aeb451622b65e599dd2d2bc050b4e409b1d48fb"
    },
    {
      "id": "human_round-72-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-100"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "human_round-73-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "human_round-74-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "human_round-75-2026",
      "seed": 2026,
      "name": "human_round",
      "args": [
        -12345
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-12345"
      },
      "random_state_sha256": "032ff1721fb4f63fa04a6df37baedc1e087a309807c8ae3ddfcb2cdf6143422c"
    },
    {
      "id": "padded_limits-76-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-77-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-78-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-79-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-80-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-81-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-82-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-83-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-84-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-85-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "padded_limits-86-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-0.07072078964675668, 0.07072078964675668)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-87-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.07072078964675668, 0.07072078964675668)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-88-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.07072078964675668, 0.07072078964675668)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-89-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.07072078964675668, 0.07072078964675668)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-90-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.2, 0.2)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-91-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(2.78783763105973, 3.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-92-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 3.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-93-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.21216236894027, 3.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-94-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.21216236894027, 3.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-95-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(2.4, 3.6)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-96-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-3.21216236894027, -2.78783763105973)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-97-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.21216236894027, 0.0)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-98-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.21216236894027, 3.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-99-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.21216236894027, 3.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-100-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.6, -2.4)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-101-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(0.43423368282594654, 9.565766317174054)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-102-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 9.565766317174054)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-103-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.565766317174054, 9.565766317174054)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-104-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.565766317174054, 9.565766317174054)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-105-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.6000000000000001, 10.6)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-106-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-9.565766317174054, -0.43423368282594654)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-107-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.565766317174054, 0.0)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-108-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.565766317174054, 9.565766317174054)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-109-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.565766317174054, 9.565766317174054)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-110-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.6, 0.6000000000000001)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-111-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-4.84864947576108, 8.84864947576108)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-112-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-4.84864947576108, 8.84864947576108)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-113-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-8.84864947576108, 8.84864947576108)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-114-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-8.84864947576108, 8.84864947576108)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-115-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-6.4, 10.4)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-116-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(1.78783763105973, 5.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-117-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 5.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-118-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.21216236894027, 5.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-119-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.21216236894027, 5.21216236894027)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-120-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(1.4, 5.6)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-121-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-7072078.9646756565, 107072078.96467566)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-122-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-7072078.9646756565, 107072078.96467566)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-123-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-107072078.96467566, 107072078.96467566)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-124-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-107072078.96467566, 107072078.96467566)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "padded_limits-125-2026",
      "seed": 2026,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-19999999.999999985, 120000000.0)"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "series_color-126-2026",
      "seed": 2026,
      "name": "series_color",
      "args": [
        [],
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#1f77b4'"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "series_color-127-2026",
      "seed": 2026,
      "name": "series_color",
      "args": [
        [
          "#123456"
        ],
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#123456'"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "series_color-128-2026",
      "seed": 2026,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        2
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'red'"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "series_color-129-2026",
      "seed": 2026,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'blue'"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "maybe_int_or_float-130-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "maybe_int_or_float-131-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "maybe_int_or_float-132-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        -2
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "maybe_int_or_float-133-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        1.0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "maybe_int_or_float-134-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "2"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "maybe_int_or_float-135-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        2.0000000002
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.0000000002"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "maybe_int_or_float-136-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        2.5
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.5"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "maybe_int_or_float-137-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        -2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "maybe_int_or_float-138-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        1e-12
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "maybe_int_or_float-139-2026",
      "seed": 2026,
      "name": "maybe_int_or_float",
      "args": [
        1e-09
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1e-09"
      },
      "random_state_sha256": "c31e52f49e32300b96c8db739f85b865d6a32fa5953086a3a9e6fb7a1020d781"
    },
    {
      "id": "choose_weighted-140-2026",
      "seed": 2026,
      "name": "choose_weighted",
      "args": [
        [
          "a",
          "b",
          "c"
        ],
        [
          0.2,
          0.3,
          0.5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'a'"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "choose_weighted-141-2026",
      "seed": 2026,
      "name": "choose_weighted",
      "args": [
        [
          1,
          2,
          3
        ],
        [
          0,
          0,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "3"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "choose_weighted-142-2026",
      "seed": 2026,
      "name": "choose_weighted",
      "args": [
        [
          "x",
          "y"
        ],
        [
          8,
          2
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'x'"
      },
      "random_state_sha256": "c2e3fd2df1a5545f0701681bcd6bb16677e7eeeefad0a6d445f77dece0216253"
    },
    {
      "id": "sample_word-0-2147483647",
      "seed": 2147483647,
      "name": "sample_word",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'ingestion'"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "sample_phrase-1-2147483647",
      "seed": 2147483647,
      "name": "sample_phrase",
      "args": [],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Cyclist Ecoute'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_phrase-2-2147483647",
      "seed": 2147483647,
      "name": "sample_phrase",
      "args": [
        2,
        4
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Cyclist Ecoute Hezron'"
      },
      "random_state_sha256": "7525bcb88ee55462f4b8c5df2fd9ddd52135a2c16d64d9886fdd8dbddc052fc3"
    },
    {
      "id": "sample_phrase-3-2147483647",
      "seed": 2147483647,
      "name": "sample_phrase",
      "args": [
        0,
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "''"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "sample_phrase-4-2147483647",
      "seed": 2147483647,
      "name": "sample_phrase",
      "args": [
        1,
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Cyclist Ecoute Hezron'"
      },
      "random_state_sha256": "7525bcb88ee55462f4b8c5df2fd9ddd52135a2c16d64d9886fdd8dbddc052fc3"
    },
    {
      "id": "sample_label-5-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Ecoute Hezron'"
      },
      "random_state_sha256": "7525bcb88ee55462f4b8c5df2fd9ddd52135a2c16d64d9886fdd8dbddc052fc3"
    },
    {
      "id": "sample_label-6-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "word"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'ingestion'"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "sample_label-7-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "phrase"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Cyclist Ecoute Hezron'"
      },
      "random_state_sha256": "7525bcb88ee55462f4b8c5df2fd9ddd52135a2c16d64d9886fdd8dbddc052fc3"
    },
    {
      "id": "sample_label-8-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "year"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'2021'"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "sample_label-9-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "quarter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Q3 2020'"
      },
      "random_state_sha256": "d16d5ae521494a6e72bfc30df40cb9ca2a7f7560a1e83218d2454c828822c0ae"
    },
    {
      "id": "sample_label-10-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "month"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Jun-20'"
      },
      "random_state_sha256": "d16d5ae521494a6e72bfc30df40cb9ca2a7f7560a1e83218d2454c828822c0ae"
    },
    {
      "id": "sample_label-11-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "hybrid"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Ingestion 16'"
      },
      "random_state_sha256": "d16d5ae521494a6e72bfc30df40cb9ca2a7f7560a1e83218d2454c828822c0ae"
    },
    {
      "id": "sample_label-12-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "numeric"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'92.0'"
      },
      "random_state_sha256": "fb783d1a3a8d1dce01af35c9b79df9e7aaf3e95c0415b415e1f739aa93315baf"
    },
    {
      "id": "sample_label-13-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "code"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'F16'"
      },
      "random_state_sha256": "d16d5ae521494a6e72bfc30df40cb9ca2a7f7560a1e83218d2454c828822c0ae"
    },
    {
      "id": "sample_label-14-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "compound"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Ingestion-Cyclist'"
      },
      "random_state_sha256": "7525bcb88ee55462f4b8c5df2fd9ddd52135a2c16d64d9886fdd8dbddc052fc3"
    },
    {
      "id": "sample_label-15-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "abbr"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'CEH'"
      },
      "random_state_sha256": "7525bcb88ee55462f4b8c5df2fd9ddd52135a2c16d64d9886fdd8dbddc052fc3"
    },
    {
      "id": "sample_label-16-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "slug"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'cyclist_ecoute_hezron69'"
      },
      "random_state_sha256": "6b291c5df67d88b99514e15f5206522971724f5ff2fd3e81eae8a7886d6439c3"
    },
    {
      "id": "sample_label-17-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "ordinal"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'11th'"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "sample_label-18-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "paired"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Ingestion vs Cyclist'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_label-19-2147483647",
      "seed": 2147483647,
      "name": "sample_label",
      "args": [
        "unknown"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'ingestion'"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "sample_series_name-20-2147483647",
      "seed": 2147483647,
      "name": "sample_series_name",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Batch 0'"
      },
      "random_state_sha256": "6b291c5df67d88b99514e15f5206522971724f5ff2fd3e81eae8a7886d6439c3"
    },
    {
      "id": "sample_series_name-21-2147483647",
      "seed": 2147483647,
      "name": "sample_series_name",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Batch 1'"
      },
      "random_state_sha256": "6b291c5df67d88b99514e15f5206522971724f5ff2fd3e81eae8a7886d6439c3"
    },
    {
      "id": "sample_series_name-22-2147483647",
      "seed": 2147483647,
      "name": "sample_series_name",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Batch 2'"
      },
      "random_state_sha256": "6b291c5df67d88b99514e15f5206522971724f5ff2fd3e81eae8a7886d6439c3"
    },
    {
      "id": "sample_series_name-23-2147483647",
      "seed": 2147483647,
      "name": "sample_series_name",
      "args": [
        11
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Batch 12'"
      },
      "random_state_sha256": "6b291c5df67d88b99514e15f5206522971724f5ff2fd3e81eae8a7886d6439c3"
    },
    {
      "id": "sample_series_name-24-2147483647",
      "seed": 2147483647,
      "name": "sample_series_name",
      "args": [
        12
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Batch 13'"
      },
      "random_state_sha256": "6b291c5df67d88b99514e15f5206522971724f5ff2fd3e81eae8a7886d6439c3"
    },
    {
      "id": "sample_series_name-25-2147483647",
      "seed": 2147483647,
      "name": "sample_series_name",
      "args": [
        99
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Batch 100'"
      },
      "random_state_sha256": "6b291c5df67d88b99514e15f5206522971724f5ff2fd3e81eae8a7886d6439c3"
    },
    {
      "id": "sample_title-26-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        null
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Hv / Rei'"
      },
      "random_state_sha256": "1fb75494bab8dac84d65c9dd789fc7f7adfe51c61ad9ca31ea1f0b9d89ebd740"
    },
    {
      "id": "sample_title-27-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Hv / Rei'"
      },
      "random_state_sha256": "1fb75494bab8dac84d65c9dd789fc7f7adfe51c61ad9ca31ea1f0b9d89ebd740"
    },
    {
      "id": "sample_title-28-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Apr 2022'"
      },
      "random_state_sha256": "bc5acd0ccd33ef3c668ffd5e01d7018e61362034aa23457d8eef0437a0f57fb2"
    },
    {
      "id": "sample_title-29-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Ecoute Vermiformity'"
      },
      "random_state_sha256": "8428668fbfa77891a366060a0969a6ca4c11b836b521cab5440968a50398c69f"
    },
    {
      "id": "sample_title-30-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Ecoute Vermiformity'"
      },
      "random_state_sha256": "8428668fbfa77891a366060a0969a6ca4c11b836b521cab5440968a50398c69f"
    },
    {
      "id": "sample_title-31-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        "barv_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Ecoute Vermiformity'"
      },
      "random_state_sha256": "8428668fbfa77891a366060a0969a6ca4c11b836b521cab5440968a50398c69f"
    },
    {
      "id": "sample_title-32-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        "line_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Hv / Rei'"
      },
      "random_state_sha256": "1fb75494bab8dac84d65c9dd789fc7f7adfe51c61ad9ca31ea1f0b9d89ebd740"
    },
    {
      "id": "sample_title-33-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        "scatter_n"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Hv / Rei'"
      },
      "random_state_sha256": "1fb75494bab8dac84d65c9dd789fc7f7adfe51c61ad9ca31ea1f0b9d89ebd740"
    },
    {
      "id": "sample_title-34-2147483647",
      "seed": 2147483647,
      "name": "sample_title",
      "args": [
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Hv / Rei'"
      },
      "random_state_sha256": "1fb75494bab8dac84d65c9dd789fc7f7adfe51c61ad9ca31ea1f0b9d89ebd740"
    },
    {
      "id": "sample_axis_title-35-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "x",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Year (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-36-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "x",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Year (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-37-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Year (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-38-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "x",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Year (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-39-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "x",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Year (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-40-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "y",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (dB)'"
      },
      "random_state_sha256": "fb783d1a3a8d1dce01af35c9b79df9e7aaf3e95c0415b415e1f739aa93315baf"
    },
    {
      "id": "sample_axis_title-41-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "y",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-42-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (USD)'"
      },
      "random_state_sha256": "fb783d1a3a8d1dce01af35c9b79df9e7aaf3e95c0415b415e1f739aa93315baf"
    },
    {
      "id": "sample_axis_title-43-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "y",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (USD)'"
      },
      "random_state_sha256": "fb783d1a3a8d1dce01af35c9b79df9e7aaf3e95c0415b415e1f739aa93315baf"
    },
    {
      "id": "sample_axis_title-44-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "y",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-45-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "z",
        "scatter"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-46-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "z",
        "line"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-47-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barv"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-48-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "z",
        "barh_stack"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "sample_axis_title-49-2147483647",
      "seed": 2147483647,
      "name": "sample_axis_title",
      "args": [
        "z",
        "other"
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'Rate (°C)'"
      },
      "random_state_sha256": "c6bcc54aa824c7a05e0e7aec5c5ae4284ee99d7d33947f12c5f1d033cec449b8"
    },
    {
      "id": "human_round-50-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "human_round-51-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        1e-05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-52-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-53-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        0.099
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.1"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-54-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        0.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-55-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-56-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        1.2345
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1.2"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-57-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        9.999
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-58-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-59-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        10.05
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "10.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-60-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        99.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "100.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-61-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "100"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "human_round-62-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        123.45
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "125"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "human_round-63-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "human_round-64-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1000"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "human_round-65-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        1234.567
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1235"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "human_round-66-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -0.0049
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "0.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-67-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -0.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-0.99"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-68-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-1.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-69-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -9.99
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-70-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -10
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-10.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-71-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -99.9
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "-100.0"
      },
      "random_state_sha256": "440ac16c6ae67a1ae07bc20ad600773651a6ac38439aff7b35483c52502ae6c9"
    },
    {
      "id": "human_round-72-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -100
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-100"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "human_round-73-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -999.9
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "human_round-74-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -1000
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-1000"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "human_round-75-2147483647",
      "seed": 2147483647,
      "name": "human_round",
      "args": [
        -12345
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-12345"
      },
      "random_state_sha256": "4e88087d84e10dce12abb142d5b52b63c074d55ebaabe492858dd33dd1f42aa3"
    },
    {
      "id": "padded_limits-76-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-77-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-78-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-79-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-80-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        []
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-81-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-82-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-83-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-84-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-85-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          }
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-1.0, 1.0)"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "padded_limits-86-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-0.08859822142355672, 0.08859822142355672)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-87-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.08859822142355672, 0.08859822142355672)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-88-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.08859822142355672, 0.08859822142355672)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-89-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.08859822142355672, 0.08859822142355672)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-90-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.2, 0.2)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-91-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(2.73420533572933, 3.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-92-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 3.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-93-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.26579466427067, 3.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-94-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.26579466427067, 3.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-95-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(2.4, 3.6)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-96-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-3.26579466427067, -2.73420533572933)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-97-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.26579466427067, 0.0)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-98-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.26579466427067, 3.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-99-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.26579466427067, 3.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-100-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -3
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-3.6, -2.4)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-101-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(0.2912142286115462, 9.708785771388454)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-102-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 9.708785771388454)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-103-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.708785771388454, 9.708785771388454)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-104-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.708785771388454, 9.708785771388454)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-105-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1,
          9
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-0.6000000000000001, 10.6)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-106-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-9.708785771388454, -0.2912142286115462)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-107-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.708785771388454, 0.0)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-108-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.708785771388454, 9.708785771388454)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-109-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.708785771388454, 9.708785771388454)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-110-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -9,
          -1
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-10.6, 0.6000000000000001)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-111-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-5.0631786570826804, 9.06317865708268)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-112-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.0631786570826804, 9.06317865708268)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-113-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.06317865708268, 9.06317865708268)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-114-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-9.06317865708268, 9.06317865708268)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-115-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          -4,
          0,
          8
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-6.4, 10.4)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-116-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(1.7342053357293299, 5.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-117-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(0.0, 5.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-118-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.26579466427067, 5.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-119-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-5.26579466427067, 5.26579466427067)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-120-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          null,
          {
            "float": "nan"
          },
          2,
          5
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(1.4, 5.6)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-121-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "tuple",
        "repr": "(-8859822.142355662, 108859822.14235567)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-122-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-8859822.142355662, 108859822.14235567)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-123-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-108859822.14235567, 108859822.14235567)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-124-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "include_zero": true,
        "symmetric": true
      },
      "expected": {
        "type": "tuple",
        "repr": "(-108859822.14235567, 108859822.14235567)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "padded_limits-125-2147483647",
      "seed": 2147483647,
      "name": "padded_limits",
      "args": [
        [
          1e-08,
          100000000.0
        ]
      ],
      "kwargs": {
        "pad": [
          0.2,
          0.2
        ]
      },
      "expected": {
        "type": "tuple",
        "repr": "(-19999999.999999985, 120000000.0)"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "series_color-126-2147483647",
      "seed": 2147483647,
      "name": "series_color",
      "args": [
        [],
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#1f77b4'"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "series_color-127-2147483647",
      "seed": 2147483647,
      "name": "series_color",
      "args": [
        [
          "#123456"
        ],
        7
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'#123456'"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "series_color-128-2147483647",
      "seed": 2147483647,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        2
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'red'"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "series_color-129-2147483647",
      "seed": 2147483647,
      "name": "series_color",
      "args": [
        [
          "red",
          "blue"
        ],
        -1
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'blue'"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "maybe_int_or_float-130-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "maybe_int_or_float-131-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        1
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "maybe_int_or_float-132-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        -2
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "maybe_int_or_float-133-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        1.0
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "1"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "maybe_int_or_float-134-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "2"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "maybe_int_or_float-135-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        2.0000000002
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.0000000002"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "maybe_int_or_float-136-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        2.5
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "2.5"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "maybe_int_or_float-137-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        -2.00000000001
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "-2"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "maybe_int_or_float-138-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        1e-12
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "0"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "maybe_int_or_float-139-2147483647",
      "seed": 2147483647,
      "name": "maybe_int_or_float",
      "args": [
        1e-09
      ],
      "kwargs": {},
      "expected": {
        "type": "float",
        "repr": "1e-09"
      },
      "random_state_sha256": "4de58c0a74e9c2ed73d3958d41fb847b0fb4f37ec4859196ae2a6e4611c97d43"
    },
    {
      "id": "choose_weighted-140-2147483647",
      "seed": 2147483647,
      "name": "choose_weighted",
      "args": [
        [
          "a",
          "b",
          "c"
        ],
        [
          0.2,
          0.3,
          0.5
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'b'"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "choose_weighted-141-2147483647",
      "seed": 2147483647,
      "name": "choose_weighted",
      "args": [
        [
          1,
          2,
          3
        ],
        [
          0,
          0,
          9
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "int",
        "repr": "3"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    },
    {
      "id": "choose_weighted-142-2147483647",
      "seed": 2147483647,
      "name": "choose_weighted",
      "args": [
        [
          "x",
          "y"
        ],
        [
          8,
          2
        ]
      ],
      "kwargs": {},
      "expected": {
        "type": "str",
        "repr": "'x'"
      },
      "random_state_sha256": "75d424445b91f82245660e83769af77f3fc5f449700b4a420f4ca95f88020482"
    }
  ],
  "histograms": [
    {
      "name": "sample_label",
      "args": [],
      "seed": 20261111,
      "count": 10000,
      "choice_contract": {
        "items": [
          "word",
          "phrase",
          "year",
          "quarter",
          "month",
          "hybrid",
          "numeric",
          "code",
          "compound",
          "abbr",
          "slug",
          "ordinal",
          "paired"
        ],
        "weights": [
          0.19,
          0.16,
          0.09,
          0.08,
          0.09,
          0.13,
          0.06,
          0.07,
          0.07,
          0.05,
          0.04,
          0.02,
          0.05
        ]
      },
      "counts": {
        "quarter": 783,
        "word": 1707,
        "abbr": 442,
        "phrase": 1501,
        "numeric": 565,
        "hybrid": 1161,
        "month": 864,
        "compound": 602,
        "paired": 428,
        "year": 866,
        "slug": 342,
        "code": 589,
        "ordinal": 150
      },
      "output_sha256": "2eb1146a774013cd3a7b9eca6336fa08cb605ab6e4bcd80856b7249cfecd4f64",
      "random_state_sha256": "e3cdd644129527515e4e3c133957ee8aa74f9c7298c9a1febdfc3a15ba909e7c"
    },
    {
      "name": "sample_title",
      "args": [
        null
      ],
      "seed": 20261111,
      "count": 10000,
      "choice_contract": {
        "items": [
          "phrase",
          "paired",
          "short",
          "temporal",
          "code"
        ],
        "weights": [
          0.28,
          0.22,
          0.22,
          0.16,
          0.12
        ]
      },
      "counts": {
        "paired": 2271,
        "phrase": 2809,
        "short": 2205,
        "code": 1181,
        "temporal": 1534
      },
      "output_sha256": "85a850fd6abf751a9b14ec3dd7e258f875cc7121b06403c552597eb5a20c10ce",
      "random_state_sha256": "28320027f50517427eacd02a26aed5db9c7bdf55cb6d6e1bfbcf9ad146b70420"
    },
    {
      "name": "sample_title",
      "args": [
        "scatter"
      ],
      "seed": 20261111,
      "count": 10000,
      "choice_contract": {
        "items": [
          "short",
          "paired",
          "phrase",
          "temporal",
          "code"
        ],
        "weights": [
          0.26,
          0.22,
          0.22,
          0.16,
          0.14
        ]
      },
      "counts": {
        "paired": 2159,
        "short": 2645,
        "code": 1400,
        "phrase": 2188,
        "temporal": 1608
      },
      "output_sha256": "c100d9e382f2305a53270c56be9027b4c76df5a19a0138e46d960ca300bd6252",
      "random_state_sha256": "82e05c274e05b350c432001cde340e8a02f30b9366af66483973c01b5cbea1c6"
    },
    {
      "name": "sample_title",
      "args": [
        "line"
      ],
      "seed": 20261111,
      "count": 10000,
      "choice_contract": {
        "items": [
          "phrase",
          "temporal",
          "paired",
          "trend",
          "short"
        ],
        "weights": [
          0.3,
          0.18,
          0.16,
          0.2,
          0.16
        ]
      },
      "counts": {
        "temporal": 1849,
        "phrase": 2936,
        "paired": 1603,
        "short": 1599,
        "trend": 2013
      },
      "output_sha256": "4a0c4eb16fd507a19d5a2257e75ef7db8ed2e3eb26c615c19abbc8be53a1d354",
      "random_state_sha256": "5e5e4393f64461f7ce405530653398b8166e12bd205fa1a19c05415f9e584f69"
    },
    {
      "name": "sample_title",
      "args": [
        "barv"
      ],
      "seed": 20261111,
      "count": 10000,
      "choice_contract": {
        "items": [
          "short",
          "phrase",
          "paired",
          "temporal",
          "compact"
        ],
        "weights": [
          0.25,
          0.28,
          0.18,
          0.12,
          0.17
        ]
      },
      "counts": {
        "phrase": 2824,
        "temporal": 1180,
        "paired": 1826,
        "compact": 1670,
        "short": 2500
      },
      "output_sha256": "83dacb9fb398134edeca6c810db05c87a0436ad8297f1ec022891cf0107ff6f6",
      "random_state_sha256": "c540e04dac2c7b33a5039a22a9ee2379be1a1a9d6462e6a61feecdd490a7b2ca"
    },
    {
      "name": "sample_title",
      "args": [
        "barh_stack"
      ],
      "seed": 20261111,
      "count": 10000,
      "choice_contract": {
        "items": [
          "short",
          "phrase",
          "paired",
          "temporal",
          "compact"
        ],
        "weights": [
          0.25,
          0.28,
          0.18,
          0.12,
          0.17
        ]
      },
      "counts": {
        "phrase": 2824,
        "temporal": 1180,
        "paired": 1826,
        "compact": 1670,
        "short": 2500
      },
      "output_sha256": "83dacb9fb398134edeca6c810db05c87a0436ad8297f1ec022891cf0107ff6f6",
      "random_state_sha256": "c540e04dac2c7b33a5039a22a9ee2379be1a1a9d6462e6a61feecdd490a7b2ca"
    }
  ],
  "weighted_contracts": [
    {
      "items": [
        "phrase",
        "paired",
        "short",
        "temporal",
        "code"
      ],
      "weights": [
        0.28,
        0.22,
        0.22,
        0.16,
        0.12
      ]
    },
    {
      "items": [
        "word",
        "hybrid",
        "abbr"
      ],
      "weights": [
        0.62,
        0.25,
        0.13
      ]
    },
    {
      "items": [
        "word",
        "phrase",
        "abbr"
      ],
      "weights": [
        0.45,
        0.35,
        0.2
      ]
    },
    {
      "items": [
        "short",
        "paired",
        "phrase",
        "temporal",
        "code"
      ],
      "weights": [
        0.26,
        0.22,
        0.22,
        0.16,
        0.14
      ]
    },
    {
      "items": [
        "phrase",
        "temporal",
        "paired",
        "trend",
        "short"
      ],
      "weights": [
        0.3,
        0.18,
        0.16,
        0.2,
        0.16
      ]
    },
    {
      "items": [
        "word",
        "phrase"
      ],
      "weights": [
        0.72,
        0.28
      ]
    },
    {
      "items": [
        "short",
        "phrase",
        "paired",
        "temporal",
        "compact"
      ],
      "weights": [
        0.25,
        0.28,
        0.18,
        0.12,
        0.17
      ]
    },
    {
      "items": [
        "word",
        "code",
        "hybrid"
      ],
      "weights": [
        0.48,
        0.34,
        0.18
      ]
    }
  ]
}
'''
