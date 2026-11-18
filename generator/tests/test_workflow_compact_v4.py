"""Training targets and display projections must remain separate artifacts."""
from pathlib import Path
import json
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import pipeline
from workflow.config import CONTRACT
from workflow.io import read


class CompactArtifactTests(unittest.TestCase):
    def test_production_writes_semantic_gt_and_distinct_preview(self):
        from compact import validate_target,semantic_rows,project_rows
        from compact_display import render_spec
        with tempfile.TemporaryDirectory() as directory:
            out=Path(directory)
            sample=out/'samples/barv_1-000000'
            row=pipeline.produce({'id':sample.name,'kind':'barv_1','index':0,'seed':101,'output':str(sample),'controls':{'category_count':4,'show_legend':False}})
            self.assertEqual(row['status'],'generated',row)
            full=read(sample/'full.vl.json');gt=read(sample/'compact.vl.json');preview=read(sample/'compact.preview.vl.json')
            validate_target(gt)
            self.assertEqual(preview,render_spec(gt));self.assertEqual(preview['data'],gt['data'])
            self.assertEqual(semantic_rows(gt),project_rows(full))
            self.assertNotIn('color',gt['encoding'])
            self.assertTrue(all('series' not in r for r in gt['data']['values']))
            before=(sample/'compact.vl.json').read_bytes()
            jobs=pipeline.write_render_jobs(out,[row])
            self.assertTrue(jobs[0]['compact'].endswith('compact.preview.vl.json'))
            self.assertTrue(jobs[0]['full'].endswith('full.vl.json'))
            self.assertEqual((sample/'compact.vl.json').read_bytes(),before)
            self.assertEqual(read(sample/'compact.preview.vl.json'),preview)

    def test_contract_version_is_separate_from_sampling_version(self):
        from generation import GENERATOR_VERSION
        self.assertEqual(CONTRACT,'compact-v5')
        self.assertEqual(GENERATOR_VERSION,'vega-lite-native/1.2')
