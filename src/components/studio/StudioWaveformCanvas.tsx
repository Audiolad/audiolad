"use client";

import { useEffect, useRef, useState } from "react";

import { getCachedWaveformPeaks } from "@/lib/studio/waveform-peaks";

type StudioWaveformCanvasProps = {
  buffer: AudioBuffer | null;
  sourceOffset: number;
  sourceDuration: number;
  timelineWidth: number;
  viewportWidth: number;
  renderStartX: number;
  height?: number;
  accent: string;
  onSeek: (timelineX: number) => void;
};

export function StudioWaveformCanvas({
  buffer,
  sourceOffset,
  sourceDuration,
  timelineWidth,
  viewportWidth,
  renderStartX,
  height = 88,
  accent,
  onSeek,
}: StudioWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState<number | null>(null);
  const renderWidth = Math.max(1, Math.ceil(viewportWidth));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(renderWidth * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.scale(scale, scale);
    context.clearRect(0, 0, renderWidth, height);
    context.fillStyle = "#0d131d";
    context.fillRect(0, 0, renderWidth, height);
    context.strokeStyle = "rgba(255,255,255,0.06)";
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(renderWidth, height / 2);
    context.stroke();

    if (!buffer) {
      return;
    }

    const peaks = getCachedWaveformPeaks(buffer, 8192);
    const safeBufferDuration = Math.max(buffer.duration, 0.000_001);
    const startRatio = Math.min(
      Math.max(sourceOffset / safeBufferDuration, 0),
      1,
    );
    const endRatio = Math.min(
      Math.max((sourceOffset + sourceDuration) / safeBufferDuration, startRatio),
      1,
    );
    context.strokeStyle = accent;
    context.lineWidth = 1;
    context.beginPath();
    const midpoint = height / 2;
    for (let column = 0; column < renderWidth; column += 1) {
      const startPeak = Math.floor(
        (startRatio +
          ((renderStartX + column) / Math.max(timelineWidth, 1)) *
            (endRatio - startRatio)) *
          peaks.minimums.length,
      );
      const endPeak = Math.min(
        peaks.minimums.length,
        Math.ceil(
          (startRatio +
            ((renderStartX + column + 1) / Math.max(timelineWidth, 1)) *
              (endRatio - startRatio)) *
            peaks.minimums.length,
        ),
      );
      let minimum = 0;
      let maximum = 0;
      for (let peakIndex = startPeak; peakIndex < endPeak; peakIndex += 1) {
        minimum = Math.min(minimum, peaks.minimums[peakIndex] ?? 0);
        maximum = Math.max(maximum, peaks.maximums[peakIndex] ?? 0);
      }
      context.moveTo(column + 0.5, midpoint + minimum * midpoint);
      context.lineTo(column + 0.5, midpoint + maximum * midpoint);
    }
    context.stroke();
  }, [
    accent,
    buffer,
    height,
    renderStartX,
    renderWidth,
    sourceDuration,
    sourceOffset,
    timelineWidth,
  ]);

  const getOffsetX = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(Math.max(event.clientX - rect.left, 0), rect.width) + renderStartX;
  };

  return (
    <div className="relative h-[88px]" style={{ width: renderWidth }}>
      <canvas
        ref={canvasRef}
        width={renderWidth}
        height={height}
        aria-label="Форма волны дорожки"
        className="block h-[88px] cursor-crosshair touch-none"
        style={{ width: renderWidth }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragOffsetX(getOffsetX(event));
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            setDragOffsetX(getOffsetX(event));
          }
        }}
        onPointerUp={(event) => {
          const offsetX = getOffsetX(event);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDragOffsetX(null);
          onSeek(offsetX);
        }}
        onPointerCancel={() => setDragOffsetX(null)}
      />
      {dragOffsetX !== null ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/80"
          style={{ left: dragOffsetX - renderStartX }}
        />
      ) : null}
    </div>
  );
}
