"""Regressions for visible styling without changing the training target."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import KINDS, build_pair
from presentation import selected_font
from test_adapter import fixture

from render_support import font_file

HAS_FONTS = all(font_file(name) for name in ('DejaVuSerif-Bold.ttf', 'DejaVuSans.ttf', 'DejaVuSansMono.ttf'))


def styles(full):
    return full['layer'][0]['encoding']


class PresentationTests(unittest.TestCase):
    def test_nine_types_style_variants_keep_identical_compact_and_observations(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                cfg = fixture(kind)
                before = copy.deepcopy(cfg)
                full, compact, _ = build_pair(kind, cfg)
                self.assertEqual(cfg, before)
                cfg['style'].update(grid_style=':', legend_frame=False, legend_ncol=2,
                                    legend_loc='lower left', spine_visible=False)
                cfg['title_loc'] = 'right'
                changed, target, _ = build_pair(kind, cfg)
                self.assertEqual(compact, target)
                self.assertEqual(full['data'], changed['data'])
                self.assertNotEqual(full, changed)
                self.assertEqual(changed['title']['anchor'], 'end')

    @unittest.skipUnless(HAS_FONTS, 'Run bootstrap.py to install the pinned test fonts')
    def test_actual_font_file_overrides_independently_sampled_style_font(self):
        cfg = fixture('line_n')
        cfg['font_path'] = str(font_file('DejaVuSerif-Bold.ttf'))
        cfg['style']['font_path'] = str(font_file('DejaVuSans.ttf'))
        full, _, source = build_pair('line_n', cfg)
        self.assertEqual(full['title']['font'], 'DejaVu Serif')
        self.assertEqual(styles(full)['x']['axis']['labelFontWeight'], 700)
        self.assertEqual(styles(full)['color']['legend']['labelFont'], 'DejaVu Serif')
        self.assertEqual(source['presentation']['font']['file'], 'DejaVuSerif-Bold.ttf')

    def test_missing_selected_font_is_explicit_failure(self):
        with self.assertRaisesRegex(FileNotFoundError, 'bootstrap'):
            selected_font({'font_path': '/nonexistent/not-a-real-selected-font.ttf'})

    def test_grid_frame_spacing_and_full_spines_are_preserved(self):
        cfg = fixture('barv_n')
        cfg['style'].update(grid_style='--', legend_frame=True, legend_framealpha=0.82,
                            legend_borderpad=0.6, legend_handletextpad=0.8,
                            legend_columnspacing=1.4, legend_labelspacing=0.4,
                            legend_size=10, spine_visible=True, spine_width=1.7)
        full, _, _ = build_pair('barv_n', cfg)
        guide = styles(full)
        self.assertEqual(guide['x']['axis']['gridDash'], [6, 3])
        legend = guide['color']['legend']
        self.assertEqual(legend['padding'], 6)
        self.assertEqual(legend['labelOffset'], 8)
        self.assertEqual(legend['columnPadding'], 14)
        self.assertEqual(legend['rowPadding'], 4)
        self.assertIn('0.8200', legend['fillColor'])
        self.assertIsNotNone(full['config']['view']['stroke'])
        self.assertEqual(full['config']['view']['strokeWidth'], 1.7)
        self.assertFalse(guide['x']['axis']['domain'])

    def test_center_left_legend_keeps_internal_placement(self):
        cfg = fixture('barv_n')
        cfg['style']['legend_loc'] = 'center left'
        full, _, _ = build_pair('barv_n', cfg)
        legend = styles(full)['color']['legend']
        self.assertEqual(legend['orient'], 'none')
        self.assertEqual(legend['legendX'], 0)
        self.assertGreater(legend['legendY'], 0)

    def test_best_legend_avoids_occupied_corner(self):
        cfg = fixture('scatter_1')
        cfg.update(x=[9, 9.3], y=[9, 9.3], xlim=[0, 10], ylim=[0, 10])
        cfg['style']['legend_loc'] = 'best'
        full, _, _ = build_pair('scatter_1', cfg)
        self.assertEqual(styles(full)['color']['legend']['orient'], 'top-left')

    def test_composite_legend_keeps_a_free_requested_corner(self):
        cfg = fixture('barline_n')
        cfg['style']['legend_loc'] = 'upper right'
        full, _, source = build_pair('barline_n', cfg)
        legend = styles(full)['color']['legend']
        self.assertEqual(legend['orient'], 'top-right')
        self.assertNotIn('legendX', legend)
        self.assertEqual(source['presentation']['legend']['reason'], 'source_location')

    def test_composite_legend_leaves_corners_that_marks_occupy(self):
        cfg = fixture('barline_n')
        cfg['labels'] = [f'C{i}' for i in range(8)]
        cfg['matrix'] = [[9, -9, 9, -9, 9, -9, 9, -9], [-9, 9, -9, 9, -9, 9, -9, 9],
                         [9, -9, 9, -9, 9, -9, 9, -9]]
        cfg['yerr'] = [[0.1] * 8, [0.1] * 8]
        cfg['style']['legend_loc'] = 'upper right'
        full, _, source = build_pair('barline_n', cfg)
        legend = styles(full)['color']['legend']
        self.assertEqual(legend['orient'], 'right')
        self.assertNotIn('legendX', legend)
        self.assertNotIn('legendY', legend)
        self.assertEqual(source['presentation']['legend']['reason'], 'composite_no_unoccupied_corner')

    def test_composite_legend_falls_back_to_the_free_corner(self):
        cfg = fixture('barline_n')
        cfg['labels'] = [f'C{i}' for i in range(8)]
        cfg['matrix'] = [[9] * 8, [9] * 8, [9] * 8]
        cfg['yerr'] = None
        cfg['show_error'] = False
        cfg['style']['legend_loc'] = 'center left'
        full, _, source = build_pair('barline_n', cfg)
        legend = styles(full)['color']['legend']
        self.assertEqual(legend['orient'], 'bottom-right')
        self.assertNotIn('legendX', legend)
        self.assertEqual(source['presentation']['legend']['reason'], 'composite_least_occupied_corner')

    def test_long_legend_relocation_removes_fixed_internal_coordinates(self):
        cfg = fixture('barv_n')
        cfg['series_names'] = ['Long complete series name ' * 15, 'B']
        cfg['style']['legend_loc'] = 'center left'
        full, _, source = build_pair('barv_n', cfg)
        legend = styles(full)['color']['legend']
        self.assertEqual(legend['orient'], 'right')
        self.assertNotIn('legendX', legend)
        self.assertNotIn('legendY', legend)
        self.assertEqual(source['presentation']['legend']['chosen'], 'right')

    @unittest.skipUnless(HAS_FONTS and os.environ.get('VSR_TEXT_TEST_MODULES') and shutil.which('node'),
                         'Set VSR_TEXT_TEST_MODULES with the pipeline dependencies for SVG integration')
    def test_official_svg_preserves_fonts_dashes_frames_and_inward_ticks(self):
        from text_layout import audit_text
        specifications = []
        for filename, dash, frame, direction in [('DejaVuSansMono.ttf', '--', True, 'in'),
                                                  ('DejaVuSerif-Bold.ttf', ':', False, 'out')]:
            cfg = fixture('line_n')
            cfg['font_path'] = str(font_file(filename))
            cfg['style'].update(grid_style=dash, grid_visible=True, grid_axis='both', legend_frame=frame)
            cfg['_render_axes'] = {'tick_styles': {'x': {'direction': direction, 'length': 6, 'width': 1.2}}}
            specifications.append(build_pair('line_n', cfg)[0])
        cfg = fixture('barh_1')
        cfg['font_path'] = str(font_file('DejaVuSansMono.ttf'))
        cfg['style'].update(legend_frame=True, legend_loc='upper left', legend_handlelength=1.23)
        specifications.append(build_pair('barh_1', cfg)[0])
        js = r'''
import fs from 'node:fs'; import path from 'node:path';
import {createRequire} from 'node:module'; import {pathToFileURL} from 'node:url';
const req=createRequire(path.resolve(process.env.VSR_TEXT_TEST_MODULES,'__presentation_test.cjs'));
const v=await import(pathToFileURL(req.resolve('vega'))),vl=await import(pathToFileURL(req.resolve('vega-lite')));
const output=[];
for (const spec of JSON.parse(fs.readFileSync(process.argv[1],'utf8'))) {
  const warnings=[]; const log=v.logger(v.Warn); log.warn=(...a)=>{warnings.push(a.join(' ')); return log};
  const compiled=vl.compile(spec,{logger:log}).spec;
  const view=new v.View(v.parse(compiled),{renderer:'none',logger:log});
  await view.runAsync();
  const invalid=[];
  function inspect(scene) {
    if (scene.role?.startsWith('legend') && ['text','symbol'].includes(scene.marktype)) {
      for (const item of scene.items||[]) if (![item.x??0,item.y??0].every(Number.isFinite)) invalid.push({role:scene.role,text:item.text});
    }
    for(const item of scene.items||[]) if(item.items) inspect(item);
  }
  inspect(view.scenegraph().root);
  output.push({svg:await view.toSVG(),warnings,invalid}); view.finalize();
}
console.log(JSON.stringify(output));
'''
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'specs.json'
            file.write_text(json.dumps(specifications), encoding='utf-8')
            run = subprocess.run([shutil.which('node'), '--input-type=module', '-e', js, str(file)],
                                 text=True, encoding='utf-8', capture_output=True, check=True, timeout=45)
        outputs = json.loads(run.stdout)
        self.assertTrue(all(not out['invalid'] for out in outputs), outputs)
        self.assertNotEqual(outputs[0]['svg'], outputs[1]['svg'])
        for spec, output, expected_family, tick_y2, dash in zip(
            specifications, outputs, ['DejaVu Sans Mono', 'DejaVu Serif'], ['-6', '6'], ['6,3', '1.5,2.5']):
            self.assertEqual(output['warnings'], [])
            self.assertTrue(audit_text(spec, output['svg'])['passed'])
            root = ET.fromstring(output['svg'])
            texts = [e for e in root.iter() if e.tag.endswith('}text')]
            self.assertTrue(texts)
            self.assertTrue(all(e.get('font-family') == expected_family for e in texts))
            ticks, grids, symbols = [], [], []
            for element in root.iter():
                cls = element.get('class', '').split()
                if 'role-axis-tick' in cls: ticks.extend(element.iter())
                if 'role-axis-grid' in cls: grids.extend(element.iter())
                if 'role-legend-symbol' in cls: symbols.extend(element.iter())
            self.assertTrue(any(e.get('y2') == tick_y2 for e in ticks))
            self.assertTrue(any(e.get('stroke-dasharray') == dash for e in grids))
            self.assertTrue(any(e.get('stroke-dasharray') == '6,3' for e in symbols))
            self.assertTrue(any(e.get('stroke-dasharray') == '1.5,2.5' for e in symbols))
        self.assertIn('0.9000', outputs[0]['svg'])
        self.assertNotIn('rgba(255,255,255,0.9000)', outputs[1]['svg'])


if __name__ == '__main__':
    unittest.main()
