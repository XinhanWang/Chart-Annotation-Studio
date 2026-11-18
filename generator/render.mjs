#!/usr/bin/env node
/**
 * Offline Vega-Lite renderer and scenegraph annotations for VSR v1.
 * node render.mjs --input jobs.json --out report.json [--modules /path/node_modules]
 * Jobs: [{id, full: absoluteJsonPath, compact: absoluteJsonPath, output: absoluteDir}]
 * Geometry uses image-top-left pixel coordinates, XYXY boxes, and XY centers.
 * A line item is a data vertex (zero-area bbox), not a fabricated point marker.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import os from 'node:os';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GEOMETRY_VERSION = 'vsr-pixel-geometry/1.0';
const JOB_RECORD_VERSION = 'vsr-render-job/1.0';
const JOB_STATUSES = new Set(['rendered', 'review_required', 'rejected']);
const NESTED_PATHS = new Set(['line', 'area', 'trail']);
const COORDINATE_PROPERTIES = ['x', 'y', 'x2', 'y2', 'width', 'height', 'size',
  'angle', 'innerRadius', 'outerRadius', 'startAngle', 'endAngle', 'strokeWidth'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const numberOr = (value, fallback = 0) => value == null ? fallback : value;
const jsonText = value => JSON.stringify(value, null, 2) + '\n';

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function moduleCandidates(explicit = []) {
  const dirs = [...explicit.map(p => path.resolve(p))];
  for (const start of [SCRIPT_DIR, process.cwd()]) {
    for (let current = start; ; current = path.dirname(current)) {
      dirs.push(path.join(current, 'node_modules'));
      if (path.dirname(current) === current) break;
    }
  }
  return [...new Set(dirs)];
}

function resolvePackage(name, candidates) {
  for (const dir of candidates) {
    const require = createRequire(path.join(dir, '__vsr_resolver__.cjs'));
    try {
      // Requiring from *within* node_modules also supports a caller supplying
      // a runtime root; Node continues searching ancestor node_modules dirs.
      const entry = require.resolve(name);
      let version = null;
      for (let p = path.dirname(entry); ; p = path.dirname(p)) {
        const pkg = path.join(p, 'package.json');
        if (fs.existsSync(pkg)) {
          const metadata = JSON.parse(fs.readFileSync(pkg, 'utf8'));
          if (metadata.name === name) { version = metadata.version; break; }
        }
        if (path.dirname(p) === p) break;
      }
      return {entry, version, require};
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  throw new Error(`Cannot resolve ${name}. Pass --modules with an existing node_modules directory. Searched: ${candidates.join(', ')}`);
}

function projectFonts(options) {
  const defaultDirectory = path.join(SCRIPT_DIR, 'assets', 'fonts');
  const requested = options.fontDirs?.length ? options.fontDirs.map(p => path.resolve(p)) : [defaultDirectory];
  const manifestPath = options.fontManifest ? path.resolve(options.fontManifest) : path.join(SCRIPT_DIR, 'fonts.manifest.json');
  let manifest = null, manifestHash = null;
  if (fs.existsSync(manifestPath)) {
    const bytes = fs.readFileSync(manifestPath);
    manifest = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    manifestHash = sha256(bytes);
  }
  const metadata = new Map((manifest?.fonts || []).map(font => [path.resolve(path.dirname(manifestPath), font.file), font]));
  const directories = [], files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.(?:ttf|otf|ttc)$/i.test(entry.name)) {
        const bytes = fs.readFileSync(absolute), known = metadata.get(absolute);
        const hash = sha256(bytes);
        if (known?.sha256 && known.sha256 !== hash) throw new Error(`Project font hash differs from manifest: ${absolute}`);
        files.push({file: absolute, bytes: bytes.length, sha256: hash, family: known?.family || null,
          weight: known?.weight || null, style: known?.style || null});
      }
    }
  };
  for (const directory of [...new Set(requested)]) {
    if (!fs.existsSync(directory)) {
      if (options.fontDirs?.length) throw new Error(`Font directory does not exist: ${directory}`);
      continue;
    }
    directories.push(directory); visit(directory);
  }
  return {directories, files, manifest: manifest ? {file: manifestPath, sha256: manifestHash} : null,
    system_fallback_enabled: false, canvas_registered: [], canvas_registration_errors: [],
    rasterizer_project_fonts: options.rasterizer === 'resvg',
    reproducibility_note: 'Every text face and cmap are validated; SVG embeds licensed font bytes; resvg uses only decoded SVG bytes via private temporary files with system fonts disabled. Vega layout bounds remain approximate when estimated.'};
}

async function loadRuntime(options) {
  const candidates = moduleCandidates(options.modules);
  const vp = resolvePackage('vega', candidates);
  const lp = resolvePackage('vega-lite', candidates);
  const fonts = projectFonts(options);
  // Register fonts only with the canvas resolved by Vega's own dependency
  // graph; an unrelated canvas module would not fix Vega's measurements.
  try {
    const vegaRequire = createRequire(vp.entry);
    const canvasRequire = createRequire(vegaRequire.resolve('vega-canvas'));
    const canvas = canvasRequire('canvas');
    if (typeof canvas.registerFont === 'function') for (const font of fonts.files) {
      if (!font.family) continue;
      try {
        canvas.registerFont(font.file, {family: font.family, ...(font.weight ? {weight: String(font.weight)} : {}), ...(font.style ? {style: font.style} : {})});
        fonts.canvas_registered.push(font.file);
      } catch (error) { fonts.canvas_registration_errors.push({file: font.file, error: String(error.message || error)}); }
    }
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') fonts.canvas_registration_errors.push({error: String(error.message || error)});
  }
  const vega = await import(pathToFileURL(vp.entry).href);
  const vl = await import(pathToFileURL(lp.entry).href);
  const scenegraphEntry = createRequire(vp.entry).resolve('vega-scenegraph');
  const scenegraph = await import(pathToFileURL(scenegraphEntry).href);
  const metrics = scenegraph.textMetrics;
  fonts.text_measurement = metrics.width === metrics.estimateWidth ? 'vega_estimated_0.8_times_char_count_times_font_size'
    : metrics.width === metrics.measureWidth ? 'node_canvas' : 'custom';
  fonts.measurement_note = fonts.text_measurement.startsWith('vega_estimated')
    ? 'No usable node-canvas context is available. Vega estimates layout text widths independently of resvg font rendering; text bounds and clipping audits are approximate.'
    : 'Vega uses a native canvas context for text widths. Project font registration and fallback depend on the recorded canvas registration list.';
  const rasterName = options.rasterizer === 'sharp' ? 'sharp' : '@resvg/resvg-js';
  const rp = resolvePackage(rasterName, candidates);
  let rasterize;
  if (options.rasterizer === 'sharp') {
    throw new Error('Sharp rejected: byte-only embedded-font rendering with system fonts disabled is unsupported. Use resvg.');
  } else {
    const {Resvg} = rp.require(rp.entry);
    const fontBuffersFromSvg = svg => [...svg.matchAll(/src:url\("data:font\/(?:otf|ttf);base64,([A-Za-z0-9+/=]+)"\)/g)].map(match => Buffer.from(match[1], 'base64'));
    // Native resvg 2.6.2 does not support fontBuffers. Materialize only SVG
    // embedded bytes into a private ephemeral directory; never use project paths.
    const withEmbeddedFonts = (buffers, callback) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vsr-svg-fonts-'));
      try {
        fs.chmodSync(directory, 0o700);
        const files = buffers.map((bytes,index) => {
          const file=path.join(directory, `${index}.${bytes.subarray(0,4).toString()==='OTTO'?'otf':'ttf'}`);
          fs.writeFileSync(file,bytes,{mode:0o600});return file;
        });
        return callback(files);
      } finally { fs.rmSync(directory,{recursive:true,force:true}); }
    };
    const probeFont = fonts.files.find(font => font.family === 'DejaVu Sans' && font.weight === 400 && font.style === 'normal');
    if (!probeFont) throw new Error('Embedded-font capability probe requires pinned DejaVu Sans regular');
    const probeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><text x="2" y="30" font-family="DejaVu Sans" font-size="25">Ag</text></svg>';
    const probe = buffers => withEmbeddedFonts(buffers, fontFiles => {
      const r=new Resvg(probeSvg,{font:{loadSystemFonts:false,fontDirs:[],fontFiles}});const img=r.render();
      try{return Buffer.from(img.asPng())}finally{img.free?.();r.free?.()}
    });
    if (probe([]).equals(probe([fs.readFileSync(probeFont.file)]))) throw new Error('Resvg cannot load isolated embedded font bytes: refusing fallback');
    fonts.raster_font_source='SVG data URI bytes decoded to private ephemeral files; system fonts disabled';
    rasterize = async svg => {
      const buffers = fontBuffersFromSvg(svg);
      if (/<text\b/.test(svg) && !buffers.length) throw new Error('Text SVG has no embedded font bytes');
      return withEmbeddedFonts(buffers, fontFiles => {
        const renderer = new Resvg(svg, {font: {loadSystemFonts: false, fontDirs:[], fontFiles}});
        let rendered;
        try { rendered=renderer.render(); return {png:Buffer.from(rendered.asPng()),width:rendered.width,height:rendered.height}; }
        finally { rendered?.free?.();renderer.free?.(); }
      });
    };
  }
  return {vega, vl, rasterize, provenance: {
    node: process.version, vega: vega.version, vega_lite: vl.version,
    rasterizer: rasterName, rasterizer_version: rp.version,
    module_entries: {vega: vp.entry, vega_lite: lp.entry, rasterizer: rp.entry},
    geometry_version: GEOMETRY_VERSION, offline: true, fonts,
  }};
}

function assertInlineResources(spec) {
  const visit = (value, at = '$') => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((v, i) => visit(v, `${at}[${i}]`)); return; }
    if (value.data?.url != null) throw new Error(`External data resource is disabled at ${at}.data.url`);
    if (value.mark === 'image' || value.mark?.type === 'image' || value.type === 'image') {
      throw new Error(`Image resources are disabled at ${at}`);
    }
    for (const [key, child] of Object.entries(value)) {
      // Inline data are ordinary user values, not resource declarations.
      if (key !== 'values' && key !== 'datasets') visit(child, `${at}.${key}`);
    }
  };
  visit(spec);
}

const blockedLoader = {
  load: async uri => { throw new Error(`External resource loading is disabled: ${String(uri)}`); },
  sanitize: async uri => { throw new Error(`External resource access is disabled: ${String(uri)}`); },
};

function svgCanvas(svg) {
  const opening = svg.match(/^\s*<svg\b[^>]*>/)?.[0];
  if (!opening) throw new Error('Vega did not return an SVG root');
  const attribute = name => opening.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const width = Number(attribute('width'));
  const height = Number(attribute('height'));
  const viewBox = attribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!(width > 0 && height > 0 && finite(width) && finite(height)) ||
      !viewBox || viewBox.length !== 4 || !viewBox.every(finite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error('SVG has invalid dimensions or viewBox');
  }
  return {opening, width, height, viewBox};
}

function normalizeCanvas(svg) {
  const before = svgCanvas(svg);
  // Integer SVG viewport dimensions make the PNG mapping unambiguous even
  // when a spec has fractional dimensions. Preserve the logical viewBox.
  const width = Math.ceil(before.width), height = Math.ceil(before.height);
  const opening = before.opening.replace(/\s(?:width|height|preserveAspectRatio)="[^"]*"/g, '')
    .replace(/>$/, ` width="${width}" height="${height}" preserveAspectRatio="none">`);
  return {svg: svg.replace(before.opening, opening), width, height, viewBox: before.viewBox};
}

function boxFromBounds(bounds, dx, dy) {
  if (!bounds) return null;
  const values = [bounds.x1, bounds.y1, bounds.x2, bounds.y2];
  return values.every(finite) && values[0] <= values[2] && values[1] <= values[3]
    ? [values[0] + dx, values[1] + dy, values[2] + dx, values[3] + dy] : null;
}

function mapPoint(point, transform) {
  return point && [point[0] * transform.scale_x + transform.offset_x,
    point[1] * transform.scale_y + transform.offset_y];
}

function mapBox(box, transform) {
  return box && [...mapPoint(box.slice(0, 2), transform), ...mapPoint(box.slice(2), transform)];
}

function isOutside(box, container, tolerance = 0.75) {
  return box && (box[0] < container[0] - tolerance || box[1] < container[1] - tolerance ||
    box[2] > container[2] + tolerance || box[3] > container[3] + tolerance);
}

function jsonDatum(datum) {
  // Vega tuple identity is a Symbol; only the semantic and transformed fields
  // are serialized. This also prevents graph references in custom datum values.
  return datum == null ? null : JSON.parse(JSON.stringify(datum));
}

function painted(item, opacity = 1) {
  const hasPaint = (color, alpha) => color != null && color !== 'none' && color !== 'transparent' && numberOr(alpha, 1) > 0;
  return opacity * numberOr(item.opacity, 1) > 0 &&
    (hasPaint(item.fill, item.fillOpacity) || (hasPaint(item.stroke, item.strokeOpacity) && numberOr(item.strokeWidth, 1) > 0));
}

/** Collect only data marks; axes, legends, titles and their symbols are excluded. */
export function collectGeometry(view, canvas, context = {}) {
  const padding = view.padding();
  const origin = view.origin();
  const offset = [origin[0] + padding.left, origin[1] + padding.top];
  const transform = {scale_x: canvas.width / canvas.viewBox[2], scale_y: canvas.height / canvas.viewBox[3],
    offset_x: -canvas.viewBox[0] * canvas.width / canvas.viewBox[2],
    offset_y: -canvas.viewBox[1] * canvas.height / canvas.viewBox[3]};
  const elements = [], marks = [], texts = [], issues = [];
  const issue = (code, message, details = {}) => issues.push({code, message, ...details});
  const clipping = (item, dx, dy) => {
    if (typeof item.clip === 'function' || item.cornerRadius || item.cornerRadiusTopLeft || item.cornerRadiusTopRight ||
        item.cornerRadiusBottomLeft || item.cornerRadiusBottomRight) {
      issue('non_rectangular_clip', 'A clip path is not rectangular; only its outer box can be audited.');
    }
    return mapBox([dx, dy, dx + numberOr(item.width), dy + numberOr(item.height)], transform);
  };
  const descend = (scene, dx, dy, inheritedClips = [], groupPath = [], groupOpacity = 1) => {
    if (!scene?.marktype) return;
    if (scene.marktype === 'group') {
      for (const [i, group] of (scene.items || []).entries()) {
        const gx = dx + numberOr(group.x), gy = dy + numberOr(group.y);
        if (![gx, gy].every(finite)) { issue('nonfinite_group', 'Group position is not finite.', {name: scene.name}); continue; }
        const clips = group.clip ? [...inheritedClips, clipping(group, gx, gy)] : inheritedClips;
        const nestedPath = [...groupPath, {name: scene.name || null, index: i,
          offset: mapPoint([gx, gy], transform), datum: jsonDatum(group.datum)}];
        for (const child of group.items || []) descend(child, gx, gy, clips, nestedPath, groupOpacity * numberOr(group.opacity, 1));
      }
      return;
    }
    if (scene.marktype === 'text') {
      for (const [index, item] of (scene.items || []).entries()) {
        if (item.text == null || String(item.text).length === 0) continue;
        const bbox = mapBox(boxFromBounds(item.bounds, dx, dy), transform);
        if (!bbox) { issue('nonfinite_text', 'Text has no finite scenegraph bounds.', {name: scene.name, index}); continue; }
        texts.push({text_id: `text_${texts.length}`, role: scene.role || null, mark_name: scene.name || null,
          text: item.text, bbox, center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
          anchor: mapPoint([numberOr(item.x) + dx, numberOr(item.y) + dy], transform),
          group_offset: mapPoint([dx, dy], transform), drawable: painted(item, groupOpacity),
          font: item.font || null, font_size_px: numberOr(item.fontSize, 11) * transform.scale_y,
          font_weight: item.fontWeight || null, font_style: item.fontStyle || null, angle: numberOr(item.angle), align: item.align || null,
          baseline: item.baseline || null});
      }
    }
    if (scene.role !== 'mark') return;
    const markId = `mark_${marks.length}`;
    const decorationMark = (scene.name || '').startsWith('__vsr_decoration_') ||
      groupPath.some(group => (group.name || '').startsWith('__vsr_decoration_'));
    const clips = scene.clip ? [...inheritedClips, clipping({...scene.group, clip: scene.clip}, dx, dy)] : inheritedClips;
    const mark = {mark_id: markId, name: scene.name || null, mark_type: scene.marktype, role: scene.role,
      annotation_role: decorationMark ? 'decoration' : 'observation',
      source_item_count: (scene.items || []).length, element_count: 0, drawable_element_count: 0,
      undefined_item_count: 0, bbox: mapBox(boxFromBounds(scene.bounds, dx, dy), transform),
      group_offset: mapPoint([dx, dy], transform), groups: groupPath, clip_boxes: clips};
    marks.push(mark);
    for (const [index, item] of (scene.items || []).entries()) {
      if (item.defined === false) { mark.undefined_item_count++; continue; }
      const invalid = COORDINATE_PROPERTIES.filter(key => item[key] != null && !finite(item[key]));
      if (invalid.length) {
        issue('nonfinite_element', 'A rendered coordinate is not finite.', {mark_id: markId, index, properties: invalid});
        continue;
      }
      const x = numberOr(item.x) + dx, y = numberOr(item.y) + dy;
      const anchor = mapPoint([x, y], transform);
      const paintBox = NESTED_PATHS.has(scene.marktype) ? null : mapBox(boxFromBounds(item.bounds, dx, dy), transform);
      let box = paintBox, center = paintBox && [(paintBox[0] + paintBox[2]) / 2, (paintBox[1] + paintBox[3]) / 2];
      let bboxKind = 'scenegraph_paint_bounds';
      if (scene.marktype === 'rect') {
        const opposite = mapPoint([x + numberOr(item.width), y + numberOr(item.height)], transform);
        box = [Math.min(anchor[0], opposite[0]), Math.min(anchor[1], opposite[1]), Math.max(anchor[0], opposite[0]), Math.max(anchor[1], opposite[1])];
        center = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
        bboxKind = 'rect_fill';
      } else if (NESTED_PATHS.has(scene.marktype)) {
        box = [...anchor, ...anchor]; center = anchor.slice(); bboxKind = 'data_vertex';
      } else if (scene.marktype === 'symbol') {
        center = anchor.slice();
      }
      if (!box || !box.every(finite) || !center?.every(finite)) {
        issue('nonfinite_element', 'Element has no finite pixel bounds.', {mark_id: markId, index}); continue;
      }
      const styleItem = NESTED_PATHS.has(scene.marktype) ? scene.items[0] : item;
      const element = {element_id: `${markId}:${index}`, mark_id: markId, mark_type: scene.marktype,
        role: decorationMark || item.datum?.decoration_role ? 'decoration' : 'observation',
        index, datum: jsonDatum(item.datum), bbox: box, bbox_kind: bboxKind, center, anchor,
        paint_bbox: paintBox, drawable: painted(styleItem, groupOpacity),
        stroke_width_px: [numberOr(styleItem.strokeWidth, 1) * transform.scale_x,
          numberOr(styleItem.strokeWidth, 1) * transform.scale_y],
        style: Object.fromEntries(['fill', 'stroke', 'fillOpacity', 'strokeOpacity', 'opacity', 'strokeWidth',
          'strokeDash', 'strokeCap', 'strokeJoin', 'shape', 'size', 'angle', 'interpolate'].filter(key => styleItem[key] != null).map(key => [key, styleItem[key]])),
        group_offset: mark.group_offset, clip_boxes: clips};
      if (scene.marktype === 'rule') element.end = mapPoint([numberOr(item.x2, numberOr(item.x)) + dx, numberOr(item.y2, numberOr(item.y)) + dy], transform);
      if (scene.marktype === 'area') element.end = mapPoint([x + numberOr(item.width), y + numberOr(item.height)], transform);
      elements.push(element);
      mark.element_count++;
      if (element.drawable) mark.drawable_element_count++;
    }
  };
  descend(view.scenegraph().root, offset[0], offset[1]);
  const image = {file: context.image || 'chart.png', width: canvas.width, height: canvas.height,
    coordinate_system: 'image_top_left', x_direction: 'right', y_direction: 'down',
    bbox_format: 'xyxy', pixel_convention: 'continuous pixel-edge coordinates; pixel centers are at n+0.5'};
  const geometry = {schema_version: GEOMETRY_VERSION, id: context.id ?? null, variant: context.variant ?? 'full',
    image, svg: {width: canvas.width, height: canvas.height, view_box: canvas.viewBox},
    source_to_image: transform,
    view: {origin, padding, root_offset: offset, plot_width: view.width(), plot_height: view.height()},
    marks, elements, texts, extraction_issues: issues};
  geometry.validation = validateGeometry(geometry);
  return geometry;
}

export function validateGeometry(geometry) {
  // The nested SVG retains the source viewport clip when letterboxed. Bounds
  // extending into the white margin are still clipped by the source image.
  const canvas = geometry.resize
    ? [geometry.resize.offset_x, geometry.resize.offset_y,
      geometry.resize.offset_x + geometry.resize.content_width, geometry.resize.offset_y + geometry.resize.content_height]
    : [0, 0, geometry.image.width, geometry.image.height];
  const nonfinite = geometry.extraction_issues.filter(i => i.code.startsWith('nonfinite'));
  const clippedElements = [], clippedMarks = [], plotClippedElements = [], plotClippedMarks = [];
  const clippedTexts = [], severeTexts = [];
  const counts = {}, observationCounts = {}, decorationCounts = {};
  for (const element of geometry.elements) {
    counts[element.mark_type] = (counts[element.mark_type] || 0) + 1;
    const roleCounts = element.role === 'decoration' ? decorationCounts : observationCounts;
    roleCounts[element.mark_type] = (roleCounts[element.mark_type] || 0) + 1;
    if (![...element.bbox, ...element.center, ...element.anchor, ...(element.paint_bbox || []), ...(element.end || [])].every(finite)) {
      nonfinite.push({code: 'nonfinite_annotation', element_id: element.element_id});
    }
    if (!element.drawable) continue;
    const bounds = element.paint_bbox || element.bbox;
    if (isOutside(bounds, canvas)) clippedElements.push(element.element_id);
    if (element.clip_boxes.some(box => isOutside(bounds, box))) plotClippedElements.push(element.element_id);
  }
  for (const mark of geometry.marks) {
    if (!mark.drawable_element_count) continue;
    if (isOutside(mark.bbox, canvas)) clippedMarks.push(mark.mark_id);
    if (mark.clip_boxes.some(box => isOutside(mark.bbox, box))) plotClippedMarks.push(mark.mark_id);
  }
  for (const text of geometry.texts || []) {
    if (![...text.bbox, ...text.center, ...text.anchor].every(finite)) {
      nonfinite.push({code: 'nonfinite_text_annotation', text_id: text.text_id}); continue;
    }
    if (!text.drawable || !isOutside(text.bbox, canvas)) continue;
    const [x1, y1, x2, y2] = text.bbox;
    const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const inside = Math.max(0, Math.min(x2, canvas[2]) - Math.max(x1, canvas[0])) *
      Math.max(0, Math.min(y2, canvas[3]) - Math.max(y1, canvas[1]));
    const fraction = area ? Math.max(0, 1 - inside / area) : 0;
    const overflow = Math.max(0, canvas[0] - x1, canvas[1] - y1, x2 - canvas[2], y2 - canvas[3]);
    const details = {text_id: text.text_id, outside_fraction: fraction, max_overflow_px: overflow};
    clippedTexts.push(details);
    // Scenegraph font measurements can be approximate without a native canvas.
    // Reject only substantial loss, never mere label-to-label overlap.
    if (fraction >= 0.5 && overflow >= Math.max(8, text.font_size_px * 0.5)) severeTexts.push(details);
  }
  return {passed: nonfinite.length === 0 && clippedElements.length === 0 && clippedMarks.length === 0 &&
      plotClippedElements.length === 0 && plotClippedMarks.length === 0 && clippedTexts.length === 0 && geometry.elements.length > 0,
    element_count: geometry.elements.length, drawable_element_count: geometry.elements.filter(e => e.drawable).length,
    observation_element_count: geometry.elements.filter(e => e.role !== 'decoration').length,
    decoration_element_count: geometry.elements.filter(e => e.role === 'decoration').length,
    observation_counts_by_type: observationCounts, decoration_counts_by_type: decorationCounts,
    mark_group_count: geometry.marks.length, counts_by_type: counts,
    undefined_item_count: geometry.marks.reduce((sum, m) => sum + m.undefined_item_count, 0),
    nonfinite_count: nonfinite.length, nonfinite_details: nonfinite,
    canvas_clipped_elements: clippedElements, canvas_clipped_marks: clippedMarks,
    plot_clipped_elements: plotClippedElements, plot_clipped_marks: plotClippedMarks,
    text_count: (geometry.texts || []).length, canvas_clipped_texts: clippedTexts, severely_clipped_texts: severeTexts,
    effective_canvas_bbox: canvas,
    severe_text_clip_policy: 'At least 50% of scenegraph bbox area outside canvas and overflow >= max(8px, half font size). Text overlaps are not tested.',
    clipping_tolerance_px: 0.75,
    bounds_note: 'Vega scenegraph paint bounds can conservatively include unused miter-join space. Data vertices have zero-area boxes; a mark bbox covers the complete line/area path.'};
}

export function squareTransform(width, height, size = 1036, mode = 'contain') {
  const scale = Math.min(size / width, size / height);
  const contentWidth = mode === 'stretch' ? size : Math.max(1, Math.round(width * scale));
  const contentHeight = mode === 'stretch' ? size : Math.max(1, Math.round(height * scale));
  return {mode, source_width: width, source_height: height, target_width: size, target_height: size,
    content_width: contentWidth, content_height: contentHeight,
    scale_x: contentWidth / width, scale_y: contentHeight / height,
    offset_x: Math.floor((size - contentWidth) / 2), offset_y: Math.floor((size - contentHeight) / 2)};
}

export function remapGeometry(geometry, transform, filename) {
  const output = structuredClone(geometry);
  output.image = {...output.image, file: filename, width: transform.target_width, height: transform.target_height};
  output.resize = transform;
  output.source_to_image = {
    scale_x: geometry.source_to_image.scale_x * transform.scale_x,
    scale_y: geometry.source_to_image.scale_y * transform.scale_y,
    offset_x: geometry.source_to_image.offset_x * transform.scale_x + transform.offset_x,
    offset_y: geometry.source_to_image.offset_y * transform.scale_y + transform.offset_y,
  };
  for (const item of [...output.marks, ...output.elements]) {
    for (const key of ['bbox', 'paint_bbox']) if (item[key]) item[key] = mapBox(item[key], transform);
    for (const key of ['center', 'anchor', 'end', 'group_offset']) if (item[key]) item[key] = mapPoint(item[key], transform);
    item.clip_boxes = item.clip_boxes.map(box => mapBox(box, transform));
    if (item.groups) item.groups = item.groups.map(group => ({...group, offset: mapPoint(group.offset, transform)}));
    if (item.stroke_width_px) item.stroke_width_px = [item.stroke_width_px[0] * transform.scale_x, item.stroke_width_px[1] * transform.scale_y];
  }
  for (const text of output.texts || []) {
    text.bbox = mapBox(text.bbox, transform);
    for (const key of ['center', 'anchor', 'group_offset']) text[key] = mapPoint(text[key], transform);
    text.font_size_px *= transform.scale_y;
  }
  output.validation = validateGeometry(output);
  return output;
}

function squareSvg(svg, transform) {
  const canvas = svgCanvas(svg);
  const inner = svg.slice(canvas.opening.length).replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${transform.target_width}" height="${transform.target_height}" viewBox="0 0 ${transform.target_width} ${transform.target_height}"><rect width="100%" height="100%" fill="white"/><svg x="${transform.offset_x}" y="${transform.offset_y}" width="${transform.content_width}" height="${transform.content_height}" viewBox="${canvas.viewBox.join(' ')}" preserveAspectRatio="none">${inner}</svg></svg>`;
}

function loggerFor(warnings, errors, vega) {
  let level = vega.Warn;
  const message = values => values.map(v => v instanceof Error ? v.message : typeof v === 'string' ? v : JSON.stringify(v)).join(' ');
  const logger = {warn: (...v) => { warnings.push(message(v)); return logger; },
    error: (...v) => { errors.push(message(v)); return logger; },
    info: () => logger, debug: () => logger,
    level: value => { if (value === undefined) return level; level = value; return logger; }};
  return logger;
}

async function renderVariant(job, variant, runtime, options) {
  const warnings = [], errors = [];
  const result = {status: 'rejected', source: job[variant], warnings, errors};
  const stem = variant === 'full' ? 'chart' : 'compact';
  const geometryName = variant === 'full' ? 'geometry' : 'compact.geometry';
  let view;
  try {
    const source = fs.readFileSync(job[variant], 'utf8').replace(/^\uFEFF/, '');
    const spec = JSON.parse(source);
    assertInlineResources(spec);
    const selectedFont = spec.usermeta?.presentation?.font;
    if (selectedFont?.source === 'font_file') {
      const files = runtime.provenance.fonts.files.filter(font => path.basename(font.file) === selectedFont.file);
      if (!files.length) throw new Error(`Selected font is not loaded by the renderer: ${selectedFont.file}. Run bootstrap.py or supply --font-dir.`);
      if (files.some(font => font.family && font.family !== selectedFont.family)) {
        throw new Error(`Selected font family differs from fonts.manifest.json: ${selectedFont.file}`);
      }
      result.selected_font = {family: selectedFont.family, weight: selectedFont.weight,
        style: selectedFont.style, files: files.map(font => ({file: font.file, sha256: font.sha256}))};
    }
    const logger = loggerFor(warnings, errors, runtime.vega);
    const compiled = runtime.vl.compile(spec, {logger}).spec;
    view = new runtime.vega.View(runtime.vega.parse(compiled), {renderer: 'none', loader: blockedLoader, logger, logLevel: runtime.vega.Warn});
    view.logger(logger);
    await view.runAsync();
    const canvas = normalizeCanvas(await view.toSVG());
    // Only geometry attributes are checked. Literal labels such as "Infinity"
    // are valid text and must not trigger a false failure.
    if (/\b(?:d|transform|x|y|x1|x2|y1|y2|width|height|r|cx|cy|points|viewBox)="[^"]*\b(?:NaN|[+-]?Infinity|undefined)\b/.test(canvas.svg)) {
      throw new Error('SVG contains a non-finite geometry attribute');
    }
    // File descriptors avoid subprocess pipe polling restrictions and large
    // licensed font/source payloads filling a synchronous pipe buffer.
    const embeddingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsr-font-embedding-'));
    let fontResult;
    const embeddingFds = [];
    try {
      fs.chmodSync(embeddingDir, 0o700);
      const inputFile = path.join(embeddingDir, 'input.json');
      const outputFile = path.join(embeddingDir, 'output.json');
      const errorFile = path.join(embeddingDir, 'stderr.txt');
      fs.writeFileSync(inputFile, JSON.stringify({svg:canvas.svg, manifest:options.fontManifest || path.join(SCRIPT_DIR,'fonts.manifest.json')}), {mode:0o600});
      embeddingFds.push(fs.openSync(inputFile, 'r'), fs.openSync(outputFile, 'w', 0o600), fs.openSync(errorFile, 'w', 0o600));
      const embedded = spawnSync(process.env.VSR_FONT_PYTHON || 'python3', [path.join(SCRIPT_DIR, 'font_embedding.py')], {
        stdio:embeddingFds, timeout:120000, windowsHide:true});
      if (embedded.error || embedded.status !== 0) throw new Error(`Font embedding failed: ${embedded.error || fs.readFileSync(errorFile, 'utf8')}`);
      fontResult = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    } finally {
      for (const fd of embeddingFds) fs.closeSync(fd);
      fs.rmSync(embeddingDir, {recursive:true, force:true});
    }
    canvas.svg=fontResult.svg;
    result.font_embedding={...fontResult.audit, source_archives:Object.fromEntries(Object.entries(fontResult.audit.source_archives || {}).map(([key,value])=>[key,{...value,base64:undefined}]))};
    const raster = await runtime.rasterize(canvas.svg);
    if (raster.width !== canvas.width || raster.height !== canvas.height) throw new Error('PNG dimensions differ from the explicit integer SVG viewport');
    const geometry = collectGeometry(view, canvas, {id: job.id, variant, image: `${stem}.png`});
    const validation = geometry.validation;
    if (!validation.element_count) errors.push('No data-mark geometry was rendered.');
    if (!validation.drawable_element_count) errors.push('No drawable data marks were rendered.');
    if (validation.nonfinite_count) errors.push(`${validation.nonfinite_count} non-finite scenegraph/annotation entries.`);
    if (validation.canvas_clipped_elements.length || validation.canvas_clipped_marks.length) warnings.push('Data-mark bounds extend outside the image; inspect canvas_clipped_* in validation.');
    if (validation.plot_clipped_elements.length || validation.plot_clipped_marks.length) warnings.push('Data-mark bounds intersect an active plot clip; inspect plot_clipped_* in validation.');
    if (validation.canvas_clipped_texts.length) warnings.push(`${validation.canvas_clipped_texts.length} text bounds extend outside the canvas.`);
    if (validation.severely_clipped_texts.length) errors.push(`${validation.severely_clipped_texts.length} text elements have at least half their scenegraph bounds outside the canvas.`);
    for (const issue of geometry.extraction_issues) if (!issue.code.startsWith('nonfinite')) warnings.push(issue.message);
    const files = {svg: path.join(job.output, `${stem}.svg`), png: path.join(job.output, `${stem}.png`),
      geometry: path.join(job.output, `${geometryName}.json`)};
    atomicWrite(files.svg, canvas.svg);
    atomicWrite(files.png, raster.png);
    atomicWrite(files.geometry, jsonText(geometry));
    Object.assign(result, {width: raster.width, height: raster.height, svg_width: canvas.width, svg_height: canvas.height,
      element_count: validation.element_count, counts_by_type: validation.counts_by_type,
      observation_element_count: validation.observation_element_count, decoration_element_count: validation.decoration_element_count,
      mark_groups: geometry.marks.map(({mark_id, name, mark_type, source_item_count, element_count, drawable_element_count}) =>
        ({mark_id, name, mark_type, source_item_count, element_count, drawable_element_count})),
      validation, files, source_sha256: sha256(source), svg_sha256: sha256(canvas.svg), png_sha256: sha256(raster.png)});
    if (options.size > 0) {
      const transform = squareTransform(raster.width, raster.height, options.size, options.resizeMode);
      const resized = await runtime.rasterize(squareSvg(canvas.svg, transform));
      if (resized.width !== options.size || resized.height !== options.size) throw new Error('Square PNG has an unexpected size');
      const filename = `${stem}.${options.size}.png`;
      const mapped = remapGeometry(geometry, transform, filename);
      files.resized_png = path.join(job.output, filename);
      files.resized_geometry = path.join(job.output, `${geometryName}.${options.size}.json`);
      atomicWrite(files.resized_png, resized.png);
      atomicWrite(files.resized_geometry, jsonText(mapped));
      result.resize = {...transform, png_sha256: sha256(resized.png), validation: mapped.validation};
    }
    result.status = errors.length ? 'rejected' : warnings.length ? 'review_required' : 'rendered';
  } catch (error) {
    errors.push(String(error.stack || error));
  } finally {
    view?.finalize();
  }
  return result;
}

function renderOptions(jobs, options) {
  options = {modules: [], fontDirs: [], rasterizer: 'resvg', size: 1036, resizeMode: 'contain',
    workers: 2, chunkSize: 10, childTimeoutMs: 180000, resume: true, ...options};
  if (!Array.isArray(jobs)) throw new Error('--input must contain a JSON array of jobs');
  if (options.rasterizer === 'sharp') throw new Error('Sharp rejected: isolated embedded font bytes are unsupported; use resvg.');
  if (!['resvg', 'sharp'].includes(options.rasterizer)) throw new Error('--rasterizer must be resvg or sharp');
  if (!Number.isInteger(options.size) || options.size < 0 || options.size > 16384) throw new Error('--size must be an integer between 0 and 16384');
  if (!['contain', 'stretch'].includes(options.resizeMode)) throw new Error('--resize-mode must be contain or stretch');
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 32) throw new Error('--workers must be between 1 and 32');
  if (!Number.isInteger(options.chunkSize) || options.chunkSize < 1 || options.chunkSize > 10) throw new Error('--chunk-size must be between 1 and 10');
  if (!Number.isInteger(options.childTimeoutMs) || options.childTimeoutMs < 1000) throw new Error('--child-timeout-ms must be an integer >= 1000');
  options.modules = options.modules.map(p => path.resolve(p));
  options.fontDirs = options.fontDirs.map(p => path.resolve(p));
  return options;
}

function sourceHashes(job) {
  return Object.fromEntries(['full', 'compact'].map(variant => {
    try { return [variant, sha256(fs.readFileSync(job[variant]))]; }
    catch { return [variant, null]; }
  }));
}

function expectedFiles(job, variant, options) {
  const stem = variant === 'full' ? 'chart' : 'compact';
  const geometry = variant === 'full' ? 'geometry' : 'compact.geometry';
  return {svg: path.join(job.output, `${stem}.svg`), png: path.join(job.output, `${stem}.png`),
    geometry: path.join(job.output, `${geometry}.json`), ...(options.size > 0 ? {
      resized_png: path.join(job.output, `${stem}.${options.size}.png`),
      resized_geometry: path.join(job.output, `${geometry}.${options.size}.json`),
    } : {})};
}

function fileHashes(record) {
  const result = [];
  for (const variant of ['full', 'compact']) for (const [key, file] of Object.entries(record[variant]?.files || {})) {
    try {
      const bytes = fs.readFileSync(file);
      result.push({variant, key, file, bytes: bytes.length, sha256: sha256(bytes)});
    } catch { /* Failed variants can have an incomplete set of output files. */ }
  }
  return result;
}

function validateJob(job, ids, outputs) {
  if (!job || job.id == null || !['string', 'number'].includes(typeof job.id)) throw new Error('Each job requires a string or numeric id');
  for (const key of ['full', 'compact', 'output']) if (typeof job[key] !== 'string' || !path.isAbsolute(job[key])) throw new Error(`Job ${job.id}: ${key} must be an absolute path`);
  const outputKey = process.platform === 'win32' ? path.normalize(job.output).toLowerCase() : path.normalize(job.output);
  if (ids.has(String(job.id))) throw new Error(`Duplicate job id: ${job.id}`);
  if (outputs.has(outputKey)) throw new Error(`Duplicate output directory: ${job.output}`);
  ids.add(String(job.id)); outputs.add(outputKey);
}

function readJsonIfPresent(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch { return null; }
}

// Metadata only: the coordinator must never import a native rasterizer.
function rendererIdentity(options) {
  const candidates = moduleCandidates(options.modules);
  const packages = ['vega', 'vega-lite', options.rasterizer === 'sharp' ? 'sharp' : '@resvg/resvg-js']
    .map(name => { const pkg = resolvePackage(name, candidates); return {name, version: pkg.version, entry: pkg.entry}; });
  const fonts = projectFonts(options);
  const identity = {renderer_sha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), node: process.version,
    geometry_version: GEOMETRY_VERSION, packages, size: options.size, resize_mode: options.resizeMode,
    font_embedding_helper_sha256:sha256(fs.readFileSync(path.join(SCRIPT_DIR,'font_embedding.py'))),
    fonttools_version:spawnSync(process.env.VSR_FONT_PYTHON || 'python3',['-c','import fontTools; print(fontTools.__version__)'],{encoding:'utf8'}).stdout?.trim(),
    font_licenses:fs.readdirSync(path.join(SCRIPT_DIR,'docs','font-licenses')).sort().map(name=>({name,sha256:sha256(fs.readFileSync(path.join(SCRIPT_DIR,'docs','font-licenses',name)))})),
    fonts: fonts.files, font_manifest: fonts.manifest, system_font_fallback: false};
  return {fingerprint: sha256(JSON.stringify(identity)), identity,
    provenance: {node: process.version, vega: packages[0].version, vega_lite: packages[1].version,
      rasterizer: packages[2].name, rasterizer_version: packages[2].version,
      geometry_version: GEOMETRY_VERSION, offline: true, fonts, resize_size: options.size, resize_mode: options.resizeMode}};
}

function isVerifiedRecord(record, entry, identity, options, allowRejected = false) {
  if (!record || record.schema_version !== JOB_RECORD_VERSION || !JOB_STATUSES.has(record.status) ||
      (!allowRejected && record.status === 'rejected') || record.render_fingerprint !== identity.fingerprint ||
      String(record.id) !== String(entry.job.id) || path.resolve(record.output || '.') !== path.resolve(entry.job.output) ||
      JSON.stringify(record.input_sha256) !== JSON.stringify(entry.inputHashes)) return false;
  const manifest = record.artifacts || [];
  for (const artifact of manifest) {
    const expected = expectedFiles(entry.job, artifact.variant, options)[artifact.key];
    if (!expected || path.resolve(artifact.file) !== path.resolve(expected)) return false;
    try {
      const bytes = fs.readFileSync(expected);
      if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) return false;
    } catch { return false; }
  }
  if (record.status !== 'rejected') for (const variant of ['full', 'compact']) {
    if (!['rendered', 'review_required'].includes(record[variant]?.status)) return false;
    for (const [key, file] of Object.entries(expectedFiles(entry.job, variant, options))) {
      if (!manifest.some(artifact => artifact.variant === variant && artifact.key === key && path.resolve(artifact.file) === path.resolve(file))) return false;
      if (path.resolve(record[variant].files?.[key] || '.') !== path.resolve(file)) return false;
    }
  }
  return true;
}

function commitJobRecord(job, record) {
  atomicWrite(path.join(job.output, 'render-record.json'), jsonText(record));
}

async function renderJobsInProcess(jobs, options, identity) {
  const runtime = await loadRuntime(options);
  const report = {schema_version: 'vsr-render-report/1.0', renderer: {...runtime.provenance,
    resize_size: options.size, resize_mode: options.resizeMode},
    render_fingerprint: identity.fingerprint,
    started_at: new Date().toISOString(), total: jobs.length, processed: 0, rendered: 0, review_required: 0, rejected: 0, records: []};
  const ids = new Set(), outputs = new Set();
  const checkpoint = () => { if (options.out) atomicWrite(path.resolve(options.out), jsonText(report)); };
  checkpoint();
  for (const [index, job] of jobs.entries()) {
    const record = {schema_version: JOB_RECORD_VERSION, id: job?.id ?? null,
      index: options.jobIndices?.[index] ?? index, status: 'rejected', render_fingerprint: identity.fingerprint,
      input_sha256: sourceHashes(job), attempt_id: options.attemptId || null, started_at: new Date().toISOString()};
    let valid = false;
    try {
      validateJob(job, ids, outputs); valid = true;
      record.output = job.output;
      record.full = await renderVariant(job, 'full', runtime, options);
      record.compact = await renderVariant(job, 'compact', runtime, options);
      const statuses = [record.full.status, record.compact.status];
      record.status = statuses.includes('rejected') ? 'rejected' : statuses.includes('review_required') ? 'review_required' : 'rendered';
    } catch (error) {
      record.errors = [String(error.stack || error)];
    }
    record.finished_at = new Date().toISOString();
    record.artifacts = fileHashes(record);
    if (valid) commitJobRecord(job, record);
    report.records.push(record);
    report.processed++;
    report[record.status]++;
    // A native abort in the next sample must never lose this committed job.
    checkpoint();
    if (report.processed % 10 === 0 || report.processed === jobs.length) {
      if (options.progress !== false) console.log(JSON.stringify({processed: report.processed, total: report.total,
        rendered: report.rendered, review_required: report.review_required, rejected: report.rejected}));
    }
  }
  report.finished_at = new Date().toISOString();
  checkpoint();
  return report;
}

function childRun(configuration, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child-config', configuration],
      {cwd: process.cwd(), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '', timedOut = false, spawnError = null;
    const keepTail = (before, chunk) => (before + chunk.toString('utf8')).slice(-32768);
    child.stdout.on('data', chunk => { stdout = keepTail(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = keepTail(stderr, chunk); });
    child.on('error', error => { spawnError = String(error.stack || error); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({exit_code: exitCode, signal, timed_out: timedOut, spawn_error: spawnError, stdout, stderr});
    });
  });
}

async function renderJobsIsolated(jobs, options, identity) {
  const prior = options.resume && options.out ? readJsonIfPresent(path.resolve(options.out)) : null;
  const previousById = new Map((prior?.records || []).map(record => [String(record.id), record]));
  const stateBase = options.out ? path.join(path.dirname(path.resolve(options.out)), '.render-state')
    : path.join(os.tmpdir(), 'vsr-render-state');
  fs.mkdirSync(stateBase, {recursive: true});
  const stateDirectory = fs.mkdtempSync(path.join(stateBase, 'run-'));
  const records = new Array(jobs.length), pending = [], ids = new Set(), outputs = new Set();
  const report = {schema_version: 'vsr-render-report/1.0',
    renderer: prior?.render_fingerprint === identity.fingerprint && prior.renderer ? prior.renderer : identity.provenance,
    render_fingerprint: identity.fingerprint, render_identity: identity.identity,
    started_at: new Date().toISOString(), total: jobs.length, processed: 0,
    rendered: 0, review_required: 0, rejected: 0, resumed: 0, records: [],
    isolation: {enabled: true, workers: options.workers, chunk_size: options.chunkSize,
      child_timeout_ms: options.childTimeoutMs, state_directory: stateDirectory, batches: 0, crashes: [],
      resume_policy: 'Reuse only matching renderer/options/input SHA-256 plus every output artifact SHA-256; retry rejected jobs.'}};
  const checkpoint = () => {
    report.records = records.filter(Boolean);
    report.processed = report.records.length;
    for (const status of JOB_STATUSES) report[status] = report.records.filter(record => record.status === status).length;
    if (options.out) atomicWrite(path.resolve(options.out), jsonText(report));
  };
  const commit = (entry, record, resumed = false) => {
    if (records[entry.index]) return;
    record.index = entry.index;
    if (resumed) { record = {...record, resumed: true}; report.resumed++; }
    records[entry.index] = record;
    checkpoint();
    if (options.progress !== false && (report.processed % 10 === 0 || report.processed === jobs.length)) {
      console.log(JSON.stringify({processed: report.processed, total: report.total, rendered: report.rendered,
        review_required: report.review_required, rejected: report.rejected, resumed: report.resumed}));
    }
  };
  for (const [index, job] of jobs.entries()) {
    try {
      validateJob(job, ids, outputs);
      const entry = {job, index, inputHashes: sourceHashes(job)};
      const candidates = options.resume ? [readJsonIfPresent(path.join(job.output, 'render-record.json')), previousById.get(String(job.id))] : [];
      const reusable = candidates.find(record => isVerifiedRecord(record, entry, identity, options));
      if (reusable) commit(entry, reusable, true); else pending.push(entry);
    } catch (error) {
      records[index] = {schema_version: JOB_RECORD_VERSION, id: job?.id ?? null, index, status: 'rejected', errors: [String(error.stack || error)]};
    }
  }
  checkpoint();
  const childOptions = {...options, inProcess: true, resume: false, progress: false};
  delete childOptions.input;
  let sequence = 0;
  const processChunk = async (entries, depth = 0) => {
    if (!entries.length) return;
    const batch = String(sequence++).padStart(6, '0');
    const childOutput = path.join(stateDirectory, `batch-${batch}.report.json`);
    const configuration = path.join(stateDirectory, `batch-${batch}.input.json`);
    const attemptId = `${path.basename(stateDirectory)}:${batch}`;
    atomicWrite(configuration, jsonText({jobs: entries.map(entry => entry.job),
      options: {...childOptions, out: childOutput, attemptId, jobIndices: entries.map(entry => entry.index)}, identity}));
    report.isolation.batches++; checkpoint();
    const outcome = await childRun(configuration, options.childTimeoutMs);
    const childReport = readJsonIfPresent(childOutput);
    if (childReport?.renderer && childReport.render_fingerprint === identity.fingerprint) {
      report.renderer = {...childReport.renderer};
    }
    const childRecords = new Map((childReport?.records || []).map(record => [String(record.id), record]));
    const unfinished = [];
    for (const entry of entries) {
      const candidates = [childRecords.get(String(entry.job.id)), readJsonIfPresent(path.join(entry.job.output, 'render-record.json'))];
      const record = candidates.find(candidate => candidate?.attempt_id === attemptId && isVerifiedRecord(candidate, entry, identity, options, true));
      if (record) commit(entry, record); else unfinished.push(entry);
    }
    if (!unfinished.length) return;
    const diagnostic = {batch, depth, ids: entries.map(entry => entry.job.id), unfinished_ids: unfinished.map(entry => entry.job.id),
      ...outcome, child_fatal: childReport?.status === 'fatal' ? childReport.error : null,
      configuration, child_report: childOutput};
    report.isolation.crashes.push(diagnostic); checkpoint();
    if (unfinished.length > 1) {
      // Sequential halves preserve the worker limit. Already committed jobs
      // are removed before retry, so a crash cannot waste their completed work.
      const midpoint = Math.ceil(unfinished.length / 2);
      await processChunk(unfinished.slice(0, midpoint), depth + 1);
      await processChunk(unfinished.slice(midpoint), depth + 1);
      return;
    }
    if (entries.length > 1) { await processChunk(unfinished, depth + 1); return; }
    const entry = unfinished[0];
    const error = `Isolated renderer failed for this job: exit=${outcome.exit_code}, signal=${outcome.signal}, timeout=${outcome.timed_out}. ${outcome.spawn_error || childReport?.error || outcome.stderr || 'No committed job result was produced.'}`;
    const record = {schema_version: JOB_RECORD_VERSION, id: entry.job.id, index: entry.index, output: entry.job.output,
      status: 'rejected', render_fingerprint: identity.fingerprint, input_sha256: entry.inputHashes,
      errors: [error], isolation_failure: diagnostic, artifacts: [], finished_at: new Date().toISOString(),
      full: {status: 'rejected', source: entry.job.full, warnings: [], errors: [error]},
      compact: {status: 'rejected', source: entry.job.compact, warnings: [], errors: ['Job process failed before both variants were committed.']}};
    commitJobRecord(entry.job, record); commit(entry, record);
  };
  const chunks = [];
  for (let i = 0; i < pending.length; i += options.chunkSize) chunks.push(pending.slice(i, i + options.chunkSize));
  let next = 0;
  const worker = async () => { for (;;) { const chunk = chunks[next++]; if (!chunk) return; await processChunk(chunk); } };
  const results = await Promise.allSettled(Array.from({length: Math.min(options.workers, chunks.length)}, worker));
  // Coordinator I/O failure must also leave one explicit result per input job.
  for (const result of results) if (result.status === 'rejected') report.isolation.crashes.push({coordinator_error: String(result.reason?.stack || result.reason)});
  for (const entry of pending) if (!records[entry.index]) {
    commit(entry, {schema_version: JOB_RECORD_VERSION, id: entry.job.id, index: entry.index, output: entry.job.output,
      status: 'rejected', errors: ['Coordinator could not commit a child result; see isolation.crashes.']});
  }
  report.finished_at = new Date().toISOString(); checkpoint();
  return report;
}

export async function renderJobs(jobs, options = {}) {
  options = renderOptions(jobs, options);
  const identity = rendererIdentity(options);
  return options.inProcess ? renderJobsInProcess(jobs, options, identity) : renderJobsIsolated(jobs, options, identity);
}

function parseArgs(argv) {
  const options = {modules: [], fontDirs: []};
  const keys = {'--input': 'input', '--out': 'out', '--size': 'size', '--target-side': 'size',
    '--resize-mode': 'resizeMode', '--rasterizer': 'rasterizer', '--font-manifest': 'fontManifest',
    '--workers': 'workers', '--chunk-size': 'chunkSize', '--child-timeout-ms': 'childTimeoutMs', '--child-config': 'childConfig'};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--in-process') { options.inProcess = true; continue; }
    if (arg === '--resume') { options.resume = true; continue; }
    if (arg === '--no-resume') { options.resume = false; continue; }
    if (arg === '--modules' || arg === '--font-dir' || keys[arg]) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--modules') options.modules.push(value);
      else if (arg === '--font-dir') options.fontDirs.push(value);
      else options[keys[arg]] = ['size', 'workers', 'chunkSize', 'childTimeoutMs'].includes(keys[arg]) ? Number(value) : value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.help && !options.childConfig && (!options.input || !options.out)) throw new Error('Usage: node render.mjs --input jobs.json --out report.json [--modules /path/node_modules]');
  return options;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node render.mjs --input jobs.json --out report.json [--modules /path/node_modules] [--size 1036|0] [--resize-mode contain|stretch] [--rasterizer resvg|sharp] [--font-dir /path/fonts] [--font-manifest fonts.manifest.json] [--workers 2] [--chunk-size 10] [--no-resume]\n--target-side is an alias for --size. --modules and --font-dir may be repeated. Defaults: ancestor node_modules, resvg, size 1036, contain, assets/fonts. Rendering runs in isolated child processes, with automatic SHA-256-verified resume. Exit: 0 clean, 1 rejected jobs, 2 review warnings, 3 setup/CLI failure.');
    } else if (options.childConfig) {
      const config = JSON.parse(fs.readFileSync(path.resolve(options.childConfig), 'utf8'));
      options = renderOptions(config.jobs, {...config.options, inProcess: true});
      const report = await renderJobsInProcess(config.jobs, options, config.identity);
      process.exitCode = report.rejected ? 1 : report.review_required ? 2 : 0;
    } else {
      const jobs = JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8').replace(/^\uFEFF/, ''));
      const report = await renderJobs(jobs, options);
      process.exitCode = report.rejected ? 1 : report.review_required ? 2 : 0;
    }
  } catch (error) {
    const fatal = {status: 'fatal', error: String(error.stack || error)};
    if (options?.out) atomicWrite(path.resolve(options.out), jsonText(fatal));
    console.error(JSON.stringify(fatal));
    process.exitCode = 3;
  }
}
