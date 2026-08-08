"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { StudioLiveWaveformCanvas } from "@/components/studio/StudioLiveWaveformCanvas";
import { StudioWaveformCanvas } from "@/components/studio/StudioWaveformCanvas";
import {
  formatTimelineTime,
  getAnchoredTimelineScrollLeft,
  getRulerStepSeconds,
  getTimelineEditExtent,
  getTimelineWidth,
  timeToTimelineX,
  timelineXToTime,
} from "@/lib/studio/timeline-math";
import {
  getStudioClipEnd,
  getStudioClipLayout,
  getStudioClipMoveLayout,
  getStudioClipSnapCandidates,
  getStudioSameTrackBounds,
  getStudioClipTrimEndLayout,
  getStudioClipTrimStartLayout,
  type StudioClip,
  type StudioClipLayout,
} from "@/lib/studio/clip-math";
import {
  clampStudioClipFades,
  type StudioClipFades,
} from "@/lib/studio/fade-math";

export type StudioTimelineTrack = {
  id: string;
  name: string;
  fileName?: string;
  hasAudio: boolean;
  buffer: AudioBuffer | null;
  clips: StudioClip[];
  accent: string;
};

export type StudioTimelineHandle = {
  scrollToStart: () => void;
  scrollToEnd: () => void;
};

type StudioTimelineProps = {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  tracks: StudioTimelineTrack[];
  pixelsPerSecond: number;
  onViewportWidthChange: (width: number) => void;
  onSeek: (time: number) => void;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onClipLayoutChange: (trackId: string, clipId: string, layout: StudioClipLayout) => void;
  onClipFadesChange: (trackId: string, clipId: string, fades: StudioClipFades) => void;
  onClipGestureBegin: () => void;
  onClipGestureCommit: () => void;
  onClipGestureCancel: () => void;
  liveRecording: {
    slotId: string;
    startTime: number;
    analyser: AnalyserNode;
  } | null;
  renderControls: (track: StudioTimelineTrack, index: number) => ReactNode;
  renderEmpty: (track: StudioTimelineTrack, index: number) => ReactNode;
};

const WAVEFORM_OVERSCAN_PIXELS = 240;

export const StudioTimeline = forwardRef<StudioTimelineHandle, StudioTimelineProps>(
function StudioTimeline({
  duration,
  currentTime,
  isPlaying,
  tracks,
  pixelsPerSecond,
  onViewportWidthChange,
  onSeek,
  selectedClipId,
  onSelectClip,
  onClipLayoutChange,
  onClipFadesChange,
  onClipGestureBegin,
  onClipGestureCommit,
  onClipGestureCancel,
  liveRecording,
  renderControls,
  renderEmpty,
}: StudioTimelineProps, ref) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const previousPixelsPerSecondRef = useRef(pixelsPerSecond);
  const lastManualScrollAtRef = useRef(0);
  const isAutoScrollingRef = useRef(false);
  const gestureRef = useRef<{
    track: StudioTimelineTrack;
    clip: StudioClip;
    kind: "move" | "trim-start" | "trim-end" | "fade-in" | "fade-out";
    pointerId: number;
    pointerStartX: number;
    layout: StudioClipLayout;
    fades: StudioClipFades;
  } | null>(null);
  const [previewLayouts, setPreviewLayouts] = useState<
    Record<string, StudioClipLayout>
  >({});
  const [previewFades, setPreviewFades] = useState<
    Record<string, StudioClipFades>
  >({});
  const projectExtent = Math.max(
    duration,
    ...tracks.flatMap((track) => track.clips.map((clip) =>
      getStudioClipEnd(previewLayouts[clip.id] ?? getStudioClipLayout(clip, track.buffer?.duration ?? 0)),
    )),
  );
  const editHorizon = getTimelineEditExtent(
    projectExtent,
    pixelsPerSecond,
    viewportWidth,
  );
  const timelineWidth = getTimelineWidth(
    editHorizon,
    pixelsPerSecond,
    viewportWidth,
  );
  const playheadX = timeToTimelineX(currentTime, pixelsPerSecond);
  const renderStartX = Math.max(scrollLeft - WAVEFORM_OVERSCAN_PIXELS, 0);
  const renderWidth = Math.min(
    viewportWidth + WAVEFORM_OVERSCAN_PIXELS * 2,
    Math.max(timelineWidth - renderStartX, 1),
  );
  const scrollTo = useCallback((nextScrollLeft: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    isAutoScrollingRef.current = true;
    lastManualScrollAtRef.current = Date.now();
    viewport.scrollLeft = Math.max(nextScrollLeft, 0);
    setScrollLeft(viewport.scrollLeft);
    window.setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 0);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToStart: () => scrollTo(0),
      scrollToEnd: () => {
        const viewport = viewportRef.current;
        if (!viewport) {
          return;
        }
        scrollTo(
          Math.max(
            timeToTimelineX(projectExtent, pixelsPerSecond) -
              viewport.clientWidth,
            0,
          ),
        );
      },
    }),
    [pixelsPerSecond, projectExtent, scrollTo],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const updateWidth = () => {
      setViewportWidth(viewport.clientWidth);
      onViewportWidthChange(viewport.clientWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [onViewportWidthChange]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const previousPixelsPerSecond = previousPixelsPerSecondRef.current;
    if (!viewport || previousPixelsPerSecond === pixelsPerSecond) {
      return;
    }

    const nextScrollLeft = getAnchoredTimelineScrollLeft({
      previousPixelsPerSecond,
      nextPixelsPerSecond: pixelsPerSecond,
      scrollLeft: viewport.scrollLeft,
      anchorViewportX: viewport.clientWidth / 2,
      duration,
      viewportWidth: viewport.clientWidth,
    });
    isAutoScrollingRef.current = true;
    viewport.scrollLeft = nextScrollLeft;
    setScrollLeft(nextScrollLeft);
    previousPixelsPerSecondRef.current = pixelsPerSecond;
    window.setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 0);
  }, [duration, pixelsPerSecond]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isPlaying || duration <= 0) {
      return;
    }

    if (Date.now() - lastManualScrollAtRef.current < 1500) {
      return;
    }
    const visibleStart = viewport.scrollLeft;
    const visibleEnd = visibleStart + viewport.clientWidth;
    if (playheadX < visibleStart + 48 || playheadX > visibleEnd - 96) {
      isAutoScrollingRef.current = true;
      viewport.scrollLeft = Math.max(0, playheadX - viewport.clientWidth * 0.35);
      window.setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 0);
    }
  }, [duration, isPlaying, playheadX]);

  const seekAtOffset = (offsetX: number) => {
    onSeek(Math.min(timelineXToTime(offsetX, pixelsPerSecond), editHorizon));
  };
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest("[data-studio-clip], [data-studio-fade-lane]")
    ) {
      onSelectClip(null);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    seekAtOffset(event.clientX - rect.left);
  };

  const getSnapTargets = (clipId: string) => [
    ...getStudioClipSnapCandidates(
      tracks.flatMap((track) => track.clips),
      clipId,
    ),
    duration,
  ];
  const getGestureLayout = (
    event: React.PointerEvent<HTMLDivElement>,
  ): StudioClipLayout | null => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return null;
    }
    const deltaSeconds = (event.clientX - gesture.pointerStartX) / pixelsPerSecond;
    const common = {
      layout: gesture.layout,
      bufferDuration: gesture.track.buffer?.duration ?? 0,
      snapTargets: getSnapTargets(gesture.clip.id),
      pixelsPerSecond,
      bypassSnap: event.altKey,
      collisionBounds: getStudioSameTrackBounds(gesture.clip, gesture.track.clips),
    };
    if (gesture.kind === "move") {
      return getStudioClipMoveLayout({
        ...common,
        requestedStartTime: gesture.layout.startTime + deltaSeconds,
      });
    }
    if (gesture.kind === "trim-start") {
      return getStudioClipTrimStartLayout({
        ...common,
        requestedStartTime: gesture.layout.startTime + deltaSeconds,
      });
    }
    if (gesture.kind === "fade-in" || gesture.kind === "fade-out") {
      return null;
    }
    return getStudioClipTrimEndLayout({
      ...common,
      requestedEndTime: getStudioClipEnd(gesture.layout) + deltaSeconds,
    });
  };
  const getGestureFades = (
    event: React.PointerEvent<HTMLDivElement>,
  ): StudioClipFades | null => {
    const gesture = gestureRef.current;
    if (
      !gesture ||
      gesture.pointerId !== event.pointerId ||
      (gesture.kind !== "fade-in" && gesture.kind !== "fade-out")
    ) {
      return null;
    }
    const deltaSeconds = (event.clientX - gesture.pointerStartX) / pixelsPerSecond;
    return clampStudioClipFades(
      {
        fadeInDuration:
          gesture.kind === "fade-in"
            ? gesture.fades.fadeInDuration + deltaSeconds
            : gesture.fades.fadeInDuration,
        fadeOutDuration:
          gesture.kind === "fade-out"
            ? gesture.fades.fadeOutDuration - deltaSeconds
            : gesture.fades.fadeOutDuration,
      },
      gesture.layout.duration,
    );
  };
  const beginClipGesture = (
    event: React.PointerEvent<HTMLDivElement>,
    track: StudioTimelineTrack,
    clip: StudioClip,
    kind: "move" | "trim-start" | "trim-end" | "fade-in" | "fade-out",
  ) => {
    if (!track.buffer) {
      return;
    }
    onSelectClip(clip.id);
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      track,
      clip,
      kind,
      pointerId: event.pointerId,
      pointerStartX: event.clientX,
      layout: getStudioClipLayout(clip, track.buffer.duration),
      fades: clampStudioClipFades(clip, clip.duration),
    };
    onClipGestureBegin();
  };
  const previewClipGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const layout = getGestureLayout(event);
    const fades = getGestureFades(event);
    const track = gestureRef.current?.track;
    const clip = gestureRef.current?.clip;
    if (layout && track) {
      setPreviewLayouts((current) => ({ ...current, [clip!.id]: layout }));
    }
    if (fades && track) {
      setPreviewFades((current) => ({ ...current, [clip!.id]: fades }));
    }
  };
  const finishClipGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const gesture = gestureRef.current;
    const layout = getGestureLayout(event);
    const fades = getGestureFades(event);
    if (!gesture || (!layout && !fades)) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = null;
    setPreviewLayouts((current) => {
      const next = { ...current };
      delete next[gesture.clip.id];
      return next;
    });
    setPreviewFades((current) => {
      const next = { ...current };
      delete next[gesture.clip.id];
      return next;
    });
    if (layout) {
      onClipLayoutChange(gesture.track.id, gesture.clip.id, layout);
    }
    if (fades) {
      onClipFadesChange(gesture.track.id, gesture.clip.id, fades);
    }
    onClipGestureCommit();
  };
  const cancelClipGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    gestureRef.current = null;
    setPreviewLayouts((current) => {
      const next = { ...current };
      delete next[gesture.clip.id];
      return next;
    });
    setPreviewFades((current) => {
      const next = { ...current };
      delete next[gesture.clip.id];
      return next;
    });
    onClipGestureCancel();
  };

  const rulerStep = getRulerStepSeconds(pixelsPerSecond);
  const rulerMarks: number[] = [];
  for (let time = 0; time <= editHorizon; time += rulerStep) {
    rulerMarks.push(time);
  }

  return (
    <section
      aria-label="Временная шкала Studio"
      className="overflow-hidden rounded-xl border border-white/10 bg-[#101722]"
    >
      <div className="grid grid-cols-[250px_minmax(0,1fr)]">
        <div className="border-r border-white/10 bg-[#101722]">
          <div className="h-8 border-b border-white/10" />
          {tracks.map((track, index) => (
            <aside
              key={track.id}
              className="min-h-[190px] border-b border-white/10 p-4 last:border-b-0"
            >
              {renderControls(track, index)}
            </aside>
          ))}
        </div>
        <div
          ref={viewportRef}
          className="overflow-x-auto"
          onScroll={(event) => {
            setScrollLeft(event.currentTarget.scrollLeft);
            if (!isAutoScrollingRef.current) {
              lastManualScrollAtRef.current = Date.now();
            }
          }}
        >
          <div className="relative min-w-full" style={{ width: timelineWidth }}>
            <div
              className="h-8 border-b border-white/10 text-[10px] text-[#9ba7bb]"
              style={{ width: timelineWidth }}
            >
              {rulerMarks.map((time) => (
                <span
                  key={time}
                  className="absolute top-0 h-full border-l border-white/15 pl-1 pt-2"
                  style={{ left: timeToTimelineX(time, pixelsPerSecond) }}
                >
                  {formatTimelineTime(time)}
                </span>
              ))}
            </div>

            {tracks.map((track, index) => {
              return (
                <div
                  key={track.id}
                  className="relative min-h-[190px] border-b border-white/10 last:border-b-0"
                  style={{ width: timelineWidth }}
                  onPointerUp={seekFromPointer}
                >
                  <div className="relative h-[88px] bg-[#0d131d]">
                    {track.hasAudio && track.buffer ? track.clips.map((clip) => {
                      const layout = previewLayouts[clip.id] ?? getStudioClipLayout(clip, track.buffer!.duration);
                      const clipLeft = timeToTimelineX(layout.startTime, pixelsPerSecond);
                      const clipWidth = Math.min(timeToTimelineX(layout.duration, pixelsPerSecond), Math.max(timelineWidth - clipLeft, 0));
                      const clipRenderStartX = Math.max(renderStartX - clipLeft, 0);
                      const clipRenderWidth = Math.min(renderWidth, Math.max(Math.min(renderStartX + renderWidth, clipLeft + clipWidth) - (clipLeft + clipRenderStartX), 0));
                      if (clipWidth <= 0) return null;
                      return (
                        <div key={clip.id}>
                    {clipRenderWidth > 0 ? <div className="absolute top-0 overflow-hidden" style={{ left: clipLeft + clipRenderStartX, width: clipRenderWidth }}>
                      <StudioWaveformCanvas buffer={track.buffer!} sourceOffset={layout.offset} sourceDuration={layout.duration} timelineWidth={clipWidth} viewportWidth={clipRenderWidth} renderStartX={clipRenderStartX} accent={track.accent} onSeek={(clipX) => { onSelectClip(clip.id); onSeek(layout.startTime + timelineXToTime(clipX, pixelsPerSecond)); }} />
                    </div> : null}
                      <div
                        className="absolute top-0 z-10 flex h-[88px] overflow-hidden rounded border border-white/30 bg-white/5"
                        style={{ left: clipLeft, width: clipWidth }}
                        data-studio-clip={clip.id}
                        onPointerDown={() => onSelectClip(clip.id)}
                      >
                        <div
                          aria-label={`Обрезать начало ${track.name}`}
                          className="w-2 shrink-0 cursor-ew-resize bg-white/20 hover:bg-white/40"
                          onPointerDown={(event) =>
                            beginClipGesture(event, track, clip, "trim-start")
                          }
                          onPointerMove={previewClipGesture}
                          onPointerUp={finishClipGesture}
                          onPointerCancel={cancelClipGesture}
                        />
                        <div
                          aria-label={`Переместить ${track.name}`}
                          className="min-w-0 flex-1 cursor-grab active:cursor-grabbing"
                          onPointerDown={(event) =>
                            beginClipGesture(event, track, clip, "move")
                          }
                          onPointerMove={previewClipGesture}
                          onPointerUp={finishClipGesture}
                          onPointerCancel={cancelClipGesture}
                        />
                        <div
                          aria-label={`Обрезать конец ${track.name}`}
                          className="w-2 shrink-0 cursor-ew-resize bg-white/20 hover:bg-white/40"
                          onPointerDown={(event) =>
                            beginClipGesture(event, track, clip, "trim-end")
                          }
                          onPointerMove={previewClipGesture}
                          onPointerUp={finishClipGesture}
                          onPointerCancel={cancelClipGesture}
                        />
                      </div>
                        </div>
                      );
                    }) : null}
                    {!track.hasAudio && liveRecording?.slotId === track.id ? (
                      <StudioLiveWaveformCanvas
                        analyser={liveRecording.analyser}
                        startTime={liveRecording.startTime}
                        pixelsPerSecond={pixelsPerSecond}
                        accent={track.accent}
                      />
                    ) : null}
                  </div>
                  {track.hasAudio && track.buffer && track.clips.some(
                    (clip) =>
                      selectedClipId === clip.id &&
                      (clip.fadeInDuration > 0 || clip.fadeOutDuration > 0),
                  ) ? (
                    <div
                      aria-label={`Автоматизация затуханий ${track.name}`}
                      className="relative h-9 border-t border-white/10 bg-[#111a27]"
                    >
                      {track.clips.map((clip) => {
                        if (
                          selectedClipId !== clip.id ||
                          (clip.fadeInDuration <= 0 && clip.fadeOutDuration <= 0)
                        ) {
                          return null;
                        }

                        const layout =
                          previewLayouts[clip.id] ??
                          getStudioClipLayout(clip, track.buffer!.duration);
                        const fades =
                          previewFades[clip.id] ??
                          clampStudioClipFades(clip, layout.duration);
                        const clipLeft = timeToTimelineX(
                          layout.startTime,
                          pixelsPerSecond,
                        );
                        const clipWidth = Math.min(
                          timeToTimelineX(layout.duration, pixelsPerSecond),
                          Math.max(timelineWidth - clipLeft, 0),
                        );

                        if (clipWidth <= 0) {
                          return null;
                        }

                        return (
                          <div
                            key={clip.id}
                            className="absolute inset-y-1 overflow-hidden rounded-sm border border-violet-200 bg-violet-400/10"
                            style={{ left: clipLeft, width: clipWidth }}
                            data-studio-fade-lane={clip.id}
                            onPointerDown={() => onSelectClip(clip.id)}
                          >
                            <span
                              aria-hidden="true"
                              className="absolute bottom-0 left-0 top-0 bg-violet-300/25"
                              style={{
                                width: timeToTimelineX(
                                  fades.fadeInDuration,
                                  pixelsPerSecond,
                                ),
                                clipPath: "polygon(0 100%, 100% 0, 100% 100%)",
                              }}
                            />
                            <span
                              aria-hidden="true"
                              className="absolute bottom-0 right-0 top-0 bg-violet-300/25"
                              style={{
                                width: timeToTimelineX(
                                  fades.fadeOutDuration,
                                  pixelsPerSecond,
                                ),
                                clipPath: "polygon(0 0, 100% 100%, 0 100%)",
                              }}
                            />
                            <div
                              aria-label={`Настроить появление ${track.name}`}
                              className="absolute bottom-0 top-0 z-10 w-2 cursor-ew-resize bg-violet-200/70 hover:bg-white"
                              style={{
                                left: Math.max(
                                  timeToTimelineX(
                                    fades.fadeInDuration,
                                    pixelsPerSecond,
                                  ) - 4,
                                  0,
                                ),
                              }}
                              onPointerDown={(event) =>
                                beginClipGesture(event, track, clip, "fade-in")
                              }
                              onPointerMove={previewClipGesture}
                              onPointerUp={finishClipGesture}
                              onPointerCancel={cancelClipGesture}
                            />
                            <div
                              aria-label={`Настроить затухание ${track.name}`}
                              className="absolute bottom-0 top-0 z-10 w-2 cursor-ew-resize bg-violet-200/70 hover:bg-white"
                              style={{
                                left: Math.max(
                                  clipWidth -
                                    timeToTimelineX(
                                      fades.fadeOutDuration,
                                      pixelsPerSecond,
                                    ) -
                                    4,
                                  0,
                                ),
                              }}
                              onPointerDown={(event) =>
                                beginClipGesture(event, track, clip, "fade-out")
                              }
                              onPointerMove={previewClipGesture}
                              onPointerUp={finishClipGesture}
                              onPointerCancel={cancelClipGesture}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {track.clips.length === 0 ? renderEmpty(track, index) : null}
                </div>
              );
            })}

            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]"
              style={{ left: playheadX }}
            />
          </div>
        </div>
      </div>
    </section>
  );
});
