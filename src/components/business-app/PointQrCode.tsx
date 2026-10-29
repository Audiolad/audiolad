"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** QR drawn locally as SVG. No external QR service. */
export default function PointQrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
      }
    }
    return { path: d, count: n + 8 };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg"
      data-testid="biz-point-qr"
    >
      <rect width={count} height={count} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
