"""Validated run configuration and stable per-sample seeds."""
import hashlib
import warnings
from pathlib import Path

from generation import KINDS, GENERATOR_VERSION
from .io import read

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = 'compact-v5'


def load_config(file):
    p = Path(file)
    if p.suffix in ('.yaml', '.yml'):
        import yaml
        cfg = yaml.safe_load(p.read_text(encoding='utf-8'))
    else:
        cfg = read(p)
    if not isinstance(cfg, dict):
        raise ValueError('Config must be an object')
    known = {'seed', 'counts', 'controls', 'workers', 'target_side', 'notes', 'native', 'postprocess_native'}
    if set(cfg) - known:
        raise ValueError('Unknown configuration keys: ' + str(set(cfg) - known))
    legacy = [key for key in ('native', 'postprocess_native') if cfg.pop(key, False)]
    if legacy:
        warnings.warn('VSR/Matplotlib outputs were removed; ignoring legacy options: ' + ', '.join(legacy), stacklevel=2)
    cfg.setdefault('seed', 20261110)
    cfg.setdefault('counts', dict.fromkeys(KINDS, 1))
    cfg.setdefault('controls', {})
    cfg.setdefault('workers', 2)
    cfg.setdefault('target_side', 1036)
    if not isinstance(cfg['counts'], dict):
        raise ValueError('counts must be an object')
    for kind, count in cfg['counts'].items():
        if kind not in KINDS or not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise ValueError(f'Invalid count: {kind}={count}')
    for key, minimum in [('seed', 0), ('workers', 1), ('target_side', 64)]:
        if not isinstance(cfg[key], int) or isinstance(cfg[key], bool) or cfg[key] < minimum:
            raise ValueError(f'{key} must be an integer >= {minimum}')
    if not isinstance(cfg['controls'], dict) or set(cfg['controls']) - {'all', *KINDS}:
        raise ValueError('controls must be an object keyed by all or chart kind')
    if any(not isinstance(value, dict) for value in cfg['controls'].values()):
        raise ValueError('Each controls entry must be an object')
    for scope, entry in cfg['controls'].items():
        for key, value in entry.items():
            if isinstance(value, list) and (not value or any(isinstance(item, list) for item in value)):
                raise ValueError(f'controls.{scope}.{key} lists must be nonempty and flat')
    return cfg


def resolve_controls(controls, index):
    """Pick one value per sample from any list-valued control, round robin.

    One run can then span several category counts, couplings or label policies
    at once. Scalars keep their usual meaning, and the resolved mapping is what
    sampling, provenance and resume all see, so each sample stays reproducible.
    """
    return {key: value[index % len(value)] if isinstance(value, list) else value
            for key, value in (controls or {}).items()}


def task_seed(base, kind, index):
    return int.from_bytes(hashlib.sha256(f'{base}:{kind}:{index}'.encode()).digest()[:4], 'big') % (2**31 - 1)


