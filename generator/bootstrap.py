"""Prepare project-local fonts and a hash manifest, without a plotting library."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.request

from presentation import describe_font

ROOT = Path(__file__).resolve().parent
FONT_DIR = ROOT / "assets/fonts"
FONT_URLS = {
    "NimbusSans-Regular.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusSans-Regular.otf",
    "NimbusSans-Bold.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusSans-Bold.otf",
    "NimbusRoman-Regular.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusRoman-Regular.otf",
    "NimbusRoman-Bold.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusRoman-Bold.otf",
    "NimbusMonoPS-Regular.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusMonoPS-Regular.otf",
    "NimbusMonoPS-Bold.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/NimbusMonoPS-Bold.otf",
    "URWBookman-Demi.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/URWBookman-Demi.otf",
    "URWBookman-Light.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/URWBookman-Light.otf",
    "URWGothic-Book.otf": "https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/master/fonts/URWGothic-Book.otf",
    "DejaVuSans-Bold.ttf": "https://raw.githubusercontent.com/matplotlib/matplotlib/v3.10.1/lib/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf",
    "DejaVuSans.ttf": "https://raw.githubusercontent.com/matplotlib/matplotlib/v3.10.1/lib/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf",
    "DejaVuSerif.ttf": "https://raw.githubusercontent.com/matplotlib/matplotlib/v3.10.1/lib/matplotlib/mpl-data/fonts/ttf/DejaVuSerif.ttf",
    "DejaVuSerif-Bold.ttf": "https://raw.githubusercontent.com/matplotlib/matplotlib/v3.10.1/lib/matplotlib/mpl-data/fonts/ttf/DejaVuSerif-Bold.ttf",
    "DejaVuSansMono.ttf": "https://raw.githubusercontent.com/matplotlib/matplotlib/v3.10.1/lib/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono.ttf",
    "DejaVuSansMono-Bold.ttf": "https://raw.githubusercontent.com/matplotlib/matplotlib/v3.10.1/lib/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono-Bold.ttf",
    "NotoMono-Regular.otf": "https://raw.githubusercontent.com/googlefonts/noto-fonts/bf20559450ec75aec7a646b208343540a4496262/phaseIII_only/unhinted/otf/NotoMono/NotoMono-Regular.otf"
}


# Support faces do not enlarge the original 16-face generation sampling pool.
BASE_FONT_NAMES = tuple(FONT_URLS)
for name in ('NimbusSans-Italic.otf','NimbusSans-BoldItalic.otf','NimbusRoman-Italic.otf','NimbusRoman-BoldItalic.otf','NimbusMonoPS-Italic.otf','NimbusMonoPS-BoldItalic.otf','URWBookman-LightItalic.otf','URWBookman-DemiItalic.otf','URWGothic-BookOblique.otf','URWGothic-Demi.otf','URWGothic-DemiOblique.otf'):
    FONT_URLS[name] = 'https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/3c0ba3b5687632dfc66526544a4e811fe0ec0cd9/fonts/' + name
for name in ('DejaVuSans-Oblique.ttf','DejaVuSans-BoldOblique.ttf','DejaVuSerif-Italic.ttf','DejaVuSerif-BoldItalic.ttf','DejaVuSansMono-Oblique.ttf','DejaVuSansMono-BoldOblique.ttf'):
    FONT_URLS[name] = 'https://raw.githubusercontent.com/matplotlib/matplotlib/v3.10.1/lib/matplotlib/mpl-data/fonts/ttf/' + name
for name, url in list(FONT_URLS.items()):
    if 'ArtifexSoftware' in url:
        FONT_URLS[name] = url.replace('/master/','/3c0ba3b5687632dfc66526544a4e811fe0ec0cd9/')


def embedding_license_record(font):
    from font_embedding import inspect_font
    family = describe_font(font)['family']
    notice = ROOT / 'docs/font-licenses' / (font.stem + '.txt')
    if not notice.is_file():
        raise ValueError('Missing audited font license notice: ' + str(notice))
    license_id = 'DejaVu-permissive' if family.startswith('DejaVu') else 'OFL-1.1' if family == 'Noto Mono' else 'AGPL-3.0-upstream-source-bundled'
    result = {'status':'approved', 'id':license_id, 'notice':notice.relative_to(ROOT).as_posix(), 'notice_sha256':hashlib.sha256(notice.read_bytes()).hexdigest()}
    if license_id.startswith('AGPL'):
        archive = ROOT / 'docs/font-licenses/urw-base35-3c0ba3b-source.tar.gz'
        if not archive.is_file(): raise ValueError('Missing exact upstream URW source archive')
        result.update({'source_archive':archive.relative_to(ROOT).as_posix(), 'source_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(), 'upstream_commit':'3c0ba3b5687632dfc66526544a4e811fe0ec0cd9', 'source_url':'https://github.com/ArtifexSoftware/urw-base35-fonts/tree/3c0ba3b5687632dfc66526544a4e811fe0ec0cd9', 'mode':'unmodified-font-with-complete-upstream-source'})
    return result


def download_font(url, destination, retries=3, timeout=30):
    """Download atomically; generation itself never accesses the network."""
    if destination.is_file():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Vega-Lite-DG-font-bootstrap"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = response.read()
            if len(data) < 1024 or data[:4] not in (b"OTTO", b"\x00\x01\x00\x00", b"ttcf"):
                raise ValueError(f"Invalid font signature: {destination.name}")
            temporary.write_bytes(data)
            describe_font(temporary)
            temporary.replace(destination)
            return
        except Exception:
            temporary.unlink(missing_ok=True)
            if attempt + 1 == retries:
                raise
            time.sleep(min(2 ** attempt, 8))


def setup_fonts(retries=3, timeout=30):
    if retries < 1 or timeout <= 0:
        raise ValueError("retries and timeout must be positive")
    records = []
    for name, url in FONT_URLS.items():
        font = FONT_DIR / name
        download_font(url, font, retries, timeout)
        records.append({"file": font.relative_to(ROOT).as_posix(), **describe_font(font),
                        "sha256": hashlib.sha256(font.read_bytes()).hexdigest(), "bytes": font.stat().st_size, "sampling_role":"base" if name in BASE_FONT_NAMES else "support_variant", "embedding_license":embedding_license_record(font)})
    manifest = {"directory": "assets/fonts", "font_count": len(records), "base_font_count":len(BASE_FONT_NAMES), "fonts": records}
    destination = ROOT / "fonts.manifest.json"
    temporary = destination.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(destination)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    result = setup_fonts(args.retries, args.timeout)
    print(json.dumps({"font_count": result["font_count"], "manifest": str(ROOT / "fonts.manifest.json")}))
