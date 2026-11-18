"""Single-vertex line series remain visible without changing ordinary targets."""
from __future__ import annotations

import copy
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import build_pair
from compact import normalize, project_rows, semantic_rows
from compact_display import render_spec
from render_support import render_specs
from test_adapter import fixture


def singleton_pair(kind, mode):
    cfg = fixture(kind)
    count = 1 if kind == 'line_1' else 2
    cfg.update(x_mode=mode, x_values=[1], x_labels=['One condition'],
               matrix=[[index + 1] for index in range(count)],
               markers=['o'] * count, markevery=[None] * count,
               xlim=[0, 2], ylim=[0, 3], show_legend=False)
    return build_pair(kind, cfg)


def audited(spec):
    """Add inert row identities only for the shared scenegraph test helper."""
    result = copy.deepcopy(spec)
    for index, row in enumerate(result['data']['values']):
        row.setdefault('row_id', f'audit-{index}')
    return result


class SinglePointLineTests(unittest.TestCase):
    def test_single_vertex_lines_enable_points_only_in_preview(self):
        for kind in ('line_1', 'line_n'):
            for mode in ('numeric', 'categorical', 'temporal'):
                with self.subTest(kind=kind, mode=mode):
                    full, target, _ = singleton_pair(kind, mode)
                    self.assertEqual(target['mark'], {'type': 'line'})
                    self.assertEqual(render_spec(target)['mark'], {'type': 'line', 'point': True})
                    self.assertEqual(project_rows(full), semantic_rows(target))
                    self.assertEqual(normalize(target), target)

    def test_one_short_series_is_enough_and_does_not_lose_path_order(self):
        cfg = fixture('line_n')
        cfg['x_values'] = [3, 1, 2]
        full, _, _ = build_pair('line_n', cfg)
        full['data']['values'] = [row for row in full['data']['values']
                                  if row['series_index'] == 0 or row['point_index'] == 0]
        target = normalize(full)
        self.assertEqual(target['mark'], {'type': 'line'})
        self.assertEqual(render_spec(target)['mark'], {'type': 'line', 'point': True})
        self.assertEqual(target['encoding']['order'], {'field': 'path_order', 'type': 'quantitative'})
        self.assertEqual(project_rows(full), semantic_rows(target))

    def test_ordinary_multivertex_line_target_stays_minimal(self):
        for kind in ('line_1', 'line_n'):
            full, target, _ = build_pair(kind, fixture(kind))
            self.assertEqual(target['mark'], {'type': 'line'})
            self.assertEqual(normalize(full), target)
            self.assertNotIn('order', target['encoding'])

    def test_real_scenegraph_has_visible_symbols_and_one_line_vertex_per_row(self):
        specs = []
        for kind in ('line_1', 'line_n'):
            for mode in ('numeric', 'categorical'):
                full, target, _ = singleton_pair(kind, mode)
                specs.extend((audited(full), audited(render_spec(target))))
        for spec, result in zip(specs, render_specs(specs)):
            with self.subTest(kind=spec.get('usermeta', {}).get('semantic', {}).get('kind', 'compact')):
                self.assertEqual(result['warnings'], [])
                expected = {row['row_id'] for row in spec['data']['values']}
                for marktype in ('line', 'symbol'):
                    marks = [mark for mark in result['marks'] if mark['marktype'] == marktype]
                    self.assertEqual(len(marks), len(expected))
                    self.assertEqual({mark['row_id'] for mark in marks}, expected)
                    self.assertTrue(all(math.isfinite(mark[axis]) for mark in marks for axis in ('x', 'y')))
                self.assertIn('mark-symbol', result['svg'])


if __name__ == '__main__':
    unittest.main()
