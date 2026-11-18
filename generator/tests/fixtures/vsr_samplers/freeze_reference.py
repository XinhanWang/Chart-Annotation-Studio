"""Regenerate frozen official VSR samples (reference creation only).

Run with Python 3.10.12, NumPy 2.2.5, and Matplotlib's colors implementation.
Normal tests and production samplers never import Matplotlib. This script does
not render, access the network, import vendor/history, or read live font assets.
"""
from pathlib import Path
import ast
import colorsys
import copy
import gzip
import json
import platform
import sys

import numpy as np
from matplotlib import colors as mcolors

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import test_vsr_sampler_sources as t


def freeze():
    fixture = t.official_sources()
    cases, coverage = [], {}
    seeds = list(range(128)) + [20261111, 2**32 - 1, 2**32, 2**40 + 11]
    for kind in fixture["modules"]:
        definitions = t.final_definitions(fixture["original_sources"][kind])
        family_function = definitions.get("sample_stack_family") or definitions.get("sample_family") or definitions["sample_config"]
        family_call = next(node for node in ast.walk(family_function)
                           if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                           and node.func.id == "choose_weighted")
        expected = sorted(ast.literal_eval(family_call.args[0]))
        for seed in seeds:
            namespace = t.reference_namespace(kind, seed, include_canvas=True)
            namespace.update(colorsys=colorsys, mcolors=mcolors)
            original_canvas = namespace["sample_canvas"]
            boundary = {}

            def capture_canvas(*args, **kwargs):
                boundary.update(arguments=t.plain([args, kwargs]), before_rng_sha256=t.rng_digest(namespace))
                result = original_canvas(*args, **kwargs)
                boundary.update(after_python_state=t.plain(namespace["random"].getstate()),
                                after_rng_sha256=t.rng_digest(namespace), result=t.plain(copy.deepcopy(result)))
                return result

            namespace["sample_canvas"] = capture_canvas
            config = namespace["sample_config"]()
            cases.append({"kind": kind, "seed": seed, "canvas": boundary,
                          "config": t.plain(config), "final_rng_sha256": t.rng_digest(namespace)})
        observed = sorted({case["config"]["family"] for case in cases if case["kind"] == kind})
        assert observed == expected, (kind, expected, observed)
        coverage[kind] = {"expected_families": expected, "observed_families": observed, "cases": len(seeds)}
    result = {
        "revision": fixture["revision"], "archive_sha256": fixture["archive_sha256"],
        "method": "Official generator functions and official common functions, per-sample random.Random and numpy.random.RandomState; only load_words/load_font_pool/resolve_existing replaced with frozen resource values. Official canvas return and Python RNG boundary recorded for no-Matplotlib test replay.",
        "python": platform.python_version(), "numpy": np.__version__, "cases": cases, "coverage": coverage,
    }
    output = Path(__file__).with_name("frozen_samples.json.gz")
    encoded = (json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()
    output.write_bytes(gzip.compress(encoded, mtime=0))
    print(f"Frozen {len(cases)} official samples to {output}")


if __name__ == "__main__":
    freeze()
