"""Pinned official VSR outputs, probability laws and sample-local binding checks.

The reference excerpt and golden outputs were extracted/executed from the
1fd0403 official archive before importing this implementation. Tests do not
read vendor, history or the source archive and need no rendering/network.
"""
from __future__ import annotations

import ast
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import inspect
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import types
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from generation import vsr_text as text

sys.path.insert(0, str(ROOT / "tests"))
from vsr_text_fixtures import REFERENCE_SOURCE, ORACLE_JSON
FUNCTIONS = (
    "resolve_existing", "load_words", "choose_weighted", "human_round",
    "sample_word", "sample_phrase", "sample_label", "sample_series_name",
    "sample_title", "sample_axis_title", "padded_limits", "series_color",
    "maybe_int_or_float",
)


def state_hash(rng):
    return hashlib.sha256(json.dumps(rng.getstate(), separators=(",", ":")).encode()).hexdigest()


def unpack(value):
    if isinstance(value, dict) and "float" in value:
        return float(value["float"])
    if isinstance(value, list):
        return [unpack(v) for v in value]
    return value


def namespace(seed, rng=None):
    """Match main's FunctionType rebinding, with a sampler-owned __file__."""
    ns = dict(vars(text))
    ns.update(__file__="/unrelated/samplers/barv_1.py", ROOT=Path("/unrelated"),
              random=random.Random(seed) if rng is None else rng,
              FONT_POOL=["/test/fonts/DejaVuSans.ttf"], WORDS=text.load_words())
    # The original functions here use no NumPy, but the mixed namespace does.
    ns["np"] = types.SimpleNamespace(random=np.random.RandomState(seed % (2**32 - 1)))
    for name, value in vars(text).items():
        if isinstance(value, types.FunctionType) and value.__module__ == text.__name__:
            fn = types.FunctionType(value.__code__, ns, name, value.__defaults__, value.__closure__)
            fn.__kwdefaults__ = value.__kwdefaults__
            ns[name] = fn
    return ns


class TraceRandom(random.Random):
    # Override choices only: overriding random() changes Random._randbelow and
    # would corrupt the original choice/randint draw order.
    def choices(self, population, weights=None, *, cum_weights=None, k=1):
        result = super().choices(population, weights=weights, cum_weights=cum_weights, k=k)
        self.choice_calls.append({"items": list(population),
                                  "weights": None if weights is None else list(weights),
                                  "value": result})
        return result


class VSRTextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.oracle = json.loads(ORACLE_JSON)
        cls.reference = REFERENCE_SOURCE

    def test_original_signatures_bodies_and_constants(self):
        reference = ast.parse(self.reference)
        actual_source = Path(text.__file__).read_text(encoding="utf-8")
        actual = ast.parse(actual_source)
        expected_functions = {n.name: n for n in reference.body if isinstance(n, ast.FunctionDef)}
        actual_functions = {n.name: n for n in actual.body if isinstance(n, ast.FunctionDef)}
        self.assertEqual(set(expected_functions), set(FUNCTIONS))
        for name in FUNCTIONS:
            with self.subTest(function=name):
                a, b = expected_functions[name], actual_functions[name]
                self.assertEqual(ast.dump(a.args), ast.dump(b.args))
                self.assertEqual(ast.dump(a.returns) if a.returns is not None else None,
                                 ast.dump(b.returns) if b.returns is not None else None)
                self.assertEqual([ast.dump(n) for n in a.body], [ast.dump(n) for n in b.body])
                # Retain source spelling, candidate order, short-circuiting and
                # eager evaluation, not merely an equivalent list of names.
                self.assertEqual(ast.get_source_segment(self.reference, a),
                                 ast.get_source_segment(actual_source, b))
        for node in reference.body:
            if isinstance(node, ast.Assign):
                self.assertEqual(getattr(text, node.targets[0].id), ast.literal_eval(node.value))
        self.assertEqual(str(inspect.signature(text.choose_weighted)),
                         "(items: 'list', weights: 'list[float]')")
        self.assertEqual(hashlib.sha256(REFERENCE_SOURCE.encode()).hexdigest(),
                         self.oracle["metadata"]["reference_excerpt_sha256"])

    def test_original_word_file_bytes_and_full_filter(self):
        metadata = self.oracle["metadata"]
        raw = text.WORD_FILE.read_bytes()
        self.assertEqual(len(raw), metadata["words_bytes"])
        self.assertEqual(hashlib.sha256(raw).hexdigest(), metadata["words_sha256"])
        lines = raw.decode("utf-8").splitlines()
        self.assertEqual(len(lines), 466550)
        for maximum in (0, 1, 4, 12, 24, 1000):
            with self.subTest(maximum=maximum):
                expected = [v.strip() for v in lines if 0 < len(v.strip()) <= maximum]
                self.assertEqual(text.load_words(max_length=maximum), expected)
        self.assertEqual(len(text.load_words()), 392136)
        self.assertIs(text.load_words(), text.load_words())
        self.assertTrue(callable(text.load_words))
        self.assertFalse(isinstance(text.load_words, types.FunctionType))

    def test_custom_words_keep_order_duplicates_case_and_length(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "words.txt"
            file.write_text("  repeat  \n\nrepeat\nA\nCase\ncase\nlonger-than-12\n", encoding="utf-8")
            self.assertEqual(text.load_words(file), ["repeat", "repeat", "A", "Case", "case"])
            self.assertEqual(text.load_words(file, max_length=4), ["A", "Case", "case"])
            self.assertEqual(text.load_words(file, max_length=0), [])
            ns = namespace(17)
            words = text.load_words(file)
            ns["load_words"] = lambda: words
            expected_rng = random.Random(17)
            self.assertEqual([ns["sample_word"]() for _ in range(1000)],
                             [expected_rng.choice(words) for _ in range(1000)])
            self.assertEqual(words.count("repeat"), 2)

    def test_pinned_outputs_types_and_random_draw_state(self):
        for case in self.oracle["cases"]:
            with self.subTest(case=case["id"]):
                ns = namespace(case["seed"])
                result = ns[case["name"]](*unpack(case["args"]),
                    **{k: unpack(v) for k, v in case["kwargs"].items()})
                self.assertEqual({"type": type(result).__name__, "repr": repr(result)}, case["expected"])
                self.assertEqual(state_hash(ns["random"]), case["random_state_sha256"])

    def test_real_old_probability_counts_outputs_and_raw_weights(self):
        for histogram in self.oracle["histograms"]:
            with self.subTest(function=histogram["name"], args=histogram["args"]):
                rng = TraceRandom(histogram["seed"])
                rng.choice_calls = []
                ns = namespace(histogram["seed"], rng)
                counts = Counter()
                digest = hashlib.sha256()
                contract = histogram["choice_contract"]
                for _ in range(histogram["count"]):
                    rng.choice_calls.clear()
                    value = ns[histogram["name"]](*histogram["args"])
                    root = rng.choice_calls[0]
                    self.assertEqual({k: root[k] for k in ("items", "weights")}, contract)
                    counts[root["value"][0]] += 1
                    digest.update(json.dumps(value, ensure_ascii=False).encode() + b"\n")
                self.assertEqual(dict(counts), histogram["counts"])
                self.assertEqual(digest.hexdigest(), histogram["output_sha256"])
                self.assertEqual(state_hash(rng), histogram["random_state_sha256"])
                total = sum(contract["weights"])
                for item, weight in zip(contract["items"], contract["weights"]):
                    self.assertLess(abs(counts[item] / histogram["count"] - weight / total), 0.02)
                if histogram["name"] == "sample_label":
                    self.assertAlmostEqual(total, 1.10)
                    self.assertEqual(len(counts), 13)

    def test_nested_title_probability_contracts(self):
        seen = {}
        for kind in (None, "scatter", "line", "barv"):
            for seed in range(100):
                rng = TraceRandom(seed)
                rng.choice_calls = []
                namespace(seed, rng)["sample_title"](kind)
                for call in rng.choice_calls:
                    seen[json.dumps(call["items"])] = {k: call[k] for k in ("items", "weights")}
        expected = {json.dumps(c["items"]): c for c in self.oracle["weighted_contracts"]}
        self.assertEqual(seen, expected)

    def test_axis_omission_and_unit_override_probability_boundaries(self):
        class Probe:
            def __init__(self, draws, picked=None):
                self.draws = iter(draws)
                self.pools = []
                self.picked = picked
            def random(self):
                return next(self.draws)
            def choice(self, pool):
                self.pools.append(list(pool))
                return self.picked if self.picked in pool else pool[0]
        for kind in ("scatter", "barv", "line"):
            for axis in ("x", "y"):
                probe = Probe([0.119999])
                ns = namespace(0, probe)
                self.assertIsNone(ns["sample_axis_title"](axis, kind))
                self.assertEqual(probe.pools, [])
        for kind, override in (("scatter", [" (ms)", " (px)", " (dB)", " (%)", ""]),
                               ("barv", [" (k)", " (%)", " (USD)", ""])):
            for probability, expected_calls in ((0.349999, 3), (0.35, 2)):
                probe = Probe([0.12, probability])
                ns = namespace(0, probe)
                ns["sample_axis_title"]("y", kind)
                self.assertEqual(len(probe.pools), expected_calls)
                self.assertEqual(len(probe.pools[0]), 25)
                self.assertEqual(probe.pools[0].count("Score"), 2)
                if expected_calls == 3:
                    self.assertEqual(probe.pools[2], override)
        probe = Probe([0.12])
        namespace(0, probe)["sample_axis_title"]("x", "scatter")
        self.assertEqual(len(probe.pools[0]), 25)
        self.assertEqual(probe.pools[1], text.UNITS)

    def test_series_pool_eager_word_draws_and_all_twelve_candidates(self):
        ns = namespace(0)
        draws = []
        def word():
            draws.append(len(draws))
            return "w" + str(len(draws))
        class LastChoice:
            def choice(self, pool):
                self.pool = pool
                return pool[-1]
        picker = LastChoice()
        ns.update(sample_word=word, random=picker)
        self.assertEqual(ns["sample_series_name"](12), "Layer 13")
        self.assertEqual(len(draws), 7)
        self.assertEqual(picker.pool, ["Series 13", "A", "W1 13", "W2", "W3-W4",
                                       "W5 / W6", "W7_13", "Group 13", "Batch 13", "Run 13",
                                       "Trial 13", "Layer 13"])

    def test_rounding_bands_and_conditional_integer_probability(self):
        class Probe:
            def __init__(self, step, probability):
                self.step, self.probability = step, probability
                self.draws = 0
            def choice(self, pool):
                self.pool = pool
                return self.step
            def random(self):
                self.draws += 1
                return self.probability
        for value, pool in ((1234, [1, 2, 5, 10, 20, 50, 100]),
                            (123, [1, 2, 5, 10]), (12, [0.1, 0.2, 0.5, 1, 2]),
                            (1.2, [0.01, 0.05, 0.1, 0.2, 0.5]),
                            (0.12, [0.001, 0.005, 0.01, 0.02])):
            probe = Probe(pool[0], 0.1)
            namespace(0, probe)["human_round"](value)
            self.assertEqual(probe.pool, pool)
            self.assertEqual(probe.draws, int(pool[0] >= 1))
        for probability, expected_type in ((0.799999, int), (0.8, float)):
            probe = Probe(1, probability)
            ns = namespace(0, probe)
            self.assertIs(type(ns["human_round"](123.4)), int)
            self.assertEqual(probe.draws, 1)
            # Original integral steps already produce ints on BOTH branches;
            # retain the 80% draw even when the resulting type looks the same.
            self.assertIs(type(ns["maybe_int_or_float"](2.0)), expected_type)
        probe = Probe(1, 0.1)
        ns = namespace(0, probe)
        self.assertEqual(ns["human_round"](0), 0)
        self.assertEqual(ns["maybe_int_or_float"](2.5), 2.5)
        self.assertEqual(probe.draws, 0)

    def test_mixed_sampler_globals_keep_word_path_and_global_rngs_safe(self):
        py_state = random.getstate()
        np_state = np.random.get_state()
        ns = namespace(101)
        self.assertEqual(ns["load_words"](), text.load_words())
        self.assertIs(ns["load_words"], text.load_words)
        self.assertEqual(ns["WORD_FILE"], Path(text.__file__).parent / "words.txt")
        self.assertNotEqual(ns["ROOT"], text.ROOT)
        ns["sample_title"]("scatter")
        self.assertEqual(random.getstate(), py_state)
        after = np.random.get_state()
        self.assertEqual(after[0], np_state[0])
        np.testing.assert_array_equal(after[1], np_state[1])
        self.assertEqual(after[2:], np_state[2:])
        self.assertEqual(ns["np"].random.rand(), np.random.RandomState(101).rand())

    def test_real_runtime_bind_preserves_cache_and_callable_contract(self):
        from generation.vsr_runtime import _bind, NumpySource
        ns = dict(vars(text))
        ns.update(random=random.Random(42), np=NumpySource(42),
                  __file__="/samplers/other.py", ROOT=Path("/samplers"))
        _bind(text, ns)
        self.assertIs(ns["load_words"], text.load_words)
        self.assertEqual(ns["load_words"](), text.load_words())
        case = next(c for c in self.oracle["cases"] if c["seed"] == 42 and c["name"] == "sample_title" and c["args"] == ["scatter"])
        result = ns["sample_title"]("scatter")
        self.assertEqual(repr(result), case["expected"]["repr"])
        self.assertEqual(state_hash(ns["random"]), case["random_state_sha256"])

    def test_sample_namespaces_are_independent_interleaved_and_concurrent(self):
        def sequence(seed):
            ns = namespace(seed)
            return [ns["sample_title"]("line") for _ in range(20)], state_hash(ns["random"])
        expected = [sequence(seed) for seed in (1, 7, 42, 2026)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(list(pool.map(sequence, (1, 7, 42, 2026))), expected)
        a, b = namespace(1), namespace(7)
        out_a, out_b = [], []
        for _ in range(20):
            out_a.append(a["sample_title"]("line"))
            out_b.append(b["sample_title"]("line"))
        self.assertEqual((out_a, state_hash(a["random"])), expected[0])
        self.assertEqual((out_b, state_hash(b["random"])), expected[1])

    def test_normal_import_is_offline_without_vendor_or_matplotlib(self):
        code = r"""
import importlib.abc
import random
import sys
class Deny(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'matplotlib', 'vendor', 'history', 'requests', 'socket'} or fullname in {'urllib.request', 'http.client'}:
            raise AssertionError('forbidden import: ' + fullname)
sys.meta_path.insert(0, Deny())
from generation import vsr_text as v
random.seed(42)
assert len(v.load_words()) == 392136
assert isinstance(v.sample_title('line'), str)
assert v.series_color([], 0) == '#1f77b4'
print('offline import and calls OK')
"""
        result = subprocess.run([sys.executable, "-B", "-c", code], cwd=ROOT,
                                text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("offline import and calls OK", result.stdout)


if __name__ == "__main__":
    unittest.main()
