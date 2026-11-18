# VSR numeric sampler restoration - 2026-11-11

## Pre-edit comparison checklist

Written before creating or modifying any sampler module. Scope: only generation/vsr_samplers/, tests/test_vsr_sampler_sources.py, related fixtures, and this document. Core/common/labels/adapter/render are owned by the main agent.

- [x] Read web-access skill; main agent already checked dependencies. SSH connected to the requested live checkout.
- [x] Lock official baseline: VSR-1fd040346add205ffbada9748273cad3bc9159e5.
- [x] Archive SHA-256: `947bb42ebf8f7d6b4c2be342e961479c2c2c63a59ae01f71dfba3410bf1fe112`.
- [x] Resolve functions using final top-level definition, then walk referenced globals recursively (including nested functions and comprehensions). The official nine files currently contain no duplicate top-level function names; stack final implementations are at lines 260/400/418/482.
- [x] Preserve every reachable function as an exact original source slice and identical AST.
- [x] Copy required literal constants; do not load WORDS/FONT_POOL or import common.
- [x] Preserve number/series/family probabilities, scales, formulas, ordering, errors, and inter-series dependencies.
- [x] Verify against frozen reference samples from official source with isolated random.Random / numpy.random.RandomState.
- [x] Verify normal import without Matplotlib/vendor/history/filesystem reads.

## Source-to-module comparison

| Official chart_generation source | Static destination | Reachable functions | Source SHA-256 |
|---|---|---:|---|
| `gen_barh_1.py` | `generation/vsr_samplers/barh_1.py` | 18 | `0fb833ed778703dfa3de55581fc0c57fbc69e151def5feeadc212010a15959f0` |
| `gen_barh_n.py` | `generation/vsr_samplers/barh_n.py` | 9 | `f167b3b89f95b7df3cf4d013cbeae6d894a45538f805361c3e3f059faf6a1bf2` |
| `gen_barv_1.py` | `generation/vsr_samplers/barv_1.py` | 18 | `b5481f0a9376f034c5d4031f51c3eaf91c1daa23b16995fc9c457322aac94f3d` |
| `gen_barv_n.py` | `generation/vsr_samplers/barv_n.py` | 9 | `71e41551a97cd9b158c5697e328e3c77d9561b733b3f353ff8e15d74e61b1155` |
| `gen_barv_stack.py` | `generation/vsr_samplers/barv_stack.py` | 10 | `a35dc73372bcc168f48bf7c702cc74ca6175367e46fe1f8bddb3d0d86b0445d1` |
| `gen_line_1.py` | `generation/vsr_samplers/line_1.py` | 12 | `42bb8900df915a9b0c5dc47187304f2a2d866e75b171812dfeea3f5960f845a6` |
| `gen_line_n.py` | `generation/vsr_samplers/line_n.py` | 12 | `fa3125012c1d32abf74218949deaa48dc4284a6f29b0bafc0ffb84289bb6b36d` |
| `gen_scatter_1.py` | `generation/vsr_samplers/scatter_1.py` | 25 | `9ec180e2d89b884c6431d70ca64512581cf423df55e31eb9bb996ecc121eac08` |
| `gen_scatter_n.py` | `generation/vsr_samplers/scatter_n.py` | 28 | `c365bdee270b13917d33ed319c54ec39d0ee2ab580bed29a37bbedbd80d4fc0b` |

### gen_barh_1.py

Functions: `arrange_items` (293-332), `finalize_values` (83-91), `generate_family_values` (265-290), `make_alternating` (203-216), `make_balanced` (94-102), `make_bimodal` (219-226), `make_clustered` (180-200), `make_heavy_tail` (105-113), `make_log_spread` (166-177), `make_ordered` (116-127), `make_plateau` (252-262), `make_signed_mix` (130-144), `make_sparse` (147-163), `make_staircase` (229-249), `sample_category_count` (54-59), `sample_category_label` (62-73), `sample_config` (335-405), `sample_scale` (76-80).

Original non-builtin globals outside local functions/random/numpy: `FONT_POOL`, `choose_weighted`, `human_round`, `maybe_int_or_float`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_label`, `sample_series_name`, `sample_title`, `series_color`.

### gen_barh_n.py

Functions: `base_curve` (92-130), `finalize_matrix` (380-391), `generate_matrix` (133-268), `reorder_categories` (271-304), `sample_category_count` (54-59), `sample_category_label` (66-71), `sample_config` (307-377), `sample_scale` (74-78), `sample_series_count` (62-63).

Original non-builtin globals outside local functions/random/numpy: `FONT_POOL`, `choose_weighted`, `human_round`, `maybe_int_or_float`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_label`, `sample_series_name`, `sample_title`, `series_color`.

### gen_barv_1.py

Functions: `arrange_items` (293-332), `finalize_values` (83-91), `generate_family_values` (265-290), `make_alternating` (203-216), `make_balanced` (94-102), `make_bimodal` (219-226), `make_clustered` (180-200), `make_heavy_tail` (105-113), `make_log_spread` (166-177), `make_ordered` (116-127), `make_plateau` (252-262), `make_signed_mix` (130-144), `make_sparse` (147-163), `make_staircase` (229-249), `sample_category_count` (54-59), `sample_category_label` (62-73), `sample_config` (335-405), `sample_scale` (76-80).

Original non-builtin globals outside local functions/random/numpy: `FONT_POOL`, `choose_weighted`, `human_round`, `maybe_int_or_float`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_label`, `sample_series_name`, `sample_title`, `series_color`.

### gen_barv_n.py

Functions: `base_curve` (92-130), `finalize_matrix` (388-399), `generate_matrix` (133-268), `reorder_categories` (271-304), `sample_category_count` (54-59), `sample_category_label` (66-71), `sample_config` (307-385), `sample_scale` (74-78), `sample_series_count` (62-63).

Original non-builtin globals outside local functions/random/numpy: `FONT_POOL`, `choose_weighted`, `human_round`, `maybe_int_or_float`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_label`, `sample_series_name`, `sample_title`, `series_color`.

### gen_barv_stack.py

Functions: `base_curve` (92-130), `finalize_matrix` (482-493), `generate_stack_matrix` (260-397), `reorder_stack_categories` (400-415), `sample_category_count` (54-59), `sample_category_label` (66-71), `sample_config` (418-479), `sample_scale` (74-78), `sample_stack_family` (249-253), `sample_stack_mode` (256-257).

Original non-builtin globals outside local functions/random/numpy: `FONT_POOL`, `choose_weighted`, `human_round`, `maybe_int_or_float`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_label`, `sample_series_name`, `sample_title`, `series_color`.

### gen_line_1.py

Functions: `_thin_ticks` (169-176), `build_x_axis` (102-166), `finalize_series` (88-99), `finalize_x_numeric` (484-492), `generate_matrix` (357-481), `make_base_curve` (263-354), `sample_config` (495-592), `sample_family` (74-78), `sample_point_count` (58-63), `sample_scale` (81-85), `sample_series_count` (66-67), `sample_x_mode` (70-71).

Original non-builtin globals outside local functions/random/numpy: `FONT_POOL`, `MONTHS`, `choose_weighted`, `human_round`, `maybe_int_or_float`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_label`, `sample_series_name`, `sample_title`, `series_color`.

### gen_line_n.py

Functions: `_thin_ticks` (169-176), `build_x_axis` (102-166), `finalize_series` (88-99), `finalize_x_numeric` (492-500), `generate_matrix` (365-489), `make_base_curve` (263-362), `sample_config` (503-599), `sample_family` (74-78), `sample_point_count` (58-63), `sample_scale` (81-85), `sample_series_count` (66-67), `sample_x_mode` (70-71).

Original non-builtin globals outside local functions/random/numpy: `FONT_POOL`, `MONTHS`, `choose_weighted`, `human_round`, `maybe_int_or_float`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_label`, `sample_series_name`, `sample_title`, `series_color`.

### gen_scatter_1.py

Functions: `allocate_counts` (225-238), `build_points` (561-594), `finalize_values` (214-222), `make_bimodal` (315-338), `make_bridge` (522-541), `make_clustered` (249-279), `make_correlated` (381-390), `make_crescent` (486-496), `make_curved` (393-408), `make_fan` (341-353), `make_grid` (499-519), `make_heteroskedastic` (426-433), `make_hourglass` (544-558), `make_multi_cluster` (282-312), `make_outliers` (457-468), `make_ring` (411-423), `make_spiral` (471-483), `make_stepwise` (356-378), `make_stripe` (436-454), `rotated_covariance` (241-246), `sample_config` (597-652), `sample_family` (184-188), `sample_marker` (198-211), `sample_point_count` (178-181), `sample_scale` (191-195).

Original non-builtin globals outside local functions/random/numpy: `DEFAULT_SCATTER_POINT_BANDS`, `FONT_POOL`, `SCATTER_POINT_BANDS`, `choose_weighted`, `human_round`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_series_name`, `sample_title`, `series_color`.

### gen_scatter_n.py

Functions: `allocate_counts` (222-235), `build_points` (558-591), `family_pool` (598-616), `finalize_values` (211-219), `make_bimodal` (312-335), `make_bridge` (519-538), `make_clustered` (246-276), `make_correlated` (378-387), `make_crescent` (483-493), `make_curved` (390-405), `make_fan` (338-350), `make_grid` (496-516), `make_heteroskedastic` (423-430), `make_hourglass` (541-555), `make_multi_cluster` (279-309), `make_outliers` (454-465), `make_ring` (408-420), `make_spiral` (468-480), `make_stepwise` (353-375), `make_stripe` (433-451), `rotated_covariance` (238-243), `sample_config` (640-742), `sample_family` (181-185), `sample_marker` (195-208), `sample_point_count` (175-178), `sample_scale` (188-192), `sample_series_count` (594-595), `transform_series_points` (619-637).

Original non-builtin globals outside local functions/random/numpy: `DEFAULT_SCATTER_POINT_BANDS`, `FONT_POOL`, `SCATTER_POINT_BANDS`, `choose_weighted`, `human_round`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_series_name`, `sample_title`, `series_color`.

## Handoff contract

Import `generation.vsr_samplers.<kind>`; call the unchanged zero-argument `sample_config() -> dict` after namespace binding. Each module exports SAMPLER_FUNCTIONS, SAMPLER_CONSTANTS, COMMON_FUNCTIONS, INJECTED_GLOBALS and __all__. Rebind every sampler and shared common function with types.FunctionType into the same per-sample namespace; supply independent random.Random and a numpy proxy whose random is numpy.random.RandomState. Inject WORDS and FONT_POOL; there are no module loaders or common imports. MONTHS and scatter count-band tables are static constants. No controls or core integration is implemented here.

## Validation status

Completed: all 141 functions have identical original source slices and AST; all six focused tests passed; 1188 frozen official samples match complete configs and final RNG states.

## Interface alignment with main agent

Main runtime imports `.vsr_samplers.` + kind (without `gen_`). The namespace merge/rebinding and the final injected `sample_canvas`, RNGs, WORDS/FONT_POOL and controls belong to generation/vsr_runtime.py. Every function is defined by its normal source module, without factories or dynamically compiled production functions. Static module import executes no sample_config.

## Completed files

All paths below are relative to `/mnt/shared-storage-user/mineru2-shared/users/wangxinhan/proj/data_generation/vsr_v1` on `h.pjlab.org.cn`.

- `generation/vsr_samplers/__init__.py`
- `generation/vsr_samplers/barh_1.py`
- `generation/vsr_samplers/barh_n.py`
- `generation/vsr_samplers/barv_1.py`
- `generation/vsr_samplers/barv_n.py`
- `generation/vsr_samplers/barv_stack.py`
- `generation/vsr_samplers/line_1.py`
- `generation/vsr_samplers/line_n.py`
- `generation/vsr_samplers/scatter_1.py`
- `generation/vsr_samplers/scatter_n.py`
- `tests/test_vsr_sampler_sources.py`
- `tests/fixtures/vsr_samplers/{official_sources.json.gz,materials.json,frozen_samples.json.gz,freeze_reference.py,README.md}`
- `docs/vsr-numeric-restoration-20261111.md`

## Validation evidence

Executed on the requested live remote checkout, Python 3.10.12 / NumPy 2.2.5:

```text
python3 -B -m unittest discover -s tests -p test_vsr_sampler_sources.py -v -f
Ran 6 tests in 6.416s
OK
```

1. Exact original source slice and AST equality for 141 reachable functions, each function hash pinned to the frozen official source; closure recursively accounts for nested functions, lambdas and comprehensions. Copied constant values match official source. Every normal imported function has its actual module __module__.
2. Duplicate-definition semantics tested with an intentionally shadowed helper. The official nine source files contain no duplicate top-level function names. In stack, unused inherited sample_series_count/generate_matrix paths are excluded; sample_config's direct weighted [2,3,4,5,6] series choice remains untouched.
3. All nine modules import with Matplotlib/vendor/history/common blocked, asset reads blocked, no WORDS/FONT_POOL attributes loaded, and no process-global Python/NumPy RNG changes. Top-level code is restricted to literal assignments, docstrings, future/random/numpy imports and function definitions.
4. 1188 independently frozen official sample configs match all keys and numeric values (no tolerance or formula replacement), plus final isolated Python/NumPy RNG digests. Coverage includes every source family, categorical/temporal/numeric line modes, absolute/percent stacks including six series, error on/off, mixed local scatter families and count redistribution.
5. Regeneration via `python3 -B tests/fixtures/vsr_samplers/freeze_reference.py` produced byte-identical compressed golden data: `de539f6a65f0bac27dd3da013cd46268190f0736b9afb7ad62ae35ba34ed26c3`.
6. Main agent's current `generation.vsr_runtime.parameter_namespace(kind, 20261111)` was unpacked as `(namespace, random_source)` and `namespace['sample_config']()` was executed successfully for all nine kinds. This is a bridge smoke check, not a rendered/core/controls acceptance test.

## Necessary differences and evidence boundary

- Sampling function bodies, parameters, defaults, helper names, probabilities, counts, scales, family logic, category ordering, errors, and series association formulas have **zero changes**. Original human_round and numeric tick behavior are retained as source behavior; no audit-driven corrections are slipped into sampling.
- Original generator import/asset initialization, paths, environment variables, multiprocessing, rendering, metadata collection, I/O and CLI sections are omitted. Only the sample_config-reachable local function closure is transplanted. The future annotation import and plain random/numpy imports are retained; metadata/export tuples are added.
- Original MONTHS imported from common is copied as a literal into each line module. Both scatter modules copy their own complete SCATTER_POINT_BANDS and DEFAULT_SCATTER_POINT_BANDS source statements.
- Runtime shared numeric/text functions, pure sample_canvas, WORDS, FONT_POOL, independent RNGs, explicit controls and orchestration remain the main agent's responsibility. Rebind all common and sampler functions into the same namespace and inject RNG objects after merging vars(module), since each static module normally imports random/numpy.
- Golden references execute actual official common numeric/text/canvas functions. Only load_words/load_font_pool/resolve_existing are replaced by immutable fixture materials; official font ordering is preserved. Tests replay the original canvas return value plus RNG boundary so they have no Matplotlib dependency. Production canvas/style substitution is outside this transplant equivalence claim.
- Python/NumPy versions and fixed resources are part of the frozen-reference protocol. The focused tests verify sampler equivalence, not image rendering, label fidelity, current style equivalence or core controls.
- First test attempt exposed a test-bridge ordering mistake (vars(module) overwrote local RNGs); the test bridge was corrected to reinject RNGs. No sampler function changed. The first live bridge probe assumed a dict return; it was corrected to unpack the actual (namespace, random_source) interface before the successful nine-kind check.

## Dependency and collection handoff

Module imports require Python and NumPy only. Before calling sample_config, the main runtime supplies `random`, `np`, `FONT_POOL`, `WORDS`, `choose_weighted`, `human_round`, `padded_limits`, `sample_axis_title`, `sample_canvas`, `sample_series_name`, `sample_title`, `series_color`, plus `maybe_int_or_float` and `sample_label` for bar/line templates. No unresolved dependency was found in the nine-kind live bridge check.

Exported names: `sample_config()` and every name in `SAMPLER_FUNCTIONS`; static data listed in `SAMPLER_CONSTANTS`; metadata `COMMON_FUNCTIONS`, `INJECTED_GLOBALS`, `SOURCE_REVISION`, `SOURCE_FILE`, and `__all__`. Import path is `generation.vsr_samplers.<kind>`.

`git check-ignore -v` confirms `/tests/fixtures/*` ignores the related fixture directory. Files exist and were tested in place; the main agent must explicitly include `tests/fixtures/vsr_samplers/` when collecting the change. This task does not change .gitignore or stage/commit other agents' work.
