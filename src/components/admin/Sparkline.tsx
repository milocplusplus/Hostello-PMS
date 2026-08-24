/**
 * Minimal trend line for the KPI cards. Renders nothing when the series is flat
 * or too short — an empty strip is honest, a straight line implies a trend.
 */
export function Sparkline({ values, color, id }: { values: number[]; color: string; id: string }) {
  const usable = values.length >= 2 && Math.max(...values) > Math.min(...values);
  if (!usable) {
    return <div className="h-10" />;
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 28 - ((v - min) / range) * 24;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-10 w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${id})`} points={`0,32 ${points.join(" ")} 100,32`} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        points={points.join(" ")}
      />
    </svg>
  );
}
