"""Compatibility entry point for the native Vega-Lite sampler.

New callers should use generation.generate_chart. The obsolete render argument
is accepted so old Python callers can migrate; no image is rendered here.
"""
from generation import FAMILIES, GENERATOR_VERSION, KINDS, PROFILES, generate_chart
from generation.common import clean as jsonable
from generation.controls import (
    BAR_MULTI_FAMILIES, BAR_SINGLE_FAMILIES, LINE_FAMILIES, SCATTER_FAMILIES,
    STACK_FAMILIES, normalize_controls as _normalize_controls,
)
from generation.core import sample_config


def generate_native(kind, seed, outdir, controls=None, render=False):
    result = generate_chart(kind, seed, outdir, controls)
    return {**result, "annotation": None}
