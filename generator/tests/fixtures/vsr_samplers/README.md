# Official VSR sampler regression fixtures

Baseline: InternLM/VSR `1fd040346add205ffbada9748273cad3bc9159e5`.
Original archive SHA-256: `947bb42ebf8f7d6b4c2be342e961479c2c2c63a59ae01f71dfba3410bf1fe112`.

- `official_sources.json.gz`: nine unmodified complete official generator source files, official common.py, source/function hashes, function line ranges, independently computed closure inventory. These are test data, not production runtime modules.
- `materials.json`: fixed 24-word resource and official ordered 16-font pool with synthetic paths. Only source asset loading is replaced during reference generation.
- `frozen_samples.json.gz`: 1188 complete official sample_config results, official canvas arguments/value and RNG boundary, final Python/NumPy RNG digest, family/mode coverage. Each kind uses seeds 0..127, 20261111, 2**32-1, 2**32, 2**40+11.
- `freeze_reference.py`: standalone, offline reference regeneration. Compiles original official generator definitions and reachable common functions, never executes original imports/asset I/O, never renders. The reference does not call transplanted functions.

## Verification

From the checkout root:

```text
python3 -B -m unittest discover -s tests -p test_vsr_sampler_sources.py -v
```

Normal tests use the recorded canvas boundary instead of executing Matplotlib color helpers. Numeric/text common functions execute their actual frozen official source. Before/after/final RNG hashes make draw order part of the contract. The production sampler bodies are not recompiled; they are imported normally and rebound with types.FunctionType, as the main runtime does.

To reproduce the golden file with Python 3.10.12 / NumPy 2.2.5 and Matplotlib available for color calculations only:

```text
python3 -B tests/fixtures/vsr_samplers/freeze_reference.py
```

This regeneration was executed and produced identical compressed bytes. Matplotlib is not needed to import samplers or run their regression tests.

## Fixed hashes

The test file pins these digests before parsing:

- `official_sources.json.gz`: `26fb8aa323c085eeb48c0a56921d2984b1712015549b05ce2decd43174ff384f`
- `materials.json`: `201b734cf63f59269f67e9631eb85b70dcbd5a1959e85cff6dcca2b344765296`
- `frozen_samples.json.gz`: `de539f6a65f0bac27dd3da013cd46268190f0736b9afb7ad62ae35ba34ed26c3`

The current repository rule `/tests/fixtures/*` ignores this directory. The main agent must explicitly include these files when collecting the change; no repository .gitignore change is made by the sampler task.
