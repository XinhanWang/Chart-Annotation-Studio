"""Text fidelity regressions; optional Node integration uses existing packages."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from text_layout import apply_text_layout, audit_text


def label_expr(mapping):
    return "(" + json.dumps(mapping, ensure_ascii=False, separators=(",", ":")) + ")[toString(datum.value)]"


def long_text_fixture():
    categories = {str(i): f"Category {i} with a long scientific condition and complete measurement description" for i in range(4)}
    series = {f"s{i}": f"Treatment group {i} with a long experimental description and complete series identity" for i in range(4)}
    rows = [{"row_id": f"s{s}c{c}", "series_id": f"s{s}", "category": c, "value": 1 + s + c}
            for s in range(4) for c in range(4)]
    return {
        "$schema": "https://vega.github.io/schema/vega-lite/v6.json", "width": 300, "height": 220,
        "title": {"text": "A complete scientific chart title with deliberately extensive explanatory context for a controlled text preservation regression",
                  "subtitle": "An equally complete subtitle describing the experiment and retaining all characters",
                  "fontSize": 17, "limit": 80},
        "data": {"values": rows}, "mark": {"type": "line", "point": True},
        "encoding": {
            "x": {"field": "category", "type": "quantitative", "scale": {"domain": [-0.5, 3.5]},
                  "title": "A complete horizontal axis title describing category identity and units in detail",
                  "axis": {"values": [0, 1, 2, 3], "labelExpr": label_expr(categories), "labelLimit": 40, "titleLimit": 50}},
            "y": {"field": "value", "type": "quantitative", "scale": {"domain": [0, 9]},
                  "title": "A complete vertical response axis title describing measured amplitude and physical units",
                  "axis": {"titleLimit": 50}},
            "color": {"field": "series_id", "type": "nominal", "scale": {"domain": list(series)},
                      "legend": {"title": "Complete treatment identities and experiment descriptions",
                                 "values": list(series), "labelExpr": label_expr(series), "labelLimit": 40,
                                 "titleLimit": 50, "orient": "top-right"}},
        },
    }


class TextLayoutTests(unittest.TestCase):
    def test_layout_preserves_observations_scales_and_source(self):
        source = long_text_fixture()
        before = copy.deepcopy(source)
        result = apply_text_layout(source)
        self.assertEqual(source, before)
        self.assertEqual(result["data"], source["data"])
        for name in ("x", "y", "color"):
            self.assertEqual(result["encoding"][name]["scale"], source["encoding"][name]["scale"])
        self.assertEqual(apply_text_layout(result), result)
        self.assertEqual(result["encoding"]["color"]["legend"]["orient"], "right")
        self.assertEqual(result["encoding"]["x"]["axis"]["labelLimit"], 0)
        self.assertGreaterEqual(result["width"], source["width"])

    def test_numeric_tick_alias_prevents_empty_integer_float_label(self):
        source = {"mark": "point", "encoding": {"x": {"field": "x", "type": "quantitative",
                  "axis": {"values": [21.0], "labelExpr": label_expr({"21.0": "Complete twenty one"})}}}}
        expression = apply_text_layout(source)["encoding"]["x"]["axis"]["labelExpr"]
        self.assertIn('"21":"Complete twenty one"', expression)
        self.assertIn('"21.0":"Complete twenty one"', expression)

    def test_null_guides_and_arbitrary_expressions_remain(self):
        source = {"mark": "point", "encoding": {"x": {"field": "x", "type": "quantitative", "axis": None},
                  "y": {"field": "y", "type": "quantitative", "axis": {"labelExpr": "format(datum.value, '.2f')"}},
                  "color": {"field": "s", "type": "nominal", "legend": None}}}
        result = apply_text_layout(source)
        self.assertIsNone(result["encoding"]["x"]["axis"])
        self.assertIsNone(result["encoding"]["color"]["legend"])
        self.assertEqual(result["encoding"]["y"]["axis"]["labelExpr"], "format(datum.value, '.2f')")

    def test_svg_audit_checks_visible_tspans_and_truncation(self):
        spec = {"title": ["A long", "complete title"], "encoding": {"x": {"type": "quantitative", "scale": {"domain": [0, 2]},
                "axis": {"values": [0, 2, 9], "labelExpr": label_expr({"0": "Alpha beta", "2": "Gamma delta", "9": "Outside domain"})}}}}
        svg = '<svg xmlns="http://www.w3.org/2000/svg"><g class="role-title-text"><text><tspan>A long</tspan><tspan>complete title</tspan></text></g><g class="role-axis-label"><text><tspan>Alpha</tspan><tspan>beta</tspan></text><text>Gamma delta</text></g></svg>'
        self.assertTrue(audit_text(spec, svg)["passed"])
        audit = audit_text(spec, svg.replace("Gamma delta", "Gamma…"))
        self.assertFalse(audit["passed"])
        self.assertEqual(audit["new_ellipsis_count"], 1)
        self.assertTrue(any("Gamma delta" in error for error in audit["errors"]))

    def test_automatic_tick_selection_is_not_missing_text(self):
        spec = {"encoding": {"x": {"type": "quantitative", "axis": {"labelExpr": label_expr({"0": "Zero", "1": "One"})}}}}
        self.assertTrue(audit_text(spec, '<svg><g class="role-axis-label"><text>Zero</text></g></svg>')["passed"])

    def test_source_ellipsis_is_allowed(self):
        spec = {"title": "Waiting…"}
        self.assertTrue(audit_text(spec, '<svg><g class="role-title-text"><text>Waiting…</text></g></svg>')["passed"])

    @unittest.skipUnless(os.environ.get("VSR_TEXT_TEST_MODULES") and shutil.which("node"),
                         "Set VSR_TEXT_TEST_MODULES to an existing Vega/Vega-Lite node_modules for SVG integration")
    def test_official_vega_svg_long_title_axes_and_multiseries_legend(self):
        source, fixed = long_text_fixture(), apply_text_layout(long_text_fixture())
        js = r"""
import fs from 'node:fs'; import path from 'node:path';
import {createRequire} from 'node:module'; import {pathToFileURL} from 'node:url';
const req=createRequire(path.resolve(process.env.VSR_TEXT_TEST_MODULES,'__text_test.cjs'));
const v=await import(pathToFileURL(req.resolve('vega'))),vl=await import(pathToFileURL(req.resolve('vega-lite')));
const cases=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const output=[];
for(const spec of cases){const warnings=[];const logger={warn:(...x)=>warnings.push(x.join(' ')),error:(...x)=>warnings.push(x.join(' ')),info:()=>{},debug:()=>{},level:()=>logger};
const compiled=vl.compile(spec,{logger}).spec;const view=new v.View(v.parse(compiled),{renderer:'none'});await view.runAsync();const svg=await view.toSVG();
const W=Number(svg.match(/ width="([^"]+)"/)[1]),H=Number(svg.match(/ height="([^"]+)"/)[1]);const p=view.padding(),o=view.origin();const clipped=[];
function walk(s,dx,dy){if(s.marktype==='group'){for(const g of s.items||[])for(const child of g.items||[])walk(child,dx+(g.x||0),dy+(g.y||0));return;}
if(s.marktype==='text')for(const t of s.items||[]){if(t.opacity===0)continue;const b=t.bounds;if(b&&(b.x1+dx<-.75||b.y1+dy<-.75||b.x2+dx>W+.75||b.y2+dy>H+.75))clipped.push(String(t.text));}}
walk(view.scenegraph().root,p.left+o[0],p.top+o[1]);output.push({svg,warnings,clipped,width:W,height:H});view.finalize();}
console.log(JSON.stringify(output));
"""
        with tempfile.TemporaryDirectory(prefix="vsr-text-layout-") as directory:
            file = Path(directory) / "specs.json"
            file.write_text(json.dumps([source, fixed], ensure_ascii=False), encoding="utf-8")
            run = subprocess.run([shutil.which("node"), "--input-type=module", "-e", js, str(file)],
                                 text=True, encoding="utf-8", capture_output=True, check=True, timeout=45)
            before, after = json.loads(run.stdout)
        self.assertFalse(audit_text(source, before["svg"])["passed"])
        self.assertEqual(after["warnings"], [])
        self.assertEqual(after["clipped"], [])
        self.assertTrue(audit_text(fixed, after["svg"])["passed"], audit_text(fixed, after["svg"]))
        self.assertTrue(audit_text(source, after["svg"])["passed"], "Original unwrapped display text must also match")


if __name__ == "__main__":
    unittest.main()
