"""Original style oracle, native mapping, font-pool and version safety checks."""
from argparse import Namespace
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import random
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from generation import GENERATOR_VERSION
from generation.core import sample_config
from generation.controls import KINDS
from generation.styles import canvas
from generation.style_rules import sample_canvas, sample_profile, REQUIRED_FONT_FILES, PALETTES
from generation.common import RandomSource
from adapter import build_pair
from presentation import resolve_role_font, describe_font
ROOT = Path(__file__).resolve().parents[1]

class StyleDiversityTests(unittest.TestCase):
    def test_canvas_matches_pinned_original_every_field(self):
        oracle = json.loads((ROOT / 'tests/fixtures/style-canvas-vsr-8b2ca38.json').read_text())
        fonts = [str(ROOT / 'assets/fonts' / n) for n in REQUIRED_FONT_FILES]
        self.assertEqual(len(PALETTES), 30)
        for c in oracle['cases']:
            with self.subTest(c=c):
                result = sample_canvas(random.Random(c['seed']), c['kind'], c['count'], c['profile'], fonts)
                result['font_path'] = Path(result['font_path']).name
                digest = hashlib.sha256(json.dumps(result,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                self.assertEqual(digest,c['sha256'])
        for kind, count, seed, expected in oracle['profile_choices']:
            self.assertEqual(sample_profile(random.Random(seed),kind,count), expected)

    def test_extra_font_faces_do_not_change_original_sampling_pool(self):
        picked = set()
        for seed in range(300):
            result = canvas(RandomSource(seed),'line_n',5,12,{})
            picked.add(Path(result['font_path']).name)
        self.assertEqual(picked, set(REQUIRED_FONT_FILES))
        self.assertEqual(len(picked), 16)

    def test_original_template_ticks_and_mark_density(self):
        for seed in range(60):
            for kind in KINDS:
                cfg = sample_config(kind,seed)
                ticks = cfg['_render_axes']['tick_styles']
                if kind.startswith('scatter'):
                    self.assertEqual(ticks['x'],ticks['y'])
                if kind.startswith('line') or kind == 'barv_n':
                    self.assertEqual(ticks['x']['length'],3.5)
                    self.assertEqual(ticks['x']['direction'],'out')
                if kind.startswith('barh'):
                    self.assertEqual(ticks['y']['direction'],'out')
                    self.assertIn(ticks['y']['length'],(3,4))
                if kind == 'scatter_n':
                    self.assertEqual(cfg['style']['dpi'],120)
                    self.assertFalse(cfg['style']['legend_outside'])
                for axis in ('x','y'):
                    if ticks[axis]['length'] != 3.5:
                        self.assertIn(ticks[axis]['length'],(3,4,5))
            dense = sample_config('scatter_1',seed,{'point_count':48})
            self.assertIn(dense['marker'],('.', 'o','s','X'))
            self.assertTrue(10 <= dense['size'] <= 18)
            self.assertTrue(.58 <= dense['alpha'] <= .82)

    def test_columns_typography_grids_and_strokes_reach_spec(self):
        cfg=sample_config('barv_n',33,{'series_count':5,'show_legend':True,'profile':'dashboard_dense','style':{'legend_ncol':3}})
        cfg['linewidths']=[.6,.8,1,1.2,1.4]
        full,_,_=build_pair('barv_n',cfg)
        for i in range(5):
            layer=next(x for x in full['layer'] if x.get('name')=='bars_'+str(i))
            self.assertEqual(layer['mark']['strokeWidth'],cfg['linewidths'][i])
            self.assertEqual(layer['encoding']['color']['legend']['columns'],3)
        self.assertEqual(full['title']['anchor'], {'left':'start','center':'middle'}[cfg['title_loc']])
        self.assertIn('title',full['usermeta']['presentation']['font_roles'])

    def test_real_bookman_and_noto_roles_are_explicit(self):
        selected=describe_font(ROOT/'assets/fonts/URWBookman-Light.otf')
        for requested,expected in (('normal',300),('bold',600)):
            face,audit=resolve_role_font(selected['family'],requested,'normal',selected)
            self.assertEqual(face['weight'],expected)
            self.assertEqual(audit['requested']['weight'],requested)
        selected=describe_font(ROOT/'assets/fonts/NotoMono-Regular.otf')
        face,audit=resolve_role_font(selected['family'],'bold','italic',selected)
        self.assertEqual(face['weight'],400)
        self.assertEqual(face['style'],'normal')
        self.assertIn('unavailable',audit['reason'])
        self.assertEqual(audit['requested']['style'],'italic')

    def test_old_native_version_cannot_resume_or_relabel_and_can_reproject(self):
        import pipeline
        from workflow.samples import obtain_sample
        from workflow.io import dump,read,digest
        from workflow.config import CONTRACT
        self.assertEqual(GENERATOR_VERSION,'vega-lite-native/1.2')
        old=json.loads((ROOT/'tests/fixtures/native-1.0-barv-1.json').read_text())
        old['generator_version']='vega-lite-native/1.0'
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); origin=root/'old'; sample=origin/'samples/barv_1-000000'
            dump(sample/'config.json',old)
            dump(sample/'sampling.json',{'generator_version':'vega-lite-native/1.0','kind':'barv_1','requested_seed':0,'sample_seed':0,'controls':{},'config_sha256':digest(old)})
            dump(origin/'run.json',{'generator_version':'vega-lite-native/1.0','contract':CONTRACT,'config':{'target_side':1036}})
            dump(origin/'generation-manifest.json',[{'id':sample.name,'kind':'barv_1','index':0,'seed':0,'status':'generated','sample':'samples/'+sample.name}])
            original=(sample/'config.json').read_bytes(); provenance=(sample/'sampling.json').read_bytes()
            with self.assertRaisesRegex(ValueError,'generator_version'):
                obtain_sample({'kind':'barv_1','seed':0,'controls':{},'output':str(sample)})
            config=root/'config.json';dump(config,{})
            with self.assertRaisesRegex(ValueError,'same generator and GT contract'):
                pipeline.generate(Namespace(config=str(config),output=str(origin),workers=None,resume=True))
            self.assertEqual((sample/'config.json').read_bytes(),original)
            self.assertEqual((sample/'sampling.json').read_bytes(),provenance)
            dest=root/'new'
            with patch('generation.generate_chart',side_effect=AssertionError('Must not resample')):
                with redirect_stdout(io.StringIO()):
                    pipeline.reproject(Namespace(source=str(origin),output=str(dest),prepare_only=True,recover_native_presentation=False,node=None))
            self.assertEqual((dest/'samples'/sample.name/'config.json').read_bytes(),original)
            self.assertEqual(read(dest/'run.json')['generator_version'],'vega-lite-native/1.0')

if __name__ == '__main__':
    unittest.main()
