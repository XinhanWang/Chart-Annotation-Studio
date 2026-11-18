"""Output syntax is stable across views, artifacts and training JSON."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))
from adapter import KINDS, build_geometry_pair
from compact import normalize, project_rows, semantic_rows
from spec_format import format_spec
from test_adapter import fixture
from workflow.io import canonical, dump, jsonl, read, serialize


class SpecFormatTests(unittest.TestCase):
    def assert_views(self, spec):
        priority = ['title', 'data', 'encoding', 'layer'] if 'layer' in spec else ['title', 'data', 'mark', 'encoding']
        prefix = [k for k in priority if k in spec]
        self.assertEqual(list(spec)[:len(prefix)], prefix)
        if 'mark' in spec:
            self.assertIsInstance(spec['mark'], dict)
            self.assertIn('type', spec['mark'])
        for key in ('layer', 'concat', 'hconcat', 'vconcat'):
            for child in spec.get(key, []):
                self.assert_views(child)
        if 'spec' in spec:
            self.assert_views(spec['spec'])

    def test_nine_kinds_artifacts_and_training_serialization(self):
        for kind in KINDS:
            for title in ('A title', ''):
                with self.subTest(kind=kind, title=title), tempfile.TemporaryDirectory() as directory:
                    cfg = fixture(kind)
                    cfg['title'] = title
                    full, _, _ = build_geometry_pair(kind, cfg)
                    gt = normalize(full)
                    if 'layer' in gt:
                        self.assertIn('x', gt['encoding'])
                        self.assertIn('y', gt['encoding'])
                        self.assertEqual(gt['layer'][0]['mark'], {'type': 'bar'})
                        if kind == 'barline_n':
                            # Each geometry keeps its own role filter; only the
                            # bar layers may offset grouped series.
                            self.assertEqual(gt['layer'][-1]['mark'], {'type': 'line'})
                            for layer in gt['layer']:
                                self.assertEqual([t['filter']['field'] for t in layer['transform']], ['series_role'])
                                self.assertLessEqual(set(layer.get('encoding', {})),
                                                     {'xOffset'} | ({'y', 'y2'} if layer['mark'] == {'type': 'rule'} else set()))
                        else:
                            self.assertNotIn('encoding', gt['layer'][0])
                            # Error layers override only the interval channels;
                            # grouping and the categorical position are inherited.
                            self.assertLessEqual(set(gt['layer'][1]['encoding']), {'x', 'x2', 'y', 'y2'})
                    self.assertEqual(semantic_rows(gt), project_rows(full))
                    self.assertEqual(serialize(normalize(gt)), serialize(gt))
                    for name, spec in [('full', full), ('compact', gt)]:
                        path = Path(directory) / (name + '.json')
                        dump(path, spec)
                        self.assert_views(read(path))
                    path = Path(directory) / 'train.jsonl'
                    jsonl(path, [{'messages': [{'role': 'assistant', 'content': serialize(gt)}], 'spec': gt}])
                    row = json.loads(path.read_text(encoding='utf-8'))
                    self.assert_views(json.loads(row['messages'][0]['content']))
                    self.assert_views(row['spec'])
                    if not title:
                        self.assertNotIn('title', gt)

    def test_nested_views_preserve_observations_and_mark_options(self):
        data = {'values': [{'mark': 'keep', 'title': 'column', 'spec': {'mark': 'unchanged'}}]}
        original = {'encoding': {}, 'layer': [{'encoding': {}, 'mark': 'bar'},
                    {'layer': [{'mark': {'type': 'line', 'order': False}}], 'data': data, 'title': 'Inner'}],
                    'data': data, 'title': 'Outer', 'usermeta': {'mark': 'keep'}}
        before = copy.deepcopy(original)
        result = format_spec(original)
        self.assert_views(result)
        self.assertEqual(result['data'], data)
        self.assertEqual(result['usermeta'], original['usermeta'])
        self.assertEqual(result['layer'][1]['layer'][0]['mark'], {'type': 'line', 'order': False})
        self.assertEqual(original, before)
        self.assertEqual(serialize(format_spec(result)), serialize(result))
        self.assertEqual(canonical({'b': 2, 'a': 1}), canonical({'a': 1, 'b': 2}))

    def test_historical_string_marks_normalize_without_mutation(self):
        for kind in KINDS:
            gt = normalize(build_geometry_pair(kind, fixture(kind))[0])
            old = copy.deepcopy(gt)
            views = old.get('layer', [old])
            for view in views:
                if set(view['mark']) == {'type'}:
                    view['mark'] = view['mark']['type']
            before = copy.deepcopy(old)
            new = normalize(old)
            self.assert_views(new)
            self.assertEqual(new, gt)
            self.assertEqual(old, before)


if __name__ == '__main__':
    unittest.main()
