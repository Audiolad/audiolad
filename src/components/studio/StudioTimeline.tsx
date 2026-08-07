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

export type StudioTimelineTrack = {
  id: string;
  name: string;
  fileName?: string;
  buffer: AudioBuffer | null;
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
  renderControls,
  renderEmpty,
}: StudioTimelineProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const previousPixelsPerSecondRef = useRef(pixelsPerSecond);
  const lastManualScrollAtRef = useRef(0);
  const isAutoScrollingRef = useRef(false);
  const timelineWidth = getTimelineWidth(duration, pixelsPerSecond, viewportWidth);
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

  const rulerStep = getRulerStepSeconds(pixelsPerSecond);
  const rulerMarks: number[] = [];
  for (let time = 0; time <= duration; time += rulerStep) {
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
              const clipWidth = Math.min(
                timeToTimelineX(track.duration, pixelsPerSecond),
                timelineWidth,
              );
              const clipRenderStartX = Math.max(renderStartX, 0);
              const clipRenderWidth = Math.min(
                renderWidth,
                Math.max(clipWidth - clipRenderStartX, 0),
              );
              return (
                <div
                  key={track.id}
                  className="relative min-h-[190px] border-b border-white/10 last:border-b-0"
                  style={{ width: timelineWidth }}
                  onPointerUp={seekFromPointer}
                >
                  <div className="h-[88px] bg-[#0d131d]">
                    {track.buffer && clipRenderWidth > 0 ? (
                      <div
                        className="absolute top-0"
                        style={{ left: clipRenderStartX }}
                      >
                        <StudioWaveformCanvas
                          buffer={track.buffer}
                          timelineWidth={clipWidth}
                          viewportWidth={clipRenderWidth}
                          renderStartX={clipRenderStartX}
                          accent={track.accent}
                          onSeek={seekAtOffset}
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
