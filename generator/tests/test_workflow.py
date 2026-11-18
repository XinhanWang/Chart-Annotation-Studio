"""Run-version and saved-data replay regressions for the public workflow."""
from argparse import Namespace
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pipeline
from test_adapter import fixture
from workflow.config import CONTRACT, load_config, resolve_controls, task_seed
from workflow.io import digest, dump, read
from generation import GENERATOR_VERSION, generate_chart
from adapter import VERSION as PROJECTION_VERSION


class WorkflowTests(unittest.TestCase):
    def test_invalid_control_container_types_are_rejected_before_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'run.json'
            for controls in ([], {'all': []}, {'line_n': 'not an object'}, {'unknown': {}}):
                with self.subTest(controls=controls):
                    dump(path, {'controls': controls})
                    with self.assertRaises(ValueError):
                        load_config(path)

    def test_list_controls_resolve_round_robin_per_sample(self):
        with tempfile.TemporaryDirectory() as directory:
            controls = {"category_count": [4, 9], "data_labels": [False, True]}
            configs = []
            for index in range(4):
                task = {"id": f"barline_n-{index:06d}", "kind": "barline_n", "index": index,
                        "seed": task_seed(77, "barline_n", index),
                        "output": str(Path(directory) / f"s{index}"),
                        "controls": resolve_controls(controls, index)}
                row = pipeline.produce(task)
                self.assertEqual(row["status"], "generated", row)
                configs.append(read(Path(task["output"]) / "config.json"))
            self.assertEqual([len(cfg["labels"]) for cfg in configs], [4, 9, 4, 9])
            self.assertEqual([bool(cfg["data_labels"]) for cfg in configs], [False, True, False, True])

    def test_empty_or_nested_control_lists_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cfg.json"
            dump(path, {"seed": 1, "counts": {"barline_n": 1}, "controls": {"barline_n": {"category_count": []}}})
            with self.assertRaises(ValueError):
                load_config(path)
            dump(path, {"seed": 1, "counts": {"barline_n": 1}, "controls": {"barline_n": {"category_count": [[4]]}}})
            with self.assertRaises(ValueError):
                load_config(path)

    def test_legacy_native_options_are_ignored_with_explicit_warning(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            dump(path, {'native': True, 'postprocess_native': True})
            with self.assertWarnsRegex(UserWarning, 'removed'):
                cfg = load_config(path)
            self.assertNotIn('native', cfg)
            self.assertNotIn('postprocess_native', cfg)

    def test_resume_refuses_different_generator_or_gt_contract(self):
        for field, value in (('generator_version', 'legacy-vsr'), ('contract', 'compact-v2')):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                config_file = root / 'config.json'
                dump(config_file, {})
                output = root / 'run'
                current = {'generator_version': GENERATOR_VERSION, 'contract': CONTRACT}
                dump(output / 'run.json', {**current, field: value})
                before = (output / 'run.json').read_bytes()
                with self.assertRaisesRegex(ValueError, 'same generator and GT contract'):
                    pipeline.generate(Namespace(config=str(config_file), output=str(output), workers=None, resume=True))
                self.assertEqual((output / 'run.json').read_bytes(), before)

    def test_resume_refuses_previous_projection_format(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dump(root / 'config.json', {})
            for version in (None, '3.0.0'):
                dump(root / 'run/run.json', {'generator_version': GENERATOR_VERSION,
                    'contract': CONTRACT, 'projection_version': version})
                before = (root / 'run/run.json').read_bytes()
                with self.assertRaisesRegex(ValueError, 'same projection version'):
                    pipeline.generate(Namespace(config=str(root / 'config.json'),
                        output=str(root / 'run'), workers=None, resume=True))
                self.assertEqual((root / 'run/run.json').read_bytes(), before)

    def test_matching_sample_provenance_reuses_saved_configuration_without_sampling(self):
        from workflow.samples import obtain_sample
        with tempfile.TemporaryDirectory() as directory:
            sample = generate_chart('barv_1', 101, directory, {'category_count': 4})
            output = Path(directory)
            config_bytes = (output / 'config.json').read_bytes()
            sampling_bytes = (output / 'sampling.json').read_bytes()
            task = {'kind': 'barv_1', 'seed': 101, 'output': directory,
                    'controls': {'n_categories': 4}}
            with patch('workflow.samples.generate_chart', side_effect=AssertionError('Must reuse saved sample')):
                with patch('workflow.samples.sample_config', side_effect=AssertionError('Valid provenance must not resample')):
                    reused = obtain_sample(task)
            self.assertEqual(reused['config'], sample['config'])
            self.assertEqual(reused['sample_seed'], 101)
            self.assertEqual(reused['diagnostics']['config_sha256'], digest(sample['config']))
            self.assertEqual((output / 'config.json').read_bytes(), config_bytes)
            self.assertEqual((output / 'sampling.json').read_bytes(), sampling_bytes)

    def test_mismatched_saved_sample_is_rejected_without_relabeling(self):
        for mismatch in ('seed_and_count', 'kind', 'controls', 'version', 'config_hash'):
            with self.subTest(mismatch=mismatch), tempfile.TemporaryDirectory() as directory:
                output = Path(directory)
                generate_chart('barv_1', 101, output, {'category_count': 4})
                task = {'id': 'barv_1-000000', 'kind': 'barv_1', 'index': 0, 'seed': 101,
                        'output': directory, 'controls': {'category_count': 4}}
                if mismatch == 'seed_and_count':
                    task.update(seed=202, controls={'category_count': 9})
                elif mismatch == 'kind':
                    task['kind'] = 'barh_1'
                elif mismatch == 'controls':
                    task['controls'] = {'category_count': 9}
                elif mismatch == 'version':
                    diagnostics = read(output / 'sampling.json')
                    dump(output / 'sampling.json', {**diagnostics, 'generator_version': 'older-generator'})
                else:
                    config = read(output / 'config.json')
                    config['values'][0] += 100
                    dump(output / 'config.json', config)
                config_bytes = (output / 'config.json').read_bytes()
                sampling_bytes = (output / 'sampling.json').read_bytes()
                result = pipeline.produce(task)
                self.assertEqual(result['status'], 'generation_failed')
                self.assertEqual((output / 'config.json').read_bytes(), config_bytes)
                self.assertEqual((output / 'sampling.json').read_bytes(), sampling_bytes)
                self.assertFalse((output / 'generation.json').exists())
                self.assertFalse((output / 'record.json').exists())

    def test_missing_sampling_metadata_is_recovered_only_for_identical_deterministic_data(self):
        from workflow.samples import obtain_sample
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            sample = generate_chart('barv_1', 101, output, {'category_count': 4})
            config_bytes = (output / 'config.json').read_bytes()
            (output / 'sampling.json').unlink()
            task = {'kind': 'barv_1', 'seed': 101, 'output': directory,
                    'controls': {'category_count': 4}}
            reused = obtain_sample(task)
            restored = read(output / 'sampling.json')
            self.assertEqual(reused['config'], sample['config'])
            self.assertEqual((output / 'config.json').read_bytes(), config_bytes)
            self.assertEqual(restored['config_sha256'], digest(sample['config']))
            self.assertEqual(restored['requested_seed'], 101)
            self.assertEqual(restored['kind'], 'barv_1')
            self.assertEqual(restored['controls'], {'category_count': 4})
            self.assertEqual(restored['generator_version'], GENERATOR_VERSION)

    def test_missing_provenance_cannot_relabel_or_accept_modified_saved_data(self):
        for mismatch in ('seed_and_count', 'modified_observation'):
            with self.subTest(mismatch=mismatch), tempfile.TemporaryDirectory() as directory:
                output = Path(directory)
                generate_chart('barv_1', 101, output, {'category_count': 4})
                (output / 'sampling.json').unlink()
                task = {'id': 'barv_1-000000', 'kind': 'barv_1', 'index': 0, 'seed': 101,
                        'output': directory, 'controls': {'category_count': 4}}
                if mismatch == 'seed_and_count':
                    task.update(seed=202, controls={'category_count': 9})
                else:
                    saved = read(output / 'config.json')
                    saved['values'][0] += 100
                    dump(output / 'config.json', saved)
                original = (output / 'config.json').read_bytes()
                result = pipeline.produce(task)
                self.assertEqual(result['status'], 'generation_failed')
                self.assertEqual((output / 'config.json').read_bytes(), original)
                self.assertFalse((output / 'sampling.json').exists())
                self.assertFalse((output / 'generation.json').exists())
                self.assertFalse((output / 'record.json').exists())

    def test_reproject_preserves_saved_data_and_uses_saved_presentation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            origin, output = root / 'old', root / 'new'
            sample = origin / 'samples' / 'scatter_1-000000'
            config = fixture('scatter_1')
            dump(sample / 'config.json', config)
            dump(sample / 'presentation.native.json', {'xlim': [3, -1], 'ylim': [-10, 10]})
            original_vsr_commit = 'a' * 40
            dump(origin / 'run.json', {'config': {'target_side': 1036}, 'contract': 'compact-v2',
                                      'vsr_commit': original_vsr_commit})
            dump(origin / 'generation-manifest.json', [{'id': sample.name, 'kind': 'scatter_1', 'index': 0,
                 'seed': 12, 'status': 'generated', 'sample': f'samples/{sample.name}'}])
            original = (sample / 'config.json').read_bytes()
            args = Namespace(source=str(origin), output=str(output), prepare_only=True,
                             recover_native_presentation=False, node=None)
            with patch('generation.generate_chart', side_effect=AssertionError('Reprojection must not resample')):
                with redirect_stdout(io.StringIO()):
                    pipeline.reproject(args)
            rewritten = output / 'samples' / sample.name
            self.assertEqual((rewritten / 'config.json').read_bytes(), original)
            self.assertEqual((sample / 'config.json').read_bytes(), original)
            full = read(rewritten / 'full.vl.json')
            self.assertTrue(full['layer'][0]['encoding']['x']['scale']['reverse'])
            self.assertEqual(len(full['data']['values']), len(config['x']))
            self.assertEqual(len(read(output / 'render-jobs.json')), 1)
            self.assertFalse((rewritten / 'native.png').exists())
            provenance = read(output / 'run.json')
            self.assertEqual(provenance['generator_version'], 'vsr/' + original_vsr_commit)
            self.assertEqual(provenance['source_generator_version'], 'vsr/' + original_vsr_commit)
            self.assertEqual(provenance['source_vsr_commit'], original_vsr_commit)
            self.assertEqual(provenance['operation'], 'reproject')
            self.assertEqual(provenance['projection_version'], PROJECTION_VERSION)
            self.assertNotEqual(provenance['generator_version'], GENERATOR_VERSION)


if __name__ == '__main__':
    unittest.main()
