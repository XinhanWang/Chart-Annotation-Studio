"""Regression tests for data identity and source semantics, without dependencies."""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from adapter import KINDS, build_pair, build_geometry_pair
from compact import normalize, project_rows, semantic_rows


def fixture(kind):
    cfg = {"title": "Test count (%)", "x_title": "Sample / time (s)", "y_title": "Response (mg)",
           "style": {"figsize": [8, 5], "series_colors": ["#ff0000", "#0000ff"]},
           "xlim": [-1, 3], "ylim": [-10, 10], "family": "test", "show_legend": True}
    if kind == "barline_n":
        cfg.update(labels=["repeat", "repeat", "Z"], bar_width=0.3, x_mode="categorical",
                   n_series=3, n_bar_series=2, n_line_series=1,
                   series_roles=["bar", "bar", "line"],
                   series_names=["repeat", "repeat", "repeat"],
                   matrix=[[1, -3, 0], [4, 5, 2], [2.5, 1.5, -1]],
                   offsets=[-0.15, 0.15], group_width=0.6,
                   bar_family="parallel", line_family="crossing", coupling="proportional",
                   hatches=["/", None, None], markers=[None, None, "o"],
                   linestyles=[None, None, "--"], marker_sizes=[None, None, 6],
                   markevery=[None, None, 2], widths=[None, None, 1.8],
                   linewidths=[1, 1, 1.8], show_error=True, capsize=3,
                   yerr=[[0.2, 0.5, 0.1], [0.4, 0.3, 0.2]],
                   error_kw={"elinewidth": 1.2, "capthick": 1.1})
    elif kind.startswith("bar"):
        cfg.update(labels=["repeat", "repeat", "Z"], bar_width=0.3, bar_height=0.3)
        if kind.endswith("_1"):
            cfg.update(values=[1, -3, 0], series_name="repeat", yerr=[0.2, 0.5, 0.1], xerr=[0.2, 0.5, 0.1])
        else:
            cfg.update(matrix=[[1, -3, 0], [4, 5, 2]], n_series=2, series_names=["repeat", "repeat"],
                       offsets=[-0.15, 0.15], hatches=["/", None], show_error=True,
                       xerr=[[0.2, 0.5, 0.1], [0.4, 0.3, 0.2]], yerr=[[0.2, 0.5, 0.1], [0.4, 0.3, 0.2]])
        if kind == "barv_stack":
            cfg.update(bottoms=[[0, 0, 0], [1, -3, 0]], stack_mode="absolute", show_error=False)
    elif kind.startswith("line"):
        cfg.update(x_mode="numeric", x_values=[0.2, 1.7, 2.0], x_labels=["0.2", "1.7", "2"],
                   matrix=[[1, -2, 3]], n_series=1, series_names=["repeat"], markers=["o"],
                   linestyles=["--"], marker_sizes=[6], markevery=[2])
        if kind == "line_n":
            cfg.update(matrix=[[1, -2, 3], [4, 5, 6]], n_series=2, series_names=["repeat", "repeat"],
                       markers=["o", "x"], linestyles=["--", ":"], marker_sizes=[6, 8], markevery=[2, None])
    else:
        cfg.update(x=[0.2, 0.2, 1.7, 2], y=[1, 1, -2, 3], series_name="repeat", marker="X", size=20)
        if kind == "scatter_n":
            cfg.update(counts=[2, 2], starts=[0, 2], n_series=2, series_names=["repeat", "repeat"],
                       markers=["X", "*"], sizes=[20, 25])
    return cfg


class AdapterTests(unittest.TestCase):
    def test_nine_kinds_json_and_idempotence(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                cfg = fixture(kind)
                before = copy.deepcopy(cfg)
                full, compact, source = build_pair(kind, cfg)
                self.assertEqual(full["$schema"], "https://vega.github.io/schema/vega-lite/v6.json")
                self.assertEqual(cfg, before)
                self.assertEqual(normalize(full), compact)
                self.assertEqual(normalize(compact), compact)
                self.assertEqual(project_rows(full), semantic_rows(compact))
                self.assertEqual(source["rows"], full["data"]["values"])
                self.assertEqual(len({row["row_id"] for row in source["rows"]}), source["row_count"])
                json.dumps(full, allow_nan=False)
                json.dumps(compact, allow_nan=False)
                self.assertTrue(full["layer"])
                self.assertTrue(compact.get("mark") or compact.get("layer"))

    def test_duplicate_labels_remain_separate(self):
        full, compact, source = build_pair("barv_n", fixture("barv_n"))
        self.assertEqual(source["row_count"], 6)
        self.assertEqual(len({r["series_id"] for r in source["rows"]}), 2)
        self.assertEqual(len({r["category_id"] for r in source["rows"]}), 3)
        self.assertEqual([r["series_index"] for r in source["rows"]], [0, 1, 0, 1, 0, 1])
        self.assertEqual([r["plot_x"] for r in source["rows"]], [-0.15, 0.15, 0.85, 1.15, 1.85, 2.15])
        rows = compact["data"]["values"]
        self.assertEqual([r["category"] for r in rows], ["repeat", "repeat", "repeat", "repeat", "Z", "Z"])
        self.assertEqual([r["category_instance"] for r in rows], [0, 0, 1, 1, 2, 2])
        self.assertEqual([r["series"] for r in rows], ["repeat"] * 6)
        self.assertEqual([r["series_instance"] for r in rows], [0, 1, 0, 1, 0, 1])
        self.assertEqual(compact["encoding"]["color"]["field"], "series_instance")
        self.assertEqual(compact["encoding"]["xOffset"]["field"], "series_instance")
        self.assertNotIn("labelExpr", json.dumps(compact))
        self.assertEqual(project_rows(full), semantic_rows(compact))

    def test_source_data_ori_retains_observations_in_visual_order(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                cfg = fixture(kind)
                _, _, source = build_pair(kind, cfg)
                if kind == "barline_n":
                    # A composite is read layer by layer: grouped bars first,
                    # then the overlaid line vertices on the same categories.
                    bars = cfg["n_bar_series"]
                    expected = [[cfg["series_names"][s], label, cfg["matrix"][s][i]]
                                for group in (range(bars), range(bars, cfg["n_series"]))
                                for i, label in enumerate(cfg["labels"]) for s in group]
                elif kind.startswith("bar"):
                    matrix = [cfg["values"]] if kind.endswith("_1") else cfg["matrix"]
                    names = [cfg["series_name"]] if kind.endswith("_1") else cfg["series_names"]
                    expected = [[names[s], label, matrix[s][i]] for i, label in enumerate(cfg["labels"]) for s in range(len(names))]
                elif kind.startswith("line"):
                    expected = [[cfg["series_names"][s], x, cfg["matrix"][s][i]]
                                for i, x in enumerate(cfg["x_values"]) for s in range(cfg["n_series"])]
                elif kind == "scatter_1":
                    expected = [[cfg["series_name"], x, y] for x, y in zip(cfg["x"], cfg["y"])]
                else:
                    expected = [[cfg["series_names"][s], cfg["x"][i], cfg["y"][i]]
                                for s, (start, count) in enumerate(zip(cfg["starts"], cfg["counts"])) for i in range(start, start + count)]
                # The fixture's horizontal y axis increases upward; its visible
                # category/group order is therefore the reverse of source order.
                if kind.startswith("barh"):
                    expected.reverse()
                elif kind == "barv_stack":
                    expected = [expected[index] for index in (1, 0, 3, 2, 5, 4)]
                self.assertEqual(source["data_ori"], expected)

    def test_native_scientific_offset_preserves_values_without_gt_axis_guides(self):
        cfg = fixture("line_1")
        cfg["_render_axes"] = {"xlim": [1000, 3000], "ylim": [-10, 10], "xticks": [1000, 2000, 3000],
                               "xticklabels": ["1", "2", "3"], "x_offset_text": "1e3"}
        full, compact, _ = build_pair("line_1", cfg)
        self.assertEqual(full["usermeta"]["presentation"]["axis_offsets"], {"x": "1e3"})
        self.assertNotIn("axis", compact["encoding"]["x"])
        self.assertEqual([r["x"] for r in compact["data"]["values"]], cfg["x_values"])
        self.assertEqual(project_rows(full), semantic_rows(compact))

    def test_native_reference_line_is_not_an_observation(self):
        cfg = fixture("line_1")
        cfg["_render_axes"] = {"reference_lines": [{"axis": "y", "value": 0}]}
        full, compact, source = build_pair("line_1", cfg)
        self.assertEqual(source["row_count"], 3)
        ref = next(layer for layer in full["layer"] if layer["name"] == "reference_y_0")
        self.assertEqual(ref["data"]["values"], [{"reference_value": 0}])
        self.assertEqual(len(compact["data"]["values"]), 3)
        self.assertEqual(project_rows(full), semantic_rows(compact))

    def test_fully_outside_reference_is_omitted_for_either_axis_direction(self):
        for limits in ([10, 20], [20, 10]):
            with self.subTest(limits=limits):
                cfg = fixture("line_1")
                # Keep observations inside the requested domain: full intentionally
                # expands unsafe domains to preserve visible observations.
                cfg["matrix"] = [[12, 15, 18]]
                cfg["_render_axes"] = {"ylim": limits, "reference_lines": [{"axis": "y", "value": 0}]}
                original = copy.deepcopy(cfg)
                full, compact, source = build_pair("line_1", cfg)
                self.assertFalse(any(l["name"].startswith("reference_") for l in full["layer"]))
                self.assertEqual(project_rows(full), semantic_rows(compact))
                self.assertEqual(source["row_count"], 3)
                self.assertEqual(cfg, original)

    def test_boundary_reference_keeps_one_pixel_fringe(self):
        for limits in ([10, 20], [20, 10]):
            for reference in (10, 10 - 0.5 * 10 / 360, 20 + 0.5 * 10 / 360):
                with self.subTest(limits=limits, reference=reference):
                    cfg = fixture("line_1")
                    cfg["_render_axes"] = {"ylim": limits, "reference_lines": [{"axis": "y", "value": reference}]}
                    full, compact, _ = build_pair("line_1", cfg)
                    self.assertTrue(any(l["name"].startswith("reference_") for l in full["layer"]))
                    self.assertEqual(project_rows(full), semantic_rows(compact))

    def test_negative_stack_uses_supplied_bottoms(self):
        cfg = fixture("barv_stack")
        cfg["bottoms"] = [[2, 7, 0], [11, -5, 3]]
        full, compact, source = build_pair("barv_stack", cfg)
        self.assertEqual([(r["value_lower"], r["value_upper"]) for r in source["rows"]],
                         [(11, 15), (2, 3), (7, 4), (-5, 0), (3, 5), (0, 0)])
        self.assertEqual([r["plot_y"] for r in source["rows"]], [13, 2.5, 5.5, -2.5, 4, 0])
        self.assertIsNone(compact["encoding"]["y"]["stack"])
        self.assertEqual(compact["encoding"]["y"]["field"], "end")
        self.assertEqual(compact["encoding"]["y2"], {"field": "start"})
        self.assertEqual([(r["start"], r["end"]) for r in compact["data"]["values"]], [(11, 15), (2, 3), (7, 4), (-5, 0), (3, 5), (0, 0)])

    def test_percent_stack_is_not_normalized_again(self):
        cfg = fixture("barv_stack")
        cfg.update(matrix=[[25, 20, 40], [75, 80, 60]], bottoms=[[0, 0, 0], [25, 20, 40]], stack_mode="percent")
        _, compact, source = build_pair("barv_stack", cfg)
        self.assertEqual([r["value_upper"] for r in source["rows"]], [100, 25, 100, 20, 100, 40])
        self.assertEqual(source["semantic"]["stack_mode"], "percent")
        self.assertNotIn('"normalize"', json.dumps(compact))

    def test_asymmetric_error_intervals_remain_after_normalization(self):
        cfg = fixture("barh_1")
        cfg["xerr"] = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
        full, compact, source = build_pair("barh_1", cfg)
        self.assertEqual([(r["error_lower"], r["error_upper"]) for r in source["rows"]], [(-0.3, 0.6), (-3.2, -2.5), (0.9, 1.4)])
        interval = compact["layer"][1]
        self.assertEqual(interval["encoding"]["x"]["field"], "lower")
        self.assertEqual(interval["encoding"]["x2"]["field"], "upper")
        self.assertEqual(sum("cap_" in layer["name"] for layer in full["layer"]), 2)

    def test_categorical_and_temporal_spacing(self):
        for mode, labels in [("categorical", ["A", "A", "B"]), ("temporal", ["Jan 2024", "Feb 2024", "Mar 2024"])]:
            with self.subTest(mode=mode):
                cfg = fixture("line_1")
                cfg.update(x_mode=mode, x_labels=labels, x_values=[9, 99, 999], tick_positions=[0, 2], tick_labels=[labels[0], labels[2]])
                _, compact, source = build_pair("line_1", cfg)
                self.assertEqual([r["plot_x"] for r in source["rows"]], [0, 1, 2])
                enc = compact["encoding"]["x"]
                self.assertNotIn("axis", enc)
                self.assertIsNone(enc["sort"])
                self.assertEqual([r["x"] for r in compact["data"]["values"]], labels)
                if mode == "categorical":
                    self.assertEqual(enc["field"], "x_instance")
                    self.assertEqual([r["x_instance"] for r in compact["data"]["values"]], [0, 1, 2])
                if mode == "temporal":
                    self.assertEqual([r["x_temporal"] for r in source["rows"]], ["2024-01-01", "2024-02-01", "2024-03-01"])
                    self.assertIn("equal calendar periods", source["semantic"]["temporal_spacing"])

    def test_numeric_spacing_and_marker_subsampling(self):
        full, compact, source = build_pair("line_n", fixture("line_n"))
        self.assertEqual([r["plot_x"] for r in source["rows"]], [0.2, 0.2, 1.7, 1.7, 2, 2])
        marker = next(layer for layer in full["layer"] if layer["name"] == "line_markers_0")
        self.assertIn({"filter": "datum.point_index % 2 === 0"}, marker["transform"])
        line = next(layer for layer in full["layer"] if layer["name"] == "line_0")
        self.assertEqual(line["encoding"]["order"]["field"], "point_index")
        self.assertEqual(len(line["transform"]), 1)
        self.assertEqual(compact["mark"], {"type": "line"})
        self.assertNotIn("layer", compact)
        self.assertEqual(project_rows(full), semantic_rows(compact))
        self.assertEqual(next(layer for layer in full["layer"] if layer["name"] == "line_0")["mark"]["strokeDash"], [6, 3])

    def test_duplicate_scatter_points_and_unequal_series_counts(self):
        cfg = fixture("scatter_n")
        cfg.update(counts=[1, 3], starts=[0, 1])
        _, compact, source = build_pair("scatter_n", cfg)
        self.assertEqual([r["series_index"] for r in source["rows"]], [0, 1, 1, 1])
        self.assertEqual(source["row_count"], 4)
        self.assertEqual(len(compact["data"]["values"]), 4)
        self.assertEqual([r["source_index"] for r in source["rows"]], [0, 1, 2, 3])

    def test_final_native_axes_and_equal_units(self):
        cfg = fixture("scatter_1")
        cfg["_render_axes"] = {"xlim": [6, -2], "ylim": [-2, 2], "x_inverted": True,
                               "xscale": "linear", "yscale": "linear", "aspect": 1.0,
                               "xticks": [-2, 0, 2, 4, 6]}
        full, compact, source = build_pair("scatter_1", cfg)
        self.assertEqual(source["axes"]["x"]["limits"], [6, -2])
        enc = full["layer"][0]["encoding"]["x"]
        self.assertEqual(enc["scale"]["domain"], [-2, 6])
        self.assertTrue(enc["scale"]["reverse"])
        geometry_full, _, _ = build_geometry_pair("scatter_1", cfg, fit_to_data=False)
        self.assertEqual(geometry_full["height"] / geometry_full["width"], 0.5)
        # Fitting paint bounds and text may adjust the final presentation;
        # the semantic GT must not inherit either size.
        self.assertEqual(source["plot_layout"]["final_plot_size"], [full["width"], full["height"]])
        self.assertNotIn("height", compact)
        self.assertNotIn("width", compact)
        self.assertNotIn("reverse", compact["encoding"]["x"].get("scale", {}))
        self.assertEqual(project_rows(full), semantic_rows(compact))

    def test_hatch_geometry_is_separate_and_deterministic(self):
        cfg = fixture("barv_1")
        for hatch in ["/", "\\", "|", "-", "+", "x", "o", "O", ".", "*"]:
            with self.subTest(hatch=hatch):
                cfg["hatch"] = hatch
                full, compact, source = build_pair("barv_1", cfg)
                self.assertEqual(build_pair("barv_1", cfg), (full, compact, source))
                self.assertGreater(source["decorative_geometry"]["row_count"], 0)
                self.assertEqual(len(full["data"]["values"]), 3)
                decorations = [l for l in full["layer"] if l["name"].startswith("__vsr_decoration_")]
                self.assertTrue(decorations)
                for layer in decorations:
                    for record in layer["data"]["values"]:
                        self.assertEqual(record["decoration_role"], "hatch")
                        self.assertNotIn("row_id", record)
                        self.assertIn(record["source_row_id"], {r["row_id"] for r in source["rows"]})
                self.assertFalse(any(l.get("name", "").startswith("__vsr_decoration_") for l in compact.get("layer", [])))

    def test_hatch_symbol_paint_bounds_stay_inside_source_bar(self):
        cfg = fixture("barv_1")
        cfg.update(values=[2, 3, 4], ylim=[0, 10], yerr=None)
        cfg["style"]["figsize"] = [8, 5.037]
        for hatch in ("o", "O", ".", "*"):
            for inverted in (False, True):
                with self.subTest(hatch=hatch, inverted=inverted):
                    cfg["hatch"] = hatch
                    cfg["_render_axes"] = {"xlim": [-1, 3], "ylim": [10, 0] if inverted else [0, 10]}
                    full, _, source = build_pair("barv_1", cfg)
                    rows = {r["row_id"]: r for r in source["rows"]}
                    x0, x1 = cfg["_render_axes"]["xlim"]
                    y0, y1 = cfg["_render_axes"]["ylim"]
                    width, height = full["width"], full["height"]
                    decorations = [l for l in full["layer"] if l["name"].startswith("__vsr_decoration_hatch_symbols")]
                    self.assertTrue(decorations)
                    for layer in decorations:
                        radius = math.sqrt(layer["mark"]["size"]) / 2 + 2 * layer["mark"]["strokeWidth"]
                        for dot in layer["data"]["values"]:
                            row = rows[dot["source_row_id"]]
                            px = (dot["hx"] - x0) / (x1 - x0) * width
                            py = (y1 - dot["hy"]) / (y1 - y0) * height
                            xs = sorted((row[f"plot_x{j}"] - x0) / (x1 - x0) * width for j in (0, 1))
                            ys = sorted((y1 - row[f"plot_y{j}"]) / (y1 - y0) * height for j in (0, 1))
                            self.assertGreaterEqual(px - radius, max(0, xs[0]))
                            self.assertLessEqual(px + radius, min(width, xs[1]))
                            self.assertGreaterEqual(py - radius, max(0, ys[0]))
                            self.assertLessEqual(py + radius, min(height, ys[1]))

    def test_legacy_geometry_normalization_is_context_aware(self):
        from adapter import normalize_geometry
        spec = {"data": {"values": [{"color": "red", "size": 3, "title": "name"}]},
                "transform": [{"calculate": "datum.size + 1", "as": "width"}],
                "mark": {"type": "bar", "color": "red", "clip": True},
                "encoding": {"x": {"field": "title", "type": "nominal", "sort": ["name"],
                                   "axis": {"title": "Variable (mg)", "labelExpr": "datum.value", "labelColor": "red"}},
                             "y": {"field": "size", "type": "quantitative", "scale": {"domain": [-1, 5], "type": "symlog"}},
                             "color": {"field": "color", "type": "nominal", "scale": {"domain": ["red"], "range": ["#f00"]}}}}
        out = normalize_geometry(spec)
        self.assertEqual(out["data"], spec["data"])
        self.assertEqual(out["transform"], spec["transform"])
        self.assertEqual(out["encoding"]["y"], spec["encoding"]["y"])
        self.assertEqual(out["encoding"]["x"]["axis"], {"title": "Variable (mg)", "labelExpr": "datum.value"})
        self.assertEqual(out["encoding"]["color"]["scale"], {"domain": ["red"]})
        self.assertEqual(normalize_geometry(out), out)

    def test_malformed_shapes_and_nonfinite_data_are_rejected(self):
        cfg = fixture("scatter_n")
        cfg["starts"] = [0, 1]
        with self.assertRaisesRegex(ValueError, "overlap"):
            build_pair("scatter_n", cfg)
        cfg = fixture("barv_1")
        cfg["values"] = [1, math.nan, 3]
        with self.assertRaisesRegex(ValueError, "finite"):
            build_pair("barv_1", cfg)
        cfg = fixture("line_1")
        cfg["matrix"] = [[1, 2]]
        with self.assertRaisesRegex(ValueError, "shapes"):
            build_pair("line_1", cfg)


if __name__ == "__main__":
    unittest.main()
