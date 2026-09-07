# Avatar source fixtures

`sample.heic` is a small still HEIF/HEIC used by `scripts/avatar-mobile-upload-unit.mjs`.

It is the public `0002.heic` single-image sample from the heic-convert test set
(ISO BMFF `ftyp mif1`). Sharp/libvips in this project can read its metadata but
cannot decode HEVC pixels (`Support for this compression format has not been built in`),
so the unit test exercises the `heic-convert` / `libheif-js` WASM fallback.
