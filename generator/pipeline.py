"""Generate native Vega-Lite charts, validate rendered artifacts and export training pairs."""
from __future__ import annotations

import argparse
import concurrent.futures
import json
from pathlib import Path
import shutil
import subprocess
import sys
import traceback

from generation import GENERATOR_VERSION, KINDS
from adapter import VERSION as PROJECTION_VERSION
from workflow.config import ROOT, CONTRACT, load_config, resolve_controls, task_seed
from workflow.io import canonical, digest, dump, jsonl, read
from workflow.validation import validate


def write_render_jobs(out, records):
    jobs = [{'id': row['id'], 'full': str(out / row['sample'] / 'full.vl.json'),
             'compact': str(out / row['sample'] / 'compact.preview.vl.json'), 'output': str(out / row['sample'])}
            for row in records if row['status'] == 'generated']
    # Training targets never acquire layout settings for renderer validation.
    from compact_display import render_spec
    for row in records:
        if row['status'] == 'generated':
            sample = out / row['sample']
            dump(sample / 'compact.preview.vl.json', render_spec(read(sample / 'compact.vl.json')))
    dump(out / 'render-jobs.json', jobs)
    return jobs


def render_records(out, records, target_side, node=None):
    write_render_jobs(out, records)
    node = node or str(ROOT.parent / '.runtime/node')
    if not Path(node).exists():
        node = shutil.which('node') or node
    return subprocess.run([node, str(ROOT / 'render.mjs'), '--input', str(out / 'render-jobs.json'),
                           '--out', str(out / 'render-report.json'), '--target-side', str(target_side)])


def produce(task):
    from workflow.samples import obtain_sample
    from adapter import build_pair, normalize
    out = Path(task['output'])
    out.mkdir(parents=True, exist_ok=True)
    try:
        result = obtain_sample(task)
        cfg = result['config']
        full, compact, source = build_pair(task['kind'], cfg)
        if normalize(full) != compact or normalize(compact) != compact:
            raise ValueError('Full-to-compact mapping/idempotence failed')
        dump(out / 'full.vl.json', full)
        dump(out / 'compact.vl.json', compact)
        from compact_display import render_spec
        dump(out / 'compact.preview.vl.json', render_spec(compact))
        dump(out / 'source.json', source)
        dump(out / 'plot-layout.json', source['plot_layout'])
        dump(out / 'generation.json', {**task, 'generator_version': GENERATOR_VERSION, 'contract': CONTRACT, 'sample_seed': result.get('sample_seed', task['seed']), 'diagnostics': result.get('diagnostics', {})})
        row = {k: task[k] for k in ['id', 'kind', 'index', 'seed']}
        row.update({'status': 'generated', 'sample': f'samples/{task["id"]}', 'config_sha256': digest(cfg), 'semantic_sha256': digest(compact), 'data_family': cfg.get('family'), 'x_mode': cfg.get('x_mode'), 'style_family': cfg.get('style', {}).get('style_family', cfg.get('style', {}).get('family')), 'series_count': cfg.get('n_series', 1)})
        dump(out / 'record.json', row)
        return row
    except Exception as e:
        error = {k: task[k] for k in ['id', 'kind', 'index', 'seed']}
        error.update(status='generation_failed', error=str(e), traceback=traceback.format_exc())
        dump(out / 'failure.json', error)
        return error


def generate(args):
    cfg = load_config(args.config)
    if args.workers is not None:
        if args.workers < 1:
            raise ValueError('workers must be positive')
        cfg['workers'] = args.workers
    out = Path(args.output).resolve()
    fingerprint = digest(cfg)
    if out.exists() and any(out.iterdir()):
        if not args.resume:
            raise ValueError('Output directory is not empty. Select a new run or use --resume with identical config.')
        previous = read(out / 'run.json')
        if previous.get('operation', 'generate') != 'generate':
            raise ValueError('generate --resume requires a generation run, not a projection/migration run')
        if previous.get('generator_version') != GENERATOR_VERSION or previous.get('contract') != CONTRACT:
            raise ValueError('Resume requires the same generator and GT contract; use reproject for a historical run')
        if previous.get('projection_version') != PROJECTION_VERSION:
            raise ValueError('Resume requires the same projection version; use reproject for a historical run')
        if previous['config_sha256'] != fingerprint:
            raise ValueError('Resume config differs from original run')
    out.mkdir(parents=True, exist_ok=True)
    dump(out / 'run.json', {'config': cfg, 'config_sha256': fingerprint, 'generator_version': GENERATOR_VERSION, 'projection_version': PROJECTION_VERSION, 'operation': 'generate', 'contract': CONTRACT, 'python': sys.version, 'command': sys.argv})
    tasks, records = [], []
    for kind, count in cfg['counts'].items():
        for index in range(count):
            sample_id = f'{kind}-{index:06d}'
            sample = out / 'samples' / sample_id
            if args.resume and (sample / 'record.json').exists():
                records.append(read(sample / 'record.json'))
                continue
            controls = resolve_controls({**cfg['controls'].get('all', {}), **cfg['controls'].get(kind, {})}, index)
            tasks.append({'id': sample_id, 'kind': kind, 'index': index, 'seed': task_seed(cfg['seed'], kind, index), 'output': str(sample), 'controls': controls})
    if cfg['workers'] == 1:
        results = map(produce, tasks)
        for row in results:
            records.append(row)
            print(json.dumps({'id': row['id'], 'status': row['status'], 'done': len(records)}, ensure_ascii=False), flush=True)
    else:
        with concurrent.futures.ProcessPoolExecutor(max_workers=cfg['workers']) as pool:
            for row in pool.map(produce, tasks):
                records.append(row)
                print(json.dumps({'id': row['id'], 'status': row['status'], 'done': len(records)}, ensure_ascii=False), flush=True)
    records.sort(key=lambda r: (KINDS.index(r['kind']), r['index']))
    dump(out / 'generation-manifest.json', records)
    render = render_records(out, records, cfg['target_side'], args.node)
    summary = validate(out)
    if summary['rejected'] or render.returncode:
        raise SystemExit(1)


def reproject(args):
    if getattr(args, 'compact_only', False):
        from workflow.migration import migrate_compact
        return migrate_compact(args)
    """Rebuild specs in a new run using saved data; preserve original runs."""
    from adapter import build_pair, normalize
    origin, out = Path(args.source).resolve(), Path(args.output).resolve()
    if origin == out or out.exists() and any(out.iterdir()):
        raise ValueError('Reprojection requires a new, empty output directory')
    if getattr(args, 'recover_native_presentation', False):
        raise ValueError('Matplotlib replay has been removed. Reproject uses the saved configuration and presentation snapshots.')
    previous = read(origin / 'run.json')
    cfg = previous['config']
    out.mkdir(parents=True, exist_ok=True)
    source_generator = previous.get('generator_version') or ('vsr/' + previous['vsr_commit'] if previous.get('vsr_commit') else 'legacy/unknown')
    dump(out / 'run.json', {**previous, 'source_run': str(origin), 'source_generator_version': source_generator,
                            'source_vsr_commit': previous.get('vsr_commit'), 'generator_version': source_generator,
                            'operation': 'reproject', 'projection_version': PROJECTION_VERSION,
                            'contract': CONTRACT, 'command': sys.argv})
    records = []
    for old in read(origin / 'generation-manifest.json'):
        if old['status'] != 'generated':
            records.append(old)
            continue
        source_dir, target = origin / old['sample'], out / old['sample']
        target.mkdir(parents=True)
        for name in ['config.json', 'generation.json', 'sampling.json', 'presentation.native.json']:
            if (source_dir / name).is_file():
                shutil.copy2(source_dir / name, target / name)
        config = read(target / 'config.json')
        render_config = config
        if (target / 'presentation.native.json').is_file():
            render_config = {**config, '_render_axes': read(target / 'presentation.native.json')}
        full, compact, source = build_pair(old['kind'], render_config)
        if normalize(full) != compact or normalize(compact) != compact:
            raise ValueError(f'Noncanonical compact: {old["id"]}')
        for name, value in [('full.vl.json', full), ('compact.vl.json', compact), ('source.json', source)]:
            dump(target / name, value)
        dump(target / 'plot-layout.json', source['plot_layout'])
        row = {**old, 'semantic_sha256': digest(compact), 'config_sha256': digest(config), 'contract': CONTRACT}
        dump(target / 'record.json', row)
        records.append(row)
    dump(out / 'generation-manifest.json', records)
    if args.prepare_only:
        write_render_jobs(out, records)
        print(json.dumps({'prepared': len([r for r in records if r['status'] == 'generated']), 'source': str(origin), 'output': str(out)}))
        return
    render = render_records(out, records, cfg['target_side'], args.node)
    summary = validate(out)
    if summary['rejected'] or render.returncode:
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    gen = sub.add_parser('generate')
    gen.add_argument('--config', required=True)
    gen.add_argument('--output', required=True)
    gen.add_argument('--resume', action='store_true')
    gen.add_argument('--workers', type=int)
    gen.add_argument('--node')
    val = sub.add_parser('validate')
    val.add_argument('--output', required=True)
    rep = sub.add_parser('reproject')
    rep.add_argument('--recover-native-presentation', action='store_true', help=argparse.SUPPRESS)
    rep.add_argument('--source', required=True)
    rep.add_argument('--output', required=True)
    rep.add_argument('--prepare-only', action='store_true')
    rep.add_argument('--compact-only', action='store_true', help='Migrate semantic GT only; copy saved full images/evidence without sampling or rendering')
    rep.add_argument('--node')
    args = parser.parse_args()
    if args.command == 'generate':
        generate(args)
    elif args.command == 'reproject':
        reproject(args)
    else:
        if validate(Path(args.output).resolve())['rejected']:
            raise SystemExit(1)


if __name__ == '__main__':
    main()
