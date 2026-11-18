"""Native style sampling using original VSR conditional distributions."""
from __future__ import annotations
from pathlib import Path
from .style_rules import PALETTES, REQUIRED_FONT_FILES, sample_canvas
ROOT = Path(__file__).resolve().parents[1]

def canvas(rng, kind, series_count, count, controls):
    # Additional real faces support rendering; they must not alter sampling.
    fonts = [str(ROOT / 'assets' / 'fonts' / name) for name in REQUIRED_FONT_FILES
             if (ROOT / 'assets' / 'fonts' / name).is_file()]
    if len(fonts) != len(REQUIRED_FONT_FILES):
        raise FileNotFoundError('The original 16-font sampling pool is incomplete')
    chart_kind = 'barh' if kind.startswith('barh') else 'barv' if kind.startswith('bar') else 'line' if kind.startswith('line') else 'scatter'
    style = sample_canvas(rng.py, chart_kind, series_count, controls.get('profile'), fonts)
    style['style_family'] = style['profile']
    overrides = controls.get("style", {})
    unknown = set(overrides) - set(style)
    if unknown:
        raise ValueError(f"Unknown style keys: {sorted(unknown)}")
    style.update(overrides)
    # Inherited style controls may carry tuples; the persisted config is JSON.
    if not isinstance(style["series_colors"], (list, tuple)) or len(style["series_colors"]) < series_count:
        raise ValueError("style.series_colors must contain a color for every series")
    if len(style["figsize"]) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or v <= 0 for v in style["figsize"]):
        raise ValueError("style.figsize must contain two positive dimensions")
    if not isinstance(style["dpi"], (int, float)) or style["dpi"] <= 0:
        raise ValueError("style.dpi must be positive")
    return style

