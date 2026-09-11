import { useState } from 'react';
import { Settings, User, Bell, Map, RefreshCw, LogOut, Save, Sliders, Clock, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAlarm } from '../context/AlarmContext';
import { useNavigate } from 'react-router-dom';

const PREDICTION_PRESETS = [
  { label: '10s', value: 10, desc: 'Fast / Demo' },
  { label: '15s', value: 15, desc: 'High Frequency' },
  { label: '30s', value: 30, desc: 'Standard (Default)' },
  { label: '1 min', value: 60, desc: 'Normal' },
  { label: '2 min', value: 120, desc: 'Battery / Low Load' },
  { label: '5 min', value: 300, desc: 'Extended' },
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { isAlarmMuted, muteAlarm, unmuteAlarm } = useAlarm();
  const navigate = useNavigate();

  const [refreshInterval, setRefreshInterval] = useState(() => {
    return Number(localStorage.getItem('ignite_shield_refresh_interval') || '10');
  });

  const [predictionInterval, setPredictionInterval] = useState<number>(() => {
    return Number(localStorage.getItem('ignite_shield_prediction_interval') || '30');
  });

  const [autoPredictEnabled, setAutoPredictEnabled] = useState<boolean>(() => {
    return localStorage.getItem('ignite_shield_autopredict_enabled') !== 'false';
  });

  const [isCustomInterval, setIsCustomInterval] = useState<boolean>(() => {
    const val = Number(localStorage.getItem('ignite_shield_prediction_interval') || '30');
    return !PREDICTION_PRESETS.some((p) => p.value === val);
  });

  const [customIntervalInput, setCustomIntervalInput] = useState<string>(() => {
    const val = Number(localStorage.getItem('ignite_shield_prediction_interval') || '30');
    return String(val);
  });

  const [saved, setSaved] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.username === 'admin' || true; // Admin accessible

  const handleSelectPreset = (val: number) => {
    setIsCustomInterval(false);
    setPredictionInterval(val);
    setCustomIntervalInput(String(val));
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setCustomIntervalInput(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 5) {
      setPredictionInterval(num);
    }
  };

  const handleSave = () => {
    const finalInterval = isCustomInterval
      ? Math.max(5, Math.min(3600, parseInt(customIntervalInput, 10) || 30))
      : predictionInterval;

    localStorage.setItem('ignite_shield_refresh_interval', String(refreshInterval));
    localStorage.setItem('ignite_shield_prediction_interval', String(finalInterval));
    localStorage.setItem('ignite_shield_autopredict_enabled', String(autoPredictEnabled));

    setPredictionInterval(finalInterval);

    // Broadcast change so Dashboard updates immediately
    window.dispatchEvent(
      new CustomEvent('ignite_shield_settings_updated', {
        detail: {
          refreshInterval,
          predictionInterval: finalInterval,
          autoPredictEnabled,
        },
      })
    );

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Settings size={28} /> Settings</h1>
          <p className="page-subtitle">System configuration and preferences</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* User Profile */}
        <div className="settings-section glass-card">
          <h3><User size={20} /> User Profile</h3>
          <div className="settings-fields">
            <div className="settings-field">
              <label>Username</label>
              <span className="settings-value">{user?.username || '—'}</span>
            </div>
            <div className="settings-field">
              <label>Email</label>
              <span className="settings-value">{user?.email || '—'}</span>
            </div>
            <div className="settings-field">
              <label>Full Name</label>
              <span className="settings-value">{user?.full_name || '—'}</span>
            </div>
            <div className="settings-field">
              <label>Role</label>
              <span className="settings-value">{user?.role || 'officer'}</span>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="settings-section glass-card">
          <h3><Bell size={20} /> Notification & Alarm</h3>
          <div className="settings-fields">
            <div className="settings-field toggle-field">
              <label>Emergency Alarm Sound</label>
              <button
                className={`toggle-btn ${!isAlarmMuted ? 'active' : ''}`}
                onClick={() => isAlarmMuted ? unmuteAlarm() : muteAlarm()}
              >
                {isAlarmMuted ? 'Muted' : 'Enabled'}
              </button>
            </div>
            <p className="settings-hint">
              When enabled, an alarm sound plays when HIGH fire risk is detected.
            </p>
          </div>
        </div>

        {/* AI Prediction Schedule (Admin Configuration) */}
        <div className="settings-section glass-card prediction-settings-card">
          <div className="settings-section-header">
            <h3><Clock size={20} className="text-accent" /> AI Prediction Schedule</h3>
            <span className="admin-badge">
              <ShieldCheck size={14} /> {isAdmin ? 'Admin Mode' : 'Admin Access'}
            </span>
          </div>

          <p className="settings-hint mb-3">
            Configure how often the AI Machine Learning model automatically evaluates real-time telemetry (temperature, humidity, soil moisture, wind speed, precipitation) and predicts forest fire risk. The live countdown appears inside the Fire Risk card on the Dashboard.
          </p>

          <div className="settings-fields">
            {/* Auto Prediction Toggle */}
            <div className="settings-field toggle-field">
              <div>
                <label className="font-semibold">Automated Prediction Loop</label>
                <div className="text-xs text-muted">When active, predictions run continuously at the set interval.</div>
              </div>
              <button
                type="button"
                className={`toggle-btn ${autoPredictEnabled ? 'active' : ''}`}
                onClick={() => setAutoPredictEnabled(!autoPredictEnabled)}
              >
                {autoPredictEnabled ? 'Active' : 'Paused'}
              </button>
            </div>

            {/* Interval Preset Chips */}
            <div className="settings-field">
              <label>Prediction Interval / Frequency</label>
              <div className="prediction-preset-grid">
                {PREDICTION_PRESETS.map((preset) => {
                  const isSelected = !isCustomInterval && predictionInterval === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      className={`prediction-preset-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelectPreset(preset.value)}
                    >
                      <span className="preset-label">{preset.label}</span>
                      <span className="preset-desc">{preset.desc}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`prediction-preset-btn ${isCustomInterval ? 'active' : ''}`}
                  onClick={() => setIsCustomInterval(true)}
                >
                  <span className="preset-label">Custom</span>
                  <span className="preset-desc">User Defined</span>
                </button>
              </div>
            </div>

            {/* Custom Interval Input (shown when custom is selected) */}
            {isCustomInterval && (
              <div className="settings-field custom-interval-field">
                <label>Custom Interval (Seconds, min 5s, max 3600s)</label>
                <div className="custom-input-wrap">
                  <input
                    type="number"
                    min="5"
                    max="3600"
                    value={customIntervalInput}
                    onChange={handleCustomChange}
                    className="settings-input"
                    placeholder="Enter seconds (e.g. 45)"
                  />
                  <span className="input-suffix">seconds</span>
                </div>
              </div>
            )}

            {/* Active Schedule Summary Box */}
            <div className="prediction-schedule-summary">
              <Zap size={16} className="text-orange-400" />
              <span>
                <strong>Active Cycle:</strong> AI predictions will execute every{' '}
                <strong>
                  {isCustomInterval
                    ? `${customIntervalInput || 30} seconds`
                    : predictionInterval >= 60
                    ? `${predictionInterval / 60} minute${predictionInterval > 60 ? 's' : ''} (${predictionInterval}s)`
                    : `${predictionInterval} seconds`}
                </strong>
                .{' '}
                {autoPredictEnabled
                  ? 'Dashboard countdown will sync and count down in real time.'
                  : 'Automatic loop is currently PAUSED (manual trigger only).'}
              </span>
            </div>
          </div>
        </div>

        {/* Refresh Settings */}
        <div className="settings-section glass-card">
          <h3><RefreshCw size={20} /> Data Refresh</h3>
          <div className="settings-fields">
            <div className="settings-field">
              <label>Refresh Interval (seconds)</label>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="settings-select"
              >
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </div>
          </div>
        </div>

        {/* Map Settings */}
        <div className="settings-section glass-card">
          <h3><Map size={20} /> Map Settings</h3>
          <div className="settings-fields">
            <p className="settings-hint">
              Map layer can be switched between Dark, Satellite, and Terrain using the layer control on the map itself.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="settings-section glass-card">
          <h3><Sliders size={20} /> Actions</h3>
          <div className="settings-actions">
            <button className="btn btn-primary" onClick={handleSave}>
              <Save size={16} /> Save Settings
              {saved && <span className="save-success">✓ Saved</span>}
            </button>
            <button className="btn btn-danger" onClick={handleLogout}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
