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

## Audio indicator (render recipe cover-audio-indicator-v1)

Every export burns in a compact bottom-right pill: dark translucent backing `rgb(24,18,40)` at 0.62 opacity with a light 2 px border, a white play disc with a `#7042c5` triangle, and four white capsule bars moving on fixed sines in a seamless 2.4 s, 60-frame loop. It is decorative and deterministic, not audio-driven; there is no extra audio processing.

Source of truth: `productVideoAudioIndicatorLayout()`. The height is 8% of the short side, rounded to an even pixel size.

| Orientation | Size | Right margin | Bottom margin | Clearance |
| --- | --- | --- | --- | --- |
| 16:9 | 156×86 px | 68 px | 118 px | Above the player control bar |
| 9:16 | 156×86 px | 140 px | 364 px | Clear of the Reels / Shorts / VK Клипы right action column and caption block |

Output settings remain `libx264`, `veryfast`, `stillimage`, `yuv420p`, 25 fps, AAC 192k, `+faststart`, and the same resolution. Output is now capped with `-t <probed audio duration>`: with a looped cover, `-shortest` let video run about 1.2 s past the audio (measured on FFmpeg 7.1 on the current main pipeline: 960 s audio → 961.2 s video). Now video duration equals audio duration.

Freshness is tracked by `product_video_render_jobs.render_recipe` (migration `20261225120000`), written on completion. Completed MP4s with NULL or another recipe show «Нужно пересоздать» and are not offered for download as current; their files stay in storage. Queued and processing jobs are rendered by the current worker. Bump `PRODUCT_VIDEO_RENDER_RECIPE` whenever the burned-in picture changes.

Re-create only on owner request; there is no automatic mass re-render. In the author cabinet, open the product → «Видео для площадок» → press «Создать заново» for the wanted audio and orientation. The next normal export also gets the indicator.

### Cost

All numbers were measured on 2026-10-08 on a shared 8-vCPU box with FFmpeg 7.1. Other jobs kept the load average at 10–14, so single runs are noisy and the three measurements below do not agree exactly. Read them as a range, not one number. Main and this change were run interleaved.

| Measurement | Audio | CPU user, main → indicator | Wall, main → indicator | Output size |
| --- | ---: | ---: | ---: | ---: |
| Real `renderProductVideo()`, 16:9 (incl. Node wrapper) | 960 s | 331 s → 338 s (+2%) | 68 s → 83 s | +1.8% |
| Real `renderProductVideo()`, 9:16 (incl. Node wrapper) | 960 s | 322 s → 323 s (+0.4%) | 64 s → 67 s | +2.1% |
| Independent review A/B, both orientations, 2 runs each | 180 s | 63–66 s → 68–70 s (+7–9%) | +3–30% | +1.6–2.0% |
| Bare FFmpeg command, 16:9, final graph | 60 s | 21 s → 32 s (+45%) | 5.3 s → 8.6 s | +1.9% |

Expect roughly +2% to +45% CPU depending on duration and load. The extra work is x264 encoding the moving bars: the same graph with a static indicator costs the same as main (21 s on the 60 s bench). The filter itself is close to free. The rejected first version, `overlay=format=auto` with an RGBA input, converted the full frame every frame and took 47 s on the 60 s bench. Output grows by about 2%.

Peak RSS is unchanged: about 1.35 GB vs 1.32 GB, dominated by x264. A 960 s export stays around 1.5 min, far inside the 1800 s lease. Heartbeat, progress, and the stall watchdog are unaffected: FFmpeg still reports progress continuously.
