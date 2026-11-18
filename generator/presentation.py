"""Apply portable Vega-Lite typography, axes and legends to chart specifications.

Font metadata is read directly from font files with fontTools. Saved legacy
presentation snapshots remain readable without their original renderer.
"""
from __future__ import annotations

import copy
from functools import lru_cache
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DASHES = {"-": [], "solid": [], "--": [6, 3], "dashed": [6, 3],
          ":": [1.5, 2.5], "dotted": [1.5, 2.5], "-.": [6, 3, 1.5, 3],
          "dashdot": [6, 3, 1.5, 3]}


@lru_cache(maxsize=128)
def _font_metadata(filename: str, mtime_ns: int, size: int) -> dict:
    from fontTools.ttLib import TTFont
    with TTFont(filename, lazy=True, fontNumber=0) as font:
        names = font['name']
        family = names.getBestFamilyName() or Path(filename).stem
        os2 = font.get('OS/2')
        weight = int(os2.usWeightClass) if os2 else 400
        italic = bool(os2.fsSelection & 1) if os2 else False
        return {"family": family, "weight": weight, "style": "italic" if italic else "normal"}


def describe_font(filename: str | Path) -> dict:
    path = Path(filename).resolve()
    stat = path.stat()
    return dict(_font_metadata(str(path), stat.st_mtime_ns, stat.st_size))


def selected_font(cfg: dict) -> dict:
    # Explicit chart font takes precedence over the style fallback.
    name = cfg.get("font_path") or cfg.get("style", {}).get("font_path")
    if not name:
        return {"family": "sans-serif", "weight": 400, "style": "normal", "source": "default"}
    path = Path(name)
    if not path.is_file():
        # Saved configurations may originate on another machine or OS.
        basename = str(name).replace("\\", "/").rsplit("/", 1)[-1]
        path = ROOT / "assets/fonts" / basename
    if not path.is_file():
        raise FileNotFoundError(f"Selected font is unavailable: {name}. Run python bootstrap.py or supply the font file.")
    return {**describe_font(path), "file": path.name, "source": "font_file"}


@lru_cache(maxsize=128)
def _family_faces(family, directory_mtime_ns):
    faces = []
    for path in sorted((ROOT / 'assets/fonts').glob('*')):
        if path.suffix.lower() in {'.ttf', '.otf', '.ttc'} and path.is_file():
            face = describe_font(path)
            if face['family'] == family:
                faces.append({**face, 'file': path.name})
    return tuple(faces)


def resolve_role_font(family, weight, font_style, selected):
    """Use real same-family faces, explicitly auditing unavailable requests.

    Bookman's actual Light/Demi weights are 300/600. Noto Mono cannot silently
    synthesize bold/italic. Added renderer faces do not change the sampling pool.
    """
    directory = ROOT / 'assets/fonts'
    faces = _family_faces(family, directory.stat().st_mtime_ns)
    requested = {'family': family, 'weight': weight, 'style': font_style}
    if not faces:
        # Generic fonts remain explicitly generic for the renderer's resolver.
        return {'family': family, 'weight': weight, 'style': font_style}, {'requested': requested, 'reason': 'generic_or_external_font'}
    desired = 400 if weight == 'normal' else 700 if weight == 'bold' else int(weight)
    weights = sorted({f['weight'] for f in faces})
    target = min(weights, key=lambda w: (abs(w - desired), w))
    matches = [f for f in faces if f['weight'] == target and f['style'] == font_style]
    reason = 'exact_face' if target == desired else 'same_family_actual_weight'
    if not matches:
        matches = [f for f in faces if f['weight'] == target and f['style'] == 'normal']
        reason = 'requested_style_unavailable_using_real_normal_face'
    if not matches:
        matches = sorted(faces, key=lambda f: (abs(f['weight'] - desired), f['style'] != 'normal'))
        reason = 'requested_role_unavailable_using_real_same_family_face'
    resolved = dict(matches[0])
    if len(weights) == 1 and target != desired:
        reason = 'requested_weight_unavailable_using_only_real_family_weight'
    return resolved, {'requested': requested, 'resolved': dict(resolved), 'reason': reason}


def _rgba(color, alpha: float) -> str:
    aliases = {"w": "#ffffff", "k": "#000000", "r": "#ff0000", "g": "#008000",
               "b": "#0000ff", "c": "#00bfbf", "m": "#bf00bf", "y": "#bfbf00",
               "white": "#ffffff", "black": "#000000", "gray": "#808080", "grey": "#808080"}
    text = aliases.get(color, color) if isinstance(color, str) else color
    if isinstance(text, str) and text.startswith("#") and len(text) in {4, 5, 7, 9}:
        digits = text[1:]
        if len(digits) in {3, 4}:
            digits = "".join(c * 2 for c in digits)
        parts = [int(digits[i:i + 2], 16) / 255 for i in range(0, len(digits), 2)]
        r, g, b = parts[:3]
        a = parts[3] if len(parts) == 4 else 1
    else:
        from PIL import ImageColor
        if isinstance(color, (list, tuple)):
            r, g, b = color[:3]
            a = color[3] if len(color) == 4 else 1
        elif color == "none":
            r, g, b, a = 0, 0, 0, 0
        elif isinstance(color, str) and color.replace('.', '', 1).isdigit():
            r = g = b = float(color)
            a = 1
        else:
            r, g, b, a = [value / 255 for value in ImageColor.getcolor(color, "RGBA")]
    return f"rgba({round(r * 255)},{round(g * 255)},{round(b * 255)},{a * alpha:.4f})"


def _expression(values: list) -> dict:
    mapping = {f"s{i:03d}": value for i, value in enumerate(values)}
    # Vega's legend layout evaluates size/stroke width with the raw domain
    # value; symbol encoding evaluates it again with an entry object. Support
    # both contexts so every legend label has a finite anchor.
    return {"expr": "(" + json.dumps(mapping, separators=(",", ":")) + ")[isObject(datum) ? datum.value : datum]"}


def _legend_symbols(full: dict, kind: str, count: int, size: float) -> dict:
    # Use the actual generated marks, including SVG-path markers, rather than a
    # second marker conversion table that could drift from the chart itself.
    properties = []
    symbol_sizes = []
    for i in range(count):
        marks = {layer.get("name"): layer.get("mark", {}) for layer in full["layer"]}
        if (kind.startswith("line") or kind == "barline_n") and f"line_{i}" in marks:
            mark = marks[f"line_{i}"]
            symbol_sizes.append(size ** 2)
            properties.append(("stroke", mark.get("strokeDash", []), mark.get("strokeWidth", 1.8)))
        elif kind.startswith("bar"):
            symbol_sizes.append(size ** 2)
            properties.append(("square", [], 1))
        else:
            mark = marks.get(f"scatter_{i}", marks.get(f"line_markers_{i}", {}))
            symbol_sizes.append(mark.get("size", 30))
            properties.append((mark.get("shape", "circle"), [], mark.get("strokeWidth", 1)))
    return {"symbolType": _expression([p[0] for p in properties]),
            "symbolDash": _expression([p[1] for p in properties]),
            "symbolStrokeWidth": _expression([p[2] for p in properties]),
            "symbolSize": _expression(symbol_sizes)}


CORNER_ORIENTS = ("top-right", "top-left", "bottom-right", "bottom-left")
# A legend may cover at most this fraction of its own area with drawn marks
# before it is considered occluding and has to move.
LEGEND_OCCLUSION_LIMIT = 0.02


def _corner_xy(corner: str, width: float, height: float, legend_width: float, legend_height: float):
    return {"top-right": (width - legend_width, 0), "top-left": (0, 0),
            "bottom-right": (width - legend_width, height - legend_height),
            "bottom-left": (0, height - legend_height)}[corner]


def _overlap_fraction(boxes, x: float, y: float, legend_width: float, legend_height: float) -> float:
    area = legend_width * legend_height
    if area <= 0:
        return 0.0
    hit = sum(max(0.0, min(x + legend_width, b[2]) - max(x, b[0])) *
              max(0.0, min(y + legend_height, b[3]) - max(y, b[1])) for b in boxes)
    return min(1.0, hit / area)


def _mark_boxes(full: dict):
    """Project every drawn mark into final plot pixels for overlap checks."""
    from plot_layout import _transform
    axes = full["layer"][0]["encoding"]
    kind = full["usermeta"]["semantic"]["kind"]
    composite = kind == "barline_n"
    projections = {}
    for axis, length in (("x", full["width"]), ("y", full["height"])):
        scale = axes[axis]["scale"]
        domain = scale["domain"]
        transform, _ = _transform(scale, domain, [], axis)
        low, high = [transform(v) for v in domain]
        reverse = bool(scale.get("reverse")) ^ (axis == "y")
        def project(value, t=transform, lo=low, hi=high, span=length, rev=reverse):
            fraction = (t(value) - lo) / (hi - lo)
            return (1 - fraction if rev else fraction) * span
        projections[axis] = project
    if composite:
        # A dual value axis gives the line roles their own right-hand scale.
        for layer in full["layer"]:
            if str(layer.get("name", "")).startswith("line_"):
                scale = layer.get("encoding", {}).get("y", {}).get("scale")
                if scale and sorted(scale["domain"]) != sorted(axes["y"]["scale"]["domain"]):
                    domain = scale["domain"]
                    transform, _ = _transform(scale, domain, [], "y")
                    low, high = [transform(v) for v in domain]
                    reverse = bool(scale.get("reverse")) ^ True
                    def project_line(value, t=transform, lo=low, hi=high,
                                     span=full["height"], rev=reverse):
                        fraction = (t(value) - lo) / (hi - lo)
                        return (1 - fraction if rev else fraction) * span
                    projections["y2"] = project_line
                break
    labels = (full.get("usermeta", {}).get("presentation") or {}).get("data_labels") or {}

    def label_pad(role):
        """Vertical room a printed value takes beyond the mark it annotates."""
        options = labels.get(role)
        if not isinstance(options, dict):
            return 0.0
        if role == "bar" and options.get("position", "above") == "inside":
            return 0.0
        return float(options.get("size", 9)) * 1.45 + 6

    boxes, previous = [], {}
    for row in full["data"]["values"]:
        # A composite occupies both footprints: rectangles for its bars and
        # connected vertices for the lines overlaid on the same categories.
        if kind.startswith("bar") and not (composite and row["role"] == "line"):
            x = sorted(projections["x"](row[f"plot_x{k}"]) for k in (0, 1))
            y = sorted(projections["y"](row[f"plot_y{k}"]) for k in (0, 1))
            if composite:
                # Error caps extend a bar footprint beyond its rectangle.
                for key in ("error_lower", "error_upper"):
                    if row.get(key) is not None:
                        edge = projections["y"](row[key])
                        y = [min(y[0], edge), max(y[1], edge)]
                pad = label_pad("bar")
                if pad:
                    # A value prints beyond the outer end of the bar it labels.
                    y = [y[0] - pad, y[1]] if row["value"] >= 0 else [y[0], y[1] + pad]
            boxes.append((x[0], y[0], x[1], y[1]))
        else:
            yproj = projections["y2"] if "y2" in projections and row.get("role") == "line" else projections["y"]
            x, y = projections["x"](row["plot_x"]), yproj(row["plot_y"])
            pad = label_pad("line") if composite else 0.0
            boxes.append((x - 4, y - 4 - pad, x + 4, y + 4 + pad))
            sid = row["series_id"]
            if (kind.startswith("line") or composite) and sid in previous:
                px, py = previous[sid]
                boxes.append((min(px, x), min(py, y), max(px, x), max(py, y)))
            previous[sid] = x, y
    return boxes, full["width"], full["height"]


def _best_corner(full: dict, legend_width: float, legend_height: float) -> str:
    """Choose the least occupied corner in the final transformed plot space.

    Count bar rectangle intersections and point/line-segment bounding boxes.
    This is a deterministic placement heuristic, not Matplotlib's algorithm.
    """
    boxes, w, h = _mark_boxes(full)
    return min(CORNER_ORIENTS,
               key=lambda corner: _overlap_fraction(boxes, *_corner_xy(corner, w, h, legend_width, legend_height),
                                                    legend_width, legend_height))


def _unoccluded_legend_placement(full: dict, legend_width: float, legend_height: float,
                                 orient: str, x=None, y=None):
    """Keep a composite legend off the marks it would cover.

    A composite fills the plot with both bar rectangles and line vertices, so a
    sampled internal location is only honoured while it stays clear; otherwise
    the least occupied corner takes over, and only when no corner is clear does
    the legend leave the plot area. Returns None when the request can stay.
    """
    boxes, w, h = _mark_boxes(full)
    # Vega lays legend rows out with symbol sizes and frame padding that the
    # sampled label metrics underestimate, so probe with a padded box.
    probe_w, probe_h = legend_width * 1.1, legend_height * 1.6

    def probe(candidate, px, py):
        if candidate != "none":
            px = 0.0 if candidate.endswith("left") else w - probe_w
            py = 0.0 if candidate.startswith("top") else h - probe_h
        return _overlap_fraction(boxes, px, py, probe_w, probe_h)

    if probe(orient, x, y) <= LEGEND_OCCLUSION_LIMIT:
        return None
    corner = min(CORNER_ORIENTS, key=lambda c: probe(c, None, None))
    if probe(corner, None, None) <= LEGEND_OCCLUSION_LIMIT:
        return corner, "composite_least_occupied_corner"
    return "right", "composite_no_unoccupied_corner"


def _apply_axis_design(guide: dict, axis: str, cfg: dict, kind: str) -> None:
    """Composite-only axis furniture: orient, tick density, formats, anchors."""
    if kind != "barline_n":
        return
    design = cfg.get("axis_design") or {}
    mode = cfg.get(f"{axis}_axis_mode", "visible")
    if mode == "hidden":
        guide.update(ticks=False, labels=False, domain=False, grid=False, title=None)
    elif mode == "no_ticks":
        guide["ticks"] = False
    elif mode == "no_labels":
        guide["labels"] = False
    if axis == "y" and cfg.get("y_tick_label_type"):
        guide["format"] = ".0%" if cfg["y_tick_label_type"] == "percent" else ",~f"
    if axis == "x":
        if cfg.get("x_axis_orient") == "top":
            guide["orient"] = "top"
        if design.get("x_label_align"):
            guide["labelAlign"] = design["x_label_align"]
        if design.get("x_title_anchor"):
            guide["titleAnchor"] = design["x_title_anchor"]
        return
    if not cfg.get("dual_y_axis") and cfg.get("y_axis_orient") == "right":
        guide["orient"] = "right"
    if design.get("y_tick_count"):
        guide["tickCount"] = design["y_tick_count"]
    if design.get("y_tick_format") and not cfg.get("y_tick_label_type"):
        guide["format"] = design["y_tick_format"]
    if design.get("y_axis_offset"):
        guide["offset"] = design["y_axis_offset"]
    if design.get("y_title_anchor"):
        guide["titleAnchor"] = design["y_title_anchor"]


def apply_presentation(full: dict, cfg: dict) -> dict:
    result = copy.deepcopy(full)
    style = cfg.get("style", {})
    font = selected_font(cfg)
    kind = full["usermeta"]["semantic"]["kind"]
    text_color = style.get("text_color", "#222222")
    axes_source = cfg.get("_render_axes", cfg.get("render_axes", {}))
    ticks_source = axes_source.get("tick_styles", {})
    roles = axes_source.get("text_styles", {})
    native_legend = axes_source.get("legend")
    def text_properties(role, prefix=""):
        if not role:
            return {}
        fields = {"font": role["family"], "fontWeight": role["weight"],
                  "fontStyle": role["style"], "fontSize": role["size"]}
        return {(prefix + key[0].upper() + key[1:]) if prefix else key: value for key, value in fields.items()}
    audit = result["usermeta"].setdefault("presentation", {})
    audit.update(version="vsr-presentation/2.0", font=font,
                 tick_style_source="native_render" if ticks_source else "configured_or_default",
                 legend_shadow="not_supported" if style.get("legend_shadow") else "not_requested")
    # Printed values are display-only, but the legend still has to avoid them.
    audit["data_labels"] = copy.deepcopy(cfg.get("data_labels"))
    # Matplotlib draws all four spines. A view border avoids painting bottom/left
    # twice and is a guide, not extra observation geometry.
    border = bool(style.get("spine_visible", True))
    result["config"]["view"].update(stroke=style.get("spine_color", text_color) if border else None,
                                     strokeWidth=style.get("spine_width", 1))
    # Layered views also receive Vega's built-in "view" style, whose transparent
    # fill can override config.view -> cell. Explicit view properties win.
    result["view"] = copy.deepcopy(result["config"]["view"])
    title = result["title"]
    title.update(font=font["family"], fontWeight=cfg.get("title_weight", font["weight"]),
                 fontStyle=cfg.get("title_style", font["style"]),
                 anchor={"left": "start", "center": "middle", "right": "end"}.get(cfg.get("title_loc"), "middle"))
    title.update(text_properties(roles.get("title")))
    title["frame"] = "group"
    audit["text_style_source"] = "native_render" if roles else "configured_or_default"
    audit["plot_size_source"] = "native_axes_points" if axes_source.get("axes_bbox_bottom_left") else "figure_estimate"
    legend_options = None
    for layer in result["layer"]:
        for axis in ("x", "y"):
            guide = layer.get("encoding", {}).get(axis, {}).get("axis")
            if not isinstance(guide, dict):
                continue
            from adapter import _label_expr
            native_values, native_labels = axes_source.get(f"{axis}ticks"), axes_source.get(f"{axis}ticklabels")
            if native_values is not None and native_labels is not None and len(native_values) == len(native_labels) and guide.get("values") == native_values:
                guide.update(labelExpr=_label_expr(native_values, native_labels), labelOverlap=False)
            ticks = ticks_source.get(axis, {})
            length = float(ticks.get("length", style.get("tick_length", 3.5)))
            direction = ticks.get("direction", style.get("tick_direction", "out"))
            if direction not in {"in", "out"}:
                raise ValueError(f"Unsupported tick direction: {direction}")
            guide.update(labelFont=font["family"], titleFont=font["family"],
                         labelFontWeight=font["weight"], titleFontWeight=font["weight"],
                         labelFontStyle=font["style"], titleFontStyle=font["style"],
                         gridDash=DASHES[style.get("grid_style", "-")], domain=False,
                         tickColor=ticks.get("color", text_color),
                         tickWidth=ticks.get("width", style.get("tick_width", 0.8)),
                         ticks=ticks.get("visible", True))
            # An ExprRef is supported by VL for signed Vega tick lengths. Keep
            # label padding nonnegative so inward ticks cannot pull labels inside.
            guide["tickSize"] = {"expr": str(-length)} if direction == "in" else length
            guide["labelPadding"] = float(style.get("tick_pad", 3)) + (length if direction == "in" else 0)
            axis_roles = roles.get(axis, {})
            guide.update(text_properties(axis_roles.get("label"), "label"))
            guide.update(text_properties(axis_roles.get("title"), "title"))
            if axis_roles.get("label"):
                guide["labelAngle"] = -float(axis_roles["label"]["rotation"])
                guide["labelAlign"] = axis_roles["label"]["align"]
            if axis in axes_source.get("grid_visible", {}):
                guide["grid"] = bool(axes_source["grid_visible"][axis])
        color = layer.get("encoding", {}).get("color", {})
        legend = color.get("legend")
        if not isinstance(legend, dict):
            continue
        if legend_options is None:
            size = float(style.get("legend_size", 10))
            count = len(color["scale"]["domain"])
            frame = bool(style.get("legend_frame", True))
            alpha = float(style.get("legend_framealpha", 0.9))
            columns = max(1, int(style.get("legend_ncol", 1)))
            legend_options = dict(
                labelFont=font["family"], titleFont=font["family"],
                labelFontWeight=font["weight"], titleFontWeight=font["weight"],
                labelFontStyle=font["style"], titleFontStyle=font["style"],
                fillColor=_rgba(style.get("axes_face", "white"), alpha) if frame else None,
                strokeColor=_rgba("#cccccc", alpha) if frame else None,
                cornerRadius=2 if frame else 0,
                padding=float(style.get("legend_borderpad", 0.35)) * size,
                offset=float(style.get("legend_borderaxespad", 0.2)) * size,
                rowPadding=float(style.get("legend_labelspacing", 0.3)) * size,
                columnPadding=float(style.get("legend_columnspacing", 1)) * size,
                labelOffset=float(style.get("legend_handletextpad", 0.5)) * size,
                columns=columns, direction="vertical", gridAlign="each",
                **_legend_symbols(full, kind, count, size * float(style.get("legend_handlelength", 1.5))))
            names = [s["series_name"] for s in full["data"]["values"] if s["point_index"] == 0]
            max_chars = max(map(len, names), default=8)
            lw = columns * (min(max_chars * size * 0.8, 240) + size * 2.5) + 2 * legend_options["padding"]
            lh = math.ceil(count / columns) * (size * 1.3 + legend_options["rowPadding"]) + 2 * legend_options["padding"]
            loc = style.get("legend_loc", "upper right")
            reason = "source_location"
            if style.get("legend_outside") or lw > full["width"] * 0.85 or lh > full["height"] * 0.85:
                orient = "right"
                reason = "source_outside" if style.get("legend_outside") else "space_for_complete_legend"
            elif native_legend:
                anchor = native_legend["anchor"]
                orient = anchor if anchor in {"top-right", "top-left", "bottom-right", "bottom-left"} else "none"
                if orient == "none":
                    x, y, _, _ = native_legend["bbox_axes_top_left"]
                    legend_options.update(legendX=x * full["width"], legendY=y * full["height"])
                reason = "native_resolved_anchor"
            elif loc == "best":
                orient = _best_corner(full, lw, lh)
                reason = "least_occupied_corner"
            elif loc in {"upper left", "upper right", "lower left", "lower right"}:
                orient = {"upper left": "top-left", "upper right": "top-right",
                          "lower left": "bottom-left", "lower right": "bottom-right"}[loc]
            else:
                orient = "none"
                xpos = 0 if loc == "center left" else full["width"] - lw if loc in {"center right", "right"} else (full["width"] - lw) / 2
                ypos = 0 if loc == "upper center" else full["height"] - lh if loc == "lower center" else (full["height"] - lh) / 2
                legend_options.update(legendX=max(0, xpos), legendY=max(0, ypos))
            if kind == "barline_n" and orient != "right" and not native_legend:
                moved = _unoccluded_legend_placement(full, lw, lh, orient,
                                                     legend_options.get("legendX"), legend_options.get("legendY"))
                if moved is not None:
                    orient, reason = moved
                    legend_options.pop("legendX", None)
                    legend_options.pop("legendY", None)
            if native_legend:
                legend_options.update(text_properties(native_legend.get("text_style"), "label"))
            legend_options["orient"] = orient
            audit["legend"] = {"requested": loc, "chosen": orient, "reason": reason, "frame": frame, "columns": columns}
        legend.update(copy.deepcopy(legend_options))
    # CSS roles must point at actual faces before strict SVG embedding.
    font_roles = {}
    def resolve_fields(obj, prefix, role):
        family_key = prefix + 'Font' if prefix else 'font'
        weight_key = prefix + 'FontWeight' if prefix else 'fontWeight'
        style_key = prefix + 'FontStyle' if prefix else 'fontStyle'
        resolved, evidence = resolve_role_font(obj.get(family_key, font['family']), obj.get(weight_key, font['weight']), obj.get(style_key, font['style']), font)
        obj.update({family_key: resolved['family'], weight_key: resolved['weight'], style_key: resolved['style']})
        font_roles[role] = evidence
    from adapter import DATA_LABEL_PREFIX
    resolve_fields(title, '', 'title')
    for layer in result['layer']:
        for axis in ('x', 'y'):
            guide = layer.get('encoding', {}).get(axis, {}).get('axis')
            if isinstance(guide, dict):
                _apply_axis_design(guide, axis, cfg, kind)
                resolve_fields(guide, 'label', axis + '_tick_label')
                resolve_fields(guide, 'title', axis + '_axis_title')
        legend = layer.get('encoding', {}).get('color', {}).get('legend')
        if isinstance(legend, dict):
            resolve_fields(legend, 'label', 'legend_label')
            resolve_fields(legend, 'title', 'legend_title')
        mark = layer.get('mark')
        if isinstance(mark, dict) and str(layer.get('name', '')).startswith(DATA_LABEL_PREFIX):
            mark['font'] = font['family']
            resolve_fields(mark, '', 'data_label')
    audit['font_roles'] = font_roles
    offsets = {}
    for axis in ("x", "y"):
        text = axes_source.get(f"{axis}_offset_text", "")
        if not text:
            continue
        # Plain scientific offset strings emitted by pinned VSR's formatter.
        # Keep them separate from semantic titles and exclude them from GT marks.
        offsets[axis] = text
        role = roles.get(axis, {}).get("offset")
        size = float((role or {}).get("size", style.get("tick_size", 11)))
        mark = {"type": "text", "text": text, "clip": False,
                "font": "DejaVu Sans", "fontSize": size, "fontWeight": 400,
                "color": text_color, **text_properties(role)}
        if axis == "x":
            mark.update(x={"expr": "width"}, y={"expr": f"height + {size * 1.7 + float(style.get('tick_pad', 3))}"},
                        align="right", baseline="top")
        else:
            mark.update(x=0, y=-5, align="left", baseline="bottom")
        result["layer"].append({"name": f"__vsr_decoration_axis_offset_{axis}",
                                "data": {"values": [{}]}, "mark": mark})
    audit["axis_offsets"] = offsets
    return result
