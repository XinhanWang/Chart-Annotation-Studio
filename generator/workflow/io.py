"""Deterministic JSON and atomic artifact writing."""
import hashlib
import json
from pathlib import Path


def canonical(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def serialize(obj):
    """Artifact JSON preserves insertion order; hashing uses canonical()."""
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def digest(obj):
    return hashlib.sha256(canonical(obj).encode()).hexdigest()


def observation_key(obj):
    """JSON numbers 3 and 3.0 have identical observation meaning."""
    def numbers(value):
        if isinstance(value, dict):
            return {k: numbers(v) for k, v in value.items()}
        if isinstance(value, list):
            return [numbers(v) for v in value]
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return value
    return canonical(numbers(obj))


def dump(file, obj):
    file = Path(file)
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_name(file.name + '.tmp')
    temporary.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(file)


def jsonl(file, rows):
    destination = Path(file)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + '.tmp')
    temporary.write_text(''.join(serialize(x) + '\n' for x in rows), encoding='utf-8')
    temporary.replace(destination)


def read(file):
    return json.loads(Path(file).read_text(encoding='utf-8'))


