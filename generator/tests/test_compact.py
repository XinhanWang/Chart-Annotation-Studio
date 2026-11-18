"""Semantic projection tests, with optional real Vega schema/render checks."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import build_geometry_pair
from compact import KINDS, normalize, project_rows, semantic_rows
from test_adapter import fixture


class CompactTests(unittest.TestCase):
    def build(self, kind, cfg=None):
        return build_geometry_pair(kind, cfg or fixture(kind))[0]

    def test_nine_kinds_projection_identity_and_core_fields(self):
        for kind in sorted(KINDS):
            with self.subTest(kind=kind):
                full = self.build(kind)
                before = copy.deepcopy(full)
                target = normalize(full)
                self.assertEqual(full, before)
                self.assertEqual(target, normalize(target))
                self.assertEqual(project_rows(full), semantic_rows(target))
                self.assertEqual(len(target["data"]["values"]), len(full["data"]["values"]))
                self.assertLessEqual(set(target), {"data", "title", "mark", "encoding", "layer"})
                for row in target["data"]["values"]:
                    self.assertLessEqual(set(row), {"category", "value", "x", "y", "series", "lower", "upper", "path_order", "stack_order", "start", "end", "category_instance", "x_instance", "series_instance", "series_role"})
                self.assertEqual(target["encoding"]["x"]["title"], "Sample / time (s)")
                self.assertEqual(target["encoding"]["y"]["title"], "Response (mg)")

    def test_ordinary_cases_use_three_fields_and_stacks_keep_geometry(self):
        for kind in sorted(KINDS):
            cfg = fixture(kind)
            if kind.startswith("bar"):
                cfg["labels"] = ["Cat A", "Cat B", "Cat C"]
                cfg["xerr"] = cfg["yerr"] = None
                cfg["show_error"] = False
            if cfg.get("series_names"):
                cfg["series_names"] = [f"Series {i}" for i in range(len(cfg["series_names"]))]
            full = self.build(kind, cfg)
            target = normalize(full)
            allowed_count = {"barv_stack": 5, "barline_n": 4}.get(kind, 3)
            self.assertTrue(all(3 <= len(row) <= allowed_count for row in target["data"]["values"]))
            if kind == "barline_n":
                self.assertIn("layer", target)
            else:
                self.assertNotIn("layer", target)
            self.assertNotIn("labelExpr", json.dumps(target))

    def test_duplicate_names_keep_human_labels_and_explicit_instances(self):
        full = self.build("barv_n")
        target = normalize(full)
        self.assertEqual([r["category"] for r in target["data"]["values"]], ["repeat", "repeat", "repeat", "repeat", "Z", "Z"])
        self.assertEqual([r["series"] for r in target["data"]["values"]], ["repeat"] * 6)
        self.assertEqual(target["encoding"]["x"]["field"], "category_instance")
        self.assertEqual(target["encoding"]["color"]["field"], "series_instance")
        self.assertNotIn("labelExpr", json.dumps(target))
        expected = project_rows(full)
        self.assertEqual(semantic_rows(target), expected)
        self.assertEqual([r["category_instance"] for r in expected], [0, 0, 1, 1, 2, 2])
        self.assertEqual([r["series_instance"] for r in expected], [0, 1, 0, 1, 0, 1])
        self.assertTrue(all(r["series"] == "repeat" for r in expected))

    def test_duplicate_scatter_observations_are_not_deduplicated(self):
        full = self.build("scatter_1")
        target = normalize(full)
        self.assertEqual(len(target["data"]["values"]), 4)
        self.assertEqual(target["data"]["values"][0], target["data"]["values"][1])
        self.assertEqual(semantic_rows(target), project_rows(full))

    def test_numeric_line_reads_left_to_right_without_changing_connections(self):
        for xs in ([3, 1, 2], [3, 2, 1], [1, 1, 2]):
            cfg = fixture("line_n")
            cfg["x_values"] = xs
            target = normalize(self.build("line_n", cfg))
            self.assertEqual([row["x"] for row in target["data"]["values"]], sorted(x for x in xs for _ in range(2)))
            for series in range(2):
                rows = [r for r in target["data"]["values"] if r["series_instance"] == series]
                order = target["encoding"].get("order", {}).get("field")
                if order:
                    rows.sort(key=lambda row: row[order])
                actual = [(r["x"], r["y"]) for r in rows]
                expected = list(zip(xs, cfg["matrix"][series]))
                edges = lambda points: {frozenset(pair) for pair in zip(points, points[1:])}
                self.assertEqual(edges(actual), edges(expected))

    def test_normal_numeric_line_needs_no_order_column(self):
        target = normalize(self.build("line_n"))
        self.assertEqual(target["mark"], {"type": "line"})
        self.assertNotIn("order", target["encoding"])

    def test_temporal_and_duplicate_categorical_labels(self):
        for mode, labels in [("temporal", ["Jan 2024", "Feb 2024", "Mar 2024"]),
                             ("categorical", ["one", "one", "two"])]:
            cfg = fixture("line_1")
            cfg.update(x_mode=mode, x_labels=labels)
            full = self.build("line_1", cfg)
            target = normalize(full)
            self.assertEqual(target["encoding"]["x"]["type"], "ordinal")
            self.assertIsNone(target["encoding"]["x"]["sort"])
            self.assertEqual(semantic_rows(target), project_rows(full))
            self.assertEqual([row["x"] for row in semantic_rows(target)], labels)

    def test_grouped_and_stacked_structure(self):
        for kind, offset in [("barh_n", "yOffset"), ("barv_n", "xOffset")]:
            target = normalize(self.build(kind))
            self.assertEqual(target["encoding"][offset]["field"], "series_instance")
        cfg = fixture("barv_stack")
        cfg.update(matrix=[[25, 20, 40], [75, 80, 60]], bottoms=[[0, 0, 0], [25, 20, 40]], stack_mode="percent")
        target = normalize(self.build("barv_stack", cfg))
        self.assertEqual(target["encoding"]["y"]["stack"], "zero")
        self.assertEqual(target["encoding"]["order"], {"field": "stack_order", "type": "quantitative"})
        self.assertEqual([row["value"] for row in target["data"]["values"]], [75, 25, 80, 20, 60, 40])

    def test_errors_are_explicit_two_layer_intervals(self):
        cfg = fixture("barh_1")
        cfg["xerr"] = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
        target = normalize(self.build("barh_1", cfg))
        self.assertEqual(len(target["layer"]), 2)
        self.assertEqual(target["layer"][0], {"mark": {"type": "bar"}})
        self.assertEqual(target["layer"][1]["mark"], {"type": "rule"})
        self.assertEqual(target["layer"][1]["encoding"], {"x": {"field": "lower", "type": "quantitative"}, "x2": {"field": "upper"}})
        self.assertEqual([(r["lower"], r["upper"]) for r in target["data"]["values"]], [(-0.3, 0.6), (-3.2, -2.5), (0.9, 1.4)])

    def test_nonlinear_scale_parameters_remain_without_layout_domain(self):
        full = self.build("scatter_1")
        for layer in full["layer"]:
            layer["encoding"]["x"]["scale"].update(type="log", base=2, domain=[0.1, 999], reverse=True)
        target = normalize(full)
        self.assertEqual(target["encoding"]["x"]["scale"], {"type": "log", "base": 2})
        self.assertNotIn("scale", target["encoding"]["y"])

    def test_style_variations_share_gt(self):
        full = self.build("line_n")
        changed = copy.deepcopy(full)
        changed["width"] = 999
        changed["background"] = "black"
        changed["title"]["fontSize"] = 60
        for layer in changed["layer"]:
            layer["mark"].update(color="red", opacity=0.1, shape="square")
            for axis in ("x", "y"):
                layer["encoding"][axis]["scale"].update(domain=[-999, 999])
                layer["encoding"][axis]["axis"].update(labelColor="blue", values=[9, 99])
        self.assertEqual(normalize(full), normalize(changed))

    def test_semantic_labels_ignore_visual_line_wrapping(self):
        full = self.build("line_n")
        labels = {"title": "Original scientific title", "x_title": "Time (seconds)", "y_title": "Temperature (degrees C)"}
        full["usermeta"]["semantic_labels"] = labels
        changed = copy.deepcopy(full)
        changed["title"]["text"] = ["Original scientific", "title"]
        for layer in changed["layer"]:
            layer["encoding"]["x"]["title"] = ["Time", "(seconds)"]
            layer["encoding"]["y"]["title"] = ["Temperature", "(degrees C)"]
        target = normalize(changed)
        self.assertEqual(target, normalize(full))
        self.assertEqual(target["title"], labels["title"])
        self.assertEqual(target["encoding"]["x"]["title"], labels["x_title"])

    def test_hidden_single_series_omits_anonymous_name_and_color(self):
        cfg = fixture("line_1")
        cfg["show_legend"] = False
        full = self.build("line_1", cfg)
        target = normalize(full)
        self.assertNotIn("color", target["encoding"])
        self.assertTrue(all(set(row) == {"x", "y"} for row in target["data"]["values"]))
        self.assertEqual(semantic_rows(target), project_rows(full))

    def test_explicit_labels_handle_unicode_quotes_and_backslashes(self):
        cfg = fixture("barv_n")
        cfg["labels"] = ['数"据\\甲', '数"据\\甲', "B"]
        cfg["series_names"] = ['相"同\\名', '相"同\\名']
        full = self.build("barv_n", cfg)
        target = normalize(full)
        self.assertEqual(semantic_rows(target), project_rows(full))
        json.dumps(target, ensure_ascii=False, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
