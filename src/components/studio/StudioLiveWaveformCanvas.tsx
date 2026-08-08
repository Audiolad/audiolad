"use client";

import { useEffect, useRef } from "react";

type StudioLiveWaveformCanvasProps = {
  analyser: AnalyserNode;
  startTime: number;
  pixelsPerSecond: number;
  accent: string;
};

const HEIGHT = 88;

export function StudioLiveWaveformCanvas({
  analyser,
  startTime,
  pixelsPerSecond,
  accent,
}: StudioLiveWaveformCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();
    let frameId: number | null = null;
    let previousWidth = 0;

    const draw = () => {
      const width = Math.max(
        1,
        Math.ceil(((performance.now() - startedAt) / 1000) * pixelsPerSecond),
      );
      if (width !== previousWidth) {
        const scale = window.devicePixelRatio || 1;
        container.style.width = `${width}px`;
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(HEIGHT * scale);
        previousWidth = width;
      }

      const context = canvas.getContext("2d");
      if (context) {
        const scale = window.devicePixelRatio || 1;
        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.clearRect(0, 0, width, HEIGHT);
        context.fillStyle = "rgba(167,139,250,0.08)";
        context.fillRect(0, 0, width, HEIGHT);
        analyser.getByteTimeDomainData(samples);
        context.strokeStyle = accent;
        context.lineWidth = 1;
        context.beginPath();
        const midpoint = HEIGHT / 2;
        for (let x = 0; x < width; x += 1) {
          const sampleIndex = Math.floor(
            (x / Math.max(width - 1, 1)) * (samples.length - 1),
          );
          const amplitude = ((samples[sampleIndex] ?? 128) - 128) / 128;
          const y = midpoint + amplitude * midpoint * 0.9;
          if (x === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
        context.stroke();
      }
      frameId = window.requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [accent, analyser, pixelsPerSecond]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="absolute top-0 h-[88px] overflow-hidden rounded border border-rose-300/50"
      style={{ left: startTime * pixelsPerSecond }}
    >
      <canvas ref={canvasRef} className="block h-[88px]" />
    </div>
  );
}
