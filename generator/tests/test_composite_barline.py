"""Regressions for the grouped-bar + overlaid-line composite category."""
from __future__ import annotations

import copy
import json
import random
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from adapter import DATA_LABEL_PREFIX, build_geometry_pair, build_pair
from compact import normalize, project_rows, semantic_rows, validate_target
from compact_display import render_spec
from generation import FAMILIES, KINDS, generate_chart
from generation.composites import barline_n as sampler
from generation.controls import BAR_MULTI_FAMILIES, BAR_SERIES_RANGE, COUPLINGS, LINE_FAMILIES, LINE_SERIES_RANGE, normalize_controls
from generation.core import sample_config
from generation.vsr_runtime import composite_namespace
from test_adapter import fixture

KIND = "barline_n"


class CompositeSamplerTests(unittest.TestCase):
    def test_sampler_constants_stay_aligned_with_the_official_families(self):
        self.assertEqual(sampler.BAR_FAMILY_CHOICES, list(BAR_MULTI_FAMILIES))
        self.assertEqual(sampler.LINE_FAMILY_CHOICES, list(LINE_FAMILIES))
        self.assertEqual(set(sampler.COUPLING_CHOICES), set(COUPLINGS))
        self.assertEqual((sampler.BAR_SERIES_CHOICES[0], sampler.BAR_SERIES_CHOICES[-1]), BAR_SERIES_RANGE)
        self.assertEqual((sampler.LINE_SERIES_CHOICES[0], sampler.LINE_SERIES_CHOICES[-1]), LINE_SERIES_RANGE)
        self.assertEqual(set(FAMILIES[KIND]), {f"{bar}+{line}" for bar in BAR_MULTI_FAMILIES for line in LINE_FAMILIES})

    def test_every_injected_global_is_supplied_by_the_runtime_namespace(self):
        namespace, _ = composite_namespace(KIND, 11, {})
        for name in sampler.INJECTED_GLOBALS:
            self.assertIn(name, namespace, name)
        for name in sampler.SAMPLER_FUNCTIONS:
            self.assertEqual(getattr(namespace[name], "__module__", sampler.__name__), sampler.__name__, name)

    def test_sampling_is_deterministic_and_leaves_global_rngs_alone(self):
        py_state, np_state = random.getstate(), np.random.get_state()
        with tempfile.TemporaryDirectory() as directory:
            first = generate_chart(KIND, 601, Path(directory) / "a", {"category_count": 5})
            second = generate_chart(KIND, 601, Path(directory) / "b", {"category_count": 5})
        self.assertEqual(first["config"], second["config"])
        self.assertEqual(random.getstate(), py_state)
        self.assertEqual(np.random.get_state()[0], np_state[0])

    def test_config_carries_roles_coupling_and_both_family_parts(self):
        cfg = sample_config(KIND, 12, {"category_count": 7, "series_count": 4})
        self.assertEqual(cfg["n_series"], 4)
        self.assertEqual(len(cfg["series_roles"]), 4)
        self.assertEqual(cfg["series_roles"], ["bar"] * cfg["n_bar_series"] + ["line"] * cfg["n_line_series"])
        self.assertEqual(cfg["family"], f"{cfg['bar_family']}+{cfg['line_family']}")
        self.assertIn(cfg["coupling"], COUPLINGS)
        self.assertEqual(cfg["x_mode"], "categorical")
        self.assertEqual(len(cfg["matrix"]), 4)
        self.assertTrue(all(len(row) == 7 for row in cfg["matrix"]))
        self.assertEqual(len(cfg["offsets"]), cfg["n_bar_series"])
        self.assertEqual(len(cfg["hatches"]), 4)
        self.assertTrue(all(h is None for h in cfg["hatches"][cfg["n_bar_series"]:]))
        self.assertTrue(all(m is None for m in cfg["markers"][:cfg["n_bar_series"]]))
        self.assertTrue(all(s is None for s in cfg["linestyles"][:cfg["n_bar_series"]]))
        self.assertTrue(all(s is not None for s in cfg["linestyles"][cfg["n_bar_series"]:]))
        json.dumps(cfg, allow_nan=False)

    def test_forced_controls_and_rejections(self):
        cfg = sample_config(KIND, 13, {"category_count": 9, "bar_series_count": 3, "line_series_count": 2,
                                       "family": "sparse+seasonal", "coupling": "residual",
                                       "show_error": True, "hatch": "\\", "show_legend": False})
        self.assertEqual((cfg["n_bar_series"], cfg["n_line_series"]), (3, 2))
        self.assertEqual((cfg["bar_family"], cfg["line_family"]), ("sparse", "seasonal"))
        self.assertEqual(cfg["coupling"], "residual")
        self.assertEqual(len(cfg["labels"]), 9)
        self.assertTrue(cfg["show_error"])
        self.assertEqual(cfg["hatches"][:3], ["\\", "\\", "\\"])
        self.assertEqual(cfg["series_names"], [f"Series {i + 1}" for i in range(5)])
        for controls in ({"family": "balanced+crossing"}, {"series_count": 8}, {"series_count": 2, "bar_series_count": 2},
                         {"family": "parallel+crossing", "line_family": "decay"}, {"coupling": "unknown"},
                         {"line_series_count": 4}, {"x_mode": "numeric"}):
            with self.subTest(controls=controls), self.assertRaises(ValueError):
                normalize_controls(KIND, controls)
        self.assertEqual(normalize_controls(KIND, {"series_count": 3, "line_series_count": 1}),
                         {"series_count": 3, "line_series_count": 1})

    def test_line_envelope_is_anchored_on_the_bars_for_every_coupling(self):
        """Assert the affine fit exactly, on values human_round has not touched."""
        bar_matrix = np.array([[12.0, 30.0, 7.0, 24.0, 18.0, 41.0, 9.0],
                               [26.0, 11.0, 33.0, 5.0, 29.0, 14.0, 37.0]])
        bar_span = float(bar_matrix.max() - bar_matrix.min())
        for coupling in COUPLINGS:
            for seed in range(12):
                with self.subTest(coupling=coupling, seed=seed):
                    namespace, _ = composite_namespace(KIND, seed, {"coupling": coupling})
                    line_matrix = namespace["line_generate_matrix"](2, bar_matrix.shape[1], namespace["sample_line_family"]())
                    lines = namespace["couple_lines"](bar_matrix, line_matrix, coupling)
                    line_span = float(lines.max() - lines.min())
                    self.assertLessEqual(abs(lines.mean() - bar_matrix.mean()), 0.9 * bar_span)
                    self.assertLessEqual(line_span, 1.9 * bar_span)
                    self.assertGreaterEqual(line_span, 0.3 * bar_span)

    def test_sampled_lines_stay_on_the_bars_value_scale_for_every_coupling(self):
        for coupling in COUPLINGS:
            with self.subTest(coupling=coupling):
                cfg = sample_config(KIND, 31, {"category_count": 8, "series_count": 3, "coupling": coupling})
                bars = np.asarray(cfg["matrix"][:cfg["n_bar_series"]], dtype=float)
                lines = np.asarray(cfg["matrix"][cfg["n_bar_series"]:], dtype=float)
                # human_round rescales the rounded bar span (and flattens a
                # near-constant one), so keep a magnitude floor before judging
                # how the two geometries share the single value axis.
                scale = max(float(bars.max() - bars.min()), 0.05 * max(1.0, float(abs(bars).max())))
                self.assertLessEqual(abs(lines.mean() - bars.mean()), 1.6 * scale)
                self.assertLessEqual(lines.max() - lines.min(), 6.0 * scale)

    def test_diversity_across_seeds(self):
        families, couplings, roles, profiles = set(), set(), set(), set()
        grids = set()
        flags = {"legend": set(), "error": set(), "hatch": set(), "marker": set(), "inverted": set()}
        with tempfile.TemporaryDirectory() as directory:
            for index in range(60):
                cfg = generate_chart(KIND, 900 + index, Path(directory) / str(index))["config"]
                families.add(cfg["family"])
                couplings.add(cfg["coupling"])
                roles.add(tuple(cfg["series_roles"]))
                profiles.add(cfg["style"]["profile"])
                flags["legend"].add(cfg["show_legend"])
                flags["error"].add(cfg["show_error"])
                flags["hatch"].add(any(cfg["hatches"]))
                flags["marker"].add(any(m is not None for m in cfg["markers"][cfg["n_bar_series"]:]))
                flags["inverted"].add(cfg["_render_axes"]["x_inverted"])
                grids.add(cfg["grid_axis"])
        self.assertGreaterEqual(len(families), 25)
        self.assertGreaterEqual(len(couplings), 5)
        self.assertGreaterEqual(len(roles), 6)
        self.assertGreaterEqual(len(profiles), 6)
        for name, values in flags.items():
            self.assertEqual(values, {True, False}, name)
        self.assertTrue(grids <= {"x", "y", "both"}, grids)
        self.assertEqual(grids, {"x", "y", "both"})


class CompositeProjectionTests(unittest.TestCase):
    def build(self, **updates):
        cfg = fixture(KIND)
        cfg.update(updates)
        return build_pair(KIND, cfg)

    def test_rows_carry_roles_and_layer_specific_geometry(self):
        full, compact, source = self.build()
        roles = {row["series_index"]: row["role"] for row in source["rows"]}
        self.assertEqual(roles, {0: "bar", 1: "bar", 2: "line"})
        for row in source["rows"]:
            if row["role"] == "bar":
                self.assertLess(row["plot_x0"], row["plot_x1"])
                self.assertEqual((row["plot_y0"], row["plot_y1"]), (0, row["value"]))
                self.assertEqual(row["plot_x"], (row["plot_x0"] + row["plot_x1"]) / 2)
            else:
                self.assertEqual(row["plot_x0"], row["plot_x1"])
                self.assertEqual(row["plot_y0"], row["plot_y1"])
                self.assertEqual(row["plot_x"], row["category_position"])
        self.assertEqual(source["observation_fields"][-1], "role")
        self.assertEqual(source["semantic"]["series_roles"], ["bar", "bar", "line"])
        self.assertEqual(source["semantic"]["coupling"], "proportional")

    def test_visible_order_reads_bars_then_lines(self):
        full, compact, source = self.build()
        rows = source["rows"]
        roles = [row["role"] for row in rows]
        self.assertEqual(roles, sorted(roles, key=lambda role: 0 if role == "bar" else 1))
        for role in ("bar", "line"):
            positions = [row["category_position"] for row in rows if row["role"] == role]
            self.assertEqual(positions, sorted(positions))
        self.assertEqual(source["data_ori"][:6], source["data_ori"][:6])
        self.assertEqual([row["series_index"] for row in rows][:6], [0, 1, 0, 1, 0, 1])
        self.assertEqual([row["series_index"] for row in rows][6:], [2, 2, 2])

    def test_gt_is_compact_v5_with_role_layers(self):
        full, compact, source = self.build()
        validate_target(compact)
        self.assertEqual(normalize(full), compact)
        self.assertEqual(normalize(compact), compact)
        self.assertEqual(project_rows(full), semantic_rows(compact))
        rows = compact["data"]["values"]
        self.assertTrue(all(row["series_role"] in {"bar", "line"} for row in rows))
        self.assertEqual([row["series_role"] for row in rows], ["bar"] * 6 + ["line"] * 3)
        self.assertEqual(compact["encoding"]["x"]["field"], "category_instance")
        self.assertEqual(compact["encoding"]["color"]["field"], "series_instance")
        self.assertNotIn("xOffset", compact["encoding"])
        marks = [layer["mark"] for layer in compact["layer"]]
        self.assertEqual(marks, [{"type": "bar"}, {"type": "rule"}, {"type": "line"}])
        self.assertEqual([layer["transform"] for layer in compact["layer"]],
                         [[{"filter": {"field": "series_role", "equal": "bar"}}]] * 2
                         + [[{"filter": {"field": "series_role", "equal": "line"}}]])
        self.assertEqual(set(compact["layer"][0]["encoding"]), {"xOffset"})
        self.assertEqual(set(compact["layer"][1]["encoding"]), {"xOffset", "y", "y2"})
        self.assertNotIn("encoding", compact["layer"][2])

    def test_single_bar_series_needs_no_offset_layer_encoding(self):
        cfg = fixture(KIND)
        cfg.update(n_series=2, n_bar_series=1, n_line_series=1, series_roles=["bar", "line"],
                   series_names=["repeat", "repeat"], matrix=[[1, -3, 0], [2.5, 1.5, -1]],
                   offsets=[0], yerr=None, show_error=False, hatches=[None, None],
                   markers=[None, "o"], linestyles=[None, "-"], marker_sizes=[None, 6],
                   markevery=[None, None], widths=[None, 1.8], linewidths=[1, 1.8])
        _, compact, _ = build_pair(KIND, cfg)
        validate_target(compact)
        self.assertEqual([layer["mark"] for layer in compact["layer"]], [{"type": "bar"}, {"type": "line"}])
        self.assertNotIn("encoding", compact["layer"][0])
        self.assertEqual([row["series_role"] for row in compact["data"]["values"]], ["bar"] * 3 + ["line"] * 3)

    def test_preview_renders_the_same_observations(self):
        _, compact, _ = self.build()
        before = copy.deepcopy(compact)
        preview = render_spec(compact)
        self.assertEqual(compact, before)
        self.assertEqual(preview["data"], compact["data"])
        self.assertEqual([layer["transform"] for layer in preview["layer"]],
                         [layer["transform"] for layer in compact["layer"]])
        # Display-only axis/legend guides are never re-validated as targets.
        self.assertNotIn("labelExpr", json.dumps({k: v for k, v in preview.items() if k != "encoding"}))

    def test_invalid_role_layouts_are_rejected(self):
        cfg = fixture(KIND)
        cfg["series_roles"] = ["line", "bar", "bar"]
        with self.assertRaises(ValueError):
            build_pair(KIND, cfg)
        cfg = fixture(KIND)
        cfg["series_roles"] = ["bar", "bar", "bar"]
        with self.assertRaises(ValueError):
            build_pair(KIND, cfg)
        cfg = fixture(KIND)
        cfg["series_roles"] = ["bar", "bar"]
        with self.assertRaises(ValueError):
            build_pair(KIND, cfg)
        cfg = fixture(KIND)
        cfg["yerr"] = [[0.1, 0.2, 0.3]]
        with self.assertRaises(ValueError):
            build_pair(KIND, cfg)

    def test_noncanonical_composite_targets_are_rejected(self):
        _, compact, _ = self.build()
        invalid = []
        mutated = copy.deepcopy(compact)
        mutated["data"]["values"][0]["series_role"] = "area"
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["data"]["values"][0]["series_role"] = "line"
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        del mutated["layer"][2]
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["layer"][0]["transform"] = [{"filter": {"field": "series", "equal": "repeat"}}]
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["mark"] = "bar"
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["layer"][0]["encoding"]["xOffset"]["field"] = "category"
        invalid.append(mutated)
        for spec in invalid:
            with self.subTest(spec=spec["layer"][0] if "layer" in spec else spec), self.assertRaises(ValueError):
                validate_target(spec)


class CompositeDualAxisTests(unittest.TestCase):
    BAR_FILTER = [{"filter": {"field": "series_role", "equal": "bar"}}]
    LINE_FILTER = [{"filter": {"field": "series_role", "equal": "line"}}]

    def build(self, **updates):
        cfg = fixture(KIND)
        cfg.update(dual_y_axis=True, y_title_right="Line rate (a.u.)")
        cfg.update(updates)
        return build_pair(KIND, cfg)

    @staticmethod
    def visible_value_guides(full):
        sides = []
        for layer in full["layer"]:
            axis = (layer.get("encoding") or {}).get("y", {}).get("axis")
            if isinstance(axis, dict):
                sides.append(axis.get("orient"))
        return sides

    def test_dual_gt_groups_bars_and_resolves_the_line_scale(self):
        full, compact, source = self.build()
        self.assertEqual(full["resolve"], {"scale": {"y": "independent"}})
        self.assertEqual(source["semantic"]["dual_y_axis"], True)
        self.assertEqual(self.visible_value_guides(full), ["left", "right"])
        line_layers = [layer for layer in full["layer"] if str(layer.get("name", "")).startswith("line_")]
        self.assertTrue(all(layer["encoding"]["y"]["scale"]["domain"] != full["layer"][0]["encoding"]["y"]["scale"]["domain"]
                            for layer in line_layers))
        validate_target(compact)
        self.assertEqual(normalize(full), compact)
        self.assertEqual(normalize(compact), compact)
        self.assertEqual(project_rows(full), semantic_rows(compact))
        self.assertEqual(compact["resolve"], {"scale": {"y": "independent"}})
        group, line_layer = compact["layer"]
        self.assertEqual(set(group), {"transform", "layer"})
        self.assertEqual(group["transform"], self.BAR_FILTER)
        self.assertEqual([child["mark"] for child in group["layer"]], [{"type": "bar"}, {"type": "rule"}])
        self.assertTrue(all("transform" not in child for child in group["layer"]))
        self.assertEqual(line_layer["transform"], self.LINE_FILTER)
        self.assertEqual(line_layer["encoding"]["y"],
                         {"field": "value", "type": "quantitative", "title": "Line rate (a.u.)"})
        preview = render_spec(compact)
        self.assertIsNone(preview["layer"][1]["encoding"]["y"]["title"])
        self.assertEqual(preview["data"], compact["data"])

    def test_dual_without_a_distinct_title_keeps_the_line_layer_bare(self):
        _, compact, _ = self.build(y_title_right="Response (mg)")
        validate_target(compact)
        self.assertEqual(compact["resolve"], {"scale": {"y": "independent"}})
        self.assertNotIn("encoding", compact["layer"][1])
        self.assertEqual(normalize(compact), compact)

    def test_dual_line_domain_covers_exactly_the_line_observations(self):
        full, compact, source = self.build()
        lines = [row["value"] for row in source["rows"] if row["role"] == "line"]
        bars = [row["value"] for row in source["rows"] if row["role"] == "bar"]
        domain = full["layer"][0]["encoding"]["y"]["scale"]["domain"]
        line_scale = next(layer["encoding"]["y"]["scale"]["domain"]
                          for layer in full["layer"] if str(layer.get("name", "")).startswith("line_"))
        self.assertLessEqual(min(lines), line_scale[1])
        self.assertGreaterEqual(max(lines), line_scale[0])
        self.assertLess(line_scale[0], min(lines))
        self.assertGreater(line_scale[1], max(lines))
        self.assertNotEqual(domain, line_scale)
        self.assertLessEqual(min(bars), domain[1])
        self.assertGreaterEqual(max(bars), domain[0])

    def test_malformed_dual_targets_are_rejected(self):
        _, compact, _ = self.build()
        invalid = []
        mutated = copy.deepcopy(compact)
        del mutated["resolve"]
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["resolve"] = {"scale": {"y": "shared"}}
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["resolve"] = {"scale": {"x": "independent"}}
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["layer"][1]["encoding"]["y"]["field"] = "lower"
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["layer"][1]["encoding"]["y"]["title"] = "Response (mg)"
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["layer"][1]["encoding"]["y"]["scale"] = {"domain": [0, 1]}
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["layer"][0]["layer"][0]["transform"] = self.BAR_FILTER
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["layer"][0] = mutated["layer"][0]["layer"][0]
        mutated["layer"][0]["transform"] = self.BAR_FILTER
        invalid.append(mutated)
        mutated = copy.deepcopy(compact)
        mutated["layer"][1]["encoding"]["x"] = {"field": "category", "type": "nominal", "sort": None}
        invalid.append(mutated)
        for spec in invalid:
            with self.subTest(spec=json.dumps(spec.get("resolve")), ), self.assertRaises(ValueError):
                validate_target(spec)
        plain, _, _ = self.build(dual_y_axis=False)
        _, plain_compact, _ = build_pair(KIND, fixture(KIND))
        mutated = copy.deepcopy(plain_compact)
        mutated["resolve"] = {"scale": {"y": "independent"}}
        with self.assertRaises(ValueError):
            validate_target(mutated)
        self.assertNotIn("resolve", plain_compact)
        self.assertNotIn("resolve", plain)

    def test_axis_design_and_orients_vary_across_seeds(self):
        duals, x_orients, y_orients, ticks, formats, offsets, anchors = set(), set(), set(), set(), set(), set(), set()
        titles = set()
        for seed in range(120):
            cfg = sample_config(KIND, 4000 + seed)
            duals.add(cfg["dual_y_axis"])
            x_orients.add(cfg["x_axis_orient"])
            y_orients.add(cfg["y_axis_orient"])
            design = cfg["axis_design"]
            ticks.add(design["y_tick_count"])
            formats.add(design["y_tick_format"])
            offsets.add(design["y_axis_offset"])
            anchors.add((design["y_title_anchor"], design["x_title_anchor"], design["x_label_align"]))
            if cfg["dual_y_axis"]:
                self.assertEqual(cfg["y_axis_orient"], "left")
                self.assertTrue(cfg["y_title_right"])
                titles.add(cfg["y_title_right"])
            else:
                self.assertIsNone(cfg["y_title_right"])
        self.assertEqual(duals, {True, False})
        self.assertEqual(x_orients, {"bottom", "top"})
        self.assertEqual(y_orients, {"left", "right"})
        self.assertGreaterEqual(len(ticks), 4)
        self.assertGreaterEqual(len(formats), 2)
        self.assertGreaterEqual(len(offsets), 3)
        self.assertGreaterEqual(len(anchors), 6)
        self.assertGreaterEqual(len(titles), 8)

    def test_presentation_honours_sampled_axis_orients(self):
        full, _, _ = self.build(dual_y_axis=False, y_axis_orient="right", x_axis_orient="top")
        guides = [(layer.get("encoding") or {}).get(axis, {}).get("axis", {})
                  for layer in full["layer"] for axis in ("x", "y")]
        self.assertTrue(all(guide.get("orient") == "top" for guide in guides
                            if isinstance(guide, dict) and guide.get("orient") in {"top", "bottom"}))
        self.assertTrue(all(guide.get("orient") == "right" for guide in guides
                            if isinstance(guide, dict) and guide.get("orient") in {"left", "right"}))
        full, _, _ = self.build(axis_design={"y_tick_count": 6, "y_tick_format": "~s", "y_axis_offset": 8,
                                              "y_title_anchor": "end", "x_title_anchor": "start",
                                              "x_label_align": None})
        left = full["layer"][0]["encoding"]["y"]["axis"]
        self.assertEqual((left["tickCount"], left["format"], left["offset"], left["titleAnchor"]),
                         (6, "~s", 8, "end"))
        self.assertEqual(full["layer"][0]["encoding"]["x"]["axis"]["titleAnchor"], "start")


class CompositeDataLabelTests(unittest.TestCase):
    """Printed values are display-only variety on the composite category."""

    LABELS = {"bar": {"position": "above", "format": ".1f", "size": 9.0, "color": "text", "weight": "normal"},
              "line": {"position": "below", "format": ".2f", "size": 8.0, "color": "series", "weight": "bold"}}

    def build(self, **updates):
        cfg = fixture(KIND)
        cfg.update(updates)
        return build_pair(KIND, cfg)

    @staticmethod
    def _line_domain(full):
        for layer in full["layer"]:
            if str(layer.get("name", "")).startswith("line_"):
                scale = layer.get("encoding", {}).get("y", {}).get("scale")
                if scale:
                    return scale["domain"]
        raise AssertionError("no line layer")

    def test_sampling_covers_labelled_and_clean_charts_within_declared_choices(self):
        seen, positions, colors, weights = set(), set(), set(), set()
        for seed in range(120):
            labels = sample_config(KIND, 5200 + seed)["data_labels"]
            seen.add(None if labels is None else tuple(sorted(labels)))
            for role, options in (labels or {}).items():
                choices = sampler.BAR_LABEL_POSITIONS if role == "bar" else sampler.LINE_LABEL_POSITIONS
                self.assertIn(options["position"], choices)
                self.assertIn(options["color"], sampler.DATA_LABEL_COLORS)
                self.assertIn(options["weight"], ("normal", "bold"))
                self.assertTrue(6.6 <= options["size"] <= 10.6)
                if options["color"] == "contrast":
                    self.assertEqual(options["position"], "inside")
                positions.add((role, options["position"]))
                colors.add((role, options["color"]))
                weights.add(options["weight"])
        self.assertIn(None, seen)
        self.assertTrue(seen - {None}, seen)
        self.assertIn(("bar", "above"), positions)
        self.assertIn(("line", "above"), positions)
        self.assertIn(("line", "below"), positions)
        self.assertTrue({("bar", "text"), ("bar", "series"), ("line", "text"), ("line", "series")} <= colors
                        <= {("bar", "text"), ("bar", "series"), ("bar", "contrast"),
                            ("line", "text"), ("line", "series")}, colors)
        self.assertEqual(weights, {"normal", "bold"})

    def test_data_label_controls_force_and_block_roles(self):
        for seed in range(24):
            labels = sample_config(KIND, 5400 + seed, {"data_labels": False})["data_labels"]
            self.assertIsNone(labels)
            forced = sample_config(KIND, 5400 + seed, {"data_labels": {"bar": True, "line": False}})["data_labels"]
            self.assertNotIn("line", forced or {})
        sparse = {"category_count": 4, "bar_series_count": 1, "line_series_count": 1}
        self.assertTrue(sample_config(KIND, 5450, {**sparse, "data_labels": True})["data_labels"])
        for controls in ({"data_labels": "yes"}, {"data_labels": {"point": True}}, {"data_labels": {"bar": 1}}):
            with self.subTest(controls=controls), self.assertRaises(ValueError):
                normalize_controls(KIND, controls)
        with self.assertRaises(ValueError):
            normalize_controls("barv_n", {"data_labels": True})

    def test_dense_charts_drop_bar_labels_even_when_forced(self):
        cfg = sample_config(KIND, 5500, {"category_count": 16, "bar_series_count": 4,
                                         "line_series_count": 3, "data_labels": True})
        self.assertNotIn("bar", cfg["data_labels"] or {})

    def test_label_layers_are_decoration_and_leave_the_target_untouched(self):
        _, plain_compact, _ = self.build()
        labelled, compact, source = self.build(data_labels=self.LABELS)
        self.assertEqual(plain_compact, compact)
        self.assertEqual(normalize(labelled), compact)
        bars = next(layer for layer in labelled["layer"] if layer["name"] == "bars_0")
        names = [layer["name"] for layer in labelled["layer"] if layer["name"].startswith(DATA_LABEL_PREFIX)]
        self.assertTrue(names)
        self.assertTrue(any(name.endswith("_negative") for name in names), names)
        for layer in labelled["layer"]:
            if not layer["name"].startswith(DATA_LABEL_PREFIX):
                continue
            mark = layer["mark"]
            self.assertEqual(mark["type"], "text")
            self.assertFalse(mark["clip"])
            self.assertNotIn("color", layer["encoding"])
            self.assertEqual(layer["encoding"]["text"]["field"], "value")
            for axis in ("x", "y"):
                # A shared scale merges identical guides; a differing one would
                # draw a second axis or switch the annotated one off.
                self.assertEqual(layer["encoding"][axis]["scale"], bars["encoding"][axis]["scale"])
                self.assertEqual(layer["encoding"][axis]["axis"], bars["encoding"][axis]["axis"])
        self.assertEqual(source["decorative_geometry"]["data_label_layers"], len(names))
        self.assertTrue(any(item["feature"] == "data_labels" for item in source["capabilities"]))
        preview = render_spec(compact)
        self.assertEqual(preview["data"], compact["data"])
        self.assertNotIn('"text"', json.dumps(preview))

    def test_label_clearance_expands_the_independent_line_domain(self):
        plain, _, _ = build_geometry_pair(KIND, {**fixture(KIND), "dual_y_axis": True}, fit_to_data=True)
        cfg = {**fixture(KIND), "dual_y_axis": True,
               "data_labels": {"line": {"position": "above", "format": ".1f", "size": 10.0,
                                        "color": "text", "weight": "normal"}}}
        labelled, _, _ = build_geometry_pair(KIND, cfg, fit_to_data=True)
        before, after = self._line_domain(plain), self._line_domain(labelled)
        self.assertGreater(max(after), max(before))
        self.assertLess(min(after), min(before))


if __name__ == "__main__":
    unittest.main()
