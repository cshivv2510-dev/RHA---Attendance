import { useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  type Chart as ChartJSInstance,
} from 'chart.js';
import type { MonthlyDataPoint } from '../../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

interface MonthlyChartProps {
  data: MonthlyDataPoint[];
  /** monthKey per index, used to label tapped points */
  monthKeys?: string[];
  onPointClick?: (monthKey: string) => void;
}

export function MonthlyChart({ data, monthKeys, onPointClick }: MonthlyChartProps) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const chartRef = useRef<ChartJSInstance<'line'>>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const chartData = {
    labels: data.map(d => d.month),
    datasets: [
      {
        label: 'Attendance %',
        // null = no session days that month → gap in the line (not 0%)
        data: data.map(d => (d.percentage === null || d.percentage === undefined ? null : d.percentage)),
        borderColor: isDark ? '#4cc07f' : '#1f7a3f',
        backgroundColor: isDark ? 'rgba(76,192,127,0.12)' : 'rgba(31,122,63,0.08)',
        fill: true,
        tension: 0, // straight segments between points
        spanGaps: false,
        pointBackgroundColor: isDark ? '#4cc07f' : '#1f7a3f',
        pointBorderColor: isDark ? '#162a1d' : '#ffffff',
        pointBorderWidth: 2,
        pointRadius: (ctx: { dataIndex: number }) => (ctx.dataIndex === selected ? 7 : 5),
        pointHoverRadius: 7,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_evt: unknown, elements: { index: number }[]) => {
      if (elements.length === 0) {
        setSelected(null);
        return;
      }
      const idx = elements[0].index;
      setSelected(idx === selected ? null : idx);
      const mk = monthKeys?.[idx];
      if (mk) onPointClick?.(mk);
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#1c3524' : '#ffffff',
        titleColor: isDark ? '#e8f5ed' : '#0a3019',
        bodyColor: isDark ? '#a3c4b0' : '#4b6b56',
        borderColor: isDark ? '#264a32' : '#e2ebe6',
        borderWidth: 1,
        cornerRadius: 12,
        padding: 12,
        titleFont: { family: 'Inter', weight: 'bold' as const },
        bodyFont: { family: 'Inter' },
        filter: (item: { parsed: { y: number | null } }) => item.parsed.y !== null,
        callbacks: {
          label: (ctx: { parsed: { y: number | null } }) => `${(ctx.parsed.y ?? 0).toFixed(0)}%`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: isDark ? '#6b9a7d' : '#8ba498',
          font: { size: 11, family: 'Inter' },
        },
        border: { display: false },
      },
      y: {
        grid: {
          color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        },
        ticks: {
          color: isDark ? '#6b9a7d' : '#8ba498',
          font: { size: 11, family: 'Inter' },
          callback: (value: string | number) => `${value}%`,
        },
        border: { display: false },
        min: 0,
        max: 100,
      },
    },
  };

  const selectedLabel = selected !== null ? data[selected] : null;

  return (
    <div>
      <div className="h-56">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
      {/* Tapped point value */}
      <div className="h-5 mt-1 text-center">
        {selectedLabel && selectedLabel.percentage !== null ? (
          <span className="text-xs font-semibold" style={{ color: '#1f7a3f' }}>
            {selectedLabel.month} · {selectedLabel.percentage}%
          </span>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Tap a point for details
          </span>
        )}
      </div>
    </div>
  );
}
