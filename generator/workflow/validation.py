"""Schema, observation, text and actual rendered-geometry quality gates."""
import collections
import json
import math
from pathlib import Path

from .config import ROOT, KINDS, GENERATOR_VERSION, CONTRACT
from .io import read, dump, jsonl, digest, canonical, observation_key, serialize


def audit_visible_order(kind, rows, primary):
    """Check table order against rendered pixels, independently of the sampler."""
    positions = {element['datum']['row_id']: element['anchor'] for element in primary}
    if set(positions) != {row['row_id'] for row in rows}:
        return []  # Coverage has a separate, more precise error.
    painted = {element['datum']['row_id']: element['mark_type'] for element in primary}
    keys = []
    for row in rows:
        x, y = (round(value, 6) for value in positions[row['row_id']])
        if kind == 'barline_n':
            # A composite is read layer by layer: every bar left to right, then
            # the overlaid line vertices. Both share one categorical position,
            # so the painted geometry, not x alone, separates the two layers.
            keys.append((0 if painted[row['row_id']] == 'rect' else 1, x))
        else:
            keys.append((y,) if kind.startswith('barh') else
                        (x, y) if kind == 'barv_stack' or kind.startswith('scatter') else (x,))
    if keys != sorted(keys):
        return ['data.values order differs from rendered positions']
    return []


def validate(out):
    out = Path(out).resolve()
    import jsonschema
    from PIL import Image
    from adapter import normalize
    from compact import project_rows, semantic_rows, validate_target
    from compact_display import render_spec
    from text_layout import audit_text
    records = read(out / 'generation-manifest.json')
    run_metadata = read(out / 'run.json')
    semantic_only = run_metadata.get('operation') == 'compact_migration'
    schema_paths = [ROOT / 'schema/vega-lite-6.5.0.schema.json',
                    ROOT / 'node_modules/vega-lite/build/vega-lite-schema.json',
                    ROOT.parent / 'node_modules/vega-lite/build/vega-lite-schema.json',
                    ROOT.parent / 'evidence/vega-lite-6.5.0.schema.json']
    schema_path = next((p for p in schema_paths if p.is_file()), None)
    if schema_path is None:
        raise FileNotFoundError('Pinned Vega-Lite schema is missing')
    schema = read(schema_path)
    validator = jsonschema.Draft7Validator(schema)
    render_report = read(out / 'render-report.json')
    render_rows = render_report.get('records', [])
    render_index = collections.defaultdict(list)
    for row in render_rows:
        render_index[row.get('id')].append(row)
    generated_count = sum(r['status'] == 'generated' for r in records)
    report_complete = render_report.get('total') == generated_count and render_report.get('processed') == generated_count and len(render_rows) == generated_count
    accepted, failures = [], []
    for row in records:
        if row['status'] != 'generated':
            failures.append(row)
            continue
        sample = out / row['sample']
        errors = []
        try:
            full, compact = read(sample / 'full.vl.json'), read(sample / 'compact.vl.json')
            preview = read(sample / 'compact.preview.vl.json')
            validate_target(compact)
            if preview != render_spec(compact):
                errors.append('Compact preview differs from deterministic rendering projection')
            if preview['data'] != compact['data']:
                errors.append('Compact preview changed the training observations')
            for label, spec in [('full', full), ('compact', compact), ('compact-preview', preview)]:
                for error in validator.iter_errors(spec):
                    errors.append(f'{label} schema: {error.message[:350]}')
            if normalize(full) != compact or normalize(compact) != compact:
                errors.append('Deterministic normalization mismatch')
            if project_rows(full) != semantic_rows(compact):
                errors.append('Compact observations or scientific meaning differ from source')
            if digest(read(sample / 'config.json')) != row['config_sha256']:
                errors.append('Saved configuration hash mismatch')
            if digest(compact) != row['semantic_sha256']:
                errors.append('Semantic hash mismatch')
            if not report_complete or len(render_index[row['id']]) != 1:
                errors.append('Renderer report is incomplete, missing or duplicated')
            elif render_index[row['id']][0].get('status') != 'rendered':
                errors.append('Renderer quality checks require review; see render-report.json')
            if semantic_only:
                from workflow.migration import audit_copied_artifacts
                errors.extend(audit_copied_artifacts(sample))
            source = read(sample / 'source.json')
            if full['data']['values'] != source['rows']:
                errors.append('Vega-Lite observation table differs from source rows')
            text_audit = audit_text(full, (sample / 'chart.svg').read_text(encoding='utf-8'))
            dump(sample / 'text-audit.json', text_audit)
            errors.extend('full text: ' + message for message in text_audit['errors'])
            rows_by_id = {r['row_id']: r for r in source['rows']}
            if len(rows_by_id) != len(source['rows']):
                errors.append('Duplicate source row_id')
            target_side = run_metadata['config']['target_side']
            image_files = ['chart.png', f'chart.{target_side}.png']
            if not semantic_only:
                image_files.extend(['compact.png', f'compact.{target_side}.png'])
            for filename in image_files:
                with Image.open(sample / filename) as image:
                    image.load()
                    if min(image.size) < 30:
                        errors.append(f'{filename}: invalid dimensions')
            variants = [('full', 'geometry.json', 'chart.png')]
            if not semantic_only:
                variants.append(('compact', 'compact.geometry.json', 'compact.png'))
            for variant, geometry_file, image_file in variants:
                geometry = read(sample / geometry_file)
                with Image.open(sample / image_file) as image:
                    if list(image.size) != [geometry['image']['width'], geometry['image']['height']]:
                        errors.append(f'{variant}: geometry/image dimensions differ')
                mark_names = {m['mark_id']: m.get('name', '') for m in geometry['marks']}
                observations = [e for e in geometry['elements'] if e.get('role') != 'decoration' and e.get('datum')]
                if variant == 'full':
                    observations = [e for e in observations if e['datum'].get('row_id') is not None]
                    if {e['datum']['row_id'] for e in observations} != set(rows_by_id):
                        errors.append('full: source row/geometry coverage mismatch')
                    for element in observations:
                        datum = element['datum']
                        original = rows_by_id.get(datum['row_id'])
                        if original is None or any(datum.get(k) != v for k, v in original.items()):
                            errors.append(f'full: scenegraph datum differs for {datum["row_id"]}')
                            break
                for element in observations:
                    if not all(math.isfinite(v) for v in element['bbox'] + element['anchor']):
                        errors.append(f'{variant}: nonfinite geometry')
                if row['kind'] == 'barline_n':
                    primary_types, primary_names = ('rect', 'line'), ('bars_', 'line_')
                elif row['kind'].startswith('bar'):
                    primary_types, primary_names = ('rect',), ('bars_',)
                elif row['kind'].startswith('line'):
                    primary_types, primary_names = ('line',), ()
                else:
                    primary_types, primary_names = ('symbol',), ()
                primary = [e for e in observations if e['mark_type'] in primary_types
                           and (variant == 'compact' or not row['kind'].startswith('bar')
                                or mark_names[e['mark_id']].startswith(primary_names))]
                if variant == 'full':
                    if collections.Counter(e['datum']['row_id'] for e in primary) != collections.Counter(rows_by_id.keys()):
                        errors.append('full: expected one primary mark/vertex per source row')
                    errors.extend('full: ' + message for message in audit_visible_order(row['kind'], source['rows'], primary))
                else:
                    data_rows = compact['data']['values']
                    keys = set().union(*(r.keys() for r in data_rows))
                    expected = collections.Counter(observation_key(r) for r in data_rows)
                    actual = collections.Counter(observation_key({k: e['datum'][k] for k in keys if k in e['datum']}) for e in primary)
                    if actual != expected:
                        errors.append('compact: expected one unchanged primary mark/vertex per observation, including duplicates')
                resized_file = sample / (f'geometry.{target_side}.json' if variant == 'full' else f'compact.geometry.{target_side}.json')
                resized = read(resized_file)
                trans = resized['resize']
                transformed = {e['element_id']: e for e in resized['elements']}
                for element in geometry['elements']:
                    actual = transformed[element['element_id']]['anchor']
                    expected = [element['anchor'][0] * trans['scale_x'] + trans['offset_x'], element['anchor'][1] * trans['scale_y'] + trans['offset_y']]
                    if max(abs(a-b) for a, b in zip(actual, expected)) > 1e-6:
                        errors.append(f'{variant}: resized pixel coordinate mismatch')
                        break
        except Exception as e:
            errors.append(str(e))
        if errors:
            failures.append({**row, 'status': 'rejected', 'errors': errors})
        else:
            accepted.append({**row, 'status': 'accepted', 'image': row['sample'] + '/chart.png', 'full': row['sample'] + '/full.vl.json', 'compact': row['sample'] + '/compact.vl.json', 'source': row['sample'] + '/source.json', 'geometry': row['sample'] + '/geometry.json'})
    jsonl(out / 'manifest.jsonl', accepted)
    jsonl(out / 'rejected.jsonl', failures)
    jsonl(out / 'train.jsonl', [{'id': r['id'], 'image': r['image'], 'messages': [{'role': 'user', 'content': '将图表转换为精简 Vega-Lite JSON。'}, {'role': 'assistant', 'content': serialize(read(out / r['compact']))}]} for r in accepted])
    summary = {'requested': len(records), 'accepted': len(accepted), 'rejected': len(failures), 'counts': dict(collections.Counter(r['kind'] for r in accepted)), 'data_families': {kind: dict(collections.Counter(str(r.get('data_family')) for r in accepted if r['kind'] == kind)) for kind in KINDS}, 'semantic_unique': len({r['semantic_sha256'] for r in accepted}), 'generator_version': run_metadata.get('generator_version', 'legacy/unknown'), 'projection_version': run_metadata.get('projection_version'), 'operation': run_metadata.get('operation', 'generate'), 'contract': CONTRACT, 'compact_preview_rendered': not semantic_only, 'limitations': ['Automated structural, numeric, render and coordinate checks do not certify all typography or visual readability.', 'No paper quality-filter checkpoint or 800K-scale dataset reproduction is claimed.']}
    dump(out / 'validation.json', summary)
    print(json.dumps(summary, ensure_ascii=False))
    return summary


