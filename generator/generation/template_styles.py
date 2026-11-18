"""Per-template style sampling from original VSR gen_*.py (8b2ca38)."""
from __future__ import annotations
from .style_rules import choose_weighted

def line_marks(p, n_points, n_series, x_mode, tick_labels):
    max_tick_label_len = max(map(len, tick_labels), default=0)
    marker_choices = [None, 'o', 's', '^', 'D', 'v', '<', '>', 'p', '*', 'x', '.']
    line_styles = ['-', '-', '-', '-', '--', '-.', ':']
    markers = []
    styles = []
    marker_sizes = []
    markevery = []
    alphas = []
    widths = []
    for _ in range(n_series):
        marker = choose_weighted(p, marker_choices, [0.4, 0.16, 0.1, 0.08, 0.07, 0.07, 0.04, 0.03, 0.02, 0.01, 0.01, 0.01])
        if marker is None and p.random() < 0.35:
            marker = None
        markers.append(marker)
        styles.append(p.choice(line_styles))
        marker_sizes.append(p.uniform(4.0, 8.5) if n_points <= 16 else p.uniform(3.5, 6.5))
        markevery.append(None if marker is None or n_points <= 9 else p.randint(2, 4))
        alphas.append(p.uniform(0.82, 0.98))
        widths.append(p.uniform(1.25, 2.3))
    if x_mode == 'numeric':
        x_rotation = choose_weighted(p, [0, 15, 30, 45], [0.4, 0.25, 0.2, 0.15])
    elif max_tick_label_len > 18 or len(tick_labels) > 8:
        x_rotation = choose_weighted(p, [30, 45, 60], [0.18, 0.34, 0.48])
    elif max_tick_label_len > 12 or len(tick_labels) > 6:
        x_rotation = choose_weighted(p, [15, 30, 45], [0.22, 0.38, 0.4])
    else:
        x_rotation = choose_weighted(p, [0, 15, 30], [0.46, 0.32, 0.22])
    x_ha = 'center' if x_rotation == 0 else 'right'
    return dict(markers=markers, linestyles=styles, marker_sizes=marker_sizes, markevery=markevery, alphas=alphas, widths=widths, x_rotation=x_rotation, x_ha=x_ha)

def marker_scatter_1(p, n_points: int) -> tuple[str, float, float]:
    if n_points > 36:
        marker = choose_weighted(p, ['.', 'o', 's', 'X'], [0.5, 0.26, 0.16, 0.08])
        size = p.uniform(10.0, 18.0)
        alpha = p.uniform(0.58, 0.82)
    elif n_points > 24:
        marker = choose_weighted(p, ['o', '.', 's', '^', 'D', 'v', 'P', 'X'], [0.22, 0.18, 0.16, 0.12, 0.1, 0.08, 0.08, 0.06])
        size = p.uniform(14.0, 26.0)
        alpha = p.uniform(0.66, 0.9)
    else:
        marker = choose_weighted(p, ['o', 's', '^', 'D', 'v', '<', '>', 'P', 'X', '*', '.'], [0.18, 0.14, 0.12, 0.1, 0.09, 0.07, 0.07, 0.08, 0.08, 0.04, 0.03])
        size = p.uniform(18.0, 40.0)
        alpha = p.uniform(0.72, 0.96)
    return (marker, size, alpha)

def marker_scatter_n(p, n_points: int) -> tuple[str, float, float]:
    if n_points > 36:
        marker = choose_weighted(p, ['.', 'o', 's', 'X'], [0.5, 0.26, 0.16, 0.08])
        size = p.uniform(8.0, 14.5)
        alpha = p.uniform(0.58, 0.82)
    elif n_points > 24:
        marker = choose_weighted(p, ['o', '.', 's', '^', 'D', 'v', 'P', 'X'], [0.22, 0.18, 0.16, 0.12, 0.1, 0.08, 0.08, 0.06])
        size = p.uniform(12.0, 22.0)
        alpha = p.uniform(0.66, 0.9)
    else:
        marker = choose_weighted(p, ['o', 's', '^', 'D', 'v', '<', '>', 'P', 'X', '*', '.'], [0.18, 0.14, 0.12, 0.1, 0.09, 0.07, 0.07, 0.08, 0.08, 0.04, 0.03])
        size = p.uniform(16.0, 32.0)
        alpha = p.uniform(0.72, 0.96)
    return (marker, size, alpha)

def finish_canvas(kind, cfg, controls):
    style = cfg['style']
    n_series = cfg['n_series']
    labels = cfg.get('labels', [])
    n_categories = len(labels)
    n_points = len(cfg.get('x_values', cfg.get('x', [])))
    family = cfg['family']
    tick_labels = cfg.get('tick_labels', [])
    max_tick_label_len = max(map(len, tick_labels), default=0)
    if kind == 'barh_1':
        (fig_w, fig_h) = style['figsize']
        max_label_len = max((len(label) for label in labels), default=8)
        fig_w = min(max(fig_w, 6.6 + max(0, max_label_len - 8) * 0.08), 11.6)
        fig_h = min(max(fig_h, 4.2 + 0.2 * n_categories), 9.8)
        style['figsize'] = (fig_w, fig_h)
        style['title_size'] = min(style['title_size'], 18)
    elif kind == 'barh_n':
        (fig_w, fig_h) = style['figsize']
        max_label_len = max((len(label) for label in labels), default=8)
        fig_w = min(max(fig_w, 6.8 + 0.12 * n_categories + 0.08 * max_label_len), 13.0)
        fig_h = min(max(fig_h, 4.8 + 0.2 * n_categories + 0.04 * max_label_len), 9.8)
        style['figsize'] = (fig_w, fig_h)
    elif kind == 'barv_1':
        (fig_w, fig_h) = style['figsize']
        max_label_len = max((len(label) for label in labels), default=8)
        fig_w = min(max(fig_w, 6.0 + 0.2 * n_categories + 0.04 * max_label_len), 11.8)
        fig_h = min(max(fig_h, 4.8 + 0.1 * n_categories), 8.8)
        style['figsize'] = (fig_w, fig_h)
        style['title_size'] = min(style['title_size'], 19)
    elif kind == 'barv_n':
        (fig_w, fig_h) = style['figsize']
        max_label_len = max((len(label) for label in labels), default=8)
        fig_w = min(max(fig_w, 6.0 + 0.18 * n_categories + 0.05 * max_label_len), 11.5)
        fig_h = min(max(fig_h, 4.8 + 0.1 * n_series), 8.2)
        style['figsize'] = (fig_w, fig_h)
    elif kind == 'barv_stack':
        (fig_w, fig_h) = style['figsize']
        max_label_len = max((len(label) for label in labels), default=8)
        fig_w = min(max(fig_w, 6.0 + 0.12 * n_categories + 0.05 * max_label_len), 11.8)
        fig_h = min(max(fig_h, 4.8 + 0.14 * n_series), 8.6)
        style['figsize'] = (fig_w, fig_h)
    elif kind == 'line_1':
        (fig_w, fig_h) = style['figsize']
        fig_w = min(max(fig_w, 6.2 + 0.16 * n_points + 0.06 * max_tick_label_len), 12.2)
        fig_h = min(max(fig_h, 4.4 + 0.08 * n_series), 8.4)
        style['figsize'] = (fig_w, fig_h)
    elif kind == 'line_n':
        (fig_w, fig_h) = style['figsize']
        fig_w = min(max(fig_w, 6.2 + 0.16 * n_points + 0.06 * max_tick_label_len), 12.2)
        fig_h = min(max(fig_h, 4.4 + 0.08 * n_series), 8.4)
        style['figsize'] = (fig_w, fig_h)
    elif kind == 'scatter_1':
        (fig_w, fig_h) = style['figsize']
        if family in {'ring', 'clustered'}:
            fig_w = max(fig_w, 6.0)
            fig_h = max(fig_h, 6.0)
        else:
            fig_w = min(max(fig_w, 5.8 + 0.01 * n_points), 10.5)
            fig_h = min(max(fig_h, 5.0 + 0.01 * n_points), 9.0)
        style['figsize'] = (fig_w, fig_h)
    elif kind == 'scatter_n':
        style['dpi'] = min(style['dpi'], 120)
        style['legend_outside'] = False
        style['legend_bbox_to_anchor'] = None
        style['layout_rect'] = None
        style['title_size'] = max(9, style['title_size'] - 2)
        style['title_pad'] = min(style['title_pad'], 12)
        (fig_w, fig_h) = style['figsize']
        if family in {'ring', 'clustered', 'multi_cluster', 'bimodal'}:
            fig_w = max(fig_w, 5.8)
            fig_h = max(fig_h, 5.8)
        else:
            fig_w = min(max(fig_w, 5.4 + 0.01 * n_points), 8.8)
            fig_h = min(max(fig_h, 4.8 + 0.01 * n_points), 7.8)
        style['figsize'] = (fig_w, fig_h)
    # Explicit overrides remain authoritative after the legacy count adjustments.
    style.update(controls.get('style', {}))
