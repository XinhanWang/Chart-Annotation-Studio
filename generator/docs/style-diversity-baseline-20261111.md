# Style diversity baseline — 2026-11-11

Written before implementation changes. Scope: generation/, style mappings in presentation.py/adapter.py and corresponding tests. Existing dirty worktree preserved; no renderer/font/workflow edits. Original Matplotlib is reference only, not a runtime dependency.

## Sources inspected
- Git HEAD 8b2ca38: vendor/VSR/chart_generation/common.py and gen_*.py.
- history/native-vl-refactor-20261110/000918-157687/vendor/VSR/chart_generation (archived old sampler/renderers).
- Current generation/{styles,core,bars,lines,scatter}.py, presentation.py and adapter.py.
- Actual old line renderer: sampled markevery, title weight/style/location, per-axis tick randomness, sci formatting, grid/spines, and tight-layout tick adaptation. Native pipeline now samples axes directly; do not mistake config-only recovery for pixel identity.

## Checklist before implementation
|Dimension|Original|Current before recovery|Intended action / limits|
|---|---|---|---|
|Base palettes|PALETTES and PALETTE_EXTRAS, profile/count weighted selection|5 replacement palettes|Restore original constants and weights|
|Profile selection|kind and series-count conditional weights|uniform profile selection|Restore exact conditional weights|
|Color modes|direct/expanded/paired/triadic/chromatic/sequential/muted/random; profile and count conditionals, contrast rejection and random tails|categorical, fixed gray or unrelated HLS loop|Port pure color math and original probabilities without Matplotlib|
|Canvas size|family-specific inches, profile scaling; template count adjustments|shared range and coarse count sizing|Restore family/profile canvas distribution; retain readable count-aware fit|
|DPI|180/200/220/240/300 weighted|100/120/150/180/200 uniform|Restore provenance sampling; final raster export scale remains renderer-owned|
|Typography sizes|dense thresholds; profile-specific bounds/scaling|narrow shared sizes and two boosts|Restore all size/padding distributions|
|Font selection|font pool choice|font asset pool choice|Keep current font handling; main agent owns font modules|
|Legend columns|2 series 1/2=.78/.22; 3=.68/.32; 4=.58/.42; >=5 1/2/3=.42/.42/.16; dashboard >=3 .28/.48/.24|2 series forced 1; otherwise 1/2 with duplicate 1|Restore full range and weights|
|Legend placement|profile/count outside probabilities; final anchor reconciliation|generic outside probability|Restore correlated placement/anchor/layout_rect|
|Legend frame/shadow/padding|profile-specific frame and shadow probabilities; all spacing/alpha ranges|shadow always false, generic frame|Restore requested values; shadow is explicitly unsupported by existing VL mapping|
|Grids|family base probability plus profile overrides; alpha/style conditions|generic probability|Restore canvas rules and actual template grid-axis behavior|
|Spines|.84 visible; width .8–1.8, dark +.2|width .8–1.6|Restore sampling; view-border approximation remains|
|Title weight/style/location|per-template categorical weighted choices|mostly missing/defaulted|Restore template-specific choices consumed by existing mapping|
|Marks|template-specific marker/size/dash/opacity/edge/hatch/error/width/rotation|generic choices across templates|Audit and restore style ranges/probabilities without replacing native data families|
|Ticks/scales/aspect/reference lines|renderer-time random choices/adaptation|native explicit sampling|Audit differences; preserve explicit native axes/data safety and expose remaining differences|
|Overrides|native explicit control API|present|Keep API and deterministic local RNG; overrides applied last|

## Important boundaries
Full original data/RNG sequence and Matplotlib tight_layout/automatic tick formatting are not promised. Existing full/compact geometry, visibility, ordering and user changes must survive. Legend shadows, hatch glyphs and plotting-library layout remain renderer differences unless separately implemented and verified.

Archive common equals Git HEAD: True. Original palette count: 30.

## Implemented restoration and verification

- `generation/style_rules.py`: pure RGB port of original constants/functions with an injected local RNG. All 30 base palettes, palette extras, profile/count weighted selection, all eight color modes, random-mode replacement/tails and contrast checks are retained. No import or runtime execution of archived code.
- `generation/template_styles.py`: original family/profile canvas changes and template count/label-dependent figsize/title limits. Original line dash/marker/density/markevery/alpha/width/rotation and scatter marker/count-dependent size/opacity distributions.
- `generation/bars.py`: original bar/group/stack widths, hatch/no-hatch and edge probabilities, uncertainty rates/ranges, error style, per-series border widths and vertical rotation distributions. Actual old barv_1 grid weighting (x,both,y=.68,.22,.10) is retained even though it differs from usual vertical-grid conventions.
- `generation/core.py`: original show-legend rates; title location/weight/style; independent chart font and style font selection. Original renderer tick sampling (including shared scatter x/y draws and default x ticks for lines/grouped vertical bars), family-conditioned bar inversion, scatter aspect (.58 single selected families/.18 multi ring), bar negative-value zero references and line .22 zero-reference rate. Default scales are original linear; explicit native scale/inversion/reference controls remain available.
- Font pool is the original 16 filenames, uniformly selected. Added italic/Demi/BoldItalic faces are renderer resources and do not change sampling weights.
- `presentation.py`: semantic normal/bold requests resolve to actual same-family weights (Bookman Light300/Demi600), and all title/axis/legend text roles point at actual faces. `usermeta.presentation.font_roles` records requested/resolved fields and reasons. No silent synthetic bold/italic.
- `adapter.py`: necessary style-only changes render sampled per-series bar stroke widths and original .45 bar/.35 line reference opacity.
- `generation.GENERATOR_VERSION = vega-lite-native/1.1`. Existing workflow code was not edited. Regression verifies a saved 1.0 sample/run cannot resume or be relabeled, original bytes remain intact, and prepare-only reproject preserves old config and version without resampling.

### Evidence on the remote machine

Root: `runs/style-diversity-20261111/` (distinct from main agent's production directory).

- `before-configs.json` and `before-source-hashes.json` captured before implementation edits.
- `canvas-oracle.json`: initial 2,220 exact full-dictionary comparisons against archived original functions using real matplotlib.colors 3.10.1: zero differences. Matplotlib was used only in this one-off reference audit, not added to requirements or production code.
- `tests/fixtures/style-canvas-vsr-8b2ca38.json`: expanded frozen reference, 2,460 canvas digests plus 2,400 profile choices. Digests cover every sampled canvas field; font paths normalized to basename for portability. Standard tests require neither Matplotlib nor history/. `tests/fixtures/native-1.0-barv-1.json` preserves a real pre-change config.
- `related-tests-final.txt`: relevant style/native/adapter/presentation/single-point/workflow tests. Use parent `.runtime/node` (v24.11.0); default `/usr/local/bin/node` is v16.14.0 and cannot load Vega-Lite (`structuredClone` absent). Earlier log errors are this environment issue; see corrected final log.
- `real-render/report.json` and 18 `.svg` files: actual Vega/Vega-Lite compile/run/SVG output over all nine templates and different profiles, zero compile warnings. These are style-focused renders, not the main 450-sample PNG/font embedding integration acceptance.
- `font-role-matrix.json`: 16 original sampled files x 4 requested weight/style combinations. All non-Noto families now have real requested style variants; Noto Mono requests for bold/italic explicitly resolve to the available real 400/normal face and are audited.
- `sampling-comparison.json`: nine templates x seeds 0..49, before/after marginal sampling comparison. Observed palettes 5→30; color modes 2→8; 3-column legends 0→27; requested shadows 0→16; title-size range 11–22→9–25. This is a 450-config sampling audit, not a render acceptance rate or a paired identical-data comparison.

### Remaining differences and limits

1. Noto Mono has no real bold/italic variants in the assets. Those requests remain sampled, but rendering resolves to its real normal400 face with explicit audit. The other original families have matching real normal/italic and light/regular/bold/demi variants.
2. Legend shadows are sampled with original probabilities but the existing Vega-Lite mapping explicitly reports `legend_shadow=not_supported`. Legend handles, frame corner shape, automatic “best” placement and outside relocation are existing approximations. Column count is preserved, but Matplotlib/Vega column fill order is not guaranteed identical.
3. Hatch overlays, dash lengths, tick-label formatting, scientific offsets, data limits and equal-aspect layout use the native renderer contract. Matplotlib tight_layout, line tick thinning and scatter_n fixed subplot margins are not copied. All categorical labels remain visible by design. Native text-layout fitting can change the initially sampled rotation/font size to prevent clipping.
4. Source DPI is sampled as before (including scatter_n=120), while final PNG export size/scale is owned by the pipeline. Figure inches are mapped to Vega points and plot fitting; pixel-identical geometry is not claimed.
5. Native data-family equations, count distributions, labels, uncertainty RNG implementation and point generation are retained. Restored style rules consume different RNG draws, so matching seed numbers do not imply identical data. Generator 1.1 explicitly distinguishes this change. Original process-global NumPy/random and render-time RNG sequences are not replayed.
6. Fixed per-point and per-series mark styles use the original ranges/probabilities, but error magnitudes are sampled through the native NumPy RNG rather than old per-value Python random calls. This changes RNG correlation/sequence without changing the documented conditional ranges.
7. Explicit style overrides remain authoritative after original template adjustments. Existing user modifications were not reverted. Font/render/bootstrap/workflow modules were owned by the main/font agents and were not edited by the style worker.
