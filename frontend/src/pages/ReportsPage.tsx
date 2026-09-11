import { useCallback, useState, useRef } from 'react';
import { FileText, Printer, Calendar, Wind } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { dashboardApi, sensorApi, alertsApi, analyticsApi } from '../services/api';
import { LoadingState, ErrorState } from '../components/common/States';
import { formatDateTime, getRiskColor, formatConfidence } from '../utils/formatters';
import { calculateFireSpread, getWindDirectionLabel, getSpreadDirectionLabel } from '../utils/fireSpreadEngine';
import type { DashboardStats, ReadingResponse, AlertResponse, AnalyticsResponse } from '../types';

export default function ReportsPage() {
  const [generating, setGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchStats = useCallback(() => dashboardApi.getStats(), []);
  const fetchReadings = useCallback(() => sensorApi.getAll(20), []);
  const fetchAlerts = useCallback(() => alertsApi.getAll(undefined, 20), []);
  const fetchAnalytics = useCallback(() => analyticsApi.get(24, 100), []);

  const { data: stats, loading: l1 } = usePolling<DashboardStats>(fetchStats, 60000);
  const { data: readings, loading: l2 } = usePolling<ReadingResponse[]>(fetchReadings, 60000);
  const { data: alerts, loading: l3 } = usePolling<AlertResponse[]>(fetchAlerts, 60000);
  const { data: analytics, loading: l4, error, refresh } = usePolling<AnalyticsResponse>(fetchAnalytics, 60000);

  const loading = l1 || l2 || l3 || l4;

  const handlePrint = () => {
    setGenerating(true);
    setTimeout(() => {
      window.print();
      setGenerating(false);
    }, 500);
  };

  // Compute fire spread data for high-risk readings with coordinates
  const highRiskWithSpread = readings
    ?.filter(r => r.fire_risk === 'High' && r.latitude != null && r.longitude != null)
    .map(r => ({
      reading: r,
      spread: calculateFireSpread(
        r.latitude!, r.longitude!,
        r.wind_speed, r.wind_direction || 0, r.fire_risk
      ),
    })) || [];

  if (loading) return <LoadingState message="Generating report data..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="reports-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><FileText size={28} /> Reports</h1>
          <p className="page-subtitle">Forest fire monitoring report</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handlePrint} disabled={generating}>
            <Printer size={16} /> {generating ? 'Generating...' : 'Print Report'}
          </button>
        </div>
      </div>

      <div className="report-content" ref={reportRef}>
        {/* Report Header */}
        <div className="report-header glass-card">
          <div className="report-brand">
            <h2>🔥 IGNITE SHIELD</h2>
            <p>Forest Fire Monitoring Report</p>
          </div>
          <div className="report-meta">
            <span><Calendar size={14} /> Generated: {new Date().toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Summary Stats */}
        {stats && (
          <div className="report-section glass-card">
            <h3>📊 Summary Statistics</h3>
            <div className="report-stats-grid">
              <div className="report-stat">
                <span className="report-stat-value">{stats.total_readings}</span>
                <span className="report-stat-label">Total Readings</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value" style={{ color: '#ef4444' }}>{stats.high_risk_count}</span>
                <span className="report-stat-label">High Risk</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value" style={{ color: '#eab308' }}>{stats.medium_risk_count}</span>
                <span className="report-stat-label">Medium Risk</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value" style={{ color: '#22c55e' }}>{stats.low_risk_count}</span>
                <span className="report-stat-label">Low Risk</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value" style={{ color: '#ef4444' }}>{stats.active_fires}</span>
                <span className="report-stat-label">Active Fires (1h)</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{stats.system_status}</span>
                <span className="report-stat-label">System Status</span>
              </div>
            </div>
          </div>
        )}

        {/* Risk Distribution */}
        {analytics && (
          <div className="report-section glass-card">
            <h3>📈 Risk Distribution</h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Risk Level</th>
                  <th>Count</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {analytics.risk_distribution.map((r) => (
                  <tr key={r.risk_level}>
                    <td style={{ color: getRiskColor(r.risk_level) }}>{r.risk_level}</td>
                    <td>{r.count}</td>
                    <td>{r.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Fire Spread Analysis */}
        {highRiskWithSpread.length > 0 && (
          <div className="report-section glass-card">
            <h3><Wind size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />🔥 Fire Spread Analysis</h3>
            <p className="report-spread-disclaimer">
              ⚠️ Wind-based fire spread simulation. Not a scientifically accurate wildfire prediction.
            </p>
            <div className="table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Wind Speed</th>
                    <th>Wind Dir</th>
                    <th>Spread Dir</th>
                    <th>Intensity</th>
                    <th>Est. Distance</th>
                    <th>Affected Area</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {highRiskWithSpread.map(({ reading, spread }) => (
                    <tr key={reading.id}>
                      <td>{reading.zone_name || `Sensor-${reading.id}`}</td>
                      <td>{reading.wind_speed.toFixed(1)} m/s</td>
                      <td>
                        {reading.wind_direction != null
                          ? `${reading.wind_direction.toFixed(0)}° (${getWindDirectionLabel(reading.wind_direction)})`
                          : 'N/A'}
                      </td>
                      <td>{getSpreadDirectionLabel(reading.wind_direction || 0)}</td>
                      <td style={{ color: spread.spreadIntensity === 'Extreme' ? '#dc2626' : spread.spreadIntensity === 'High' ? '#ef4444' : '#f97316' }}>
                        {spread.spreadIntensity}
                      </td>
                      <td>{spread.spreadDistanceKm.toFixed(1)} km</td>
                      <td>{spread.affectedAreaSqKm} km²</td>
                      <td>{formatDateTime(reading.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Readings */}
        {readings && readings.length > 0 && (
          <div className="report-section glass-card">
            <h3>🌡️ Recent Sensor Readings</h3>
            <div className="table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Temp (°C)</th>
                    <th>Humidity (%)</th>
                    <th>Soil (%)</th>
                    <th>Wind (m/s)</th>
                    <th>Risk</th>
                    <th>Confidence</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r.id}>
                      <td>#{r.id}</td>
                      <td>{r.temperature.toFixed(1)}</td>
                      <td>{r.humidity.toFixed(1)}</td>
                      <td>{r.soil_moisture.toFixed(1)}</td>
                      <td>{r.wind_speed.toFixed(1)}</td>
                      <td style={{ color: getRiskColor(r.fire_risk) }}>{r.fire_risk}</td>
                      <td>{formatConfidence(r.confidence)}</td>
                      <td>{formatDateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Alerts */}
        {alerts && alerts.length > 0 && (
          <div className="report-section glass-card">
            <h3>🚨 Recent Alerts</h3>
            <div className="table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Risk Level</th>
                    <th>Zone</th>
                    <th>Message</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.alert_type.replace('_', ' ')}</td>
                      <td style={{ color: getRiskColor(a.risk_level === 'Critical' ? 'High' : a.risk_level) }}>{a.risk_level === 'Critical' ? 'High' : a.risk_level}</td>
                      <td>{a.zone_name || '—'}</td>
                      <td className="alert-msg-cell">{a.message}</td>
                      <td>{a.is_acknowledged ? '✅ Ack' : '⏳ Pending'}</td>
                      <td>{formatDateTime(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="report-footer">
          <p>Report generated by IGNITE SHIELD — Forest Fire Monitoring System</p>
          <p>{new Date().toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  );
}
