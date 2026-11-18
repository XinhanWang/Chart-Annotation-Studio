"""Versioned, image-preserving migration of saved full specs to semantic GT.

Never samples or invokes a renderer. Old compact rendering is intentionally not
copied under current names; previews are specs only, not validated new images.
"""
from __future__ import annotations

import copy
import hashlib
from pathlib import Path
import shutil
import sys

from adapter import VERSION as PROJECTION_VERSION
from compact import normalize
from compact_display import render_spec
from .config import CONTRACT
from .io import digest, dump, read

REQUIRED_ARTIFACTS = {'full.vl.json', 'config.json', 'source.json', 'chart.png',
                      'chart.svg', 'geometry.json'}


def file_hash(file):
    h = hashlib.sha256()
    with Path(file).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def audit_copied_artifacts(sample):
    """Check the copied bytes against migration provenance, offline."""
    provenance = read(sample / 'compact-migration.json')
    files = provenance.get('copied_artifacts', {})
    if not REQUIRED_ARTIFACTS <= set(files):
        return ['Migration provenance lacks required full artifacts']
    errors = []
    for name, expected in files.items():
        if Path(name).name != name:
            errors.append('Migration provenance contains a nonlocal filename')
            continue
        p = sample / name
        if p.is_symlink() or not p.is_file() or file_hash(p) != expected:
            errors.append('Migrated artifact changed: ' + name)
    return errors


def migrate_compact(args):
    from .validation import validate
    if getattr(args, 'prepare_only', False) or getattr(args, 'recover_native_presentation', False):
        raise ValueError('--compact-only cannot be combined with rendering/recovery flags')
    origin, out = Path(args.source).resolve(), Path(args.output).resolve()
    if out == origin or origin in out.parents or out in origin.parents:
        raise ValueError('Migration output must be disjoint from its source run')
    if out.exists() and any(out.iterdir()):
        raise ValueError('Compact migration requires a new, empty output directory')
    previous = read(origin / 'run.json')
    old_records = read(origin / 'generation-manifest.json')
    old_report = read(origin / 'render-report.json')
    index = {}
    for record in old_report.get('records', []):
        if record.get('id') in index:
            raise ValueError('Duplicate source render-record ID')
        index[record.get('id')] = record
    generated = [r for r in old_records if r['status'] == 'generated']
    ids = [r['id'] for r in generated]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate source sample ID')
    # Inspect all source records before writing a new target.
    for old in generated:
        sample = (origin / old['sample']).resolve()
        if sample.parent != origin / 'samples' or sample.name != old['id']:
            raise ValueError('Source sample path is outside the run')
        record = index.get(old['id'], {})
        if record.get('full', {}).get('status') != 'rendered':
            raise ValueError('Source full render is not accepted: ' + old['id'])
        target_side = previous['config']['target_side']
        required = REQUIRED_ARTIFACTS | {f'chart.{target_side}.png', f'geometry.{target_side}.json'}
        if not all((sample / name).is_file() and not (sample / name).is_symlink() for name in required):
            raise ValueError('Source full evidence missing: ' + old['id'])
        normalize(read(sample / 'full.vl.json'))
    out.mkdir(parents=True, exist_ok=True)
    dump(out / 'run.json', {**previous, 'source_run': str(origin),
        'source_contract': previous.get('contract'), 'source_command': previous.get('command'),
        'command': list(sys.argv), 'operation': 'compact_migration',
        'projection_version': PROJECTION_VERSION, 'contract': CONTRACT,
        'compact_preview_rendered': False, 'full_artifacts_reused': True})
    records, render_records = [], []
    for old in old_records:
        if old['status'] != 'generated':
            records.append(copy.deepcopy(old))
            continue
        source_dir, target = origin / old['sample'], out / old['sample']
        target.mkdir(parents=True)
        hashes = {}
        for source_file in source_dir.iterdir():
            name = source_file.name
            if name.startswith('compact.') or name in {'compact.png', 'compact-migration.json', 'record.json', 'render-record.json'}:
                continue
            if source_file.is_symlink() or not source_file.is_file():
                raise ValueError('Unexpected source artifact: ' + str(source_file))
            expected = file_hash(source_file)
            shutil.copy2(source_file, target / name)
            if file_hash(target / name) != expected:
                raise ValueError('Copied artifact hash mismatch: ' + name)
            hashes[name] = expected
        full = read(target / 'full.vl.json')
        compact = normalize(full)
        dump(target / 'compact.vl.json', compact)
        dump(target / 'compact.preview.vl.json', render_spec(compact))
        dump(target / 'compact-migration.json', {'source_run': str(origin),
            'source_contract': previous.get('contract'), 'contract': CONTRACT,
            'copied_artifacts': hashes, 'compact_preview_rendered': False})
        row = {**old, 'semantic_sha256': digest(compact), 'contract': CONTRACT}
        dump(target / 'record.json', row)
        records.append(row)
        old_render = index[old['id']]
        record = {'id': old['id'], 'status': 'rendered',
            'full': copy.deepcopy(old_render['full']),
            'compact': {'status': 'not_rendered', 'semantic_projection_only': True},
            'provenance': {'operation': 'compact_migration', 'source_run': str(origin)}}
        record['full']['source'] = str(target / 'full.vl.json')
        record['full']['reused'] = True
        dump(target / 'render-record.json', record)
        render_records.append(record)
    dump(out / 'generation-manifest.json', records)
    dump(out / 'render-report.json', {'schema_version': 'vsr-render-report/1.0',
        'operation': 'compact_migration', 'renderer': old_report.get('renderer'),
        'source_report_sha256': file_hash(origin / 'render-report.json'),
        'total': len(generated), 'processed': len(generated), 'rendered': len(generated),
        'review_required': 0, 'rejected': 0, 'records': render_records})
    summary = validate(out)
    if summary['rejected']:
        raise SystemExit(1)
    return summary
