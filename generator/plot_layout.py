"""Fit complete observation geometry inside the plot before rendering.

This policy changes presentation only: source observations, uncertainty and
series identity are never edited.  Native limits are lower bounds on the visible
domain, rather than permission to hide data.  The adapter calls this before
creating hatch/reference geometry so those layers use the fitted coordinates.
"""
from __future__ import annotations

import copy
import math
from typing import Callable


POLICY = "complete-observation-domain-v1"
MAX_PLOT_SIDE = 16384.0
SAFETY_PX = 2.0


def _finite(value, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number")
    return float(value)


def _scale_for_axis(cfg: dict, layers: list[dict], axis: str) -> dict:
    definitions = []
    for layer in layers:
        channel = layer.get("encoding", {}).get(axis, {})
        scale = channel.get("scale")
        if isinstance(scale, dict):
            definitions.append({key: scale[key] for key in ("type", "base", "exponent", "constant") if key in scale})
    if definitions:
        first = definitions[0]
        if any(item != first for item in definitions[1:]):
            raise ValueError(f"Cannot fit inconsistent {axis} scale transforms across layers")
        return {"type": "linear", **first}
    native = cfg.get("_render_axes") or {}
    return {"type": native.get(f"{axis}scale", native.get(f"{axis}_scale", "linear"))}


def _transform(scale: dict, domain: list[float], values: list[float], axis: str) -> tuple[Callable, Callable]:
    kind = scale.get("type", "linear")
    if kind in {"linear", "time", "utc"}:
        return lambda x: x, lambda x: x
    if kind == "log":
        if "base" in scale and (_finite(scale["base"], f"{axis} log base") <= 0 or scale["base"] == 1):
            raise ValueError(f"{axis} log base must be positive and different from 1")
        positive = all(value > 0 for value in domain)
        negative = all(value < 0 for value in domain)
        if not positive and not negative:
            raise ValueError(f"{axis} log domain must be entirely positive or entirely negative; zero is not representable")
        if any(value <= 0 if positive else value >= 0 for value in values):
            raise ValueError(f"{axis} observation/interval geometry crosses zero or has the wrong sign for the log domain")
        if positive:
            return math.log, math.exp
        return lambda x: -math.log(-x), lambda x: -math.exp(-x)
    if kind == "symlog":
        constant = _finite(scale.get("constant", 1), f"{axis} symlog constant")
        if constant <= 0:
            raise ValueError(f"{axis} symlog constant must be positive")
        return (lambda x: math.copysign(math.log1p(abs(x) / constant), x),
                lambda x: math.copysign(math.expm1(abs(x)) * constant, x))
    if kind in {"pow", "sqrt"}:
        exponent = 0.5 if kind == "sqrt" else _finite(scale.get("exponent", 1), f"{axis} power exponent")
        if exponent <= 0:
            raise ValueError(f"{axis} power exponent must be positive")
        return (lambda x: math.copysign(abs(x) ** exponent, x),
                lambda x: math.copysign(abs(x) ** (1 / exponent), x))
    raise ValueError(f"Cannot safely fit unsupported {axis} scale type {kind!r}")


def _extent_values(kind: str, rows: list[dict], axis: str, roles: set[str] | None = None,
                   errors: bool = True) -> list[float]:
    values = []
    horizontal = kind.startswith("barh")
    for row in rows:
        if roles is not None and row.get("role", "bar") not in roles:
            continue
        fields = [f"plot_{axis}0", f"plot_{axis}1"] if kind.startswith("bar") else [f"plot_{axis}"]
        if errors and kind.startswith("bar") and axis == ("x" if horizontal else "y"):
            fields += [key for key in ("error_lower", "error_upper") if key in row]
        values.extend(_finite(row[field], f"{axis} geometry {field}") for field in fields)
    if not values and roles is None:
        raise ValueError("Cannot fit a chart without observations")
    return values


def _at(cfg: dict, plural: str, single: str, index: int, default):
    sequence = cfg.get(plural)
    return sequence[index] if sequence is not None else cfg.get(single, default)


def _fallback_marks(kind: str, cfg: dict, rows: list[dict]) -> list[dict]:
    """Permit direct use without importing adapter internals or changing RNG."""
    roles = cfg.get("series_roles", [])
    if kind == "barline_n" or kind.startswith("bar"):
        marks = [{"type": "bar", "strokeWidth": cfg.get("linewidth", 1)}]
        if any("error_lower" in row for row in rows):
            error = cfg.get("error_kw") or {}
            marks += [{"type": "rule", "strokeWidth": error.get("elinewidth", 1)},
                      {"type": "tick", "orient": "vertical" if kind.startswith("barh") else "horizontal",
                       "size": 2 * (cfg.get("capsize") or 3), "thickness": error.get("capthick", 1)}]
        if kind != "barline_n":
            return marks
    else:
        marks = []
    count = 1 + max(int(row.get("series_index", 0)) for row in rows)
    for index in range(count):
        if kind == "barline_n" and roles[index] == "bar":
            continue
        if kind.startswith("line") or kind == "barline_n":
            if _at(cfg, "linestyles", "linestyle", index, "-") not in {None, "None", "none", "", " "}:
                marks.append({"type": "line", "strokeWidth": _at(cfg, "widths", "linewidth", index, 1.8)})
            if _at(cfg, "markers", "marker", index, None) not in {None, "None", "none", "", " "}:
                marks.append({"type": "point", "size": _at(cfg, "marker_sizes", "markersize", index, 6) ** 2})
        else:
            marks.append({"type": "point", "size": _at(cfg, "sizes", "size", index, 25),
                          "strokeWidth": _at(cfg, "linewidths", "linewidth", index, 0.5)})
    return marks


def _pixel_margins(kind: str, cfg: dict, rows: list[dict], layers: list[dict]) -> tuple[dict, list[dict]]:
    marks = [layer.get("mark", {}) for layer in layers] if layers else _fallback_marks(kind, cfg, rows)
    margins = {"x": SAFETY_PX, "y": SAFETY_PX}
    details = []
    for value in marks:
        mark = {"type": value} if isinstance(value, str) else value
        mark_type = mark.get("type")
        stroke = _finite(mark.get("strokeWidth", 1), "mark stroke width")
        if stroke < 0:
            raise ValueError("Mark stroke width cannot be negative")
        # Vega paint bounds include the default miter limit (4) times half
        # the stroke width.  Keep it even for filled symbols to cover the
        # conservative scenegraph bounds used by our post-render quality gate.
        x = y = 2 * stroke + SAFETY_PX
        if mark_type in {"point", "circle", "square"}:
            size = _finite(mark.get("size", 30), "point size")
            if size < 0:
                raise ValueError("Point size cannot be negative")
            # All adapter symbols are built-ins or paths inside [-1, 1].
            # 1.5 sqrt(size) safely covers their asymmetric triangle, star,
            # cross and custom-path extents as well as circles and squares.
            x = y = 1.5 * math.sqrt(size) + 2 * stroke + SAFETY_PX
        elif mark_type == "tick":
            size = _finite(mark.get("size", 20), "error cap size")
            thickness = _finite(mark.get("thickness", 1), "error cap thickness")
            if min(size, thickness) < 0:
                raise ValueError("Error cap dimensions cannot be negative")
            across, along = thickness / 2 + SAFETY_PX, size / 2 + SAFETY_PX
            if mark.get("orient") == "vertical":
                x, y = across, along
            elif mark.get("orient") == "horizontal":
                x, y = along, across
            else:
                x = y = max(across, along)
        margins["x"], margins["y"] = max(margins["x"], x), max(margins["y"], y)
        details.append({"mark": mark_type, "x_px": x, "y_px": y})
    return margins, details


def _fit_transformed(old_lo: float, old_hi: float, data_lo: float, data_hi: float,
                     fraction_lo: float, fraction_hi: float) -> tuple[float, float]:
    """Smallest domain containing old bounds with per-side data clearances."""
    span = max(old_hi - old_lo, (data_hi - data_lo) / max(1 - fraction_lo - fraction_hi, 1e-9),
               (old_hi - data_lo) / max(1 - fraction_lo, 1e-9),
               (data_hi - old_lo) / max(1 - fraction_hi, 1e-9))
    lo = min(old_lo, data_lo - fraction_lo * span)
    hi = lo + span
    # Return the original floats exactly when they already provide clearance.
    if (data_lo - old_lo >= fraction_lo * (old_hi - old_lo)
            and old_hi - data_hi >= fraction_hi * (old_hi - old_lo)):
        return old_lo, old_hi
    epsilon = max(abs(span), 1.0) * 1e-12
    return min(old_lo, lo - epsilon), max(old_hi, hi + epsilon)


def _label_clearance(kind: str, cfg: dict, rows: list[dict]) -> tuple[float, dict]:
    """Value-axis room for printed labels that paint beyond their own mark.

    Only a composite annotates values, and only a label drawn outside its mark
    needs room: an inside label stays within the bar it sits on. The reported
    sides are the ones a label extends past, so the anchored bar end keeps
    touching its axis line everywhere else.
    """
    sides = {"low": False, "high": False}
    settings = cfg.get("data_labels")
    if kind != "barline_n" or not isinstance(settings, dict):
        return 0.0, sides
    px = 0.0
    bar = settings.get("bar")
    if isinstance(bar, dict) and bar.get("position", "above") != "inside":
        px = max(px, _finite(bar.get("size", 9), "data label size") * 1.45 + 6)
        for row in rows:
            if row.get("role", "bar") == "bar":
                sides["high" if row["value"] >= 0 else "low"] = True
    line = settings.get("line")
    if isinstance(line, dict):
        px = max(px, _finite(line.get("size", 9), "data label size") * 1.45 + 6)
        sides["high"] = sides["low"] = True
    return px, sides


def _fit_constraints(old_lo, old_hi, constraints):
    """Fit each geometry's clearance at its own extent, not at all bar ends.

    Each tuple is (low, high, low_fraction, high_fraction). Pairwise bounds
    solve the smallest feasible span, including the original domain bounds.
    """
    lowers = [(old_lo, 0.0)] + [(lo, f_lo) for lo, hi, f_lo, f_hi in constraints]
    uppers = [(old_hi, 0.0)] + [(hi, f_hi) for lo, hi, f_lo, f_hi in constraints]
    span = max((hi - lo) / (1 - f_lo - f_hi)
               for lo, f_lo in lowers for hi, f_hi in uppers)
    low = min(lo - fraction * span for lo, fraction in lowers)
    epsilon = max(abs(span), 1.0) * 1e-12
    return low - epsilon, low + span + epsilon


def _composite_value_constraints(cfg, rows, axis, transform, fraction, anchored, label_fraction):
    """Separate bar baselines from line glyphs and printed-value anchors."""
    constraints = []
    roles = {'line'} if axis == 'y2' else {'bar'} if cfg.get('dual_y_axis') else {'bar', 'line'}
    for role in roles:
        own = [row for row in rows if row.get('role') == role]
        if not own:
            continue
        values = _extent_values('barline_n', own, 'y')
        low, high = min(map(transform, values)), max(map(transform, values))
        clearances = _anchor_clearances('barline_n', own, 'y', fraction, anchored) \
            if role == 'bar' else (fraction, fraction)
        constraints.append((low, high, *clearances))
        options = (cfg.get('data_labels') or {}).get(role)
        if not isinstance(options, dict):
            continue
        if role == 'line':
            # Reserve text space around the line's own vertices. Even when a
            # line is annotated, an unrelated zero bar baseline stays anchored.
            constraints.append((low, high, label_fraction, label_fraction))
        elif options.get('position') != 'inside':
            for positive in (False, True):
                ends = [row.get('error_upper' if positive else 'error_lower', row['plot_y1'])
                        for row in own if (row['value'] >= 0) == positive]
                if ends:
                    constraints.append((min(map(transform, ends)), max(map(transform, ends)),
                                        0.0 if positive else label_fraction,
                                        label_fraction if positive else 0.0))
    return constraints


def _anchor_clearances(kind: str, rows: list[dict], axis: str, fraction: float,
                       anchored: float = 0.0, label_sides: dict | None = None) -> tuple[float, float]:
    """Stroke-level clearance on sides whose extreme is a bar end, not a glyph.

    Bars anchor at zero: their painted edge (rect plus half the edge stroke)
    lands exactly on the axis line, exactly like Matplotlib spines, while the
    scenegraph paint bounds stay inside the plot clip. Markers, line vertices
    and point glyphs keep the full pixel clearance so their paint is uncut.
    """
    if not kind.startswith("bar") or axis != ("x" if kind.startswith("barh") else "y"):
        return fraction, fraction
    rects = _extent_values(kind, rows, axis, {"bar"}, errors=False)
    if not rects:
        return fraction, fraction
    caps = _extent_values(kind, rows, axis, {"bar"})
    others = _extent_values(kind, rows, axis, {"line"})
    rect_lo, rect_hi = min(rects), max(rects)
    cap_lo, cap_hi = min(caps), max(caps)
    other_lo = min(others) if others else rect_lo
    other_hi = max(others) if others else rect_hi
    tolerance = 1e-9 * max(1.0, abs(rect_lo), abs(rect_hi))
    # Only a bare rect end may sit on the axis line; error caps and floating
    # glyphs keep their paint clearance.
    low = anchored if cap_lo >= rect_lo - tolerance and other_lo >= rect_lo - tolerance else fraction
    high = anchored if cap_hi <= rect_hi + tolerance and other_hi <= rect_hi + tolerance else fraction
    if label_sides and axis == "y":
        # A printed value paints beyond the bar end it annotates, so that side
        # keeps the full pixel clearance instead of resting on the axis line.
        low = max(low, fraction) if label_sides.get("low") else low
        high = max(high, fraction) if label_sides.get("high") else high
    return low, high


def fit_plot_layout(kind: str, cfg: dict, rows: list[dict], limits: dict,
                    width: float, height: float, *, layers: list[dict] | None = None) -> tuple[dict, float, float, dict]:
    """Expand domains and, if needed, the plot so every observation can fit.

    ``layers`` should contain the main observation/error layers before hatch or
    reference construction.  It supplies the exact scale transform and visual
    mark sizes; ``rows`` supplies interval ends including signed stack geometry.
    Subsequent text layout may enlarge the canvas, but must not shrink it.
    """
    layers = layers or []
    original_dimensions = {"width": _finite(width, "plot width"), "height": _finite(height, "plot height")}
    if min(original_dimensions.values()) <= 0:
        raise ValueError("Plot dimensions must be positive")
    original_limits = copy.deepcopy(limits)
    margins, mark_details = _pixel_margins(kind, cfg, rows, layers)
    geometry_margins = dict(margins)
    label_px, label_sides = _label_clearance(kind, cfg, rows)
    if label_px:
        # Printed values are glyphs too: keep their complete paint box inside
        # the plot, exactly like a marker or an error cap.
        margins["y"] = max(margins["y"], label_px)
        mark_details.append({"mark": "text", "x_px": SAFETY_PX, "y_px": label_px})
    # Half the widest bar edge stroke: the anchored rect keeps exactly this much
    # room so its painted edge rests on the axis line without crossing the clip.
    anchored_px = 0.05
    for value in ([layer.get("mark", {}) for layer in layers] if layers else _fallback_marks(kind, cfg, rows)):
        mark = {"type": value} if isinstance(value, str) else value
        if mark.get("type") == "bar":
            anchored_px = max(anchored_px, _finite(mark.get("strokeWidth", 1), "mark stroke width") / 2 + 0.05)
    # A large glyph can require more room than the existing canvas.  Growing
    # the canvas keeps each margin below one quarter of the plot dimension.
    width = max(float(width), 4 * margins["x"] + 4)
    height = max(float(height), 4 * margins["y"] + 4)
    spans, fitted, axes_audit = {}, {}, {}
    axis_plan = [("x", width), ("y", height)]
    if "y2" in limits:
        axis_plan.append(("y2", height))
    anchored_fraction = 0.0
    for axis, pixels in axis_plan:
        if axis not in limits or len(limits[axis]) != 2:
            raise ValueError(f"{axis} limits must have two endpoints")
        domain = [_finite(value, f"{axis} domain") for value in limits[axis]]
        if domain[0] == domain[1]:
            raise ValueError(f"{axis} domain must have nonzero extent")
        if axis == "y2":
            # The independent right-hand value axis serves the line roles only.
            values = _extent_values(kind, rows, "y", {"line"})
            scale = {"type": "linear"}
        else:
            roles = {"bar"} if kind == "barline_n" and axis == "y" and "y2" in limits else None
            values = _extent_values(kind, rows, axis, roles)
            scale = _scale_for_axis(cfg, layers, axis)
        transform, inverse = _transform(scale, domain, values, axis)
        # A secondary value axis shares the plot height and the left margin
        # budget, so its clearance is measured against the primary y margin.
        margin_px = margins["y" if axis == "y2" else axis]
        anchored_fraction = anchored_px / pixels
        try:
            old_lo, old_hi = sorted(transform(value) for value in domain)
            data_lo, data_hi = min(map(transform, values)), max(map(transform, values))
            fraction = margin_px / pixels
            fraction_lo, fraction_hi = _anchor_clearances(kind, rows, axis, fraction, anchored_fraction,
                                                          label_sides if axis in ("y", "y2") else None)
            constraints = [(data_lo, data_hi, fraction_lo, fraction_hi)]
            if kind == 'barline_n' and axis in ('y', 'y2'):
                constraints = _composite_value_constraints(cfg, rows, axis, transform,
                    geometry_margins['y'] / pixels, anchored_fraction, margin_px / pixels)
            def has_clearance(lo, hi):
                return all(a - lo >= f_lo * (hi - lo) and hi - b >= f_hi * (hi - lo)
                           for a, b, f_lo, f_hi in constraints)
            original_clearance = has_clearance(old_lo, old_hi)
            if kind == 'barline_n' and axis in ('y', 'y2'):
                lo, hi = _fit_constraints(old_lo, old_hi, constraints)
            else:
                lo, hi = _fit_transformed(old_lo, old_hi, data_lo, data_hi, fraction_lo, fraction_hi)
            if original_clearance:
                new_domain = sorted(domain)
                lo, hi = old_lo, old_hi
            else:
                new_domain = [inverse(lo), inverse(hi)]
                # A mathematically adequate expansion can round straight back
                # onto an endpoint (e.g. a unit range near 1e15).  Round outward
                # in the actual data coordinates and verify the representable
                # transformed bounds, instead of claiming invisible padding.
                for _ in range(8):
                    new_domain = [math.nextafter(new_domain[0], -math.inf),
                                  math.nextafter(new_domain[1], math.inf)]
                    lo, hi = (transform(value) for value in new_domain)
                    if has_clearance(lo, hi):
                        break
                else:
                    raise ValueError("floating-point precision cannot preserve the requested pixel clearance")
        except (ValueError, OverflowError, ZeroDivisionError) as error:
            raise ValueError(f"Cannot fit finite {axis} {scale.get('type')} coordinates: {error}") from error
        if not all(math.isfinite(value) for value in [lo, hi, *new_domain]) or hi <= lo:
            raise ValueError(f"Fitted {axis} scale is not finite and nondegenerate")
        if domain[0] > domain[1]:
            new_domain.reverse()
        fitted[axis], spans[axis] = new_domain, hi - lo
        axes_audit[axis] = {"scale": scale, "source_limits": domain, "fitted_limits": new_domain,
                            "geometry_extent": [min(values), max(values)], "margin_px": margin_px,
                            "clearance_fractions": [fraction_lo, fraction_hi],
                            "geometry_clearance_constraints": [list(item) for item in constraints],
                            "changed": new_domain != domain}
    native = cfg.get("_render_axes") or {}
    aspect = native.get("aspect", "auto")
    equal_aspect = aspect == "equal" or isinstance(aspect, (int, float)) and not isinstance(aspect, bool) and aspect > 0
    if equal_aspect:
        unit_aspect = 1.0 if aspect == "equal" else _finite(aspect, "unit aspect")
        required_ratio = spans["y"] / spans["x"] * unit_aspect
        if height / width < required_ratio:
            height = width * required_ratio
        else:
            width = height / required_ratio
    if not all(math.isfinite(value) and 0 < value <= MAX_PLOT_SIDE for value in (width, height)):
        raise ValueError(f"Complete data/mark bounds require a plot larger than {int(MAX_PLOT_SIDE)} pixels")
    # Round up: rounding down could remove a promised subpixel clearance.
    width, height = math.ceil(width * 1000) / 1000, math.ceil(height * 1000) / 1000
    dimensions = {"width": width, "height": height}
    audit = {"policy": POLICY, "source_limits": original_limits, "fitted_limits": copy.deepcopy(fitted),
             "source_dimensions": original_dimensions, "fitted_dimensions": dimensions,
             "changed": fitted != original_limits or dimensions != original_dimensions,
             "axes": axes_audit, "mark_padding": mark_details,
             "padding_rationale": "Observation/interval endpoints plus conservative symbol, cap and stroke paint bounds with 2px safety; fit in scale-transform space.",
             "equal_aspect": bool(equal_aspect), "aspect_policy": "Enlarge plot dimensions; never narrow data domains.",
             "observations_changed": False}
    return fitted, width, height, audit
