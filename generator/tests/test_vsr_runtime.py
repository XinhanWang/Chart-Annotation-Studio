"""Public integration invariants beyond the frozen upstream function oracles."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import random
import sys
import unittest
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from generation import GENERATOR_VERSION, KINDS
from generation.core import sample_config
from generation.common import clean
from generation.vsr_runtime import sample_parameters
from adapter import build_pair


class VSRRuntimeTests(unittest.TestCase):
    def test_global_rngs_unchanged_and_parallel_samples_reproducible(self):
        py_state=random.getstate()
        np_state=np.random.get_state()
        cases=[(kind,331+i) for i,kind in enumerate(KINDS)]
        sequential=[sample_config(*c) for c in cases]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            parallel=list(pool.map(lambda c:sample_config(*c),cases))
        self.assertEqual(sequential,parallel)
        self.assertEqual(random.getstate(),py_state)
        current=np.random.get_state()
        self.assertEqual(current[0],np_state[0]);self.assertTrue(np.array_equal(current[1],np_state[1]));self.assertEqual(current[2:],np_state[2:])

    def test_default_core_preserves_raw_data_and_text(self):
        for index,kind in enumerate(KINDS):
            raw,_=sample_parameters(kind,772+index)
            cfg=sample_config(kind,772+index)
            for key in ('title','x_title','y_title','family','labels','values','matrix','x_values','x_labels','x','y','counts','starts','series_families','stack_mode','bottoms'):
                if key in raw:
                    self.assertEqual(clean(raw[key]),cfg[key],(kind,key))
            full,gt,_=build_pair(kind,cfg)
            self.assertEqual(full['usermeta']['semantic_labels'].get('x_title'),cfg['x_title'])
            self.assertEqual(full['usermeta']['semantic_labels'].get('y_title'),cfg['y_title'])

    def test_one_point_and_explicit_counts_do_not_reduce_defaults(self):
        self.assertEqual(GENERATOR_VERSION,'vega-lite-native/1.2')
        for kind in ('line_1','line_n'):
            cfg=sample_config(kind,7,{'point_count':1})
            self.assertEqual(len(cfg['x_values']),1)
            self.assertTrue(all(cfg['markers']))
        for count in (12,16,20,28,48):
            cfg=sample_config('scatter_n',9,{'point_count':count})
            self.assertEqual(len(cfg['x']),count)
            self.assertGreaterEqual(min(cfg['counts']),4)
