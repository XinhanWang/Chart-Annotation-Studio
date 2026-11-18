"""Visible observation order shared by rendering, evidence and training GT.

Stable source IDs and point indices remain untouched. Only the table sequence
changes: horizontal categories run top-to-bottom; other categories and numeric
positions run left-to-right. Stack/scatter ties run top-to-bottom; line ties
retain the stable series order, which also determines the legend. Composite
charts read their bar layer first, then the overlaid line vertices.
"""
from __future__ import annotations


def visual_rows(kind: str, rows: list[dict], *, x_reverse: bool = False,
                y_reverse: bool = False) -> list[dict]:
    """Return a new row list in screen reading order, without changing rows."""
    x_direction = -1 if x_reverse else 1
    y_direction = 1 if y_reverse else -1

    def key(row: dict) -> tuple:
        stable = (row.get("series_index", 0), row.get("point_index", 0), row.get("row_index", 0))
        if kind == "barline_n":
            # A composite is read as its two layers: every grouped bar left to
            # right, then the overlaid line vertices on the same categories.
            return (0 if row["role"] == "bar" else 1,
                    x_direction * row["category_position"], x_direction * row["plot_x"], *stable)
        if kind.startswith("barh"):
            return (y_direction * row["category_position"],
                    y_direction * row["plot_category"], *stable)
        if kind.startswith("barv"):
            inner = (y_direction * (row["value_lower"] + row["value_upper"]) / 2
                     if kind == "barv_stack" else x_direction * row["plot_category"])
            return (x_direction * row["category_position"], inner, *stable)
        if kind.startswith("line"):
            return (x_direction * row["plot_x"], *stable)
        return (x_direction * row["plot_x"], y_direction * row["plot_y"], *stable)

    return sorted(rows, key=key)


def first_seen(rows: list[dict], field: str) -> list:
    return list(dict.fromkeys(row[field] for row in rows))


def needs_path_order(rows: list[dict]) -> bool:
    """A line may be reversed safely, but must not acquire different edges."""
    paths: dict[str, list[int]] = {}
    for row in rows:
        paths.setdefault(row["series_id"], []).append(row["point_index"])
    return any(path != sorted(path) and path != sorted(path, reverse=True)
               for path in paths.values())


def needs_stack_endpoints(rows: list[dict]) -> bool:
    """Detect stacks whose supplied endpoints are not a zero-based diverging sum."""
    totals: dict[tuple, float] = {}
    for row in sorted(rows, key=lambda item: (item["category_index"], item["series_index"])):
        key = (row["category_id"], row["value"] < 0)
        lower = totals.get(key, 0)
        upper = lower + row["value"]
        if abs(row["value_lower"] - lower) > 1e-9 * max(1, abs(lower), abs(row["value_lower"])):
            return True
        if abs(row["value_upper"] - upper) > 1e-9 * max(1, abs(upper), abs(row["value_upper"])):
            return True
        totals[key] = upper
    return False
