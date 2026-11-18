"""Explicit composite diversity; omitted controls preserve existing sampling."""
from __future__ import annotations


def apply_controls(cfg, controls, rng):
    """Keep category identity/order and quantitative values honest in the GT."""
    for key in ("x_axis_mode", "y_axis_mode", "x_tick_label_type", "y_tick_label_type"):
        if key in controls:
            cfg[key] = controls[key]
    count = len(cfg["labels"])
    label_type = controls.get("x_tick_label_type")
    if label_type == "numbers":
        start, step = rng.randint(0, 20), rng.choice((1, 5, 10, 25))
        cfg["labels"] = [str(start + step * i) for i in range(count)]
        cfg["x_title"] = "Measurement interval"
    elif label_type == "dates":
        year, month = rng.randint(2018, 2025), rng.randint(0, 11)
        cfg["labels"] = [f"{year + (month + i) // 12}-{(month + i) % 12 + 1:02d}" for i in range(count)]
        cfg["x_title"] = "Month"
    elif label_type == "percent":
        cfg["labels"] = [f"{100 * (i + 1) / count:.0f}%" for i in range(count)]
        cfg["x_title"] = "Target share (%)"
    elif label_type == "text":
        # Explicit text control guarantees Q8=C, even if the word pool includes
        # labels made entirely of digits. Keep the original language variety.
        cfg["labels"] = [f"Group {label}" for label in cfg["labels"]]
    if "show_markers" in controls:
        for i, role in enumerate(cfg["series_roles"]):
            if role == "line":
                cfg["markers"][i] = (cfg["markers"][i] or "o") if controls["show_markers"] else None
                cfg["markevery"][i] = None
    if controls.get("y_tick_label_type") == "percent":
        # Express the sampled shape as a fraction before d3 percent formatting;
        # scale uncertainties and domains together with the observations.
        factor = max(abs(float(v)) for row in cfg["matrix"] for v in row) or 1.0
        cfg["matrix"] = [[float(v) / factor for v in row] for row in cfg["matrix"]]
        if cfg.get("yerr") is not None:
            cfg["yerr"] = [[float(v) / factor for v in row] for row in cfg["yerr"]]
        for key in ("ylim", "ylims"):
            if cfg.get(key) is not None:
                cfg[key] = [float(v) / factor for v in cfg[key]]
        cfg["y_title"] = "Share (%)"
        if cfg.get("dual_y_axis"):
            cfg["y_title_right"] = "Line share (%)"
        for options in (cfg.get("data_labels") or {}).values():
            options["format"] = ".0%"
