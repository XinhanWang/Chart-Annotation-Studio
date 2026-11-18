# SVG font baseline — 2026-11-11 (before implementation)

Scope: render.mjs, font_embedding.py, bootstrap.py, fonts.manifest.json, assets/fonts, tests/test_font_embedding.py, font licensing docs only.

Full SVG roles: axis-label, axis-title, legend-label, legend-title, title/subtitle and mark text, including nested tspans and inherited family/weight/style. Compact removes presentation labels according to its spec but any surviving text (including mark text) must independently resolve. Full/compact must be audited independently, never infer glyph coverage from selected_font alone.

Before changes: 16 project font files hashed, canvas registration attempted. SVG retains text but contains no @font-face or embedded font bytes. Resvg loads local paths and system fonts (loadSystemFonts:true); Sharp uses uncontrolled host font discovery. Exported SVG consequently depends on the viewer machine. Full and compact share this defect. Vega layout may use estimated widths when node-canvas is absent; embedding does not certify scenegraph text geometry.

Original faces: Nimbus Sans/Roman/Mono PS regular+bold; URW Bookman light+demi; URW Gothic book; DejaVu Sans/Serif/Sans Mono regular+bold; Noto Mono regular. No italic variants in original manifest. Preserve these 16 as base sampling population; added variants are support faces only.

Actual fontTools inspection: original Nimbus/URW OTF files have OS/2.fsType=4 but no name13/14. Preview/print bit alone is not a copyright grant. Debian URW AGPL exception scoped to PS/PDF cannot silently authorize SVG. DejaVu name13 contains permissive Bitstream/Arev terms; Noto Mono name13 declares OFL 1.1. Require audited full notices in SVG metadata; reject missing/unknown grants and restrictive fsType.

Plan: strict inherited text-run resolution; exact family/weight/style (no synthetic face/fallback); per-face cmap validation; licensed subset @font-face data URIs retaining text; rasterizer receives only bytes decoded from SVG, system fonts disabled. Hash helper, manifest and license files in resume identity. Sharp explicitly rejected until it can honor the same byte-only contract.
