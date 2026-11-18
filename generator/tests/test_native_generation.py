"""Public native sampling regressions with the legacy renderer unavailable."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from adapter import build_pair
from generation import FAMILIES, KINDS, PROFILES, generate_chart
from generation.controls import normalize_controls


def compact_controls(kind):
    controls = {'category_count': 5} if kind.startswith('bar') else {'point_count': 16 if kind == 'scatter_n' else 8}
    if not kind.endswith('_1'):
        controls['series_count'] = 2
    return controls


class NativeGenerationTests(unittest.TestCase):
    def test_nine_kinds_are_deterministic_with_matplotlib_import_forbidden(self):
        script = r'''
import importlib.abc,json,pathlib,sys,tempfile
class NoMatplotlib(importlib.abc.MetaPathFinder):
    def find_spec(self,fullname,path=None,target=None):
        if fullname=='matplotlib' or fullname.startswith('matplotlib.'):
            raise AssertionError('Removed Matplotlib dependency was imported: '+fullname)
sys.meta_path.insert(0,NoMatplotlib())
from generation import KINDS,generate_chart
from adapter import build_pair
results=[]
with tempfile.TemporaryDirectory() as directory:
    for index,kind in enumerate(KINDS):
        controls={'category_count':5} if kind.startswith('bar') else {'point_count':16 if kind=='scatter_n' else 8}
        if not kind.endswith('_1'):controls['series_count']=2
        first=generate_chart(kind,701+index,pathlib.Path(directory)/(kind+'a'),controls)
        second=generate_chart(kind,701+index,pathlib.Path(directory)/(kind+'b'),controls)
        full,target,source=build_pair(kind,first['config'])
        results.append({'kind':kind,'same':first['config']==second['config'],'rows':len(target['data']['values'])})
    forbidden=[str(p) for p in pathlib.Path(directory).rglob('*') if p.suffix=='.png' or p.name.startswith('native.')]
print(json.dumps({'results':results,'forbidden_files':forbidden,'loaded':[n for n in sys.modules if n.startswith('matplotlib')]}))
'''
        run = subprocess.run([sys.executable, '-c', script], cwd=ROOT, text=True, encoding='utf-8',
                             capture_output=True, check=True, timeout=120)
        result = json.loads(run.stdout)
        self.assertEqual({r['kind'] for r in result['results']}, set(KINDS))
        self.assertTrue(all(r['same'] and r['rows'] > 0 for r in result['results']))
        self.assertEqual(result['loaded'], [])
        self.assertEqual(result['forbidden_files'], [])

    def test_every_retained_data_family_generates_valid_observations(self):
        with tempfile.TemporaryDirectory() as directory:
            for kind in KINDS:
                seen = set()
                for index, family in enumerate(FAMILIES[kind]):
                    with self.subTest(kind=kind, family=family):
                        controls = {**compact_controls(kind), 'family': family}
                        cfg = generate_chart(kind, 401, Path(directory) / f'{kind}-{index}', controls)['config']
                        full, target, source = build_pair(kind, cfg)
                        self.assertEqual(cfg['family'], family)
                        self.assertEqual(len(target['data']['values']), source['row_count'])
                        json.dumps(full, allow_nan=False)
                        seen.add(json.dumps(target['data']['values'], sort_keys=True))
                self.assertGreater(len(seen), 1, f'{kind} collapsed all families into identical observations')

    def test_forced_error_hatch_and_count_controls_are_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            for kind in ('barh_1', 'barh_n', 'barv_1', 'barv_n'):
                controls = {**compact_controls(kind), 'show_error': True, 'hatch': '/', 'show_legend': False}
                before = copy.deepcopy(controls)
                cfg = generate_chart(kind, 118, Path(directory) / kind, controls)['config']
                full, target, source = build_pair(kind, cfg)
                self.assertEqual(controls, before)
                self.assertEqual(len(cfg['labels']), 5)
                self.assertEqual(source['row_count'], 5 if kind.endswith('_1') else 10)
                self.assertTrue(all('lower' in row and 'upper' in row for row in target['data']['values']))
                self.assertTrue(any(layer.get('name', '').startswith('__vsr_decoration') for layer in full['layer']))
                if kind.endswith('_1'):
                    self.assertTrue(all('series' not in row for row in target['data']['values']))
                    self.assertNotIn('color', target['encoding'])
                else:
                    self.assertEqual({row['series'] for row in target['data']['values']}, {'Series 1', 'Series 2'})
                    self.assertNotIn('legend', target['encoding']['color'])

    def test_percent_stacks_sum_to_one_hundred_per_category(self):
        with tempfile.TemporaryDirectory() as directory:
            cfg = generate_chart('barv_stack', 234, directory,
                                 {'category_count': 7, 'series_count': 4, 'stack_mode': 'percent'})['config']
        self.assertEqual(cfg['stack_mode'], 'percent')
        self.assertEqual(len(cfg['matrix']), 4)
        for index in range(7):
            self.assertAlmostEqual(sum(series[index] for series in cfg['matrix']), 100, places=7)

    def test_style_profiles_remain_diverse(self):
        signatures = set()
        with tempfile.TemporaryDirectory() as directory:
            for index, profile in enumerate(PROFILES):
                cfg = generate_chart('scatter_n', 910, Path(directory) / str(index),
                                     {'point_count': 20, 'series_count': 3, 'profile': profile})['config']
                signatures.add(json.dumps(cfg['style'], sort_keys=True))
        self.assertGreaterEqual(len(signatures), 6)

    def test_controls_reject_invalid_types_and_preserve_aliases(self):
        for controls in ([], {'point_count': True}, {'series_count': 1}, {'show_legend': 1},
                         {'x_mode': 'missing'}, {'style': []}, {'unknown_control': 2}):
            with self.subTest(controls=controls), self.assertRaises(ValueError):
                normalize_controls('line_n', controls)
        normalized = normalize_controls('line_n', {'n_points': 7, 'n_series': 3, 'style_profile': 'editorial'})
        self.assertEqual(normalized, {'point_count': 7, 'series_count': 3, 'profile': 'editorial'})

    def test_single_point_lines_keep_a_visible_point_for_every_series(self):
        with tempfile.TemporaryDirectory() as directory:
            for kind, seed in (("line_1", 1), ("line_n", 3)):
                with self.subTest(kind=kind):
                    cfg = generate_chart(kind, seed, Path(directory) / kind, {"point_count": 1})["config"]
                    full, target, source = build_pair(kind, cfg)
                    marker_layers = [layer for layer in full["layer"] if layer.get("name", "").startswith("line_markers_")]
                    self.assertEqual(len(marker_layers), cfg["n_series"])
                    self.assertEqual(len(target["data"]["values"]), cfg["n_series"])
                    self.assertTrue(all(marker not in (None, "None", "none", "", " ") for marker in cfg["markers"]))

    def test_existing_sample_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            generate_chart('line_1', 91, directory, {'point_count': 5})
            saved = (Path(directory) / 'config.json').read_bytes()
            with self.assertRaises(FileExistsError):
                generate_chart('line_1', 92, directory, {'point_count': 6})
            self.assertEqual((Path(directory) / 'config.json').read_bytes(), saved)


if __name__ == '__main__':
    unittest.main()
