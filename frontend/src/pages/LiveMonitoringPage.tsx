import React, { useCallback } from 'react';
import { Activity, Thermometer, Droplets, Wind, CloudRain, Compass, RefreshCw } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { sensorApi } from '../services/api';
import { LoadingState, ErrorState } from '../components/common/States';
import { formatDateTime, formatRelativeTime, getRiskColor, formatConfidence } from '../utils/formatters';
import { getWindDirectionLabel } from '../utils/fireSpreadEngine';
import type { ReadingResponse } from '../types';
import LiveDateTimeBadge from '../components/common/LiveDateTimeBadge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export default function LiveMonitoringPage() {
  const fetchLatest = useCallback(() => sensorApi.getLatest(), []);
  const fetchHistory = useCallback(() => sensorApi.getAll(20), []);

  const { data: latest, loading, error, refresh } = usePolling<ReadingResponse>(fetchLatest, 5000);
  const { data: history } = usePolling<ReadingResponse[]>(fetchHistory, 10000);

  if (loading) return <LoadingState message="Connecting to sensors..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const trendData = history?.slice().reverse().map((r, i) => ({
    index: i,
    temperature: r.temperature,
    humidity: r.humidity,
    soil_moisture: r.soil_moisture,
    wind_speed: r.wind_speed,
    time: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  })) || [];

  return (
    <div className="monitoring-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Activity size={28} /> Live Monitoring</h1>
          <p className="page-subtitle">Real-time sensor readings</p>
        </div>
        <div className="header-actions">
          <LiveDateTimeBadge />
          <button className="btn btn-secondary" onClick={refresh}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {latest && (
        <>
          {/* Current Risk Status */}
          <div className="monitoring-status" style={{ borderColor: getRiskColor(latest.fire_risk) }}>
            <div className="monitoring-risk-indicator" style={{ background: getRiskColor(latest.fire_risk) }}>
              {latest.fire_risk === 'High' ? '🔥' : latest.fire_risk === 'Medium' ? '⚠️' : '✅'}
              <span>{latest.fire_risk} Risk</span>
              <span className="risk-confidence">{formatConfidence(latest.confidence)}</span>
            </div>
            <div className="monitoring-meta">
              <span>Sensor #{latest.id}</span>
              <span>{latest.zone_name || '—'}</span>
              <span>Updated: {formatRelativeTime(latest.created_at)}</span>
            </div>
          </div>

          {/* Sensor Cards */}
          <div className="sensor-grid">
            <SensorCard
              icon={<Thermometer size={24} />}
              label="Temperature"
              value={latest.temperature}
              unit="°C"
              color="#ef4444"
              status={latest.temperature > 40 ? 'High' : latest.temperature > 35 ? 'Medium' : 'Low'}
            />
            <SensorCard
              icon={<Droplets size={24} />}
              label="Humidity"
              value={latest.humidity}
              unit="%"
              color="#3b82f6"
              status={latest.humidity < 30 ? 'High' : latest.humidity < 50 ? 'Medium' : 'Low'}
            />
            <SensorCard
              icon={<Activity size={24} />}
              label="Soil Moisture"
              value={latest.soil_moisture}
              unit="%"
              color="#22c55e"
              status={latest.soil_moisture < 20 ? 'High' : latest.soil_moisture < 40 ? 'Medium' : 'Low'}
            />
            <SensorCard
              icon={<Wind size={24} />}
              label="Wind Speed"
              value={latest.wind_speed}
              unit="m/s"
              color="#f97316"
              status={latest.wind_speed > 10 ? 'High' : latest.wind_speed > 5 ? 'Medium' : 'Low'}
            />
            <SensorCard
              icon={<Compass size={24} />}
              label="Wind Direction"
              value={latest.wind_direction}
              unit="°"
              color="#8b5cf6"
              status="Low"
              displayValue={latest.wind_direction != null ? `${latest.wind_direction.toFixed(0)}° ${getWindDirectionLabel(latest.wind_direction)}` : undefined}
              fallback="Data unavailable"
            />
            <SensorCard
              icon={<CloudRain size={24} />}
              label="Precipitation"
              value={latest.precipitation}
              unit="mm"
              color="#06b6d4"
              status="Low"
              fallback="Data unavailable"
            />
          </div>

          {/* Trend Charts */}
          {trendData.length > 1 && (
            <div className="trend-section">
              <h2 className="section-title">📈 Recent Trends</h2>
              <div className="trend-grid">
                <TrendChart data={trendData} dataKey="temperature" label="Temperature (°C)" color="#ef4444" />
                <TrendChart data={trendData} dataKey="humidity" label="Humidity (%)" color="#3b82f6" />
                <TrendChart data={trendData} dataKey="soil_moisture" label="Soil Moisture (%)" color="#22c55e" />
                <TrendChart data={trendData} dataKey="wind_speed" label="Wind Speed (m/s)" color="#f97316" />
              </div>
            </div>
          )}

          <div className="monitoring-footer">
            <span>Last reading: {formatDateTime(latest.created_at)}</span>
            <span>Polling interval: 5 seconds</span>
          </div>
        </>
      )}
    </div>
  );
}

function SensorCard({
  icon, label, value, unit, color, status, displayValue, fallback
}: {
  icon: React.ReactNode; label: string; value: number | null | undefined;
  unit: string; color: string; status: string; displayValue?: string; fallback?: string;
}) {
  const statusColors = { High: '#ef4444', Medium: '#eab308', Low: '#22c55e', Critical: '#ef4444', Warning: '#eab308', Normal: '#22c55e' };
  const statusColor = statusColors[status as keyof typeof statusColors] || '#6b7280';

  return (
    <div className="sensor-card glass-card">
      <div className="sensor-card-header">
        <div className="sensor-icon" style={{ color }}>{icon}</div>
        <div className="sensor-status-dot" style={{ background: statusColor }} title={status} />
      </div>
      <div className="sensor-card-body">
        <span className="sensor-value">
          {displayValue || (value != null ? `${value.toFixed(1)}` : fallback || 'N/A')}
        </span>
        {value != null && !displayValue && <span className="sensor-unit">{unit}</span>}
      </div>
      <span className="sensor-label">{label}</span>
      <span className="sensor-status" style={{ color: statusColor }}>{status}</span>
    </div>
  );
}

function TrendChart({
  data, dataKey, label, color
}: {
  data: Record<string, unknown>[]; dataKey: string; label: string; color: string;
}) {
  return (
    <div className="trend-chart glass-card">
      <h4>{label}</h4>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={40} />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#fff' }}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
