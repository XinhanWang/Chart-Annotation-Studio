"""The compact-only route must not call any sampler or renderer."""
from pathlib import Path
from types import SimpleNamespace
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import pipeline
from adapter import build_pair
from compact import normalize
from workflow.io import dump, read
from workflow.migration import audit_copied_artifacts, migrate_compact
from test_adapter import fixture


class CompactMigrationTests(unittest.TestCase):
    def source(self, root):
        old = root / 'old'
        sample = old / 'samples/line_1-000000'
        sample.mkdir(parents=True)
        full, _, source = build_pair('line_1', fixture('line_1'))
        dump(sample / 'full.vl.json', full)
        dump(sample / 'config.json', fixture('line_1'))
        dump(sample / 'source.json', source)
        dump(sample / 'compact.vl.json', {'legacy': True})
        for name in ['chart.png', 'chart.1036.png', 'chart.svg', 'geometry.json', 'geometry.1036.json', 'compact.png']:
            (sample / name).write_bytes(('old-' + name).encode())
        dump(old / 'run.json', {'config': {'target_side': 1036}, 'contract': 'compact-v3', 'generator_version': 'frozen-source'})
        dump(old / 'generation-manifest.json', [{'id': sample.name, 'kind': 'line_1', 'sample': 'samples/' + sample.name, 'status': 'generated'}])
        dump(old / 'render-report.json', {'records': [{'id': sample.name, 'full': {'status': 'rendered'}}]})
        return old, sample

    def test_migration_copies_full_and_rebuilds_only_semantic_gt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); old, source = self.source(root); out = root / 'new'
            before = {p.name: p.read_bytes() for p in source.iterdir()}
            args = SimpleNamespace(source=str(old), output=str(out), compact_only=True)
            with patch('workflow.validation.validate', return_value={'rejected': 0}) as validate, patch('pipeline.render_records', side_effect=AssertionError('renderer called')), patch('pipeline.produce', side_effect=AssertionError('sampler called')):
                pipeline.reproject(args)
            validate.assert_called_once_with(out)
            sample = out / 'samples' / source.name
            self.assertEqual(read(sample / 'compact.vl.json'), normalize(read(source / 'full.vl.json')))
            self.assertEqual(read(sample / 'compact.preview.vl.json')['data'], read(sample / 'compact.vl.json')['data'])
            self.assertFalse((sample / 'compact.png').exists())
            self.assertEqual(read(out / 'run.json')['generator_version'], 'frozen-source')
            self.assertFalse(read(out / 'run.json')['compact_preview_rendered'])
            for name in ('full.vl.json', 'chart.png', 'chart.svg', 'source.json'):
                self.assertEqual((sample / name).read_bytes(), before[name])
            self.assertEqual({p.name: p.read_bytes() for p in source.iterdir()}, before)
            self.assertEqual(audit_copied_artifacts(sample), [])
            (sample / 'chart.png').write_bytes(b'tampered')
            self.assertIn('Migrated artifact changed: chart.png', audit_copied_artifacts(sample))

    def test_migrated_run_can_be_migrated_again(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); old, _ = self.source(root)
            with patch('workflow.validation.validate', return_value={'rejected': 0}):
                for source, target in ((old, root / 'new'), (root / 'new', root / 'again')):
                    migrate_compact(SimpleNamespace(source=str(source), output=str(target)))
            self.assertEqual(audit_copied_artifacts(root / 'again/samples/line_1-000000'), [])

    def test_reject_overlapping_outputs_and_missing_full_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); old, sample = self.source(root)
            for out in (old, old / 'new', root):
                with self.assertRaises(ValueError):
                    migrate_compact(SimpleNamespace(source=str(old), output=str(out)))
            (sample / 'chart.svg').unlink()
            with self.assertRaisesRegex(ValueError, 'evidence missing'):
                migrate_compact(SimpleNamespace(source=str(old), output=str(root / 'new')))
            self.assertFalse((root / 'new').exists())

    def test_reject_missing_and_duplicate_source_render_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); old, sample = self.source(root)
            for records in ([], [{'id': sample.name, 'full': {'status': 'rejected'}}], [{'id': sample.name}, {'id': sample.name}]):
                dump(old / 'render-report.json', {'records': records})
                with self.assertRaises(ValueError):
                    migrate_compact(SimpleNamespace(source=str(old), output=str(root / 'new')))
                self.assertFalse((root / 'new').exists())

    @unittest.skipUnless(os.environ.get('VSR_FONT_INTEGRATION') == '1', 'requires real installed renderer/fonts')
    def test_real_render_then_full_only_validation_and_training_export(self):
        from generation import GENERATOR_VERSION
        from workflow.config import CONTRACT
        from workflow.validation import validate
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); old=root/'old'; sample=old/'samples/barv_1-000000'
            row=pipeline.produce({'id':sample.name,'kind':'barv_1','index':0,'seed':101,'output':str(sample),'controls':{'category_count':4,'show_legend':False}})
            self.assertEqual(row['status'],'generated',row)
            dump(old/'run.json',{'config':{'target_side':1036},'generator_version':GENERATOR_VERSION,'contract':CONTRACT})
            dump(old/'generation-manifest.json',[row])
            self.assertEqual(pipeline.render_records(old,[row],1036).returncode,0)
            self.assertEqual(validate(old)['accepted'],1)
            out=root/'new'
            with patch('pipeline.render_records',side_effect=AssertionError('rerender')), patch('pipeline.produce',side_effect=AssertionError('resample')):
                summary=migrate_compact(SimpleNamespace(source=str(old),output=str(out)))
            self.assertEqual(summary['accepted'],1)
            self.assertFalse(summary['compact_preview_rendered'])
            self.assertEqual(validate(out)['accepted'],1)
            pair=json.loads((out/'train.jsonl').read_text())
            self.assertEqual(json.loads(pair['messages'][1]['content']),read(out/row['sample']/'compact.vl.json'))
            from spec_format import format_spec
            from workflow.io import serialize
            self.assertEqual(pair['messages'][1]['content'],
                serialize(format_spec(read(out/row['sample']/'compact.vl.json'))))

    def test_generate_resume_refuses_migration_without_rewriting_run(self):
        from generation import GENERATOR_VERSION
        from workflow.config import CONTRACT
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); out=root/'migration'; out.mkdir()
            config=root/'config.json'; dump(config,{'seed':1,'counts':{'barv_1':1}})
            dump(out/'run.json',{'operation':'compact_migration','generator_version':GENERATOR_VERSION,'contract':CONTRACT})
            before=(out/'run.json').read_bytes()
            with self.assertRaisesRegex(ValueError,'requires a generation run'):
                pipeline.generate(SimpleNamespace(config=str(config),output=str(out),workers=None,resume=True))
            self.assertEqual((out/'run.json').read_bytes(),before)
