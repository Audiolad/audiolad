import {
  formatTimeseriesTooltipLine,
  type TimeseriesMarker,
  type TimeseriesTooltipBox,
  type TimeseriesTooltipModel,
} from "@/lib/admin/timeseries-tooltip";
import { TIMESERIES_PAD_Y } from "@/lib/admin/timeseries-axis";

export default function AdminAnalyticsTimeseriesTooltip({
  model,
  box,
  anchorX,
  axisY,
  markers,
}: {
  model: TimeseriesTooltipModel;
  box: TimeseriesTooltipBox;
  anchorX: number;
  axisY: number;
  markers: readonly TimeseriesMarker[];
}) {
  return (
    <g data-testid="admin-timeseries-tooltip" pointerEvents="none">
      <line
        x1={anchorX}
        y1={TIMESERIES_PAD_Y}
        x2={anchorX}
        y2={axisY}
        stroke="#d9cdee"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {markers.map((marker) => (
        <circle
          key={marker.key}
          data-testid="admin-timeseries-marker"
          data-series={marker.key}
          cx={marker.x}
          cy={marker.y}
          r="5"
          fill={marker.color}
          stroke="#ffffff"
          strokeWidth="2"
        />
      ))}
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx="10"
        fill="#ffffff"
        stroke="#eadff8"
        strokeWidth="1"
      />
      <text
        x={box.x + 10}
        y={box.y + 18}
        className="fill-[#2b2140]"
        fontSize="12"
        fontWeight="600"
      >
        {model.date}
      </text>
      {model.lines.map((line, index) => (
        <text
          key={line.key}
          x={box.x + 10}
          y={box.y + 18 + 15 * (index + 1)}
          fill={line.color}
          fontSize="11"
        >
          {formatTimeseriesTooltipLine(line.label, line.value)}
        </text>
      ))}
    </g>
  );
}
