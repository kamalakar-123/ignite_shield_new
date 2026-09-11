import { useCallback, useState } from 'react';
import { Bell, Check, Filter } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { alertsApi } from '../services/api';
import { LoadingState, ErrorState, EmptyState } from '../components/common/States';
import { formatDateTime, formatRelativeTime, getRiskColor } from '../utils/formatters';
import type { AlertResponse } from '../types';

const FILTER_OPTIONS = ['All', 'High', 'Medium', 'Low'];

export default function AlertsPage() {
  const [filter, setFilter] = useState('All');

  const fetchAlerts = useCallback(() => alertsApi.getAll(filter !== 'All' ? filter : undefined), [filter]);
  const { data: alerts, loading, error, refresh } = usePolling<AlertResponse[]>(fetchAlerts, 10000);

  const handleAcknowledge = async (alertId: number) => {
    try {
      await alertsApi.acknowledge(alertId);
      refresh();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  if (loading) return <LoadingState message="Loading alerts..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="alerts-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Bell size={28} /> Alerts</h1>
          <p className="page-subtitle">{alerts?.length || 0} alerts found</p>
        </div>
        <div className="alert-filters">
          <Filter size={16} />
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              className={`filter-chip ${filter === opt ? 'active' : ''}`}
              onClick={() => setFilter(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {!alerts || alerts.length === 0 ? (
        <EmptyState message="No alerts recorded yet. Alerts are auto-generated when fire risk is Medium or High." icon="🔔" />
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => {
            const displayRisk = alert.risk_level === 'Critical' ? 'High' : alert.risk_level;
            const riskColor = getRiskColor(displayRisk);
            return (
              <div
                key={alert.id}
                className={`alert-card glass-card ${alert.is_acknowledged ? 'acknowledged' : ''}`}
              >
                <div className="alert-card-left">
                  <div
                    className="alert-risk-indicator"
                    style={{ background: riskColor }}
                  />
                  <div className="alert-card-content">
                    <div className="alert-card-header">
                      <span className="alert-type-badge" style={{ background: `${riskColor}20`, color: riskColor }}>
                        {alert.alert_type.replace('_', ' ')}
                      </span>
                      <span className="alert-risk-level">{displayRisk}</span>
                      {alert.zone_name && <span className="alert-zone">📍 {alert.zone_name}</span>}
                    </div>
                    <p className="alert-message">{alert.message}</p>
                    <div className="alert-card-footer">
                      <span className="alert-time" title={formatDateTime(alert.created_at)}>
                        {formatRelativeTime(alert.created_at)}
                      </span>
                      {alert.is_acknowledged && (
                        <span className="alert-ack-badge">
                          <Check size={12} /> Acknowledged
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {!alert.is_acknowledged && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleAcknowledge(alert.id)}
                  >
                    <Check size={14} /> Acknowledge
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
