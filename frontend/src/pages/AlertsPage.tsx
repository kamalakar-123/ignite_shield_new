import { useCallback, useState } from 'react';
import {
  Bell,
  Check,
  Filter,
  Mail,
  MessageSquare,
  Smartphone,
  Send,
  Thermometer,
  Droplets,
  Activity,
  Wind,
  Info,
} from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { alertsApi } from '../services/api';
import { LoadingState, ErrorState, EmptyState } from '../components/common/States';
import { formatDateTime, formatRelativeTime, getRiskColor } from '../utils/formatters';
import type { AlertResponse } from '../types';

const FILTER_OPTIONS = ['All', 'High', 'Medium', 'Low'];

type TestingChannel = 'all' | 'email' | 'sms' | 'whatsapp' | null;

interface TestResultState {
  success: boolean;
  message: string;
  details?: {
    email?: { status: string; recipient?: string | null; error?: string | null };
    sms?: { status: string; recipient?: string | null; error?: string | null };
    whatsapp?: { status: string; recipient?: string | null; error?: string | null };
  };
}

export default function AlertsPage() {
  const [filter, setFilter] = useState('All');
  const [activeTesting, setActiveTesting] = useState<TestingChannel>(null);
  const [testResult, setTestResult] = useState<TestResultState | null>(null);
  const [showSandboxHint, setShowSandboxHint] = useState(false);

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

  const handleTestAll = async () => {
    setActiveTesting('all');
    setTestResult(null);
    try {
      const res = await alertsApi.sendTestAll();
      setTestResult({
        success: res.success,
        message: res.message || 'Multi-channel test complete.',
        details: {
          email: res.email,
          sms: res.sms,
          whatsapp: res.whatsapp,
        },
      });
      refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error executing multi-channel test alert';
      setTestResult({
        success: false,
        message: errMsg,
      });
    } finally {
      setActiveTesting(null);
    }
  };

  const handleTestEmail = async () => {
    setActiveTesting('email');
    setTestResult(null);
    try {
      const res = await alertsApi.sendTestEmail();
      setTestResult({
        success: res.success,
        message: res.success
          ? `Email Alert Sent Successfully! Recipient: ${res.recipient || 'Configured alert email'}`
          : res.error || 'Failed to dispatch email alert. Verify Gmail SMTP credentials.',
        details: {
          email: { status: res.status, recipient: res.recipient, error: res.error },
        },
      });
      refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error sending test email alert';
      setTestResult({ success: false, message: errMsg });
    } finally {
      setActiveTesting(null);
    }
  };

  const handleTestSMS = async () => {
    setActiveTesting('sms');
    setTestResult(null);
    try {
      const res = await alertsApi.sendTestSMS();
      setTestResult({
        success: res.success,
        message: res.success
          ? `SMS Sent Successfully via Twilio! SID: ${res.message_sid || 'N/A'}`
          : res.error || 'Failed to send SMS alert. Verify Twilio SMS settings.',
        details: {
          sms: { status: res.status, recipient: res.recipient, error: res.error },
        },
      });
      refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error sending test SMS';
      setTestResult({ success: false, message: errMsg });
    } finally {
      setActiveTesting(null);
    }
  };

  const handleTestWhatsApp = async () => {
    setActiveTesting('whatsapp');
    setTestResult(null);
    try {
      const res = await alertsApi.sendTestWhatsApp();
      setTestResult({
        success: res.success,
        message: res.success
          ? `WhatsApp Message Sent Successfully via Twilio! SID: ${res.message_sid || 'N/A'}`
          : res.error || 'Failed to send WhatsApp alert. Verify Twilio Sandbox status.',
        details: {
          whatsapp: { status: res.status, recipient: res.recipient, error: res.error },
        },
      });
      refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Error sending test WhatsApp';
      setTestResult({ success: false, message: errMsg });
    } finally {
      setActiveTesting(null);
    }
  };

  if (loading) return <LoadingState message="Loading alerts..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="alerts-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Bell size={28} /> Alerts & Notifications</h1>
          <p className="page-subtitle">
            {alerts?.length || 0} alerts found • Multi-Channel: Gmail SMTP, Twilio SMS & WhatsApp
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Multi-channel Test Action Buttons */}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleTestAll}
            disabled={activeTesting !== null}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Dispatch a test alert simultaneously to Email, SMS, and WhatsApp"
          >
            {activeTesting === 'all' ? <Send size={14} className="animate-spin" /> : <Bell size={14} />}
            <span>{activeTesting === 'all' ? 'Testing 3 Channels...' : 'Test All 3 Channels'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleTestEmail}
            disabled={activeTesting !== null}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Test Gmail SMTP Email only"
          >
            {activeTesting === 'email' ? <Send size={14} className="animate-spin" /> : <Mail size={14} />}
            <span>{activeTesting === 'email' ? 'Sending...' : 'Test Email'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleTestSMS}
            disabled={activeTesting !== null}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Test Twilio Normal SMS only"
          >
            {activeTesting === 'sms' ? <Send size={14} className="animate-spin" /> : <Smartphone size={14} />}
            <span>{activeTesting === 'sms' ? 'Sending...' : 'Test SMS'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleTestWhatsApp}
            disabled={activeTesting !== null}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Test Twilio WhatsApp only"
          >
            {activeTesting === 'whatsapp' ? <Send size={14} className="animate-spin" /> : <MessageSquare size={14} />}
            <span>{activeTesting === 'whatsapp' ? 'Sending...' : 'Test WhatsApp'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => setShowSandboxHint(!showSandboxHint)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Toggle Twilio Sandbox Instructions"
          >
            <Info size={14} />
            <span>Sandbox Info</span>
          </button>

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
      </div>

      {/* Twilio Sandbox Info Banner */}
      {showSandboxHint && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            background: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid #334155',
            fontSize: '13px',
            color: '#cbd5e1',
            lineHeight: '1.6',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={16} /> Twilio Trial & Sandbox Instructions
            </span>
            <button
              type="button"
              onClick={() => setShowSandboxHint(false)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>
              <strong>Gmail SMTP:</strong> Dispatches directly via port 587 STARTTLS to <code>ALERT_EMAIL</code> without sandbox restrictions.
            </li>
            <li>
              <strong>Normal SMS:</strong> On Twilio trial accounts, international SMS requires the destination number (<code>TWILIO_SMS_TO</code>) to be verified in Twilio Console Verified Caller IDs.
            </li>
            <li>
              <strong>WhatsApp:</strong> To receive messages from Twilio Sandbox, the recipient must send the join code (e.g. <code>join &lt;keyword&gt;</code>) from WhatsApp to the Twilio number.
            </li>
          </ul>
        </div>
      )}

      {/* Test Execution Result Banner */}
      {testResult && (
        <div
          className={`alert-banner ${testResult.success ? 'success' : 'warning'}`}
          style={{
            padding: '14px 16px',
            borderRadius: '8px',
            marginBottom: '18px',
            background: testResult.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            color: testResult.success ? '#22c55e' : '#ef4444',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Bell size={16} />
              <span>{testResult.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setTestResult(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          {/* Breakdown for multi-channel test */}
          {testResult.details && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '8px',
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                fontSize: '12px',
              }}
            >
              {testResult.details.email && (
                <div style={{ color: testResult.details.email.status === 'SENT' ? '#4ade80' : '#f87171' }}>
                  📧 <strong>Email:</strong> {testResult.details.email.status}
                  {testResult.details.email.error && ` (${testResult.details.email.error})`}
                </div>
              )}
              {testResult.details.sms && (
                <div style={{ color: testResult.details.sms.status === 'SENT' ? '#4ade80' : '#f87171' }}>
                  📱 <strong>SMS:</strong> {testResult.details.sms.status}
                  {testResult.details.sms.error && ` (${testResult.details.sms.error})`}
                </div>
              )}
              {testResult.details.whatsapp && (
                <div style={{ color: testResult.details.whatsapp.status === 'SENT' ? '#4ade80' : '#f87171' }}>
                  💬 <strong>WhatsApp:</strong> {testResult.details.whatsapp.status}
                  {testResult.details.whatsapp.error && ` (${testResult.details.whatsapp.error})`}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!alerts || alerts.length === 0 ? (
        <EmptyState message="No alerts recorded yet. Alerts are auto-generated when fire risk is Medium or High." icon="🔔" />
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => {
            const displayRisk = alert.risk_level === 'Critical' ? 'High' : alert.risk_level;
            const riskColor = getRiskColor(displayRisk);
            const hasTelemetry =
              alert.temperature != null ||
              alert.humidity != null ||
              alert.soil_moisture != null ||
              alert.wind_speed != null;

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
                  <div className="alert-card-content" style={{ width: '100%' }}>
                    <div className="alert-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="alert-type-badge" style={{ background: `${riskColor}20`, color: riskColor }}>
                        {alert.alert_type.replace('_', ' ')}
                      </span>
                      <span className="alert-risk-level">{displayRisk}</span>
                      {alert.zone_name && <span className="alert-zone">📍 {alert.zone_name}</span>}

                      {/* ----------------- Multi-Channel Status Badges ----------------- */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                        {/* 1. Email Status Badge */}
                        {alert.email_status && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background:
                                alert.email_status.toUpperCase() === 'SENT'
                                  ? 'rgba(34, 197, 94, 0.18)'
                                  : alert.email_status.toUpperCase() === 'FAILED'
                                  ? 'rgba(239, 68, 68, 0.18)'
                                  : alert.email_status.toUpperCase() === 'PENDING'
                                  ? 'rgba(56, 189, 248, 0.18)'
                                  : 'rgba(148, 163, 184, 0.15)',
                              color:
                                alert.email_status.toUpperCase() === 'SENT'
                                  ? '#22c55e'
                                  : alert.email_status.toUpperCase() === 'FAILED'
                                  ? '#ef4444'
                                  : alert.email_status.toUpperCase() === 'PENDING'
                                  ? '#38bdf8'
                                  : '#94a3b8',
                              border: `1px solid ${
                                alert.email_status.toUpperCase() === 'SENT'
                                  ? 'rgba(34, 197, 94, 0.4)'
                                  : alert.email_status.toUpperCase() === 'FAILED'
                                  ? 'rgba(239, 68, 68, 0.4)'
                                  : alert.email_status.toUpperCase() === 'PENDING'
                                  ? 'rgba(56, 189, 248, 0.4)'
                                  : 'rgba(148, 163, 184, 0.3)'
                              }`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title={`Email: ${alert.email_status} | Recipient: ${alert.email_recipient || 'N/A'}${alert.email_error ? ` | Error: ${alert.email_error}` : ''}`}
                          >
                            <Mail size={12} />
                            Email: {alert.email_status.toUpperCase() === 'SENT' ? '✓' : alert.email_status.toUpperCase() === 'FAILED' ? '✗' : alert.email_status.toUpperCase() === 'PENDING' ? '⏳' : '⟳'}
                          </span>
                        )}

                        {/* 2. SMS Status Badge */}
                        {alert.sms_status && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background:
                                alert.sms_status.toUpperCase() === 'SENT'
                                  ? 'rgba(34, 197, 94, 0.18)'
                                  : alert.sms_status.toUpperCase() === 'FAILED'
                                  ? 'rgba(239, 68, 68, 0.18)'
                                  : alert.sms_status.toUpperCase() === 'PENDING'
                                  ? 'rgba(56, 189, 248, 0.18)'
                                  : 'rgba(148, 163, 184, 0.15)',
                              color:
                                alert.sms_status.toUpperCase() === 'SENT'
                                  ? '#22c55e'
                                  : alert.sms_status.toUpperCase() === 'FAILED'
                                  ? '#ef4444'
                                  : alert.sms_status.toUpperCase() === 'PENDING'
                                  ? '#38bdf8'
                                  : '#94a3b8',
                              border: `1px solid ${
                                alert.sms_status.toUpperCase() === 'SENT'
                                  ? 'rgba(34, 197, 94, 0.4)'
                                  : alert.sms_status.toUpperCase() === 'FAILED'
                                  ? 'rgba(239, 68, 68, 0.4)'
                                  : alert.sms_status.toUpperCase() === 'PENDING'
                                  ? 'rgba(56, 189, 248, 0.4)'
                                  : 'rgba(148, 163, 184, 0.3)'
                              }`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title={`SMS: ${alert.sms_status} | Recipient: ${alert.sms_recipient || 'N/A'}${alert.sms_error ? ` | Error: ${alert.sms_error}` : ''}`}
                          >
                            <Smartphone size={12} />
                            SMS: {alert.sms_status.toUpperCase() === 'SENT' ? '✓' : alert.sms_status.toUpperCase() === 'FAILED' ? '✗' : alert.sms_status.toUpperCase() === 'PENDING' ? '⏳' : '⟳'}
                          </span>
                        )}

                        {/* 3. WhatsApp Status Badge */}
                        {alert.whatsapp_status && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background:
                                alert.whatsapp_status.toUpperCase() === 'SENT'
                                  ? 'rgba(34, 197, 94, 0.18)'
                                  : alert.whatsapp_status.toUpperCase() === 'FAILED'
                                  ? 'rgba(239, 68, 68, 0.18)'
                                  : alert.whatsapp_status.toUpperCase() === 'PENDING'
                                  ? 'rgba(56, 189, 248, 0.18)'
                                  : 'rgba(148, 163, 184, 0.15)',
                              color:
                                alert.whatsapp_status.toUpperCase() === 'SENT'
                                  ? '#22c55e'
                                  : alert.whatsapp_status.toUpperCase() === 'FAILED'
                                  ? '#ef4444'
                                  : alert.whatsapp_status.toUpperCase() === 'PENDING'
                                  ? '#38bdf8'
                                  : '#94a3b8',
                              border: `1px solid ${
                                alert.whatsapp_status.toUpperCase() === 'SENT'
                                  ? 'rgba(34, 197, 94, 0.4)'
                                  : alert.whatsapp_status.toUpperCase() === 'FAILED'
                                  ? 'rgba(239, 68, 68, 0.4)'
                                  : alert.whatsapp_status.toUpperCase() === 'PENDING'
                                  ? 'rgba(56, 189, 248, 0.4)'
                                  : 'rgba(148, 163, 184, 0.3)'
                              }`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title={`WhatsApp: ${alert.whatsapp_status} | Recipient: ${alert.whatsapp_recipient || 'N/A'}${alert.whatsapp_error ? ` | Error: ${alert.whatsapp_error}` : ''}`}
                          >
                            <MessageSquare size={12} />
                            WhatsApp: {alert.whatsapp_status.toUpperCase() === 'SENT' ? '✓' : alert.whatsapp_status.toUpperCase() === 'FAILED' ? '✗' : alert.whatsapp_status.toUpperCase() === 'PENDING' ? '⏳' : '⟳'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sensor Telemetry Pill Row */}
                    {hasTelemetry && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          marginTop: '6px',
                          marginBottom: '6px',
                          fontSize: '12px',
                          color: '#cbd5e1',
                          flexWrap: 'wrap',
                        }}
                      >
                        {alert.temperature != null && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Thermometer size={13} style={{ color: '#ef4444' }} /> {alert.temperature.toFixed(1)} °C
                          </span>
                        )}
                        {alert.humidity != null && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Droplets size={13} style={{ color: '#3b82f6' }} /> {alert.humidity.toFixed(1)} %
                          </span>
                        )}
                        {alert.soil_moisture != null && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Activity size={13} style={{ color: '#22c55e' }} /> {alert.soil_moisture.toFixed(1)} %
                          </span>
                        )}
                        {alert.wind_speed != null && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Wind size={13} style={{ color: '#f97316' }} /> {alert.wind_speed.toFixed(1)} m/s
                          </span>
                        )}
                      </div>
                    )}

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
