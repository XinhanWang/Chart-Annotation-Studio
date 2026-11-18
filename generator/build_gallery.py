"""Build a self-contained gallery and Feishu paste payload from accepted triples."""
from __future__ import annotations
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path

LABELS = {'barh_1': '单系列横向柱状图', 'barh_n': '多系列横向柱状图', 'barv_1': '单系列纵向柱状图', 'barv_n': '多系列纵向柱状图', 'barv_stack': '堆叠柱状图', 'line_1': '单系列折线图', 'line_n': '多系列折线图', 'scatter_1': '单系列散点图', 'scatter_n': '多系列散点图', 'barline_n': '柱状+折线复合图'}


def pretty(spec):
    return json.dumps(spec, ensure_ascii=False, indent=2)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--run', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--destination', default='https://aicarrier.feishu.cn/wiki/KGpowD0rZidn2xkqOwHcTGVAnWd')
    a = p.parse_args()
    run, out = Path(a.run).resolve(), Path(a.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    rows = [json.loads(line) for line in (run / 'manifest.jsonl').read_text(encoding='utf-8').splitlines() if line]
    selected = {}
    for row in rows:
        selected.setdefault(row['kind'], row)
    if set(selected) != set(LABELS):
        raise ValueError('Expected one accepted example for every supported chart type')
    intro = '<p>原生 Vega-Lite 数据生产管线：独立采样数据与样式，支持单/多系列横向柱、纵向柱、堆叠柱、折线、散点，以及柱状与折线共用一条类别轴的复合图，共 10 种图表结构。以下每类展示图像—完整绘图 Vega-Lite JSON—精简训练 JSON。图像由官方 Vega-Lite 编译器和 Vega 生成 SVG，再由 Resvg 转为 PNG。</p><p>精简 GT 只保留原始数值、类别、系列、图表类型、变量名称/单位，以及必要的分组、堆叠、非线性尺度、连接顺序与误差上下限。常规数据行使用 category/value 或 x/y，多系列增加 series，复合图再增加 series_role 区分柱与折线；不包含内部 ID、绘图坐标、像素位置、字体颜色、轴刻度、布局和审计元信息。默认线性尺度和可自动推断的绘图设置省略。</p><p>GT 按图中可见顺序排列 data.values，类别和系列通道使用 sort:null；无图例的系列使用 Series 1、Series 2 等名称。类别型折线显示全部类别标签。完整绘图规格取消长文本截断，并对标题和标签换行、预留空间；精简 JSON 可独立重绘，重绘样式采用 Vega-Lite 默认设置。实现位置：h.pjlab.org.cn:/mnt/shared-storage-user/mineru2-shared/users/wangxinhan/proj/data_generation/vsr_v1。</p>'
    chunks, cards = [], []
    for i, (kind, label) in enumerate(LABELS.items(), 1):
        row = selected[kind]
        data = (run / row['image']).read_bytes()
        image = 'data:image/png;base64,' + base64.b64encode(data).decode()
        full = json.loads((run / row['full']).read_text(encoding='utf-8'))
        compact = json.loads((run / row['compact']).read_text(encoding='utf-8'))
        codes = [pretty(full), pretty(compact)]
        body = (intro if i == 1 else '') + f'<h3>{i:02d} {label}（{kind}）</h3><p>样本：{row["id"]}；seed={row["seed"]}。图像、绘图 JSON、精简 JSON 如下。</p><p><img src="{image}" width="900"></p><p><strong>绘图 Vega-Lite JSON</strong></p><pre><code class="language-json">{html.escape(codes[0])}</code></pre><p><strong>精简 Vega-Lite JSON</strong></p><pre><code class="language-json">{html.escape(codes[1])}</code></pre><p> </p>'
        filename = f'{i:02d}-{kind}.html'
        (out / filename).write_text(body, encoding='utf-8')
        chunks.append({'kind': kind, 'id': row['id'], 'file': filename, 'sha256': hashlib.sha256(body.encode()).hexdigest(), 'image_sha256': hashlib.sha256(data).hexdigest(), 'codes': codes})
        cards.append(f'<section id="{kind}"><h2>{label}</h2><img src="{image}"><details><summary>绘图 Vega-Lite JSON</summary><pre>{html.escape(codes[0])}</pre></details><details><summary>精简 Vega-Lite JSON</summary><pre>{html.escape(codes[1])}</pre></details></section>')
    manifest = {'destination_url': a.destination, 'section': '合成示例', 'chunks': chunks, 'expected_images': 10, 'expected_codes': 20}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    document = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>原生 Vega-Lite · 可见顺序 GT</title><style>body{font:16px system-ui;max-width:1100px;margin:30px auto;padding:20px;background:#f5f7fb;color:#172238}section{background:white;padding:24px;margin:24px 0;border-radius:12px}img{max-width:100%;max-height:750px}pre{overflow:auto;font:12px monospace;max-height:600px;background:#eef2f7;padding:16px}summary{padding:12px;cursor:pointer}nav a{margin:0 12px 8px 0;display:inline-block}</style><h1>原生 Vega-Lite · 可见顺序 GT</h1>' + intro + '<nav>' + ''.join(f'<a href="#{k}">{v}</a>' for k, v in LABELS.items()) + '</nav>' + ''.join(cards) + '</html>'
    (out / 'gallery.html').write_text(document, encoding='utf-8')
    print(json.dumps({'examples': len(chunks), 'images': 10, 'codes': 20, 'gallery': str(out / 'gallery.html')}))


if __name__ == '__main__':
    main()
