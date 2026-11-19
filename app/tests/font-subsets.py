"""Offline identity audit for generated fonts (requires fonttools[woff])."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
import json

ROOT = Path(__file__).resolve().parents[1] / "public/fonts"
manifest = json.loads((ROOT / "latin/manifest.json").read_text())
checked = 0
for name in manifest["fonts"]:
    original = TTFont(ROOT / name)
    small = TTFont(ROOT / "latin" / Path(name).name)
    cmap, subset_cmap = original.getBestCmap(), small.getBestCmap()
    assert set(subset_cmap) <= set(cmap)
    assert all(ord(c) in subset_cmap for c in "Governance 0123456789 ÀÉÇãõç — €")
    if "fvar" in original:
        assert original["fvar"].compile(original) == small["fvar"].compile(small)
    for tag in ["hhea", "OS/2"]:
        for field in ["ascent", "descent", "lineGap", "sTypoAscender", "sTypoDescender", "sTypoLineGap"]:
            assert getattr(original[tag], field, None) == getattr(small[tag], field, None)
    locations = [{}]
    if "fvar" in original:
        locations += [{a.axisTag: a.minValue for a in original["fvar"].axes},
                      {a.axisTag: a.maxValue for a in original["fvar"].axes}]
    for location in locations:
        a, b = original.getGlyphSet(location=location), small.getGlyphSet(location=location)
        for char, glyph in subset_cmap.items():
            pa, pb = DecomposingRecordingPen(a), DecomposingRecordingPen(b)
            a[cmap[char]].draw(pa); b[glyph].draw(pb)
            assert pa.value == pb.value, (name, char, location, "outline changed")
            assert a[cmap[char]].width == b[glyph].width, (name, char, "advance changed")
            checked += 1
    # These are the OpenType features currently requested by site CSS.
    for table, used in [("GSUB", {"liga", "clig", "tnum", "lnum"}), ("GPOS", {"kern"})]:
        def tags(font):
            if table not in font or not font[table].table.FeatureList: return set()
            return {r.FeatureTag for r in font[table].table.FeatureList.FeatureRecord}
        assert tags(original) & used <= tags(small)
    print(name, "identical outlines, advances, line metrics and variable axes")
print(f"PASS: {checked} glyph/variation comparisons")
