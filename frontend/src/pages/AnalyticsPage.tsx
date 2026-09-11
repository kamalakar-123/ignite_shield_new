import { useCallback, useState } from 'react';
import { BarChart3, Clock } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { analyticsApi } from '../services/api';
import { LoadingState, ErrorState, EmptyState } from '../components/common/States';
import type { AnalyticsResponse } from '../types';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const TIME_RANGES = [
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
  { label: 'All', hours: 8760 },
];

const RISK_COLORS: Record<string, string> = { Low: '#22c55e', Medium: '#eab308', High: '#ef4444' };

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState(24);

  const fetchAnalytics = useCallback(() => analyticsApi.get(timeRange, 500), [timeRange]);
  const { data, loading, error, refresh } = usePolling<AnalyticsResponse>(fetchAnalytics, 30000);

  if (loading) return <LoadingState message="Loading analytics..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!data || data.time_series.length === 0) return <EmptyState message="No historical data available" icon="📊" />;

  const chartData = data.time_series.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
  }));

  const riskDistData = data.risk_distribution.map((d) => ({
    name: d.risk_level,
    value: d.count,
    percentage: d.percentage,
    fill: RISK_COLORS[d.risk_level] || '#6b7280',
  }));

  // Fire incidents over time (count of High risk per time bucket)
  const incidentData = (() => {
    const buckets: Record<string, number> = {};
    data.time_series.forEach((d) => {
      const key = new Date(d.timestamp).toLocaleDateString('en-IN', { month: 'short', day: '2-digit' });
      if (d.fire_risk === 'High') {
        buckets[key] = (buckets[key] || 0) + 1;
      } else if (!buckets[key]) {
        buckets[key] = 0;
      }
    });
    return Object.entries(buckets).map(([date, count]) => ({ date, incidents: count }));
  })();

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><BarChart3 size={28} /> Analytics</h1>
          <p className="page-subtitle">{data.total_predictions} total predictions analyzed</p>
        </div>
        <div className="time-range-selector">
          <Clock size={16} />
          {TIME_RANGES.map((r) => (
            <button
              key={r.hours}
              className={`time-btn ${timeRange === r.hours ? 'active' : ''}`}
              onClick={() => setTimeRange(r.hours)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="analytics-grid">
        {/* Temperature over time */}
        <div className="chart-card glass-card">
          <h3>🌡️ Temperature Over Time</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#fff' }} />
              <Area type="monotone" dataKey="temperature" stroke="#ef4444" fill="url(#tempGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Humidity over time */}
        <div className="chart-card glass-card">
          <h3>💧 Humidity Over Time</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#fff' }} />
              <Area type="monotone" dataKey="humidity" stroke="#3b82f6" fill="url(#humGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Soil Moisture over time */}
        <div className="chart-card glass-card">
          <h3>🌱 Soil Moisture Over Time</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#fff' }} />
              <Line type="monotone" dataKey="soil_moisture" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Wind Speed over time */}
        <div className="chart-card glass-card">
          <h3>💨 Wind Speed Over Time</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#fff' }} />
              <Line type="monotone" dataKey="wind_speed" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Risk Distribution */}
        <div className="chart-card glass-card">
          <h3>🔥 Fire Risk Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={riskDistData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                label={({ name, value }) => `${name}: ${riskDistData.find(d => d.name === name)?.percentage ?? value}%`}
              >
                {riskDistData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#fff' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Fire Incidents over time */}
        <div className="chart-card glass-card">
          <h3>🚨 High Risk Incidents Over Time</h3>
          {incidentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={incidentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="incidents" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">No high risk incidents in this time range</div>
          )}
        </div>
      </div>
    </div>
  );
}
