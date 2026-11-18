"""Deterministic native chart sampling; Vega-Lite is the only rendering path."""
from .controls import KINDS, FAMILIES, PROFILES

GENERATOR_VERSION = "vega-lite-native/1.2"


def generate_chart(kind, seed, outdir, controls=None):
    """Write config.json and sampling.json; return config, sample_seed, diagnostics."""
    from .core import generate_chart as generate
    return generate(kind, seed, outdir, controls)


__all__ = ["KINDS", "FAMILIES", "PROFILES", "GENERATOR_VERSION", "generate_chart"]
