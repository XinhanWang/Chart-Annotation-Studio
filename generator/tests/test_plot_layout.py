"""Data-completeness regressions for pre-render domain fitting."""
from __future__ import annotations

import copy
import math
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from adapter import _limits, _main_layers, _rows, _series_names, build_geometry_pair, normalize
from plot_layout import fit_plot_layout


def fit(kind, cfg, width=400, height=300):
    rows = _rows(kind, cfg, _series_names(kind, cfg))
    limits = {axis: _limits(cfg, axis, rows, kind) for axis in ('x', 'y')}
    layers = _main_layers(kind, cfg, rows, _series_names(kind, cfg), limits)
    return fit_plot_layout(kind, cfg, rows, limits, width, height, layers=layers)


class PlotLayoutTests(unittest.TestCase):
    def test_real_error_end_is_included_without_editing_data(self):
        cfg = {'labels': ['last'], 'values': [650], 'xerr': [73.107770510122],
               'xlim': [0, 701.7919978886754], 'ylim': [-0.5, 0.5]}
        before = copy.deepcopy(cfg)
        limits, width, _, audit = fit('barh_1', cfg)
        upper = 650 + cfg['xerr'][0]
        clearance = (limits['x'][1] - upper) / (limits['x'][1] - limits['x'][0]) * width
        self.assertGreaterEqual(clearance, audit['axes']['x']['margin_px'] - 1e-8)
        self.assertLessEqual(limits['x'][0], 0)
        self.assertGreater(limits['x'][1], 723.1077)
        self.assertEqual(cfg, before)
        self.assertFalse(audit['observations_changed'])

    def test_real_scatter_outlier_and_equal_aspect_use_more_canvas(self):
        cfg = {'x': [3.6, 12], 'y': [-3.2, -14], 'size': 3.4874768281641764,
               '_render_axes': {'xlim': [-13.614209309922316, 13.614209309922316],
                                'ylim': [-13.526375701471204, 13.526375701471204], 'aspect': 1}}
        limits, width, height, audit = fit('scatter_1', cfg)
        self.assertLess(limits['y'][0], -14)
        self.assertGreaterEqual(width, 400)
        self.assertGreaterEqual(height, 300)
        ratio = (limits['y'][1] - limits['y'][0]) / (limits['x'][1] - limits['x'][0])
        self.assertAlmostEqual(height / width, ratio, places=5)
        self.assertTrue(audit['equal_aspect'])

    def test_existing_sufficient_domains_and_dimensions_are_exactly_preserved(self):
        cfg = {'x': [20, 80], 'y': [25, 75], 'size': 4, 'xlim': [0, 100], 'ylim': [0, 100]}
        limits, width, height, audit = fit('scatter_1', cfg)
        self.assertEqual(limits, {'x': [0, 100], 'y': [0, 100]})
        self.assertEqual((width, height), (400, 300))
        self.assertFalse(audit['changed'])

    def test_large_symbols_have_pixel_clearance_even_at_data_extrema(self):
        cfg = {'x': [0, 1], 'y': [0, 1], 'size': 40000, 'linewidth': 6,
               'xlim': [0, 1], 'ylim': [0, 1]}
        limits, width, height, audit = fit('scatter_1', cfg, width=100, height=100)
        self.assertGreater(width, 100)
        self.assertGreater(height, 100)
        for axis, pixels in [('x', width), ('y', height)]:
            lo, hi = limits[axis]
            clearance = min(-lo, hi - 1) / (hi - lo) * pixels
            self.assertGreaterEqual(clearance, 300 + 12 + 2 - 1e-8)

    def test_reversed_axis_keeps_orientation(self):
        cfg = {'x': [0, 10], 'y': [1, 2], 'size': 20,
               '_render_axes': {'xlim': [10, 0], 'ylim': [0, 3]}}
        limits, *_ = fit('scatter_1', cfg)
        self.assertGreater(limits['x'][0], 10)
        self.assertLess(limits['x'][1], 0)

    def test_group_offsets_bar_edges_and_signed_stack_endpoints_are_covered(self):
        grouped = {'labels': ['a'], 'matrix': [[2], [3]], 'n_series': 2,
                   'series_names': ['a', 'b'], 'offsets': [-1, 1], 'bar_width': 1.5,
                   'xlim': [-0.5, 0.5], 'ylim': [0, 3]}
        limits, *_ = fit('barv_n', grouped)
        self.assertLess(limits['x'][0], -1.75)
        self.assertGreater(limits['x'][1], 1.75)
        stacked = {'labels': ['a'], 'matrix': [[5], [-12], [9]], 'n_series': 3,
                   'series_names': ['a', 'b', 'c'], 'xlim': [-0.5, 0.5], 'ylim': [0, 4]}
        limits, *_ = fit('barv_stack', stacked)
        self.assertLess(limits['y'][0], -7)
        self.assertGreater(limits['y'][1], 5)

    def test_error_caps_reserve_perpendicular_pixel_space(self):
        cfg = {'labels': ['a'], 'values': [5], 'xerr': [1], 'capsize': 100,
               'xlim': [0, 10], 'ylim': [-0.1, 0.1], 'bar_height': 0.1}
        limits, _, height, audit = fit('barh_1', cfg)
        self.assertGreaterEqual(audit['axes']['y']['margin_px'], 102)
        lo, hi = limits['y']
        self.assertGreaterEqual(min(-lo, hi) / (hi - lo) * height, 102)

    def test_line_endpoints_and_marker_dimensions_are_covered(self):
        cfg = {'x_mode': 'numeric', 'x_labels': ['a', 'b'], 'x_values': [0, 1],
               'matrix': [[5, -5]], 'series_names': ['A'], 'markers': ['*'],
               'marker_sizes': [30], 'xlim': [0, 1], 'ylim': [-5, 5]}
        limits, _, _, audit = fit('line_1', cfg)
        self.assertLess(limits['x'][0], 0)
        self.assertGreater(limits['x'][1], 1)
        self.assertLess(limits['y'][0], -5)
        self.assertGreaterEqual(audit['axes']['x']['margin_px'], 45)

    def test_positive_log_fits_in_log_space_and_rejects_zero(self):
        cfg = {'x': [1, 1000], 'y': [1, 2], 'size': 30,
               '_render_axes': {'xscale': 'log', 'xlim': [1, 100], 'ylim': [0, 3]}}
        limits, width, _, audit = fit('scatter_1', cfg)
        lo, hi = map(math.log, limits['x'])
        clearance = (hi - math.log(1000)) / (hi - lo) * width
        self.assertGreaterEqual(clearance, audit['axes']['x']['margin_px'] - 1e-8)
        self.assertGreater(limits['x'][0], 0)
        cfg['x'][0] = 0
        with self.assertRaisesRegex(ValueError, 'crosses zero|wrong sign'):
            fit('scatter_1', cfg)

    def test_negative_log_with_reverse_is_valid_but_cannot_cross_zero(self):
        cfg = {'x': [-200, -0.5], 'y': [1, 2],
               '_render_axes': {'xscale': 'log', 'xlim': [-1, -100], 'ylim': [0, 3]}}
        limits, *_ = fit('scatter_1', cfg)
        self.assertLess(limits['x'][0], 0)
        self.assertGreater(limits['x'][0], -0.5)
        self.assertLess(limits['x'][1], -200)
        cfg['_render_axes']['xlim'] = [-100, 1]
        with self.assertRaisesRegex(ValueError, 'entirely positive or entirely negative'):
            fit('scatter_1', cfg)

    def test_symlog_constant_and_power_exponent_keep_signed_observations(self):
        rows = [{'plot_x': -100, 'plot_y': -3}, {'plot_x': 100, 'plot_y': 4}]
        limits = {'x': [-10, 10], 'y': [-1, 1]}
        layers = [{'mark': {'type': 'point', 'size': 10}, 'encoding': {
            'x': {'scale': {'type': 'symlog', 'constant': 2}},
            'y': {'scale': {'type': 'pow', 'exponent': 3}}}}]
        before = copy.deepcopy((rows, limits, layers))
        result, width, height, audit = fit_plot_layout('scatter_1', {}, rows, limits, 400, 300, layers=layers)
        for axis, extrema, transform, pixels in [
            ('x', [-100, 100], lambda v: math.copysign(math.log1p(abs(v)/2), v), width),
            ('y', [-3, 4], lambda v: v**3, height),
        ]:
            lo, hi = map(transform, result[axis])
            actual = min(transform(extrema[0])-lo, hi-transform(extrema[1]))/(hi-lo)*pixels
            self.assertGreaterEqual(actual, audit['axes'][axis]['margin_px']-1e-7)
        self.assertEqual((rows, limits, layers), before)

    def test_zero_span_data_can_be_fitted_without_changing_observations(self):
        cfg = {'x': [5, 5], 'y': [2, 2], 'size': 100, 'xlim': [0, 5], 'ylim': [0, 2]}
        limits, *_ = fit('scatter_1', cfg)
        self.assertGreater(limits['x'][1], 5)
        self.assertGreater(limits['y'][1], 2)

    def test_fitting_presentation_does_not_change_compact_target(self):
        cfg = {'labels': ['last'], 'values': [650], 'xerr': [73.107770510122],
               'xlim': [0, 701.7919978886754], 'ylim': [-0.5, 0.5]}
        original, _, _ = build_geometry_pair('barh_1', cfg)
        result = copy.deepcopy(original)
        limits, width, height, _ = fit('barh_1', cfg, original['width'], original['height'])
        result['width'], result['height'] = width, height
        for layer in result['layer']:
            for axis in ('x', 'y'):
                layer['encoding'][axis]['scale']['domain'] = sorted(limits[axis])
        self.assertEqual(normalize(original), normalize(result))

    def test_impossible_visual_dimensions_are_rejected_explicitly(self):
        cfg = {'x': [0, 1], 'y': [0, 1], 'size': 1e12, 'xlim': [0, 1], 'ylim': [0, 1]}
        with self.assertRaisesRegex(ValueError, 'larger than'):
            fit('scatter_1', cfg)

    def test_small_range_at_large_offset_keeps_representable_pixel_clearance(self):
        cfg = {'x': [1e15, 1e15 + 1], 'y': [0, 1], 'size': 25,
               'xlim': [1e15, 1e15 + 1], 'ylim': [-1, 2]}
        limits, width, _, audit = fit('scatter_1', cfg)
        lo, hi = limits['x']
        clearance = min(1e15 - lo, hi - (1e15 + 1)) / (hi - lo) * width
        self.assertGreaterEqual(clearance, audit['axes']['x']['margin_px'])

    def test_unrepresentable_log_padding_is_rejected_without_zero_domain(self):
        cfg = {'x': [1e-300, 1e300], 'y': [0, 1], 'size': 100,
               '_render_axes': {'xscale': 'log', 'xlim': [1e-300, 1e300], 'ylim': [-1, 2]}}
        with self.assertRaisesRegex(ValueError, 'Cannot fit finite|not finite'):
            fit('scatter_1', cfg, width=100, height=100)


if __name__ == '__main__':
    unittest.main()
