# VSR text and pure math restoration (2026-11-11)

## Baseline inventory - recorded before implementation

- Recorded UTC: 2026-11-11T07:45:26.955296+00:00.
- Remote root: `/mnt/shared-storage-user/mineru2-shared/users/wangxinhan/proj/data_generation/vsr_v1`.
- HEAD: `b92f317a344fa9c6b0906972bf3678a2b5979321`; worktree status before this document: `clean`.
- Official revision: `1fd040346add205ffbada9748273cad3bc9159e5`.
- `vsr-source.tar.gz` SHA-256: `947bb42ebf8f7d6b4c2be342e961479c2c2c63a59ae01f71dfba3410bf1fe112`.
- `chart_generation/common.py`: 60082 bytes; SHA-256 `344fed1da3e148823c2bb5b7c115c2f4ad1210c4038baa88d77943b16dfeb624`.
- Verified byte equality with `git show 8b2ca381c33f5e52506c442c1c5a8c9e49f45a94:vendor/VSR/chart_generation/common.py`.
- `chart_generation/words.txt`: 4862985 bytes, 466550 lines; SHA-256 `39a4ead879cc8283de87f2ec58e7b4b340d6caa724db1b52a91dccf2f273c5e7`.
- Default word filtering: strip each line; retain `0 < len(word) <= max_length` (default 12); 392136 retained entries. Preserve ordering and multiplicities. Do not deduplicate; custom duplicate entries retain repeated sampling mass.
- Restore literal MONTHS (12), QUARTERS (4), SERIES_TAGS (12), UNITS (18), and local loader constants/cache. Existing palette/style constants remain owned by style_rules.
- sample_label has all 13 branches with raw relative weights `[.19,.16,.09,.08,.09,.13,.06,.07,.07,.05,.04,.02,.05]` (sum 1.10, retain as written).
- Preserve all 12 series-name candidates and eager evaluation of candidate words; preserve title families for scatter/line/bar/default and their nested weights.
- Preserve 25 x-axis and 25 y-axis options (including repeated `Score`), 12% omitted axis titles, and 35% scatter/bar y-unit overrides.
- Preserve randomized rounding steps, conditional 80% integer conversion and exact random draw order; padded_limits filters None/float NaN, uses random uniform margins and supports zero/symmetry.
- Four main output paths below did not exist at baseline; only this document is written in this step.

### Original callable inventory

| Callable | Original common.py lines |
| --- | --- |
| `resolve_existing(candidates: Iterable[Path])` | 379-383 |
| `load_words(path: Path | None=None, max_length: int=12)` | 403-413 |
| `choose_weighted(items: list, weights: list[float])` | 488-489 |
| `human_round(value: float)` | 850-872 |
| `sample_word()` | 875-877 |
| `sample_phrase(min_words: int=1, max_words: int=3)` | 880-882 |
| `sample_label(kind: str | None=None)` | 885-933 |
| `sample_series_name(index: int)` | 936-951 |
| `sample_title(chart_kind: str | None=None)` | 954-994 |
| `sample_axis_title(axis: str, chart_kind: str)` | 997-1064 |
| `padded_limits(values: Iterable[float], include_zero: bool=False, symmetric: bool=False, pad: tuple[float, float]=(0.06, 0.15))` | 1452-1480 |
| `series_color(series_colors: list[str], index: int)` | 1483-1486 |
| `maybe_int_or_float(value: float)` | 1489-1492 |

### Existing generation files - read-only baseline SHA-256

These hashes identify the starting state. Concurrent main-agent edits are separate from this scoped restoration.

| Path | SHA-256 |
| --- | --- |
| `generation/__init__.py` | `2dfc3b325599d01ad8527927a63069c130c016d96acc3f9b88888902305a8aaf` |
| `generation/bars.py` | `eb9e530d7449931ce451607381b581a14ec8033c97a354c116f9e4d0052b8ca2` |
| `generation/common.py` | `eaf3f5ed03962095396898a7611b47ed9a49859aa6d1b75a78e34a4f6d6a3504` |
| `generation/controls.py` | `2be749fa98f7c7586f0ff459acc2649923b9a5730592651415dbc593e8bb4014` |
| `generation/core.py` | `ad42018fa38906defa15040ac8516f8fc3d1a6e0eb521079db604bc068803a5a` |
| `generation/labels.py` | `c4b97201dbeb446e88012982d4d261af2957f5040772154af1697770e1a928dd` |
| `generation/lines.py` | `b0b161389b5156319ed6919c6ef52fa846b076037bbcca77d6afd4e10fdd4e7e` |
| `generation/scatter.py` | `ebe7d84ce882813da25ae6bdb66fff7d41cbbce924df44806761da43a7e505ba` |
| `generation/style_rules.py` | `7413f619206da1048e54071b9d4cd7427b27729e034510c2669cc347d07ab4fc` |
| `generation/styles.py` | `c7ce63c723206146c9abd276794c8604c91a2229f0dcc0e53c49aeb37a21601d` |
| `generation/template_styles.py` | `b0e5f28cad297f39f5a6e3e0c7eb947e06fe1e625c742d119069ee0fc21e34c0` |

## Authorized output inventory

- `generation/vsr_text.py`
- `generation/words.txt`
- `tests/test_vsr_text.py`
- Dedicated `tests/vsr_text_fixtures.py` reference fixture
- `docs/vsr-text-restoration-20261111.md`

No edits to existing labels/core/common/style_rules, style sampling, font-face resolution, or runtime integration. The main agent owns integration with the existing style_rules.sample_canvas wrapper and real font-face resolution.

## Validation

Completed on the remote checkout with Python 3.10.12.

```text
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_vsr_text.py -v
Ran 13 tests in 3.406s
OK
```

- 858 pinned original-output cases verify values, return types and post-call Python RNG state, covering all 13 label branches plus fallback, all title families, axes, phrases, series indices, rounding magnitude/sign boundaries, limits and color wraparound.
- Six original 10000-draw histograms verify exact branch counts, complete-output SHA-256 and final RNG state. Raw/nested weight lists remain exact, including the 1.10 total for labels.
- Boundary tests check the 0.12 omission threshold, 0.35 y-unit overrides, repeated `Score` candidate probability, eager seven-word/12-candidate series-name pool, randomized rounding steps and conditional 0.8 draw behavior.
- Original words SHA-256/bytes/order match; full max_length filters checked at 0, 1, 4, 12, 24, 1000, plus custom duplicates, whitespace, case and long entries. No truncation or deduplication.
- Actual `generation.vsr_runtime._bind` is exercised with sampler-owned __file__ and ROOT, per-sample Random and NumpySource. It retains module-bound load_words and matches an original title output and RNG state.
- Interleaved/concurrent namespaces reproduce separate sequential results, without mutating process-global Python/NumPy RNG states.
- A fresh Python subprocess imports and calls the module with Matplotlib/vendor/history/network-client imports forbidden. Offline urllib.parse is allowed because pathlib itself uses it; urllib.request/http.client/socket remain forbidden.
- Live comparison with the official archive confirms all 13 selected function source segments are identical and words.txt is byte-identical. The only callable decoration is the outer local lru_cache on load_words; its signature and body remain original.
- All five final scoped files were checked with `git diff --no-index --check /dev/null <file>`: no whitespace diagnostics (exit 1 means these new files differ from /dev/null). Both Python files compile without producing pycache.
- Baseline recheck: 11 existing generation files; paths changed by concurrent work since baseline: `['generation/__init__.py', 'generation/core.py']`. This task made no writes to those paths.


## Import and integration contract

```python
from generation import vsr_text

words = vsr_text.load_words()  # complete original words.txt, max_length=12
label = vsr_text.sample_label(kind=None)
title = vsr_text.sample_title(chart_kind="line")
axis_title = vsr_text.sample_axis_title(axis="y", chart_kind="scatter")
```

Normal imports use the standard-library random module. Production keeps main's per-sample FunctionType rebinding: share ONE globals dictionary across all rebound pure functions, assign `random=Random(seed)` and `np=NumpySource(seed)`, and rebind dependencies as well as entry points. No RNG argument is added. All original callable signatures are listed in the baseline inventory above.

`load_words(path: Path | None = None, max_length: int = 12)` has an outer `functools.lru_cache(maxsize=None)`, so main's binder leaves it module-bound. Its original internal `_WORDS_CACHE` remains intact. `ROOT = BASE_DIR = Path(__file__).resolve().parent`, `WORD_FILE = ROOT / "words.txt"`, and `WORDS_CANDIDATES = [WORD_FILE]` are evaluated once at import. No function body resolves __file__. An injected load_words closure is supported. Cached lists retain the original mutable-list API.

Public text constants: MONTHS, QUARTERS, SERIES_TAGS, UNITS, with original list types/order/multiplicity. Local word-path/cache support: ROOT, BASE_DIR, WORD_FILE, WORDS_CANDIDATES, _WORDS_CACHE. No palette or style sampler is moved into this module. Main retains style_rules.sample_canvas and real font-face resolution.

## Scoped file inventory and provenance

| Path | Role | SHA-256 |
| --- | --- | --- |
| `generation/vsr_text.py` | 13 original functions, constants and offline cached loader | `2a0c5e49d565717feb38bf9a3303c5bdb208c7efeac87616fb11713dc206e80c` |
| `generation/words.txt` | Unmodified complete original word file | `39a4ead879cc8283de87f2ec58e7b4b340d6caa724db1b52a91dccf2f273c5e7` |
| `tests/test_vsr_text.py` | 13 behavior/probability/binding tests | `29651ec85a34aa57b719b8e8c3e5fdaa20e4af382d6cf808b737cef6da4d25f3` |
| `tests/vsr_text_fixtures.py` | Official source excerpt, 858 outputs and 6 original probability/output histograms | `98355e3dee3c3e7d7fb61cfe32a8fc71c469a586f213ab2ca460e7596e59ce4b` |

This document is the fifth scoped deliverable. This task performed no commit, push, existing-source edit, style/font change or main integration.

The dedicated tests/vsr_text_fixtures.py stores the exact selected source and JSON oracle as string constants. Existing /tests/* and /tests/fixtures/* allowlists hide data files/directories, while tests/*.py is allowed. No .gitignore edit or force staging is required.
