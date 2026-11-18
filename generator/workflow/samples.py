"""Create a sample or safely recover its verified sampling provenance."""
from pathlib import Path

from generation import GENERATOR_VERSION, generate_chart
from generation.core import sample_config, sampling_diagnostics
from generation.controls import normalize_controls
from .io import canonical, digest, dump, read


def obtain_sample(task):
    output = Path(task['output'])
    config_file, provenance_file = output / 'config.json', output / 'sampling.json'
    kind, seed = task['kind'], task['seed']
    controls = normalize_controls(kind, task['controls'])
    if not config_file.is_file():
        return generate_chart(kind, seed, output, controls=controls)
    config = read(config_file)
    expected = {'generator_version': GENERATOR_VERSION, 'kind': kind,
                'requested_seed': seed, 'sample_seed': seed, 'controls': controls}
    diagnostics = read(provenance_file) if provenance_file.is_file() else None
    if diagnostics is not None:
        for key, value in expected.items():
            if canonical(diagnostics.get(key)) != canonical(value):
                raise ValueError(f'Saved sampling provenance differs in {key}; refusing to relabel existing data')
        if diagnostics.get('config_sha256'):
            if diagnostics['config_sha256'] != digest(config):
                raise ValueError('Saved sampling configuration hash mismatch')
        elif config != sample_config(kind, seed, controls):
            raise ValueError('Saved configuration differs from deterministic sampling')
    elif config != sample_config(kind, seed, controls):
        raise ValueError('Unverified saved configuration differs from the requested seed/controls')
    if diagnostics is None or not diagnostics.get('config_sha256'):
        diagnostics = sampling_diagnostics(kind, seed, config, controls)
        dump(provenance_file, diagnostics)
    return {'config': config, 'sample_seed': seed,
            'diagnostics': {**diagnostics, 'reused_saved_config': True}}
