"""Bind the static VSR parameter samplers to independent per-sample RNGs.

No rendering-library imports, process-global RNG mutation or history loading.
The static functions retain original control flow, including draw order.
"""
from __future__ import annotations
import importlib
import math
import random
import types
from pathlib import Path
import numpy as np
from . import style_rules, vsr_text
from .composites import KINDS as COMPOSITE_KINDS
from .controls import BAR_SERIES_RANGE, FAMILIES, LINE_SERIES_RANGE

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = 'InternLM/VSR@1fd040346add205ffbada9748273cad3bc9159e5'

# Composite samplers never reimplement numeric families. They call the official
# single-geometry closures below, rebound into sibling namespaces that share the
# same per-sample RNG stream, and only add composition plus presentation.
COMPOSITE_BASES = {'barline_n': (('barv_n', {'generate_matrix': 'bar_generate_matrix',
                                             'finalize_matrix': 'bar_finalize_matrix',
                                             'reorder_categories': 'bar_reorder_categories',
                                             'sample_category_label': 'bar_sample_category_label'}),
                                 ('line_n', {'generate_matrix': 'line_generate_matrix'}))}


class NumpySource:
    """NumPy operations plus the original MT19937 random API, locally scoped."""
    def __init__(self, seed):
        self.random = np.random.RandomState(seed % (2**32 - 1))
    def __getattr__(self, name):
        return getattr(np, name)


def _bind(module, namespace):
    for name, value in vars(module).items():
        if isinstance(value, types.FunctionType) and value.__module__ == module.__name__:
            rebound = types.FunctionType(value.__code__, namespace, name, value.__defaults__, value.__closure__)
            rebound.__kwdefaults__ = value.__kwdefaults__
            namespace[name] = rebound


def _font_pool():
    fonts = [str(ROOT / 'assets/fonts' / name) for name in style_rules.REQUIRED_FONT_FILES]
    if not all(Path(file).is_file() for file in fonts):
        raise FileNotFoundError('The original 16-font sampling pool is incomplete')
    return fonts


def _canvas_sampler(controls, p, fonts):
    def canvas(chart_kind, series_count=1):
        style = style_rules.sample_canvas(p, chart_kind, series_count, controls.get('profile'), fonts)
        # Apply these again after template-specific layout changes, so explicit
        # user overrides remain authoritative without altering default draws.
        unknown = set(controls.get('style', {})) - set(style)
        if unknown:
            raise ValueError('Unknown style keys: ' + str(sorted(unknown)))
        style.update(controls.get('style', {}))
        return style
    return canvas


def _controlled_weighted(original_weighted, kind, controls):
    def weighted(items, weights):
        drawn = original_weighted(items, weights)
        if 'family' in controls and len(items) == len(FAMILIES[kind]) and set(items) == set(FAMILIES[kind]):
            return controls['family']
        if 'stack_mode' in controls and set(items) == {'absolute', 'percent'}:
            return controls['stack_mode']
        if kind == 'barv_stack' and 'series_count' in controls and list(items) == [2,3,4,5,6]:
            return controls['series_count']
        return drawn
    return weighted


def _force_controls(namespace, controls):
    for function, key in [('sample_category_count','category_count'), ('sample_point_count','point_count'),
                          ('sample_series_count','series_count'), ('sample_family','family'), ('sample_stack_family','family'),
                          ('sample_x_mode','x_mode'), ('sample_stack_mode','stack_mode'),
                          ('sample_bar_series_count','bar_series_count'), ('sample_line_series_count','line_series_count'),
                          ('sample_bar_family','bar_family'), ('sample_line_family','line_family'),
                          ('sample_coupling','coupling'),
                          ('sample_dual_y_axis','dual_y_axis'),
                          ('sample_y_axis_orient','y_axis_orient'),
                          ('sample_x_axis_orient','x_axis_orient'),
                          ('sample_axis_design','axis_design'),
                          ('sample_secondary_axis_title','y_title_right')]:
        if key in controls and function in namespace:
            original = namespace[function]
            def forced(*args, _original=original, _value=controls[key], **kwargs):
                _original(*args, **kwargs)
                return _value
            namespace[function] = forced
    if 'data_labels' in controls and 'sample_data_labels' in namespace:
        # A label request shapes the sampled annotation rather than replacing
        # it, so the original draw order and every later draw stay untouched.
        original = namespace['sample_data_labels']
        def labelled(*args, _original=original, _request=controls['data_labels'], **kwargs):
            return _original(*args, request=_request, **kwargs)
        namespace['sample_data_labels'] = labelled


def composite_controls(kind, controls, p):
    """Split composite-level controls into the per-geometry sampler controls."""
    c = dict(controls)
    if 'family' in c:
        bar_family, line_family = c['family'].split('+', 1)
        c.setdefault('bar_family', bar_family)
        c.setdefault('line_family', line_family)
    if 'series_count' in c and not {'bar_series_count', 'line_series_count'} <= set(c):
        total = c['series_count']
        if 'bar_series_count' in c:
            c['line_series_count'] = total - c['bar_series_count']
        elif 'line_series_count' in c:
            c['bar_series_count'] = total - c['line_series_count']
        else:
            low = max(BAR_SERIES_RANGE[0], total - LINE_SERIES_RANGE[1])
            high = min(BAR_SERIES_RANGE[1], total - LINE_SERIES_RANGE[0])
            if low > high:
                raise ValueError(f'{kind} cannot split series_count={total} into bar and line series')
            c['bar_series_count'] = p.randint(low, high)
            c['line_series_count'] = total - c['bar_series_count']
        ranges = {'bar_series_count': BAR_SERIES_RANGE, 'line_series_count': LINE_SERIES_RANGE}
        for key, (minimum, maximum) in ranges.items():
            if not minimum <= c[key] <= maximum:
                raise ValueError(f'{kind} requires {key} in [{minimum}, {maximum}]')
    return c


def composite_namespace(kind, seed, controls):
    """Bind the official geometry closures and the composite sampler to one stream."""
    p = random.Random(seed)
    shared_numpy = NumpySource(seed)
    controls = composite_controls(kind, controls or {}, p)
    fonts, words = _font_pool(), vsr_text.load_words()
    canvas = _canvas_sampler(controls, p, fonts)
    namespace = {**vars(vsr_text), 'random': p, 'np': shared_numpy, 'math': math}
    _bind(vsr_text, namespace)
    namespace.update(FONT_POOL=fonts, WORDS=words, sample_canvas=canvas)
    namespace['choose_weighted'] = _controlled_weighted(namespace['choose_weighted'], kind, controls)
    for base_kind, aliases in COMPOSITE_BASES[kind]:
        base = importlib.import_module('.vsr_samplers.' + base_kind, __package__)
        local = {**vars(vsr_text), **vars(base), 'random': p, 'np': shared_numpy, 'math': math}
        _bind(vsr_text, local)
        _bind(base, local)
        local.update(FONT_POOL=fonts, WORDS=words, sample_canvas=canvas)
        namespace.update({alias: local[name] for name, alias in aliases.items()})
    if controls.get('category_count', 4) < 3:
        original_matrix = namespace['line_generate_matrix']
        def short_matrix(series, count, family):
            # The official piecewise breakpoints need >=3 points; evaluate that
            # original curve and interpolate it, exactly as line templates do.
            if family == 'piecewise' and count < 3:
                values = original_matrix(series, 3, family)
                return np.asarray([np.interp(np.linspace(0,2,count), np.arange(3), row) for row in values])
            return original_matrix(series, count, family)
        namespace['line_generate_matrix'] = short_matrix
    module = importlib.import_module('.composites.' + kind, __package__)
    namespace.update(vars(module))
    namespace.update(random=p, np=shared_numpy, math=math)
    _bind(module, namespace)
    _force_controls(namespace, controls)
    return namespace, p


def parameter_namespace(kind, seed, controls=None):
    controls = controls or {}
    if kind in COMPOSITE_KINDS:
        return composite_namespace(kind, seed, controls)
    module = importlib.import_module('.vsr_samplers.' + kind, __package__)
    namespace = {**vars(vsr_text), **vars(module)}
    p = random.Random(seed)
    namespace.update(random=p, np=NumpySource(seed), math=math)
    # Bind common functions first, then template-local overrides exactly as
    # Python's original imports/definitions do. Each call owns this dictionary.
    _bind(vsr_text, namespace)
    _bind(module, namespace)
    fonts = _font_pool()
    namespace.update(FONT_POOL=fonts, WORDS=vsr_text.load_words())
    namespace['sample_canvas'] = _canvas_sampler(controls, p, fonts)
    namespace['choose_weighted'] = _controlled_weighted(namespace['choose_weighted'], kind, controls)
    _force_controls(namespace, controls)
    if kind == 'scatter_n' and 'point_count' in controls and 'series_count' not in controls:
        original = namespace['sample_series_count']
        namespace['sample_series_count'] = lambda: min(original(), (controls['point_count'] - 4) // 4)
    if kind.startswith('line') and controls.get('point_count', 8) < 3:
        original_matrix = namespace['generate_matrix']
        def short_matrix(series, count, family):
            # VSR never naturally samples fewer than eight line points. Its
            # piecewise breakpoints require >=3; preserve native short-line
            # controls by evaluating that original curve and interpolating it.
            if family == 'piecewise' and count < 3:
                values = original_matrix(series, 3, family)
                return np.asarray([np.interp(np.linspace(0,2,count), np.arange(3), row) for row in values])
            return original_matrix(series, count, family)
        namespace['generate_matrix'] = short_matrix
    return namespace, p


def sample_parameters(kind, seed, controls=None):
    namespace, p = parameter_namespace(kind, seed, controls)
    return namespace['sample_config'](), p
