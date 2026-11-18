"""Saved presentation metadata and visible styling survive native Vega conversion."""
import copy
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import build_pair
from test_adapter import fixture
from text_layout import apply_text_layout, audit_text

class FidelityTests(unittest.TestCase):
    def test_rotated_long_labels_stay_rotated_complete_and_idempotent(self):
        cfg=fixture('barv_1');cfg['x_rotation']=45
        cfg['labels']=['Long complete category ' * 4, 'Second', 'Third']
        full,compact,_=build_pair('barv_1',cfg)
        axis=full['layer'][0]['encoding']['x']['axis']
        self.assertEqual(axis['labelAngle'],-45)
        self.assertIn(cfg['labels'][0].strip(),axis['labelExpr'])
        self.assertEqual(apply_text_layout(full),full)
        cfg['x_rotation']=0
        self.assertEqual(build_pair('barv_1',cfg)[1],compact)

    def test_saved_precision_offset_roles_grid_and_legend(self):
        cfg=fixture('scatter_1')
        face={'family':'DejaVu Sans','weight':400,'style':'normal','size':11,'rotation':0,'align':'center'}
        cfg['_render_axes']={'xticks':[-1,0,1], 'xticklabels':['−0.10','0.00','0.10'], 'x_offset_text':'1e1',
            'grid_visible':{'x':True,'y':False},
            'tick_styles':{'x':{'direction':'in','length':5}},
            'text_styles':{'title':{**face,'weight':700},'x':{'label':face,'offset':face}},
            'legend':{'anchor':'bottom-left','bbox_axes_top_left':[0,0.8,0.2,0.2],'text_style':face}}
        full,target,_=build_pair('scatter_1',cfg)
        enc=full['layer'][0]['encoding']
        self.assertIs(enc['x']['axis']['grid'],True)
        self.assertIs(enc['y']['axis']['grid'],False)
        self.assertGreaterEqual(enc['x']['axis']['labelPadding'],5)
        self.assertIn('−0.10',enc['x']['axis']['labelExpr'])
        self.assertEqual(full['title']['fontWeight'],700)
        self.assertEqual(enc['color']['legend']['orient'],'bottom-left')
        self.assertEqual(full['usermeta']['presentation']['axis_offsets'],{'x':'1e1'})
        offset=[layer for layer in full['layer'] if layer['name']=='__vsr_decoration_axis_offset_x']
        self.assertEqual(offset[0]['mark']['text'],'1e1')
        self.assertFalse(any('offset' in layer.get('name','') for layer in target.get('layer',[])))
        bare=copy.deepcopy(cfg);del bare['_render_axes']
        self.assertEqual(build_pair('scatter_1',bare)[1],target)
        # Offset must be actually emitted into SVG, not just metadata.
        spec={'usermeta':{'presentation':{'axis_offsets':{'x':'1e1'}}}}
        self.assertFalse(audit_text(spec,'<svg/>')['passed'])
        self.assertTrue(audit_text(spec,'<svg><g class="role-mark"><text>1e1</text></g></svg>')['passed'])

    def test_actual_axes_size_uses_points_not_whole_figure(self):
        cfg=fixture('scatter_1')
        cfg['_render_axes']={'axes_bbox_bottom_left':[100,200,1200,800],'dpi':200}
        full,_,_=build_pair('scatter_1',cfg)
        self.assertEqual(full['usermeta']['plot_layout']['source_dimensions'],{'width':432.0,'height':288.0})

    def test_layered_plot_background_reaches_actual_svg(self):
        import json, os, subprocess, shutil
        if not os.environ.get('VSR_TEXT_TEST_MODULES') or not shutil.which('node'):
            self.skipTest('Needs official Vega dependencies')
        cfg=fixture('scatter_1');cfg['style'].update(facecolor='#fff7fb',axes_face='#ffffff')
        full,_,_=build_pair('scatter_1',cfg)
        js = """
const fs=require('fs'),path=require('path'),{createRequire}=require('module');
const {pathToFileURL}=require('url');const req=createRequire(path.resolve(process.env.VSR_TEXT_TEST_MODULES,'__fidelity.cjs'));
(async()=>{const v=await import(pathToFileURL(req.resolve('vega'))),vl=await import(pathToFileURL(req.resolve('vega-lite')));
const spec=JSON.parse(fs.readFileSync(0,'utf8'));const view=new v.View(v.parse(vl.compile(spec).spec),{renderer:'none'});
await view.runAsync();process.stdout.write(await view.toSVG());view.finalize();})();
"""
        rendered=subprocess.run(['node','-e',js],input=json.dumps(full),text=True,capture_output=True,check=True)
        import xml.etree.ElementTree as ET
        paths=[el for el in ET.fromstring(rendered.stdout).iter() if el.tag.endswith('path') and el.get('class')=='background']
        self.assertEqual(paths[0].get('fill'),'#ffffff')
