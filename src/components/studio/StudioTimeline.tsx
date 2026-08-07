"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { StudioWaveformCanvas } from "@/components/studio/StudioWaveformCanvas";
import {
  formatTimelineTime,
  getAnchoredTimelineScrollLeft,
  getRulerStepSeconds,
  getTimelineWidth,
  timeToTimelineX,
  timelineXToTime,
} from "@/lib/studio/timeline-math";
import {
  getStudioClipEnd,
  getStudioClipLayout,
  getStudioClipMoveLayout,
  getStudioClipTrimEndLayout,
  getStudioClipTrimStartLayout,
  type StudioClipLayout,
} from "@/lib/studio/clip-math";

export type StudioTimelineTrack = {
  id: string;
  name: string;
  fileName?: string;
  buffer: AudioBuffer | null;
  startTime: number;
  offset: number;
  duration: number;
  accent: string;
};

type StudioTimelineProps = {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  tracks: StudioTimelineTrack[];
  pixelsPerSecond: number;
  onViewportWidthChange: (width: number) => void;
  onSeek: (time: number) => void;
  onClipLayoutChange: (trackId: string, layout: StudioClipLayout) => void;
  onClipGestureStart: () => void;
  renderControls: (track: StudioTimelineTrack, index: number) => ReactNode;
  renderEmpty: (track: StudioTimelineTrack, index: number) => ReactNode;
};

const WAVEFORM_OVERSCAN_PIXELS = 240;

export function StudioTimeline({
  duration,
  currentTime,
  isPlaying,
  tracks,
  pixelsPerSecond,
  onViewportWidthChange,
  onSeek,
  onClipLayoutChange,
  onClipGestureStart,
  renderControls,
  renderEmpty,
}: StudioTimelineProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const previousPixelsPerSecondRef = useRef(pixelsPerSecond);
  const lastManualScrollAtRef = useRef(0);
  const isAutoScrollingRef = useRef(false);
  const gestureRef = useRef<{
    track: StudioTimelineTrack;
    kind: "move" | "trim-start" | "trim-end";
    pointerId: number;
    pointerStartX: number;
    layout: StudioClipLayout;
  } | null>(null);
  const [previewLayouts, setPreviewLayouts] = useState<
    Record<string, StudioClipLayout>
  >({});
  const displayDuration = Math.max(
    duration,
    ...tracks.map((track) =>
      getStudioClipEnd(
        previewLayouts[track.id] ??
          getStudioClipLayout(track, track.buffer?.duration ?? 0),
      ),
    ),
  );
  const timelineWidth = getTimelineWidth(
    displayDuration,
    pixelsPerSecond,
    viewportWidth,
  );
  const playheadX = timeToTimelineX(currentTime, pixelsPerSecond);
  const renderStartX = Math.max(scrollLeft - WAVEFORM_OVERSCAN_PIXELS, 0);
  const renderWidth = Math.min(
    viewportWidth + WAVEFORM_OVERSCAN_PIXELS * 2,
    Math.max(timelineWidth - renderStartX, 1),
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
    onSeek(Math.min(timelineXToTime(offsetX, pixelsPerSecond), duration));
  };
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    seekAtOffset(event.clientX - rect.left);
  };

  const getSnapTargets = (trackId: string) => [
    0,
    duration,
    ...tracks.flatMap((track) =>
      track.id === trackId
        ? []
        : [track.startTime, track.startTime + track.duration],
    ),
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
      snapTargets: getSnapTargets(gesture.track.id),
      pixelsPerSecond,
      bypassSnap: event.altKey,
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
    return getStudioClipTrimEndLayout({
      ...common,
      requestedEndTime: getStudioClipEnd(gesture.layout) + deltaSeconds,
    });
  };
  const beginClipGesture = (
    event: React.PointerEvent<HTMLDivElement>,
    track: StudioTimelineTrack,
    kind: "move" | "trim-start" | "trim-end",
  ) => {
    if (!track.buffer) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      track,
      kind,
      pointerId: event.pointerId,
      pointerStartX: event.clientX,
      layout: getStudioClipLayout(track, track.buffer.duration),
    };
    onClipGestureStart();
  };
  const previewClipGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const layout = getGestureLayout(event);
    const track = gestureRef.current?.track;
    if (layout && track) {
      setPreviewLayouts((current) => ({ ...current, [track.id]: layout }));
    }
  };
  const finishClipGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const gesture = gestureRef.current;
    const layout = getGestureLayout(event);
    if (!gesture || !layout) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = null;
    setPreviewLayouts((current) => {
      const next = { ...current };
      delete next[gesture.track.id];
      return next;
    });
    onClipLayoutChange(gesture.track.id, layout);
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
      delete next[gesture.track.id];
      return next;
    });
  };

  const rulerStep = getRulerStepSeconds(pixelsPerSecond);
  const rulerMarks: number[] = [];
  for (let time = 0; time <= displayDuration; time += rulerStep) {
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
              const layout = previewLayouts[track.id] ??
                getStudioClipLayout(track, track.buffer?.duration ?? 0);
              const clipLeft = timeToTimelineX(layout.startTime, pixelsPerSecond);
              const clipWidth = Math.min(
                timeToTimelineX(layout.duration, pixelsPerSecond),
                Math.max(timelineWidth - clipLeft, 0),
              );
              const clipRenderStartX = Math.max(renderStartX - clipLeft, 0);
              const clipRenderWidth = Math.min(
                renderWidth,
                Math.max(
                  Math.min(renderStartX + renderWidth, clipLeft + clipWidth) -
                    (clipLeft + clipRenderStartX),
                  0,
                ),
              );
              return (
                <div
                  key={track.id}
                  className="relative min-h-[190px] border-b border-white/10 last:border-b-0"
                  style={{ width: timelineWidth }}
                  onPointerUp={seekFromPointer}
                >
                  <div className="relative h-[88px] bg-[#0d131d]">
                    {track.buffer && clipRenderWidth > 0 ? (
                      <div
                        className="absolute top-0 overflow-hidden"
                        style={{
                          left: clipLeft + clipRenderStartX,
                          width: clipRenderWidth,
                        }}
                      >
                        <StudioWaveformCanvas
                          buffer={track.buffer}
                          sourceOffset={layout.offset}
                          sourceDuration={layout.duration}
                          timelineWidth={clipWidth}
                          viewportWidth={clipRenderWidth}
                          renderStartX={clipRenderStartX}
                          accent={track.accent}
                          onSeek={(clipX) =>
                            onSeek(
                              layout.startTime +
                                timelineXToTime(clipX, pixelsPerSecond),
                            )
                          }
                        />
                      </div>
                    ) : null}
                    {track.buffer && clipWidth > 0 ? (
                      <div
                        className="absolute top-0 z-10 flex h-[88px] overflow-hidden rounded border border-white/30 bg-white/5"
                        style={{ left: clipLeft, width: clipWidth }}
                        data-studio-clip={track.id}
                      >
                        <div
                          aria-label={`Обрезать начало ${track.name}`}
                          className="w-2 shrink-0 cursor-ew-resize bg-white/20 hover:bg-white/40"
                          onPointerDown={(event) =>
                            beginClipGesture(event, track, "trim-start")
                          }
                          onPointerMove={previewClipGesture}
                          onPointerUp={finishClipGesture}
                          onPointerCancel={cancelClipGesture}
                        />
                        <div
                          aria-label={`Переместить ${track.name}`}
                          className="min-w-0 flex-1 cursor-grab active:cursor-grabbing"
                          onPointerDown={(event) =>
                            beginClipGesture(event, track, "move")
                          }
                          onPointerMove={previewClipGesture}
                          onPointerUp={finishClipGesture}
                          onPointerCancel={cancelClipGesture}
                        />
                        <div
                          aria-label={`Обрезать конец ${track.name}`}
                          className="w-2 shrink-0 cursor-ew-resize bg-white/20 hover:bg-white/40"
                          onPointerDown={(event) =>
                            beginClipGesture(event, track, "trim-end")
                          }
                          onPointerMove={previewClipGesture}
                          onPointerUp={finishClipGesture}
                          onPointerCancel={cancelClipGesture}
                        />
                      </div>
                    ) : null}
                  </div>
                  {!track.buffer ? renderEmpty(track, index) : null}
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
}
