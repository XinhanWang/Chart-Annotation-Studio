"""Numeric helpers use a per-sample RNG and never mutate global random state."""
from __future__ import annotations

import json
import math
from pathlib import Path
import random
import numpy as np


class RandomSource:
    def __init__(self, seed):
        self.py = random.Random(seed)
        self.np = np.random.default_rng(seed)

    def scale(self):
        return self.py.choice((0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000)) * self.py.uniform(0.75, 1.35)


def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, np.ndarray):
        return clean(value.tolist())
    if isinstance(value, np.generic):
        return clean(value.item())
    return value


def numbers(values):
    """Keep five significant figures without changing signs or merging x steps."""
    result = np.asarray(values, dtype=float)
    flat = []
    for value in result.flat:
        value = float(f"{value:.5g}")
        if not math.isfinite(value):
            raise ValueError("Sampler produced a non-finite observation")
        flat.append(int(value) if value.is_integer() else value)
    return np.asarray(flat).reshape(result.shape).tolist()


def limits(values, zero=False, pad=0.12):
    array = np.asarray(values, dtype=float)
    lo, hi = float(array.min()), float(array.max())
    if zero:
        lo, hi = min(lo, 0), max(hi, 0)
    span = hi - lo or max(abs(lo), 1)
    return [lo if zero and lo == 0 else lo - span * pad,
            hi if zero and hi == 0 else hi + span * pad]


def save(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(clean(value), ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
