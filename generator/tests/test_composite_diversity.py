"""Diversity must survive projection, guide merging and semantic normalization."""
import copy
import unittest

from adapter import build_pair, normalize
from generation.core import sample_config
from generation.controls import normalize_controls


class CompositeDiversityTests(unittest.TestCase):
    @staticmethod
    def baseline_config(**updates):
        cfg = sample_config('barline_n', 81, {'category_count': 3,
                            'bar_series_count': 1, 'line_series_count': 1,
                            'show_markers': True, 'show_error': False})
        cfg.update(matrix=[[20, 30, 40], [50, 60, 70]],
                   dual_y_axis=False, ylim=[0, 100], ylims=[0, 100],
                   data_labels={'line': {'position': 'above', 'size': 10, 'format': '.0f'}})
        cfg['_render_axes']['ylim'] = [0, 100]
        cfg.update(updates)
        return cfg

    def test_interior_line_labels_leave_bar_baseline_on_bottom_frame(self):
        cfg = self.baseline_config()
        for position in ('above', 'below'):
            cfg['data_labels']['line']['position'] = position
            full, compact, source = build_pair('barline_n', cfg)
            lo, hi = source['plot_layout']['fitted_limits']['y']
            # Allow only the subpixel stroke budget, never a text-height gap.
            zero_to_frame = -lo / (hi - lo) * full['height']
            self.assertLess(zero_to_frame, 1)
            self.assertEqual(normalize(full), compact)

    def test_marker_and_label_near_zero_still_receive_clearance(self):
        cfg = self.baseline_config(matrix=[[20, 30, 40], [0, 60, 70]])
        cfg['data_labels']['line']['position'] = 'below'
        full, _, source = build_pair('barline_n', cfg)
        lo, hi = source['plot_layout']['fitted_limits']['y']
        zero_to_frame = -lo / (hi - lo) * full['height']
        self.assertGreaterEqual(zero_to_frame, 10 * 1.45 + 6)

    def test_independent_line_scale_cannot_move_bar_baseline(self):
        for line in ([5000, 6000, 7000], [-5000, -6000, -7000]):
            cfg = self.baseline_config(dual_y_axis=True, matrix=[[20, 30, 40], line])
            full, _, source = build_pair('barline_n', cfg)
            lo, hi = source['plot_layout']['fitted_limits']['y']
            self.assertLess(-lo / (hi - lo) * full['height'], 1)
            self.assertEqual(source['plot_layout']['axes']['y']['geometry_extent'], [0, 40])
            line_lo, line_hi = source['plot_layout']['fitted_limits']['y2']
            self.assertLess(line_lo, min(line))
            self.assertGreater(line_hi, max(line))

    def test_hidden_dual_axis_and_marker_controls_survive_projection(self):
        cfg = sample_config('barline_n', 77, {'dual_y_axis': True,
                            'x_axis_mode': 'hidden', 'y_axis_mode': 'hidden',
                            'show_markers': False, 'data_labels': False})
        full, compact, _ = build_pair('barline_n', cfg)
        self.assertEqual(normalize(full), compact)
        guides = [layer.get('encoding', {}).get(axis, {}).get('axis')
                  for layer in full['layer'] for axis in ('x', 'y')]
        for guide in guides:
            if isinstance(guide, dict):
                self.assertFalse(guide['ticks'])
                self.assertFalse(guide['labels'])
                self.assertFalse(guide['grid'])
                self.assertIsNone(guide['title'])
        self.assertFalse(any(layer['name'].startswith('line_markers_') for layer in full['layer']))
        self.assertTrue(any(layer['name'].startswith('line_') for layer in full['layer']))

    def test_percent_scales_values_errors_domains_and_labels_together(self):
        controls = {'show_error': True, 'data_labels': True, 'dual_y_axis': True}
        plain = sample_config('barline_n', 78, controls)
        percent = sample_config('barline_n', 78, {**controls, 'y_tick_label_type': 'percent'})
        factor = max(abs(v) for row in plain['matrix'] for v in row)
        for key in ('matrix', 'yerr'):
            for before, after in zip(plain[key], percent[key]):
                for a, b in zip(before, after):
                    self.assertAlmostEqual(a / factor, b)
        for a, b in zip(plain['ylims'], percent['ylims']):
            self.assertAlmostEqual(a / factor, b)
        full, compact, _ = build_pair('barline_n', percent)
        self.assertEqual(normalize(full), compact)
        self.assertTrue(all(layer['encoding']['y']['axis']['format'] == '.0%'
                            for layer in full['layer'] if isinstance(layer.get('encoding', {}).get('y', {}).get('axis'), dict)))

    def test_labels_remain_categories_and_display_controls_do_not_change_gt(self):
        for label_type in ('numbers', 'dates', 'text', 'percent'):
            cfg = sample_config('barline_n', 79, {'category_count': 4,
                                'x_tick_label_type': label_type, 'show_markers': True})
            full, compact, _ = build_pair('barline_n', cfg)
            hidden = copy.deepcopy(cfg)
            hidden.update(x_axis_mode='hidden', y_axis_mode='no_labels')
            self.assertEqual(build_pair('barline_n', hidden)[1], compact)
            self.assertEqual(normalize(full), compact)
            self.assertEqual(len(set(cfg['labels'])), 4)
            self.assertTrue(any(layer['name'].startswith('line_markers_') for layer in full['layer']))

    def test_controls_are_scoped_and_invalid_choices_rejected(self):
        for controls in ({'y_tick_label_type': 'dates'}, {'show_markers': 1}, {'x_axis_mode': 'off'}):
            with self.assertRaises(ValueError):
                normalize_controls('barline_n', controls)
        with self.assertRaises(ValueError):
            normalize_controls('barv_n', {'x_axis_mode': 'hidden'})


if __name__ == '__main__':
    unittest.main()
