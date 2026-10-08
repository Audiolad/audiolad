import {
  PRODUCT_VIDEO_ORIENTATION_META,
  type ProductVideoOrientation,
} from "./contract";

/**
 * «Это аудио — включите» indicator burned into every exported product MP4.
 *
 * A play disc and four soft sound bars on a small dark translucent pill with
 * a light border, bottom-right. The bars are DECORATIVE: they move on fixed
 * sine curves and do not follow the real loudness or spectrum of the audio.
 *
 * The indicator is drawn on a tiny RGBA canvas, then pre-converted to YUVA.
 * The cached loop and yuv420 overlay keep per-frame filter cost near zero;
 * remaining extra CPU is x264 encoding the animated region.
 * Bar periods divide the loop length, so the loop is seamless.
 * The uploaded cover file itself is never changed.
 */

export const PRODUCT_VIDEO_AUDIO_INDICATOR_FPS = 25;
export const PRODUCT_VIDEO_AUDIO_INDICATOR_LOOP_SECONDS = 2.4;
export const PRODUCT_VIDEO_AUDIO_INDICATOR_LOOP_FRAMES = Math.round(
  PRODUCT_VIDEO_AUDIO_INDICATOR_FPS * PRODUCT_VIDEO_AUDIO_INDICATOR_LOOP_SECONDS,
);

export type ProductVideoAudioIndicatorLayout = {
  frameWidth: number;
  frameHeight: number;
  width: number;
  height: number;
  marginRight: number;
  marginBottom: number;
  x: number;
  y: number;
};

const BAR_PHASES_1 = [0, 1.7, 3.4, 5.1] as const;
const BAR_PHASES_2 = [0.9, 2.6, 4.4, 0.3] as const;

const BACKING_RGB = [24, 18, 40] as const;
const BACKING_ALPHA = 0.62;
const BORDER_ALPHA = 0.45;
const BAR_ALPHA = 0.95;
const PLAY_RGB = [0x70, 0x42, 0xc5] as const;

function even(value: number): number {
  return 2 * Math.round(value / 2);
}

function n(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * Size and safe-area margins. Size follows the short side so 16:9 and 9:16
 * get the same physical indicator. 9:16 sits higher and further from the
 * right edge to stay clear of the Reels / Shorts / VK Клипы action column and
 * the caption block; 16:9 stays above the player control bar.
 */
export function productVideoAudioIndicatorLayout(
  orientation: ProductVideoOrientation,
): ProductVideoAudioIndicatorLayout {
  const { width: frameWidth, height: frameHeight } =
    PRODUCT_VIDEO_ORIENTATION_META[orientation];
  const shortSide = Math.min(frameWidth, frameHeight);
  const height = even(0.08 * shortSide);
  const width = even(1.82 * height);
  const marginRight =
    orientation === "landscape_16_9"
      ? even(0.035 * frameWidth)
      : even(0.13 * frameWidth);
  const marginBottom =
    orientation === "landscape_16_9"
      ? even(0.11 * frameHeight)
      : even(0.19 * frameHeight);
  return {
    frameWidth,
    frameHeight,
    width,
    height,
    marginRight,
    marginBottom,
    x: frameWidth - width - marginRight,
    y: frameHeight - height - marginBottom,
  };
}

/** Anti-aliased coverage 0..1 from a signed distance in pixels. */
function coverage(sdf: string): string {
  return `clip(0.5-(${sdf}),0,1)`;
}

function indicatorExpressions(w: number, h: number) {
  const px = "(X+0.5)";
  const py = "(Y+0.5)";
  const cx = h / 2;
  const cy = h / 2;

  const pillSdf =
    `hypot(max(abs(${px}-${n(w / 2)})-${n(w / 2 - h / 2)},0),${py}-${n(cy)})-${n(h / 2)}`;
  const borderPx = Math.max(2, Math.round(0.025 * h));
  const pill = coverage(pillSdf);
  const border = `(${pill}-${coverage(`${pillSdf}+${borderPx}`)})`;

  const disc = coverage(`hypot(${px}-${n(cx)},${py}-${n(cy)})-${n(0.34 * h)}`);

  // Right-pointing triangle: left edge, upper edge, lower edge.
  const tx0 = cx - 0.1 * h;
  const tx1 = cx + 0.15 * h;
  const ty = 0.14 * h;
  const len = Math.hypot(tx1 - tx0, ty);
  const nx = ty / len;
  const ny = (tx1 - tx0) / len;
  const leftEdge = `${n(tx0)}-${px}`;
  const upperEdge = `${n(nx)}*(${px}-${n(tx1)})-${n(ny)}*(${py}-${n(cy)})`;
  const lowerEdge = `${n(nx)}*(${px}-${n(tx1)})+${n(ny)}*(${py}-${n(cy)})`;
  const triangle = coverage(`max(${leftEdge},max(${upperEdge},${lowerEdge}))`);

  const bw = 0.1 * h;
  const gap = 0.08 * h;
  const firstX = 0.98 * h + bw / 2;
  const omega = (2 * Math.PI) / PRODUCT_VIDEO_AUDIO_INDICATOR_LOOP_SECONDS;
  const bars = BAR_PHASES_1.map((p, i) => {
    const q = BAR_PHASES_2[i];
    const xi = firstX + i * (bw + gap);
    const f = `(0.5+0.3*sin(${n(omega)}*T+${n(p)})+0.2*sin(${n(2 * omega)}*T+${n(q)}))`;
    // Full bar height = h * (0.18 + 0.38 * f), f in [0, 1].
    const halfLen = `max(${n(0.09 * h)}+${n(0.19 * h)}*${f}-${n(bw / 2)},0)`;
    return coverage(
      `hypot(${px}-${n(xi)},max(abs(${py}-${n(cy)})-${halfLen},0))-${n(bw / 2)}`,
    );
  });
  const barsCov = bars.reduce((acc, bar) => `max(${acc},${bar})`);

  // st(0)=foreground alpha, st(1)=backing alpha, st(2)=total alpha,
  // st(3)=triangle coverage. Straight-alpha "over" composite.
  const prelude =
    `st(0,max(${disc},max(${n(BAR_ALPHA)}*${barsCov},${n(BORDER_ALPHA)}*${border})));` +
    `st(1,${n(BACKING_ALPHA)}*${pill});` +
    `st(2,ld(0)+ld(1)*(1-ld(0)));` +
    `st(3,${triangle}*${disc});`;
  const channel = (backing: number, play: number) =>
    `${prelude}(((255+(${play}-255)*ld(3))*ld(0)+${backing}*ld(1)*(1-ld(0)))/max(ld(2),0.000001))`;
  return {
    r: channel(BACKING_RGB[0], PLAY_RGB[0]),
    g: channel(BACKING_RGB[1], PLAY_RGB[1]),
    b: channel(BACKING_RGB[2], PLAY_RGB[2]),
    a: `${prelude}255*ld(2)`,
  };
}

/** lavfi chain that outputs the looping indicator as [aind]. */
export function productVideoAudioIndicatorSource(
  orientation: ProductVideoOrientation,
): string {
  const { width, height } = productVideoAudioIndicatorLayout(orientation);
  const e = indicatorExpressions(width, height);
  return (
    `color=c=black@0:s=${width}x${height}:r=${PRODUCT_VIDEO_AUDIO_INDICATOR_FPS}` +
    `:d=${PRODUCT_VIDEO_AUDIO_INDICATOR_LOOP_SECONDS},format=rgba,` +
    `geq=r='${e.r}':g='${e.g}':b='${e.b}':a='${e.a}',` +
    `format=yuva420p,` +
    `loop=loop=-1:size=${PRODUCT_VIDEO_AUDIO_INDICATOR_LOOP_FRAMES}:start=0[aind]`
  );
}

/** Full -filter_complex: scaled cover + indicator overlay -> [vout]. */
export function productVideoFilterComplex(
  orientation: ProductVideoOrientation,
): string {
  const layout = productVideoAudioIndicatorLayout(orientation);
  const { frameWidth: W, frameHeight: H } = layout;
  return (
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[avbg];` +
    `${productVideoAudioIndicatorSource(orientation)};` +
    `[avbg][aind]overlay=x=${layout.x}:y=${layout.y}:format=yuv420,format=yuv420p[vout]`
  );
}
