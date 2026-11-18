"""The training table must agree with positions and labels in real rendered charts."""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import KINDS, build_pair
from compact import project_rows, semantic_rows
from compact_display import render_spec
from render_support import render_specs
from test_adapter import fixture
from text_layout import audit_text


def plain_bar(kind, reverse=False):
    cfg = fixture(kind)
    cfg.update(labels=['Zeta', 'Alpha', 'Mu'], xerr=None, yerr=None, show_error=False,
               matrix=[[1, 2, 3], [4, 5, 6]], series_names=['B treatment', 'A treatment'])
    axis = 'y' if kind.startswith('barh') else 'x'
    cfg[axis + 'lim'] = [2.6, -.6] if reverse else [-.6, 2.6]
    return cfg


class VisibleContractTests(unittest.TestCase):
    def test_all_discrete_gt_encodings_use_data_order(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                cfg = fixture(kind)
                if kind.startswith('line'):
                    cfg.update(x_mode='categorical', x_labels=['Zulu', 'Alpha', 'Middle'])
                full, target, _ = build_pair(kind, cfg)
                self.assertEqual(project_rows(full), semantic_rows(target))
                for encoding in [target.get('encoding', {}), *(layer.get('encoding', {}) for layer in target.get('layer', []))]:
                    for definition in encoding.values():
                        if definition.get('type') in ('nominal', 'ordinal'):
                            self.assertIn('sort', definition)
                            self.assertIsNone(definition['sort'])

    def test_hidden_legends_omit_anonymous_singleton_but_keep_multiple_identities(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                cfg = fixture(kind)
                cfg['show_legend'] = False
                full, target, _ = build_pair(kind, cfg)
                self.assertEqual(project_rows(full), semantic_rows(target))
                full_names = {row['series_name'] for row in full['data']['values']}
                if kind.endswith('_1'):
                    self.assertTrue(all('series' not in row for row in target['data']['values']))
                    self.assertNotIn('color', target['encoding'])
                    self.assertEqual(full_names, {'Series 1'})
                else:
                    names = list(dict.fromkeys(row['series'] for row in target['data']['values']))
                    self.assertEqual(names, [f'Series {i + 1}' for i in range(len(names))])
                    self.assertEqual(full_names, set(names))
                    self.assertNotIn('legend', target['encoding']['color'])

    def test_actual_bar_positions_and_discrete_domains_match_gt_row_order(self):
        cases = [(kind, reverse, build_pair(kind, plain_bar(kind, reverse)))
                 for kind in ('barh_n', 'barv_n') for reverse in (False, True)]
        outputs = render_specs([spec for _, _, (full, target, _) in cases for spec in (full, render_spec(target))])
        for index, (kind, reverse, (full, target, _)) in enumerate(cases):
            with self.subTest(kind=kind, reverse=reverse):
                rendered_full, rendered_gt = outputs[index * 2:index * 2 + 2]
                self.assertEqual(rendered_full['warnings'], [])
                self.assertEqual(rendered_gt['warnings'], [])
                axis = 'y' if kind.startswith('barh') else 'x'
                extent = 'height' if axis == 'y' else 'width'
                bars = [mark for mark in rendered_full['marks'] if mark['name'].startswith('bars_')]
                self.assertEqual(len(bars), 6)
                bars.sort(key=lambda mark: mark[axis] + (mark.get(extent) or 0) / 2)
                visible = [(mark['datum']['category'], mark['datum']['value'], mark['datum']['series_name']) for mark in bars]
                table = [(row['category'], row['value'], row['series']) for row in target['data']['values']]
                self.assertEqual(table, visible)
                expected = list(dict.fromkeys(row['category'] for row in target['data']['values']))
                actual = rendered_gt['scales'][axis]
                self.assertEqual(actual['domain'], expected)
                self.assertEqual(actual['positions'], sorted(actual['positions']))

    def test_preview_renders_discrete_labels_without_axis_guides_in_gt(self):
        specs = []
        originals = []
        for mode in ('categorical', 'temporal'):
            cfg = fixture('line_n')
            labels = ([f'Condition {i:02d}' for i in range(12)] if mode == 'categorical'
                      else [f'{2020 + i // 4} Q{i % 4 + 1}' for i in range(12)])
            cfg.update(x_mode=mode, x_values=list(range(12)), x_labels=labels,
                       matrix=[[i + 1 for i in range(12)], [15 - i / 2 for i in range(12)]],
                       xlim=[-.5, 11.5], ylim=[0, 16], markevery=[None, None],
                       _render_axes={'xticks': [0, 4, 8], 'xticklabels': [labels[i] for i in (0, 4, 8)]})
            full, target, _ = build_pair('line_n', cfg)
            specs.extend((full, render_spec(target)))
            originals.extend((labels, labels))
            self.assertNotIn('axis', target['encoding']['x'])
            self.assertEqual(list(dict.fromkeys(row['x'] for row in target['data']['values'])), labels)
        for spec, labels, output in zip(specs, originals, render_specs(specs)):
            self.assertEqual(output['warnings'], [])
            self.assertTrue(audit_text(spec, output['svg'])['passed'])
            actual = [' '.join(str(part) for part in item['text']) if isinstance(item['text'], list)
                      else str(item['text']) for item in output['labels']]
            for label in labels:
                self.assertIn(label, actual)

    def test_full_log_axes_render_without_scale_warnings(self):
        cases = []
        for kind in ('line_n', 'scatter_n'):
            for axis in ('x', 'y'):
                for reverse in (False, True):
                    cfg = fixture(kind)
                    if kind.startswith('line'):
                        cfg['matrix'] = [[abs(value) + 1 for value in series] for series in cfg['matrix']]
                    else:
                        cfg['y'] = [abs(value) + 1 for value in cfg['y']]
                    domain = [100, .1] if reverse else [.1, 100]
                    cfg['_render_axes'] = {axis + 'scale': 'log', axis + 'lim': domain}
                    full, target, _ = build_pair(kind, cfg)
                    self.assertNotIn("reverse", target["encoding"][axis].get("scale", {}))
                    cases.extend((kind, axis, direction, spec) for direction, spec in ((reverse, full), (False, render_spec(target))))
        for case, result in zip(cases, render_specs([case[3] for case in cases])):
            kind, axis, reverse, _ = case
            with self.subTest(kind=kind, axis=axis, reverse=reverse):
                self.assertEqual(result['warnings'], [])
                scale = result['scales'][axis]
                self.assertTrue(all(value > 0 for value in scale['domain']))
                self.assertTrue(all(math.isfinite(value) for value in scale['positions']))
                increasing = reverse if axis == 'y' else not reverse
                self.assertEqual(scale['positions'], sorted(scale['positions'], reverse=not increasing))

    def test_hidden_source_names_do_not_leak_into_preview_svg(self):
        cfg = fixture('line_n')
        cfg.update(show_legend=False, series_names=['Secret source name', 'Other hidden name'])
        full, target, _ = build_pair('line_n', cfg)
        before = copy.deepcopy(target)
        self.assertNotIn('legend', target['encoding']['color'])
        for result in render_specs([full, render_spec(target)]):
            # Preview derives its own guides; source legend remains hidden.
            self.assertEqual(target, before)
            self.assertNotIn('Secret source name', result['svg'])
            self.assertNotIn('Other hidden name', result['svg'])


if __name__ == '__main__':
    unittest.main()
