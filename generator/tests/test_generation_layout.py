"""Regressions through the public generation entry point, not only the fitter."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import KINDS, build_geometry_pair, build_pair, normalize
from compact import project_rows, semantic_rows
from test_adapter import fixture


class GenerationLayoutTests(unittest.TestCase):
    def test_actual_error_interval_overflow_is_prevented_by_default(self):
        cfg = fixture('barh_1')
        cfg.update(labels=['Self-deaf Overplow Pilfery'], values=[650],
                   xerr=[73.107770510122], xlim=[0, 701.7919978886754],
                   _render_axes={'xlim': [0, 701.7919978886754], 'ylim': [-0.6, 0.6]})
        before = copy.deepcopy(cfg)
        full, compact, source = build_pair('barh_1', cfg)
        upper = full['layer'][0]['encoding']['x']['scale']['domain'][1]
        self.assertGreater(upper, 723.107770510122)
        self.assertEqual(cfg, before)
        self.assertEqual(compact['data']['values'][0]['upper'], 723.107770510122)
        self.assertEqual(full['data']['values'], source['rows'])
        self.assertTrue(all(layer['mark']['clip'] for layer in full['layer']))

    def test_actual_equal_aspect_scatter_point_remains_visible(self):
        cfg = fixture('scatter_1')
        cfg.update(x=[3.6, 12], y=[-3.2, -14],
                   xlim=[-13.614209309922316, 13.614209309922316],
                   ylim=[-15.84009136204795, 15.84009136204795],
                   _render_axes={'xlim': [-13.614209309922316, 13.614209309922316],
                                 'ylim': [-13.526375701471204, 13.526375701471204], 'aspect': 1.0})
        full, compact, _ = build_pair('scatter_1', cfg)
        enc = full['layer'][0]['encoding']
        self.assertLess(enc['y']['scale']['domain'][0], -14)
        xspan = enc['x']['scale']['domain'][1] - enc['x']['scale']['domain'][0]
        yspan = enc['y']['scale']['domain'][1] - enc['y']['scale']['domain'][0]
        self.assertAlmostEqual(full['height'] / full['width'], yspan / xspan, delta=0.003)
        self.assertEqual(compact['data']['values'][1]['y'], -14)

    def test_nine_types_keep_observations_and_identical_compact_targets(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                cfg = fixture(kind)
                legacy, _, _ = build_geometry_pair(kind, cfg)
                full, compact, source = build_pair(kind, cfg)
                self.assertEqual(full['data'], legacy['data'])
                self.assertEqual(compact, normalize(legacy))
                self.assertEqual(project_rows(full), semantic_rows(compact))
                self.assertEqual(normalize(compact), compact)
                self.assertEqual(source['plot_layout'], full['usermeta']['plot_layout'])


if __name__ == '__main__':
    unittest.main()
