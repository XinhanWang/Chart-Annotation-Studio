"""Compact-v4 semantics and real Vega-Lite preview regression coverage."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))
from adapter import build_geometry_pair
from compact import KINDS, normalize, project_rows, semantic_rows, validate_canonical, validate_target
from compact_display import render_spec
from test_adapter import fixture
from render_support import render_specs


def full_for(kind, **updates):
    cfg = fixture(kind)
    cfg.update(updates)
    return build_geometry_pair(kind, cfg)[0]


def legacy_target(full):
    """A historical v3 table/expression representation for migration checks."""
    rows = project_rows(full, version=3)
    target = {'data': {'values': copy.deepcopy(rows)}, 'encoding': {}}
    for field, channel in [('category', 'x'), ('x', 'x'), ('series', 'color')]:
        identity = field + '_instance'
        if identity not in rows[0]:
            continue
        labels = {r[identity]: r[field] for r in rows}
        expr = json.dumps([labels[i] for i in range(len(labels))], ensure_ascii=False) + '[datum.value]'
        target['encoding'][channel] = {'field': field, 'legend' if channel == 'color' else 'axis': {'labelExpr': expr}}
        for row in target['data']['values']:
            row[field] = row.pop(identity)
    return target


class CompactSemanticV4Tests(unittest.TestCase):
    def test_alias(self):
        self.assertIs(validate_target, validate_canonical)

    def test_nine_kinds_core_projection_and_immutability(self):
        for kind in sorted(KINDS):
            with self.subTest(kind=kind):
                full = full_for(kind)
                before = copy.deepcopy(full)
                gt = normalize(full)
                validate_target(gt)
                self.assertEqual(normalize(gt), gt)
                self.assertIsNot(normalize(gt), gt)
                self.assertEqual(full, before)
                self.assertEqual(project_rows(full), semantic_rows(gt))
                self.assertEqual(len(gt['data']['values']), len(full['data']['values']))
                self.assertEqual(gt['encoding']['x']['title'], 'Sample / time (s)')
                self.assertEqual(gt['encoding']['y']['title'], 'Response (mg)')
                def inspect(value):
                    if isinstance(value, dict):
                        self.assertFalse(set(value) & {'axis', 'legend', 'config', 'width', 'height', 'font', 'fontSize', 'labelExpr', 'reverse', 'point', 'background'})
                        for v in value.values():
                            inspect(v)
                    elif isinstance(value, list):
                        for v in value:
                            inspect(v)
                inspect(gt)

    def test_duplicate_categories_and_series_keep_labels_and_identity(self):
        gt = normalize(full_for('barv_n'))
        rows = gt['data']['values']
        self.assertEqual([r['category'] for r in rows], ['repeat', 'repeat', 'repeat', 'repeat', 'Z', 'Z'])
        self.assertEqual([r['category_instance'] for r in rows], [0, 0, 1, 1, 2, 2])
        self.assertEqual([r['series_instance'] for r in rows], [0, 1, 0, 1, 0, 1])
        self.assertTrue(all(r['series'] == 'repeat' for r in rows))
        self.assertEqual(gt['encoding']['x']['field'], 'category_instance')
        self.assertEqual(gt['encoding']['color']['field'], 'series_instance')
        self.assertEqual(gt['encoding']['xOffset']['field'], 'series_instance')

    def test_duplicate_categorical_and_temporal_line_labels(self):
        for mode in ['categorical', 'temporal']:
            gt = normalize(full_for('line_1', x_mode=mode, x_labels=['Jan', 'Jan', 'Feb']))
            self.assertEqual([r['x'] for r in gt['data']['values']], ['Jan', 'Jan', 'Feb'])
            self.assertEqual([r['x_instance'] for r in gt['data']['values']], [0, 1, 2])
            self.assertEqual(gt['encoding']['x']['field'], 'x_instance')

    def test_single_anonymous_and_visible_named_series(self):
        for kind in ['barh_1', 'barv_1', 'line_1', 'scatter_1']:
            hidden = normalize(full_for(kind, show_legend=False))
            self.assertNotIn('color', hidden['encoding'])
            self.assertTrue(all('series' not in r for r in hidden['data']['values']))
            visible = normalize(full_for(kind, show_legend=True))
            self.assertEqual({r['series'] for r in visible['data']['values']}, {'repeat'})
            self.assertIn('color', visible['encoding'])
            visible_default = normalize(full_for(kind, show_legend=True, series_name='Series 1', series_names=['Series 1']))
            self.assertEqual({r['series'] for r in visible_default['data']['values']}, {'Series 1'})

    def test_hidden_multi_series_keep_stable_anonymous_identity(self):
        for kind in ['barv_n', 'barh_n', 'barv_stack', 'line_n', 'scatter_n']:
            full = full_for(kind, show_legend=False)
            gt = normalize(full)
            self.assertEqual({r['series'] for r in gt['data']['values']}, {'Series 1', 'Series 2'})
            self.assertNotIn('repeat', [r['series'] for r in gt['data']['values']])
            self.assertEqual(project_rows(full), semantic_rows(gt))

    def test_duplicate_observations_not_removed(self):
        rows = normalize(full_for('scatter_1'))['data']['values']
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0], rows[1])

    def test_path_edges_preserved(self):
        for xs in [[3, 1, 2], [3, 2, 1], [1, 1, 2]]:
            full = full_for('line_n', x_values=xs)
            gt = normalize(full)
            self.assertEqual([r['x'] for r in gt['data']['values']], sorted(xs * 2))
            order = gt['encoding'].get('order', {}).get('field')
            for s in [0, 1]:
                rows = [r for r in gt['data']['values'] if r['series_instance'] == s]
                if order:
                    rows.sort(key=lambda r: r[order])
                expected = list(zip(xs, fixture('line_n')['matrix'][s]))
                edges = lambda points: {frozenset(pair) for pair in zip(points, points[1:])}
                self.assertEqual(edges([(r['x'], r['y']) for r in rows]), edges(expected))
            self.assertEqual(project_rows(full), semantic_rows(gt))

    def test_stack_errors_and_arbitrary_endpoints(self):
        ordinary = normalize(full_for('barv_stack', matrix=[[25, 20, 40], [75, 80, 60]], bottoms=[[0, 0, 0], [25, 20, 40]], stack_mode='percent'))
        self.assertEqual(ordinary['encoding']['y']['stack'], 'zero')
        self.assertEqual([r['value'] for r in ordinary['data']['values']], [75, 25, 80, 20, 60, 40])
        self.assertEqual(ordinary['encoding']['order']['field'], 'stack_order')
        full = full_for('barv_stack', bottoms=[[2, 7, 0], [11, -5, 3]])
        arbitrary = normalize(full)
        self.assertEqual(arbitrary['encoding']['y']['field'], 'end')
        self.assertEqual(arbitrary['encoding']['y2'], {'field': 'start'})
        self.assertEqual(project_rows(full), semantic_rows(arbitrary))
        error = normalize(full_for('barh_1', xerr=[[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]))
        self.assertEqual([(r['lower'], r['upper']) for r in error['data']['values']], [(-0.3, 0.6), (-3.2, -2.5), (0.9, 1.4)])
        self.assertEqual(error['layer'][1]['encoding']['x2'], {'field': 'upper'})

    def test_reverse_removed_but_visible_row_order_retained(self):
        full = full_for('scatter_1')
        for layer in full['layer']:
            layer['encoding']['x']['scale'].update(type='log', base=2, domain=[0.1, 999], reverse=True)
        gt = normalize(full)
        self.assertEqual(gt['encoding']['x']['scale'], {'type': 'log', 'base': 2})
        self.assertEqual([r['x'] for r in gt['data']['values']], [2, 1.7, 0.2, 0.2])
        self.assertEqual(project_rows(full), semantic_rows(gt))

    def test_style_and_wrapping_do_not_enter_gt(self):
        full = full_for('line_n')
        full['usermeta']['semantic_labels'] = {'title': 'Scientific condition', 'x_title': 'Time (s)', 'y_title': 'Dose (mg)'}
        changed = copy.deepcopy(full)
        changed.update(width=999, height=888, background='pink', config={'font': 'Anything'})
        changed['title']['text'] = ['Scientific', 'condition']
        for layer in changed['layer']:
            layer['mark'].update(color='#123456', opacity=0.1, point=True)
            layer['encoding']['x']['title'] = ['Time', '(s)']
        self.assertEqual(normalize(full), normalize(changed))

    def test_legacy_v3_decoder_and_explicit_projection(self):
        for kind in ['barv_n', 'line_n', 'scatter_n', 'line_1']:
            full = full_for(kind)
            old = legacy_target(full)
            before = copy.deepcopy(old)
            self.assertEqual(semantic_rows(old), project_rows(full, version=3))
            self.assertEqual(project_rows(old), project_rows(full, version=3))
            self.assertEqual(old, before)
            with self.assertRaises(ValueError):
                normalize(old)
        full = full_for('line_1', show_legend=False)
        self.assertTrue(all('series' in r for r in project_rows(full, version=3)))
        self.assertTrue(all('series' not in r for r in project_rows(full)))

    def test_noncanonical_and_unsupported_inputs_rejected(self):
        gt = normalize(full_for('line_1'))
        invalid = [{}, {'data': {'url': 'remote'}, 'mark': 'line', 'encoding': {}}, []]
        for key, value in [('axis', {}), ('legend', None), ('config', {}), ('width', 2), ('transform', []), ('usermeta', {})]:
            v = copy.deepcopy(gt); v[key] = value; invalid.append(v)
        for key, value in [('axis', {}), ('legend', None), ('scale', {'reverse': True}), ('scale', {'type': 'linear'}), ('type', 'temporal')]:
            v = copy.deepcopy(gt); v['encoding']['x'][key] = value; invalid.append(v)
        v = copy.deepcopy(gt); v['mark'] = {'type': 'line', 'point': True}; invalid.append(v)
        v = copy.deepcopy(gt); v['data']['values'][0]['hidden'] = 'leak'; invalid.append(v)
        v = normalize(full_for('barv_n')); del v['data']['values'][0]['category']; invalid.append(v)
        v = normalize(full_for('barv_n')); v['encoding']['color']['field'] = 'series'; invalid.append(v)
        for v in invalid:
            with self.subTest(value=v):
                with self.assertRaises(ValueError):
                    validate_target(v)
                if isinstance(v, dict):
                    with self.assertRaises(ValueError):
                        normalize(v)

    def test_preview_isolated_data_and_titles(self):
        for kind in sorted(KINDS):
            gt = normalize(full_for(kind))
            before = copy.deepcopy(gt)
            preview = render_spec(gt)
            self.assertEqual(gt, before)
            self.assertEqual(preview['data'], gt['data'])
            self.assertIsNot(preview['data'], gt['data'])
            preview['data']['values'][0]['dummy'] = 1
            self.assertEqual(gt, before)
        gt = normalize(full_for('line_1'))
        del gt['encoding']['x']['title']; del gt['encoding']['y']['title']
        preview = render_spec(gt)
        self.assertIsNone(preview['encoding']['x']['title'])
        self.assertIsNone(preview['encoding']['y']['title'])
        self.assertNotIn('title', gt['encoding']['x'])

    def test_real_vega_compile_run_svg_all_kinds_and_duplicates(self):
        modules = os.environ.get('VSR_TEXT_TEST_MODULES', str(ROOT.parent / 'node_modules'))
        targets = [normalize(full_for(k)) for k in sorted(KINDS)]
        special = normalize(full_for('line_1', x_mode='categorical', x_labels=['数"据\\甲', '数"据\\甲', 'B']))
        targets.append(special)
        with patch.dict(os.environ, {'VSR_TEXT_TEST_MODULES': modules}):
            rendered = render_specs([render_spec(t) for t in targets])
        self.assertEqual(len(rendered), len(targets))
        for r in rendered:
            self.assertIn('<svg', r['svg'])
            self.assertEqual(r['warnings'], [])
        labels = [label['text'] for label in rendered[-1]['labels']]
        self.assertEqual(labels.count('数"据\\甲'), 2)
        self.assertIn('B', labels)

    def test_real_single_point_line_visible_only_in_preview(self):
        gt = normalize(full_for('line_1', matrix=[[3]], x_values=[1], x_labels=['1'], show_legend=False))
        self.assertEqual(gt['mark'], {'type': 'line'})
        preview = render_spec(gt)
        self.assertEqual(preview['mark'], {'type': 'line', 'point': True})
        self.assertEqual(gt['data'], preview['data'])
        with patch.dict(os.environ, {'VSR_TEXT_TEST_MODULES': os.environ.get('VSR_TEXT_TEST_MODULES', str(ROOT.parent / 'node_modules'))}):
            rendered = render_specs([preview])[0]
        self.assertIn('role-mark', rendered['svg'])
        self.assertIn('aria-roledescription="point"', rendered['svg'])
        self.assertEqual(rendered['warnings'], [])

    def test_all_nonlinear_scales_keep_only_applicable_semantics(self):
        for scale in ({'type': 'log', 'base': 2}, {'type': 'pow', 'exponent': 3},
                      {'type': 'sqrt'}, {'type': 'symlog', 'constant': 0.5}):
            with self.subTest(scale=scale):
                full = full_for('scatter_1')
                for layer in full['layer']:
                    layer['encoding']['x']['scale'] = {**scale, 'domain': [0.1, 10], 'reverse': True, 'nice': False, 'zero': False}
                gt = normalize(full)
                self.assertEqual(gt['encoding']['x']['scale'], scale)
                self.assertEqual(project_rows(full), semantic_rows(gt))
                self.assertEqual(normalize(gt), gt)
                self.assertEqual(render_spec(gt)['data'], gt['data'])

    def test_invalid_nonlinear_parameters_are_rejected(self):
        for scale in ({'type': 'log', 'base': 1}, {'type': 'log', 'base': 0},
                      {'type': 'pow', 'exponent': -2}, {'type': 'symlog', 'constant': 0},
                      {'type': 'sqrt', 'exponent': 2}, {'type': 'pow', 'exponent': float('inf')}):
            with self.subTest(scale=scale):
                gt = normalize(full_for('scatter_1'))
                gt['encoding']['x']['scale'] = scale
                with self.assertRaises(ValueError):
                    validate_target(gt)

    def test_long_legend_names_are_complete_only_in_display_projection(self):
        names=['Aardvark / Panchaxes with a complete long name', 'A second full series identity']
        gt=normalize(full_for('line_n',series_names=names))
        before=copy.deepcopy(gt);preview=render_spec(gt)
        self.assertNotIn('legend',gt['encoding']['color'])
        self.assertEqual(preview['encoding']['color']['legend']['labelLimit'],0)
        self.assertEqual(gt,before)
        with patch.dict(os.environ, {'VSR_TEXT_TEST_MODULES': os.environ.get('VSR_TEXT_TEST_MODULES',str(ROOT.parent/'node_modules'))}):
            rendered=render_specs([preview])[0]
        # render_specs.labels contains axis labels only; inspect actual SVG text
        # nodes for legend evidence rather than mistaking that helper for all text.
        import xml.etree.ElementTree as ET
        svg=ET.fromstring(rendered['svg'])
        labels=[''.join(node.itertext()) for node in svg.iter() if node.tag.rsplit('}',1)[-1]=='text']
        for name in names:self.assertIn(name,labels)


if __name__ == '__main__':
    unittest.main()
