"""Strict font embedding plus real resvg integration; no host-font assumptions."""
import base64, copy, hashlib, io, json, os, re, subprocess, sys, tempfile, unittest
from pathlib import Path
from fontTools.ttLib import TTFont
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from font_embedding import embed_svg, FontEmbeddingError

def svg(text='− μ × 10⁻³ α β Ω ± ∞ ≤ ≥', family='DejaVu Sans', weight='400', style='normal'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="100"><g font-family="{family}" font-weight="{weight}" font-style="{style}"><text x="10" y="40" font-size="24">{text}<tspan> DNA</tspan></text></g></svg>'

class Embedding(unittest.TestCase):
    def test_all_manifest_faces_preserve_family_and_cover_actual_text(self):
        manifest=json.loads((ROOT/'fonts.manifest.json').read_text())
        for rec in manifest['fonts']:
            with self.subTest(face=rec['file']):
                f=TTFont(ROOT/rec['file']);cmap=f.getBestCmap();f.close()
                chars=''.join(c for c in 'ABC xyz 123 − μ × 10⁻³ α β Ω ± ∞ ≤ ≥ H₂O' if ord(c) in cmap)
                out=embed_svg(svg(chars,rec['family'],str(rec['weight']),rec['style']))
                face=out['audit']['faces'][0]
                self.assertEqual(face['family'],rec['family']);self.assertEqual(face['style'],rec['style'])
                self.assertIn('<text',out['svg']);self.assertIn('@font-face',out['svg'])
                blob=base64.b64decode(re.search(r'base64,([A-Za-z0-9+/=]+)',out['svg'])[1])
                embedded=TTFont(io.BytesIO(blob));self.assertTrue(set(face['codepoints']) <= set(embedded.getBestCmap()));embedded.close()
                if rec['embedding_license']['id'].startswith('AGPL'):
                    self.assertEqual(hashlib.sha256(blob).hexdigest(),rec['sha256'])
                    self.assertTrue(out['audit']['source_archives'])
    def test_generic_and_inherited_roles(self):
        out=embed_svg(svg(family='sans-serif'))
        self.assertEqual(out['audit']['generic_resolutions'],[{'requested':'sans-serif','resolved':'DejaVu Sans'}])
        self.assertEqual({f['family'] for f in out['audit']['faces']},{'DejaVu Sans'})
    def test_no_synthetic_or_missing_glyph_fallback(self):
        for source in [svg(family='Unknown'),svg(text='\U0010ffff'),svg(family='Noto Mono',weight='700'),svg(style='oblique'),svg(family='DejaVu Sans, serif')]:
            with self.subTest(source=source),self.assertRaises(FontEmbeddingError):embed_svg(source)
    def test_reject_unknown_license_hash_and_restricted_fstype(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); (root/'assets').mkdir()
            original=json.loads((ROOT/'fonts.manifest.json').read_text())
            rec=copy.deepcopy(next(x for x in original['fonts'] if x['family']=='DejaVu Sans' and x['weight']==400 and x['style']=='normal'))
            rec['file']='assets/font.ttf';(root/rec['file']).write_bytes((ROOT/'assets/fonts/DejaVuSans.ttf').read_bytes())
            notice=(ROOT/rec['embedding_license']['notice']).read_bytes();(root/'notice.txt').write_bytes(notice);rec['embedding_license']['notice']='notice.txt'
            manifest=root/'fonts.manifest.json'
            def save():manifest.write_text(json.dumps({'fonts':[rec]}))
            save();embed_svg(svg(),manifest)
            rec['embedding_license']['status']='unknown';save()
            with self.assertRaisesRegex(FontEmbeddingError,'license not approved'):embed_svg(svg(),manifest)
            rec['embedding_license']['status']='approved';rec['sha256']='bad';save()
            with self.assertRaisesRegex(FontEmbeddingError,'hash mismatch'):embed_svg(svg(),manifest)
            font=TTFont(root/rec['file']);font['OS/2'].fsType=2;font.save(root/rec['file']);font.close();rec['sha256']=hashlib.sha256((root/rec['file']).read_bytes()).hexdigest();save()
            with self.assertRaisesRegex(FontEmbeddingError,'fsType'):embed_svg(svg(),manifest)
    def test_reject_css_shorthand_and_resource_text(self):
        for source in [svg().replace('<g ','<g style="font: italic 12px serif" '),svg().replace('<g ','<style>text{font-family:serif}</style><g '),svg().replace('<tspan>','<textPath>').replace('</tspan>','</textPath>')]:
            with self.assertRaises(FontEmbeddingError):embed_svg(source)

@unittest.skipUnless(os.environ.get('VSR_FONT_INTEGRATION')=='1','Set VSR_FONT_INTEGRATION=1 for actual renderer')
class Renderer(unittest.TestCase):
    def test_full_compact_actual_renderer_and_sharp_rejection(self):
        probe=Path('/tmp/vsr-font-render-integration-20261111');probe.mkdir(exist_ok=True)
        label='− μ × 10⁻³ α β Ω ± ∞ ≤ ≥ DNA H₂O'
        full={'$schema':'https://vega.github.io/schema/vega-lite/v5.json','width':700,'height':220,'padding':25,'data':{'values':[{'x':1,'y':1,'s':label}]},'layer':[{'mark':{'type':'point'},'encoding':{'x':{'field':'x','type':'quantitative','title':'Time μs'},'y':{'field':'y','type':'quantitative','title':'Dose α'}}}]+[{'mark':{'type':'text','font':'DejaVu Sans','fontWeight':weight,'fontStyle':style,'fontSize':20,'dx':0,'dy':dy},'encoding':{'text':{'field':'s'}}} for weight,style,dy in [(400,'normal',-50),(700,'normal',0),(400,'italic',50)]],'title':{'text':'Biology α β Ω','subtitle':'H₂O × 10⁻³'},'config':{'font':'DejaVu Sans'}}
        compact=copy.deepcopy(full);compact.pop('title');compact['config']['font']='sans-serif'
        for axis in compact['layer'][0]['encoding'].values():axis['axis']=None
        for name,spec in [('full',full),('compact',compact)]: (probe/(name+'.json')).write_text(json.dumps(spec,ensure_ascii=False))
        jobs=[{'id':'font-roles','full':str(probe/'full.json'),'compact':str(probe/'compact.json'),'output':str(probe/'output')}];(probe/'jobs.json').write_text(json.dumps(jobs))
        args=[os.environ.get('VSR_FONT_NODE', 'node'),str(ROOT/'render.mjs'),'--input',str(probe/'jobs.json'),'--out',str(probe/'report.json'),'--size','1036','--in-process']
        result=subprocess.run(args,cwd=ROOT,text=True,capture_output=True,timeout=180)
        self.assertIn(result.returncode,(0,2),result.stdout+result.stderr)
        report=json.loads((probe/'report.json').read_text());self.assertEqual(report['rejected'],0)
        for variant,stem in [('full','chart'),('compact','compact')]:
            rec=report['records'][0][variant];self.assertEqual({(f['weight'],f['style']) for f in rec['font_embedding']['faces']},{(400,'normal'),(700,'normal'),(400,'italic')})
            self.assertTrue((probe/'output'/(stem+'.svg')).is_file());self.assertGreater((probe/'output'/(stem+'.png')).stat().st_size,1000)
        sharp=subprocess.run(args+['--out',str(probe/'sharp-rejected.json'),'--rasterizer','sharp'],cwd=ROOT,text=True,capture_output=True,timeout=90)
        self.assertIn('Sharp rejected',sharp.stdout+sharp.stderr)

if __name__=='__main__':unittest.main()
