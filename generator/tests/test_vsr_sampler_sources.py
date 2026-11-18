"""Official-source closure, exact AST/source, import purity and frozen RNG regressions.

Fixtures hold the official source independently of the transplanted modules.
Golden samples use original common text/numeric functions and real original
sample_canvas at fixture creation. Tests replay only that out-of-scope canvas
call boundary (value + RNG state), so they never need Matplotlib or old sources.
"""
from __future__ import annotations

import ast
import builtins
import copy
import functools
import gzip
import hashlib
import importlib
import inspect
import json
import math
from pathlib import Path
import random
import subprocess
import symtable
import sys
import types
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "vsr_samplers"

FIXTURE_SHA256 = {
    "official_sources.json.gz": "26fb8aa323c085eeb48c0a56921d2984b1712015549b05ce2decd43174ff384f",
    "frozen_samples.json.gz": "de539f6a65f0bac27dd3da013cd46268190f0736b9afb7ad62ae35ba34ed26c3",
    "materials.json": "201b734cf63f59269f67e9631eb85b70dcbd5a1959e85cff6dcca2b344765296",
}


def fixture_bytes(name):
    data = (FIXTURES / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != FIXTURE_SHA256[name]:
        raise AssertionError("Frozen reference digest changed: " + name)
    return data


@functools.lru_cache(maxsize=1)
def official_sources():
    return json.loads(gzip.decompress(fixture_bytes("official_sources.json.gz")))


@functools.lru_cache(maxsize=1)
def frozen_samples():
    return json.loads(gzip.decompress(fixture_bytes("frozen_samples.json.gz")))


@functools.lru_cache(maxsize=None)
def final_definitions(source):
    # A dict assignment intentionally models Python's final definition semantics.
    return {node.name: node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)}


def referenced_globals(table):
    names = {value.get_name() for value in table.get_symbols()
             if value.is_global() and value.is_referenced()}
    for child in table.get_children():
        names.update(referenced_globals(child))
    return names


def reachable_closure(source, roots=("sample_config",), stop=()):
    definitions = final_definitions(source)
    tables = {table.get_name(): table for table in symtable.symtable(source, "<source>", "exec").get_children()}
    reached, dependencies = set(), set()
    pending = list(roots)
    while pending:
        name = pending.pop()
        if name in reached or name in stop:
            continue
        reached.add(name)
        loads = referenced_globals(tables[name])
        dependencies.update(loads)
        pending.extend((loads & definitions.keys()) - reached - set(stop))
    return reached, dependencies - reached - set(dir(builtins)) - {"random", "np"}


@functools.lru_cache(maxsize=None)
def literal_constants(source):
    values = {}
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                values[node.targets[0].id] = ast.literal_eval(node.value)
            except (TypeError, ValueError):
                pass
    return values


def plain(value):
    if isinstance(value, np.ndarray):
        return plain(value.tolist())
    if isinstance(value, np.generic):
        return plain(value.item())
    if isinstance(value, dict):
        return {str(key): plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    return value


def canonical(value):
    return json.dumps(plain(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def rng_digest(namespace):
    state = [namespace["random"].getstate(), namespace["np"].random.get_state()]
    return hashlib.sha256(canonical(state).encode()).hexdigest()


def tuples(value):
    return tuple(tuples(item) for item in value) if isinstance(value, list) else value


class NumpyProxy:
    def __init__(self, seed):
        self.random = np.random.RandomState(seed % (2**32 - 1))

    def __getattr__(self, name):
        return getattr(np, name)


@functools.lru_cache(maxsize=None)
def compiled_functions(source, names):
    definitions = final_definitions(source)
    body = [ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)]
    body += sorted((definitions[name] for name in names), key=lambda node: node.lineno)
    return compile(ast.fix_missing_locations(ast.Module(body=body, type_ignores=[])), "<official-reference>", "exec")


def execute_functions(source, names, namespace):
    exec(compiled_functions(source, tuple(sorted(names))), namespace)


@functools.lru_cache(maxsize=None)
def common_closure(kind, include_canvas):
    fixture = official_sources()
    source = fixture["common_source"]
    roots = set(fixture["modules"][kind]["external_globals"]) - {"FONT_POOL"}
    if not include_canvas:
        roots.discard("sample_canvas")
    roots &= final_definitions(source).keys()
    return reachable_closure(source, roots, stop={"load_words", "load_font_pool", "resolve_existing"})[0]


def reference_namespace(kind, seed, include_canvas=False):
    """Compile official functions only; never execute original imports/asset I/O."""
    fixture = official_sources()
    source = fixture["common_source"]
    common_names = common_closure(kind, include_canvas)
    namespace = {"__name__": "_official_vsr_" + kind, "math": math,
                 "random": random.Random(seed), "np": NumpyProxy(seed)}
    namespace.update(copy.deepcopy(literal_constants(source)))
    materials = frozen_materials()
    namespace.update(WORDS=materials["words"][:], FONT_POOL=materials["fonts"][:],
                     FONT_DIR_CANDIDATES=["fixture-font-directory"])
    namespace["load_words"] = lambda *args, **kwargs: namespace["WORDS"]
    namespace["load_font_pool"] = lambda *args, **kwargs: namespace["FONT_POOL"]
    namespace["resolve_existing"] = lambda *args, **kwargs: "fixture-font-directory"
    execute_functions(source, common_names, namespace)
    # Independently compile ALL original generator definitions: do not use the
    # production closure or copied functions as the reference implementation.
    generator_source = fixture["original_sources"][kind]
    namespace.update(copy.deepcopy(literal_constants(generator_source)))
    execute_functions(generator_source, final_definitions(generator_source), namespace)
    return namespace


@functools.lru_cache(maxsize=1)
def frozen_materials():
    return json.loads(fixture_bytes("materials.json").decode("utf-8"))


def replay_canvas(namespace, boundary):
    def sample_canvas(*args, **kwargs):
        if canonical([args, kwargs]) != canonical(boundary["arguments"]):
            raise AssertionError("Official canvas call arguments changed")
        if rng_digest(namespace) != boundary["before_rng_sha256"]:
            raise AssertionError("RNG draws before canvas differ from official reference")
        namespace["random"].setstate(tuples(boundary["after_python_state"]))
        if rng_digest(namespace) != boundary["after_rng_sha256"]:
            raise AssertionError("Canvas replay state differs (NumPy state must be unchanged)")
        return copy.deepcopy(boundary["result"])
    return sample_canvas


def static_namespace(kind, seed):
    namespace = reference_namespace(kind, seed)
    module = importlib.import_module("generation.vsr_samplers." + kind)
    local_random, local_numpy = namespace["random"], namespace["np"]
    namespace.update(vars(module))
    namespace.update(random=local_random, np=local_numpy)
    # Rebinding to one dictionary mirrors the main agent's namespace bridge.
    for name in module.SAMPLER_FUNCTIONS:
        function = getattr(module, name)
        rebound = types.FunctionType(function.__code__, namespace, name, function.__defaults__, function.__closure__)
        rebound.__kwdefaults__ = function.__kwdefaults__
        namespace[name] = rebound
    return namespace


class SamplerSourceTests(unittest.TestCase):
    def test_official_sources_and_function_closures_are_exact(self):
        fixture = official_sources()
        self.assertEqual(fixture["revision"], "1fd040346add205ffbada9748273cad3bc9159e5")
        for kind, info in fixture["modules"].items():
            with self.subTest(kind=kind):
                original = fixture["original_sources"][kind]
                self.assertEqual(hashlib.sha256(original.encode()).hexdigest(), info["source_sha256"])
                original_defs = final_definitions(original)
                module = importlib.import_module("generation.vsr_samplers." + kind)
                transplanted = inspect.getsource(module)
                copied_defs = final_definitions(transplanted)
                closure, external = reachable_closure(original)
                self.assertEqual(set(copied_defs), closure)
                self.assertEqual(set(module.SAMPLER_FUNCTIONS), closure)
                self.assertEqual(set(module.SAMPLER_CONSTANTS), set(info["constants"]))
                self.assertEqual(external - set(module.SAMPLER_CONSTANTS), set(info["external_globals"]))
                self.assertEqual(set(module.COMMON_FUNCTIONS), set(info["external_globals"]) - {"FONT_POOL"})
                self.assertEqual(set(module.INJECTED_GLOBALS), set(info["external_globals"]) | {"WORDS", "FONT_POOL"})
                for name in closure:
                    self.assertEqual(ast.dump(copied_defs[name], include_attributes=False),
                                     ast.dump(original_defs[name], include_attributes=False), (kind, name))
                    self.assertEqual(ast.get_source_segment(transplanted, copied_defs[name]),
                                     ast.get_source_segment(original, original_defs[name]), (kind, name))
                    self.assertEqual(getattr(module, name).__module__, module.__name__)
                    evidence = info["functions_evidence"][name]
                    self.assertEqual(hashlib.sha256(ast.get_source_segment(original, original_defs[name]).encode()).hexdigest(), evidence["source_sha256"])
                    self.assertEqual(hashlib.sha256(ast.dump(original_defs[name], include_attributes=False).encode()).hexdigest(), evidence["ast_sha256"])
                constants = {**literal_constants(fixture["common_source"]), **literal_constants(original)}
                for name in module.SAMPLER_CONSTANTS:
                    self.assertEqual(getattr(module, name), constants[name])
                self.assertEqual(set(module.__all__), closure | set(module.SAMPLER_CONSTANTS))

    def test_final_definition_semantics(self):
        source = "def sample_config():\n    return helper()\ndef helper():\n    return obsolete()\ndef helper():\n    return 2\n"
        self.assertEqual(reachable_closure(source)[0], {"sample_config", "helper"})
        self.assertNotIn("obsolete", reachable_closure(source)[1])
        self.assertEqual(final_definitions(source)["helper"].lineno, 5)

    def test_module_top_level_is_static_and_side_effect_free(self):
        for kind in official_sources()["modules"]:
            module = importlib.import_module("generation.vsr_samplers." + kind)
            with self.subTest(kind=kind):
                self.assertFalse(hasattr(module, "WORDS"))
                self.assertFalse(hasattr(module, "FONT_POOL"))
                for node in ast.parse(inspect.getsource(module)).body:
                    if isinstance(node, ast.FunctionDef):
                        continue
                    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                        continue
                    if isinstance(node, ast.Import):
                        self.assertTrue(all(alias.name in {"random", "numpy"} for alias in node.names))
                    elif isinstance(node, ast.ImportFrom):
                        self.assertEqual(node.module, "__future__")
                    elif isinstance(node, ast.Assign):
                        ast.literal_eval(node.value)
                    else:
                        self.fail(f"Unexpected top-level statement: {kind}: {ast.dump(node)}")

    def test_normal_import_needs_no_assets_renderer_or_legacy_modules(self):
        script = r"""
import builtins, importlib, importlib.abc, json, pathlib, random, sys
import numpy as np
class BlockLegacy(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'matplotlib', 'vendor', 'history', 'common'}:
            raise AssertionError('forbidden dependency: ' + fullname)
sys.meta_path.insert(0, BlockLegacy())
import generation.vsr_samplers as package
py_before, np_before = repr(random.getstate()), repr(np.random.get_state())
old_open = builtins.open
old_read_text, old_read_bytes = pathlib.Path.read_text, pathlib.Path.read_bytes
def no_io(*args, **kwargs):
    raise AssertionError('Asset I/O during sampler import')
builtins.open = no_io
pathlib.Path.read_text = pathlib.Path.read_bytes = no_io
try:
    for kind in package.KINDS:
        module = importlib.import_module('generation.vsr_samplers.' + kind)
        assert callable(module.sample_config)
        assert not hasattr(module, 'WORDS') and not hasattr(module, 'FONT_POOL')
        assert module.sample_config.__module__ == module.__name__
finally:
    builtins.open = old_open
    pathlib.Path.read_text, pathlib.Path.read_bytes = old_read_text, old_read_bytes
assert py_before == repr(random.getstate())
assert np_before == repr(np.random.get_state())
print(json.dumps({'kinds': len(package.KINDS), 'asset_io': 0, 'global_rng_mutations': 0}))
"""
        result = subprocess.run([sys.executable, "-B", "-c", script], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout), {"kinds": 9, "asset_io": 0, "global_rng_mutations": 0})

    def test_frozen_official_sampling_configs_and_final_rng_states(self):
        fixture = frozen_samples()
        py_before, np_before = random.getstate(), canonical(np.random.get_state())
        for case in fixture["cases"]:
            with self.subTest(kind=case["kind"], seed=case["seed"]):
                namespace = static_namespace(case["kind"], case["seed"])
                namespace["sample_canvas"] = replay_canvas(namespace, case["canvas"])
                actual = namespace["sample_config"]()
                self.assertEqual(canonical(actual), canonical(case["config"]))
                self.assertEqual(rng_digest(namespace), case["final_rng_sha256"])
        self.assertEqual(random.getstate(), py_before)
        self.assertEqual(canonical(np.random.get_state()), np_before)

    def test_frozen_fixture_covers_families_modes_errors_and_multi_series(self):
        cases = frozen_samples()["cases"]
        for kind, info in frozen_samples()["coverage"].items():
            selected = [case["config"] for case in cases if case["kind"] == kind]
            with self.subTest(kind=kind):
                expected_families = info["expected_families"]
                self.assertEqual(sorted({config["family"] for config in selected}), expected_families)
                if kind.startswith("line"):
                    self.assertEqual({config["x_mode"] for config in selected}, {"numeric", "categorical", "temporal"})
                if kind == "barv_stack":
                    self.assertEqual({config["stack_mode"] for config in selected}, {"absolute", "percent"})
                    self.assertIn(6, {config["n_series"] for config in selected})
                if kind.startswith("bar") and kind != "barv_stack":
                    key = "xerr" if kind.startswith("barh") else "yerr"
                    self.assertEqual({config[key] is not None for config in selected}, {False, True})
                if kind == "scatter_n":
                    self.assertTrue(any(len(set(config["series_families"])) > 1 for config in selected))
                    for config in selected:
                        self.assertTrue(all(count >= 4 for count in config["counts"]))
                        self.assertEqual(sum(config["counts"]), len(config["x"]))
                        self.assertEqual(config["starts"], np.cumsum([0] + config["counts"][:-1]).tolist())


if __name__ == "__main__":
    unittest.main()
