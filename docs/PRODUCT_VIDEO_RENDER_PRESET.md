# Product video x264 preset

Static cover + audio MP4 (`libx264`, `-tune stillimage`, default CRF 23, AAC 192 kbps, 25 fps, `-shortest`). The preset only changes the video encoder speed/efficiency. Audio codec, bitrate, and duration stay the same.

## Measurement

No 16-minute source audio is in the repo. The bench used a synthetic mono 44.1 kHz sine (220 Hz) encoded to MP3 192 kbps, duration 960.026 s, plus one still 1920×1080 PNG (`testsrc2`, a single frame). Encodes ran sequentially on this 4-vCPU VM with the same FFmpeg arguments the worker uses, swapping only `-preset`.

| Preset | Wall time | Realtime factor | Output size | Video | Audio | Duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| medium (previous) | 164.786 s | 5.826× | 26,601,163 B | 9,478 kB | 15,713 kB | 960.000 s |
| faster | 171.903 s | 5.585× | 25,525,756 B | 8,428 kB | 15,713 kB | 960.000 s |
| veryfast (chosen) | 142.0 s | 6.76× | 24,476,425 B | 7,403 kB | 15,713 kB | 960.000 s |

`medium` and `faster` wall times are the benchmark script's timers. Their realtime factors match FFmpeg's own `speed=` (5.83× and 5.59×). `veryfast` wall time is audio duration divided by FFmpeg's reported 6.76× (the output file mtime was about 142.3 s after the start timestamp).

All three outputs are 1920×1080 H.264 + AAC, duration 960.000 s. Audio payload size is identical, so the preset did not change the audio encode.

## Quality

Same CRF 23. A frame at 8 s compared with the `medium` frame:

| Preset | SSIM (All) | PSNR average |
| --- | ---: | ---: |
| faster | 0.994377 (22.50 dB) | — |
| veryfast | 0.991152 (20.53 dB) | 43.63 dB |

The still is a detailed test card (colour bars, grid, text). At SSIM 0.991 and PSNR 43.6 dB the `veryfast` frame is not visibly worse for a static cover. `veryfast` is also the smallest file.

`faster` was slower than `medium` on this still-image encode, so it is not used.

## Decision

`PRODUCT_VIDEO_X264_PRESET` is `veryfast`. A 16-minute static 1080p export drops from about 165 s to about 142 s on this machine, with a smaller file and the same audio duration.
