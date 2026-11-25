"""Generate lossless Latin webfont subsets; originals remain the Unicode fallback.

Run with Python + fonttools[woff]==4.60.1. Generated WOFF2s are checked in, so
normal application builds do not need Python. Keep the site's layout features,
hints, variation axes, names and outlines. Unused stylistic alternates stay in
the original files, alongside the less common Unicode characters.
"""
from pathlib import Path
import json
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1] / "public/fonts"
OUT = ROOT / "latin"
OUT.mkdir(exist_ok=True)
RANGES = [(0x0, 0xFF), (0x131, 0x131), (0x152, 0x153),
          (0x300, 0x36F), (0x2000, 0x206F),
          (0x20AC, 0x20AC), (0x2122, 0x2122),
          (0x2190, 0x2193), (0x2212, 0x2212), (0x2215, 0x2215),
          (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD)]
UNICODES = {c for lo, hi in RANGES for c in range(lo, hi + 1)}
FILES = ["InterVariable.woff2", "InterVariable-Italic.woff2", "OfficeCodePro-Medium.woff2"]
manifest = {"unicodeRange": ",".join(f"U+{lo:X}-{hi:X}" for lo, hi in RANGES), "fonts": {}}
for name in FILES:
    source, target = ROOT / name, OUT / Path(name).name
    font = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    # Default shaping/kerning/ligatures plus all number styles used by the UI.
    options.layout_features += ["tnum", "lnum", "pnum", "onum", "zero", "frac"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(target)
    manifest["fonts"][name] = {"originalBytes": source.stat().st_size,
                                "latinBytes": target.stat().st_size}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=2))
