"""Sampling orchestration and provenance; no plotting or subprocess side effects."""
from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
import numpy as np

from . import GENERATOR_VERSION
from .common import RandomSource, clean, save
from .composites import KINDS as COMPOSITE_KINDS
from .controls import normalize_controls
from .vsr_runtime import sample_parameters, UPSTREAM


def _axis_values(kind, cfg, axis):
    if kind.startswith("bar"):
        category_axis = "y" if kind.startswith("barh") else "x"
        if axis == category_axis:
            return np.arange(len(cfg["labels"])), True
        values = np.asarray(cfg.get("values", cfg.get("matrix")), dtype=float)
        if kind == "barv_stack":
            values = values.sum(axis=0)
        return np.append(values, 0), False
    if kind.startswith("line"):
        if axis == "x":
            return np.asarray(cfg["x_values"]), cfg["x_mode"] != "numeric"
        return np.asarray(cfg["matrix"]), False
    return np.asarray(cfg[axis]), False


def _axes(rng, kind, cfg, controls):
    """Explicit native scale/inversion choices replace render-time randomness."""
    p = rng.py
    axes = {"presentation_version": 3, "source": "native_sampling", "aspect": "auto"}
    for axis in ("x", "y"):
        values, categorical = _axis_values(kind, cfg, axis)
        domain = list(cfg[f"{axis}lim"])
        scale = "linear"
        scale = controls.get(f"{axis}_scale", scale)
        if categorical and scale != "linear":
            raise ValueError(f"A categorical {axis} axis must have a linear position scale")
        if scale == "log":
            if np.any(values <= 0):
                raise ValueError(f"A log {axis} axis requires strictly positive observations and endpoints")
            low, high = float(values.min()), float(values.max())
            factor = math.exp(max(math.log(high / low), .2) * .1)
            domain = [low / factor, high * factor]
        elif scale == "sqrt":
            if np.any(values < 0):
                raise ValueError(f"A sqrt {axis} axis requires nonnegative observations")
            domain[0] = max(0, domain[0])
        inverted = False
        if (kind.startswith('barh') and axis == 'y') or (kind == 'barv_1' and axis == 'x'):
            # Original renderers short-circuit the family-dependent first draw.
            inverted = (cfg['family'] in {'ordered', 'heavy_tail', 'log_spread'} and p.random() < .65) or p.random() < .24
        elif kind in COMPOSITE_KINDS and axis == 'x':
            # A composite keeps its value axis upright; only the category axis
            # may run right-to-left, exactly like the other categorical bars.
            inverted = p.random() < .16
        inverted = controls.get(f'{axis}_inverted', inverted)
        if inverted:
            domain.reverse()
        axes.update({f"{axis}lim": domain, f"{axis}scale": scale, f"{axis}_inverted": inverted})
    if kind.startswith("scatter") and axes["xscale"] == axes["yscale"] == "linear" and ((kind == "scatter_1" and cfg["family"] in {"ring", "clustered", "multi_cluster", "bimodal"} and p.random() < .58) or (kind == "scatter_n" and cfg["family"] == "ring" and p.random() < .18)):
        axes["aspect"] = "equal"
    refs = controls.get("reference_lines")
    if refs is None:
        refs = []
        if kind.startswith('bar'):
            if np.any(np.asarray(cfg.get('values', cfg.get('matrix'))) < 0):
                refs.append({'axis': 'x' if kind.startswith('barh') else 'y', 'value': 0})
        elif kind.startswith('line') and p.random() < .22:
            refs.append({'axis': 'y', 'value': 0})
    if any(not math.isfinite(float(ref["value"])) for ref in refs):
        raise ValueError("Reference-line values must be finite")
    axes["reference_lines"] = copy.deepcopy(refs)
    style = cfg["style"]
    axes["grid_visible"] = {axis: bool(style["grid_visible"]) and cfg.get("grid_axis", style["grid_axis"]) in {axis, "both"} for axis in ("x", "y")}
    def tick(lengths=(3, 4, 5), max_width=1.2, direction=None):
        return {'length': p.choice(lengths), 'width': p.uniform(.7, max_width),
                'direction': direction or p.choice(('in', 'out')),
                'color': style['text_color'], 'visible': True}
    default = {'length': 3.5, 'width': .8, 'direction': 'out', 'color': style['text_color'], 'visible': True}
    if kind.startswith('scatter'):
        shared = tick()
        axes['tick_styles'] = {'x': dict(shared), 'y': dict(shared)}
    elif kind == 'barv_stack':
        axes['tick_styles'] = {'x': tick(), 'y': tick((3, 4))}
    elif kind.startswith('barh'):
        axes['tick_styles'] = {'x': tick(max_width=1.3), 'y': tick((3, 4), direction='out')}
    elif kind.startswith('barv'):
        axes['tick_styles'] = {'y': tick(max_width=1.3), 'x': tick((3, 4), direction='out') if kind.endswith('_1') else dict(default)}
    elif kind in COMPOSITE_KINDS:
        axes['tick_styles'] = {'y': tick(max_width=1.3), 'x': dict(default)}
    else:
        axes['tick_styles'] = {'x': dict(default), 'y': tick()}
    # All category labels live in the sampler output; Vega-Lite never chooses a subset.
    if kind.startswith("line") and cfg["x_mode"] != "numeric":
        axes["xticks"], axes["xticklabels"] = list(range(len(cfg["x_labels"]))), cfg["x_labels"][:]
    return axes


def sample_config(kind, seed, controls=None):
    """Run the complete VSR parameter rules, then apply native contract adapters.

    Raw default parameters retain the upstream stochastic control flow. Extra
    fields below carry the native rendering/GT contract, not new data formulas.
    """
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError("seed must be a non-negative integer")
    c = normalize_controls(kind, controls)
    cfg, p = sample_parameters(kind, seed, c)
    cfg = clean(cfg)
    cfg['generator_version'] = GENERATOR_VERSION
    cfg['kind'] = kind
    count = len(cfg['labels']) if kind.startswith('bar') else len(cfg['x_values']) if kind.startswith('line') else len(cfg['x'])
    series = cfg.get('n_series', 1)
    cfg['n_series'] = series
    if not kind.endswith('_1') and len(cfg.get('series_names', [])) != series:
        raise ValueError('Upstream sampler returned incompatible series names')
    if kind in COMPOSITE_KINDS and len(cfg.get('series_roles', [])) != series:
        raise ValueError('Composite sampler returned incompatible series roles')
    cfg['show_legend'] = c.get('show_legend', cfg.get('show_legend', kind.endswith('_n') or kind == 'barv_stack'))
    if not cfg['show_legend']:
        cfg['series_names'] = [f'Series {i+1}' for i in range(series)]
        cfg['series_name'] = cfg['series_names'][0]
    elif 'series_names' not in cfg:
        cfg['series_names'] = [cfg['series_name']]
    if 'series_name' not in cfg:
        cfg['series_name'] = cfg['series_names'][0]
    style = cfg['style']
    style['style_family'] = style['profile']
    style.update(c.get('style', {}))
    if 'font_path' in c.get('style', {}):
        cfg['font_path'] = style['font_path']
    if len(style['series_colors']) < series:
        raise ValueError('style.series_colors must contain a color for every series')
    if len(style['figsize']) != 2 or any(isinstance(v, bool) or not isinstance(v, (int,float)) or v <= 0 for v in style['figsize']):
        raise ValueError('style.figsize must contain two positive dimensions')
    if not isinstance(style['dpi'], (int,float)) or style['dpi'] <= 0:
        raise ValueError('style.dpi must be positive')
    if kind.startswith('bar'):
        axis = 'x' if kind.startswith('barh') else 'y'
        error_key = axis+'err'
        # Only the bar series of a composite carry uncertainty; its line series
        # keep the plain observations the official line templates produce.
        bar_series = cfg['n_bar_series'] if kind in COMPOSITE_KINDS else series
        if 'show_error' in c:
            if c['show_error'] and cfg.get(error_key) is None:
                values = np.asarray([cfg['values']] if kind.endswith('_1') else cfg['matrix'][:bar_series])
                error = [[abs(float(v))*p.uniform(.05,.16 if kind.endswith('_1') else .14)+p.uniform(0,.2 if kind.endswith('_1') else .25) for v in row] for row in values]
                cfg[error_key] = error[0] if kind.endswith('_1') else error
                cfg['capsize'] = p.randint(2,5)
                cfg['error_kw'] = {'elinewidth':p.uniform(.8,1.6),'capthick':p.uniform(.8,1.6)}
            elif not c['show_error']:
                cfg[error_key] = None
        cfg['show_error'] = cfg.get('show_error', cfg.get(error_key) is not None)
        if 'show_error' in c:
            cfg['show_error'] = c['show_error']
        if 'hatch' in c:
            if kind.endswith('_1'): cfg['hatch'] = c['hatch']
            elif kind in COMPOSITE_KINDS: cfg['hatches'] = [c['hatch']]*bar_series + [None]*(series-bar_series)
            else: cfg['hatches'] = [c['hatch']]*series
        # Exact-percent is an explicit native control; upstream's natural
        # percent stacks retain their original independently rounded segments.
        if kind == 'barv_stack' and c.get('stack_mode') == 'percent':
            matrix = np.asarray(cfg['matrix'],dtype=float)
            for i in range(count):
                matrix[int(np.argmax(matrix[:,i])),i] += 100-float(matrix[:,i].sum())
            cfg['matrix'] = matrix.tolist()
            cfg['bottoms'] = np.vstack((np.zeros(count),np.cumsum(matrix,axis=0)[:-1])).tolist()
        category_axis = 'y' if kind.startswith('barh') else 'x'
        width = cfg.get('bar_height' if kind.startswith('barh') else 'bar_width', .7)
        offsets = cfg.get('offsets', [0])
        low = min(offsets)-width/2
        high = count-1+max(offsets)+width/2
        margin = (high-low)*.05 or .5
        cfg.setdefault(category_axis+'lim', [low-margin, high+margin])
        cfg.setdefault(axis+'lim', cfg.get(axis+'lims'))
    if kind.startswith('line') and count == 1:
        cfg['markers'] = [m or 'o' for m in cfg['markers']]
    if kind in COMPOSITE_KINDS:
        from .composites.diversity import apply_controls
        apply_controls(cfg, c, p)
    # Continue the sample-local random stream for renderer-time choices.
    cfg['_render_axes'] = _axes(type('AxisRandom', (), {'py': p})(), kind, cfg, c)
    return clean(cfg)


def sampling_diagnostics(kind, seed, cfg, controls=None):
    """Describe sampled parameters and bind provenance to the exact configuration."""
    c = normalize_controls(kind, controls)
    config_json = json.dumps(cfg, ensure_ascii=False, sort_keys=True,
                             separators=(",", ":"), allow_nan=False)
    config_sha256 = hashlib.sha256(config_json.encode("utf-8")).hexdigest()
    return {"generator_version": GENERATOR_VERSION, "kind": kind,
            "requested_seed": seed, "sample_seed": seed, "sampling_attempts": 1,
            "controls": clean(c), "family": cfg["family"], "profile": cfg["style"]["profile"],
            "axes": copy.deepcopy(cfg["_render_axes"]), "renderer": "vega-lite",
            "source": "static VSR parameter rules with independent per-sample RNGs",
            "upstream": UPSTREAM,
            "config_sha256": config_sha256}


def generate_chart(kind, seed, outdir, controls=None):
    """Persist sampling evidence, leaving JSON construction/rendering to the pipeline.

    The return dictionary retains config/sample_seed/diagnostics used by the
    former entry point. Rendering always proceeds through adapter + render.mjs.
    max_attempts is accepted for old run configs but no rejection loop is needed:
    forced counts, family, errors and style choices are applied directly.
    """
    c = normalize_controls(kind, controls)
    outdir = Path(outdir)
    for name in ("config.json", "sampling.json"):
        if (outdir / name).exists():
            raise FileExistsError(f"Refusing to overwrite existing sample: {outdir / name}")
    cfg = sample_config(kind, seed, c)
    diagnostics = sampling_diagnostics(kind, seed, cfg, c)
    outdir.mkdir(parents=True, exist_ok=True)
    save(outdir / "config.json", cfg)
    save(outdir / "sampling.json", diagnostics)
    return {"config": cfg, "sample_seed": seed, "diagnostics": diagnostics}

