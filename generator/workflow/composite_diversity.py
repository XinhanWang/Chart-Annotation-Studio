"""Audit Q6–Q12 from rendered composites and build a local review gallery.

Run: python -m workflow.composite_diversity --run runs/<batch>
"""
import argparse
from collections import Counter
import html
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from .io import dump, read


def label_answer(labels):
    if not labels:
        return 'E'
    if all(re.fullmatch(r'[-+\d.,\s−]+%', label) for label in labels):
        return 'D'
    if all(re.fullmatch(r'\d{4}-\d{2}', label) for label in labels):
        return 'B'
    if all(re.fullmatch(r'[-+\d.,\s−]+(?:[kMGTmunµ])?', label) for label in labels):
        return 'A'
    return 'C'


def audit_sample(directory):
    cfg, source = read(directory / 'config.json'), read(directory / 'source.json')
    root = ET.parse(directory / 'chart.svg').getroot()
    axis_ticks, labels = Counter(), {'x': [], 'y': []}
    markers = printed = bars = 0
    for group in root.iter():
        classes = group.get('class', '').split()
        if 'role-axis' in classes:
            description = group.get('aria-label', '')
            axis = 'x' if description.startswith('X-axis') else 'y' if description.startswith('Y-axis') else None
            if axis:
                for mark in group.iter():
                    if 'role-axis-tick' in mark.get('class', '').split():
                        axis_ticks[axis] += len(list(mark))
                    if 'role-axis-label' in mark.get('class', '').split():
                        labels[axis].extend(''.join(child.itertext()) for child in mark)
        if 'role-mark' in classes:
            if any(name.startswith('line_markers_') for name in classes):
                markers += len(list(group))
            if any(name.startswith('__vsr_decoration_data_label_') for name in classes):
                printed += sum(child.tag.endswith('text') and bool(''.join(child.itertext())) for child in group)
            if any(name.startswith('bars_') for name in classes):
                bars += len(list(group))
    vertices = sum(row['role'] == 'line' for row in source['rows'])
    expected_bars = sum(row['role'] == 'bar' for row in source['rows'])
    if bars != expected_bars:
        raise ValueError(f'{directory.name}: SVG bar count {bars} differs from source {expected_bars}')
    count = bars + vertices
    answers = {'Q6': 'A' if axis_ticks['x'] else 'B', 'Q7': 'A' if axis_ticks['y'] else 'B',
               'Q8': label_answer(labels['x']), 'Q9': label_answer(labels['y']),
               'Q10': 'A' if printed else 'B', 'Q11': 'A' if markers else 'B',
               'Q12': 'A' if count <= 10 else 'B' if count <= 30 else 'C'}
    return {'id': directory.name, 'answers': answers, 'observations': count,
            'svg_bars': bars, 'line_vertices': vertices, 'svg_markers': markers,
            'svg_data_labels': printed, 'svg_axis_ticks': dict(axis_ticks),
            'svg_axis_labels': labels, 'family': cfg['family'],
            'profile': cfg['style']['profile'], 'dual_y_axis': cfg['dual_y_axis']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    args = parser.parse_args()
    run = Path(args.run).resolve()
    manifest = [json.loads(line) for line in (run / 'manifest.jsonl').read_text().splitlines() if line]
    if not manifest or any(row['kind'] != 'barline_n' for row in manifest):
        raise ValueError('Expected an accepted composite-only batch')
    samples = [audit_sample(run / row['sample']) for row in manifest]
    questions = [f'Q{i}' for i in range(6, 13)]
    coverage = {q: dict(sorted(Counter(s['answers'][q] for s in samples).items())) for q in questions}
    report = {'samples': len(samples), 'coverage': coverage,
              'counting': 'Q6/Q7 count physical SVG ticks; Q12 counts bars plus line vertices, without counting a marker twice. Exactly 30 belongs to B; C starts at 31.',
              'unsupported': {'Q9': ['B: dates/times', 'C: text categories']},
              'distinct_families': len({s['family'] for s in samples}),
              'profiles': dict(Counter(s['profile'] for s in samples)),
              'dual_y_axis': sum(s['dual_y_axis'] for s in samples), 'records': samples}
    dump(run / 'diversity-report.json', report)
    cards = []
    for sample in samples:
        name = sample['id']
        answers = ' · '.join(f'{q}={a}' for q, a in sample['answers'].items())
        attrs = ' '.join(f'data-{q.lower()}="{a}"' for q, a in sample['answers'].items())
        cards.append(f'<article {attrs}><h3>{name}</h3><p>{answers} · N={sample["observations"]}</p>'
                     f'<a href="samples/{name}/chart.png"><img loading="lazy" src="samples/{name}/chart.png"></a>'
                     f'<p>{html.escape(sample["family"])} · {html.escape(sample["profile"])}</p>'
                     f'<a href="samples/{name}/full.vl.json">绘图 JSON</a> · '
                     f'<a href="samples/{name}/compact.vl.json">GT JSON</a></article>')
    filters = ''.join(f'<label>{q} <select data-q="{q.lower()}"><option value="">全部</option>'
                      + ''.join(f'<option>{a}</option>' for a in coverage[q]) + '</select></label> ' for q in questions)
    document = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>复合图 Q6–Q12 样例</title>'
                '<style>body{font:15px system-ui;margin:24px;background:#edf0f4;color:#172238}nav{position:sticky;top:0;background:white;padding:16px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:20px}article{padding:16px;background:white}img{width:100%}article[hidden]{display:none}select{padding:6px}pre{white-space:pre-wrap}</style>'
                '<h1>柱状＋折线复合图：Q6–Q12</h1><p>Q6/Q7 按可见短刻度判断。Q12 统计柱子＋折线顶点，marker 不重复计数。'
                'Y 轴日期/文本类别暂不支持；X 日期/数字/百分比为有序类别标签。</p>'
                f'<pre>{html.escape(json.dumps(coverage, ensure_ascii=False))}</pre><nav>{filters}<span id="count"></span></nav><main>'
                + ''.join(cards) + '</main><script>function filter(){let n=0;document.querySelectorAll("article").forEach(c=>{c.hidden=[...document.querySelectorAll("select")].some(s=>s.value&&c.dataset[s.dataset.q]!==s.value);if(!c.hidden)n++});document.getElementById("count").textContent=n+" 张"}document.querySelectorAll("select").forEach(s=>s.onchange=filter);filter()</script></html>')
    (run / 'gallery.html').write_text(document, encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'records'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
