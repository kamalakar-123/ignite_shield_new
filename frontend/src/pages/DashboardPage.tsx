import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  Flame,
  MapPin,
  Activity,
  Clock,
  Thermometer,
  Bell,
  Volume2,
  VolumeX,
  Droplets,
  Wind,
  Compass,
  Leaf,
  CloudRain,
  Zap,
  AlertTriangle,
  CloudOff,
  Radio,
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { usePolling } from '../hooks/usePolling';
import { useAlarm } from '../context/AlarmContext';
import { useTheme } from '../context/ThemeContext';
import { dashboardApi, predictionApi, alertsApi, sensorApi } from '../services/api';
import { LoadingState, ErrorState } from '../components/common/States';
import { formatRelativeTime, getRiskColor } from '../utils/formatters';
import { getWindDirectionLabel } from '../utils/fireSpreadEngine';
import FireMap from '../components/map/FireMap';
import ZonePanel from '../components/map/ZonePanel';
import LiveDateTimeBadge from '../components/common/LiveDateTimeBadge';
import { useGeolocation } from '../hooks/useGeolocation';
import type { DashboardStats, ReadingResponse, AlertResponse, RiskMapPoint } from '../types';

type EnvFilter = 'all' | 'temperature' | 'humidity' | 'soil_moisture' | 'wind_speed' | 'precipitation';

const envFilterOptions: {
  key: EnvFilter;
  label: string;
  color: string;
  unit: string;
  domain: [number, number];
  ticks: number[];
}[] = [
  { key: 'all', label: 'All', color: '#22c55e', unit: '', domain: [0, 100], ticks: [0, 25, 50, 75, 100] },
  { key: 'temperature', label: 'Temperature', color: '#ef4444', unit: '°C', domain: [0, 50], ticks: [0, 10, 20, 30, 40, 50] },
  { key: 'humidity', label: 'Humidity', color: '#3b82f6', unit: '%', domain: [0, 100], ticks: [0, 25, 50, 75, 100] },
  { key: 'soil_moisture', label: 'Soil Moisture', color: '#22c55e', unit: '%', domain: [0, 100], ticks: [0, 25, 50, 75, 100] },
  { key: 'wind_speed', label: 'Wind Speed', color: '#eab308', unit: 'm/s', domain: [0, 25], ticks: [0, 5, 10, 15, 20, 25] },
  { key: 'precipitation', label: 'Precipitation', color: '#06b6d4', unit: 'mm', domain: [0, 20], ticks: [0, 5, 10, 15, 20] },
];

export interface ManualOverrides {
  temperature?: number;
  humidity?: number;
  soil_moisture?: number;
  wind_speed?: number;
  wind_direction?: number;
  precipitation?: number;
}

export default function DashboardPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Device Real-time GPS Geolocation
  const geo = useGeolocation();
  const geoRef = useRef(geo);

  useEffect(() => {
    geoRef.current = geo;
  }, [geo]);

  const [selectedEnvFilter, setSelectedEnvFilter] = useState<EnvFilter>('all');
  const activeFilterOpt =
    envFilterOptions.find((o) => o.key === selectedEnvFilter) || envFilterOptions[0];

  const fetchStats = useCallback(() => dashboardApi.getStats(), []);
  const fetchLatest = useCallback(() => predictionApi.getLatest(), []);
  const fetchAlerts = useCallback(() => alertsApi.getAll(undefined, 5), []);
  const fetchRecent = useCallback(() => sensorApi.getAll(20), []);

  const { data: stats, loading: statsLoading, refresh: refreshStats } = usePolling<DashboardStats>(fetchStats, 15000);
  const { data: latest, loading: latestLoading, error: latestError, refresh: refreshLatest } =
    usePolling<ReadingResponse>(fetchLatest, 10000);
  const { data: alerts } = usePolling<AlertResponse[]>(fetchAlerts, 15000);
  const { data: recentHistory, refresh: refreshRecent } = usePolling<ReadingResponse[]>(fetchRecent, 10000);

  const latestRef = useRef(latest);
  useEffect(() => {
    latestRef.current = latest;
  }, [latest]);

  const { isAlarmActive, isAlarmMuted, triggerAlarm, acknowledgeAlarm, unmuteAlarm, turnOffAlarm } = useAlarm();

  // ============================================================
  // REAL-TIME SENSOR & WEATHER TELEMETRY (Single Source of Truth: PostgreSQL)
  // ============================================================
  const [liveSensor, setLiveSensor] = useState<{
    temperature: number;
    humidity: number;
    soil_moisture: number;
    timestamp: Date | null;
  } | null>(null);

  const [liveWeather, setLiveWeather] = useState<{
    wind_speed: number;
    wind_direction: number;
    precipitation: number;
    timestamp: Date | null;
  } | null>(null);

  const liveSensorRef = useRef(liveSensor);
  useEffect(() => {
    liveSensorRef.current = liveSensor;
  }, [liveSensor]);

  // ============================================================
  // TEMPORARY MANUAL DEMONSTRATION MODE (NEVER persisted across page refresh)
  // ============================================================
  const [manualOverrides, setManualOverrides] = useState<ManualOverrides | null>(null);
  const manualOverridesRef = useRef(manualOverrides);
  useEffect(() => {
    manualOverridesRef.current = manualOverrides;
  }, [manualOverrides]);

  const [predictedRisk, setPredictedRisk] = useState<string | null>(null);
  const [predictionConfidence, setPredictionConfidence] = useState<number | null>(null);
  const mountedRef = useRef(true);

  // ============================================================
  // OPEN-METEO LIVE WEATHER STATE & POLLING (Every 30 seconds)
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState<Date | null>(null);

  // ============================================================
  // PREDICTION INTERVAL & REAL-TIME COUNTDOWN SYSTEM
  // Managed by Admin in Settings (persisted in localStorage)
  // ============================================================
  const [predictionInterval, setPredictionInterval] = useState<number>(() => {
    return Math.max(5, Number(localStorage.getItem('ignite_shield_prediction_interval') || '30'));
  });

  const [autoPredictEnabled, setAutoPredictEnabled] = useState<boolean>(() => {
    return localStorage.getItem('ignite_shield_autopredict_enabled') !== 'false';
  });

  const [countdown, setCountdown] = useState<number>(() => {
    return Math.max(5, Number(localStorage.getItem('ignite_shield_prediction_interval') || '30'));
  });

  const [isPredicting, setIsPredicting] = useState<boolean>(false);

  // Sync settings when updated in Settings page or another tab
  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const ce = e as CustomEvent<{
        predictionInterval?: number;
        autoPredictEnabled?: boolean;
      }>;
      const newInterval = Math.max(
        5,
        ce.detail?.predictionInterval ??
          Number(localStorage.getItem('ignite_shield_prediction_interval') || '30')
      );
      const newAuto =
        ce.detail?.autoPredictEnabled ??
        (localStorage.getItem('ignite_shield_autopredict_enabled') !== 'false');

      setPredictionInterval(newInterval);
      setAutoPredictEnabled(newAuto);
      setCountdown(newInterval);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ignite_shield_prediction_interval' && e.newValue) {
        const val = Math.max(5, Number(e.newValue));
        setPredictionInterval(val);
        setCountdown(val);
      }
      if (e.key === 'ignite_shield_autopredict_enabled' && e.newValue) {
        setAutoPredictEnabled(e.newValue !== 'false');
      }
    };

    window.addEventListener('ignite_shield_settings_updated', handleSettingsUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('ignite_shield_settings_updated', handleSettingsUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const [sensorError, setSensorError] = useState<string | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);

  const autoPredictEnabledRef = useRef(autoPredictEnabled);
  useEffect(() => {
    autoPredictEnabledRef.current = autoPredictEnabled;
  }, [autoPredictEnabled]);

  const predictionIntervalRef = useRef(predictionInterval);
  useEffect(() => {
    predictionIntervalRef.current = predictionInterval;
  }, [predictionInterval]);

  // ============================================================
  // UNIFIED 30-SECOND PREDICTION FLOW:
  // ESP32 Sensors -> FastAPI Backend -> Open-Meteo Weather -> ML Random Forest -> PostgreSQL -> React Dashboard
  // ============================================================
  const runPredictionCycle = useCallback(async (_isManual: boolean = false) => {
    if (!mountedRef.current) return;

    const lat = geoRef.current.latitude;
    const lon = geoRef.current.longitude;

    if (lat == null || lon == null) {
      if (geoRef.current.error) {
        setWeatherError('Location permission required for live weather data.');
      }
      return;
    }

    setIsPredicting(true);
    setPredictionError(null);

    try {
      // Call FastAPI POST /api/prediction
      // Predicts fire risk strictly using the exact values currently displayed on the dashboard
      const res = await predictionApi.predictFlow({
        latitude: lat,
        longitude: lon,
        temperature: liveSensorRef.current?.temperature,
        humidity: liveSensorRef.current?.humidity,
        soil_moisture: liveSensorRef.current?.soil_moisture,
      });

      if (!mountedRef.current) return;

      setLiveSensor({
        temperature: res.sensor_data.temperature,
        humidity: res.sensor_data.humidity,
        soil_moisture: res.sensor_data.soil_moisture,
        timestamp: new Date(res.timestamp),
      });

      setLiveWeather({
        wind_speed: res.weather_data.wind_speed,
        wind_direction: res.weather_data.wind_direction,
        precipitation: res.weather_data.precipitation,
        timestamp: new Date(res.timestamp),
      });

      if (!manualOverridesRef.current) {
        setPredictedRisk(res.prediction.fire_risk);
        setPredictionConfidence(res.prediction.confidence);
      }
      setLastWeatherUpdate(new Date(res.timestamp));
      setWeatherError(null);
      setSensorError(null);

      // Refresh DB history, latest reading, and dashboard stats
      refreshRecent();
      refreshLatest();
      refreshStats();
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.warn('Prediction flow error:', err);
      const detail = err?.response?.data?.detail || err?.message || '';
      if (detail.includes('Sensor data unavailable')) {
        setSensorError('Sensor data unavailable');
      } else if (detail.includes('Weather data temporarily unavailable')) {
        setWeatherError('Weather data temporarily unavailable');
      } else {
        setPredictionError(detail || 'Prediction failed');
      }
    } finally {
      if (mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current) setIsPredicting(false);
        }, 300);
      }
    }
  }, [refreshRecent, refreshLatest, refreshStats]);

  // When GPS lock is acquired or coordinates change, trigger automated prediction
  const lastGeoPosRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (geo.latitude != null && geo.longitude != null) {
      const prev = lastGeoPosRef.current;
      if (!prev || Math.abs(prev.lat - geo.latitude) > 0.001 || Math.abs(prev.lon - geo.longitude) > 0.001) {
        lastGeoPosRef.current = { lat: geo.latitude, lon: geo.longitude };
        runPredictionCycle(false);
      }
    }
  }, [geo.latitude, geo.longitude, runPredictionCycle]);

  // Centralized 30-Second Polling Timer (Avoid duplicate calls across components)
  useEffect(() => {
    mountedRef.current = true;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (autoPredictEnabledRef.current) {
            runPredictionCycle(false);
          }
          return predictionIntervalRef.current;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [runPredictionCycle]);

  // Centralized Live ESP32 Telemetry Polling (Every 5 seconds)
  // Polls PostgreSQL via GET /api/readings/latest - Single Source of Truth
  useEffect(() => {
    let active = true;
    const fetchLatestESP32FromDB = async () => {
      try {
        const latestReading = await sensorApi.getLatestReading();
        if (active && latestReading && typeof latestReading.temperature === 'number') {
          const prevTime = liveSensorRef.current?.timestamp?.getTime() || 0;
          const newTime = latestReading.timestamp ? new Date(latestReading.timestamp).getTime() : 0;
          const isNewReading = newTime > prevTime;

          setLiveSensor({
            temperature: latestReading.temperature,
            humidity: latestReading.humidity,
            soil_moisture: latestReading.soil_moisture,
            timestamp: latestReading.timestamp ? new Date(latestReading.timestamp) : new Date(),
          });
          setSensorError(null);

          // Immediately re-run prediction when fresh ESP32 sensor values arrive (only if not in demo mode)
          if (isNewReading && prevTime > 0 && !manualOverridesRef.current) {
            runPredictionCycle(false);
          }
        }
      } catch (err) {
        if (active && !liveSensorRef.current && !latestRef.current) {
          setSensorError('Sensor data unavailable');
        }
      }
    };

    fetchLatestESP32FromDB();
    const interval = setInterval(fetchLatestESP32FromDB, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runPredictionCycle]);

  // Detect Stale ESP32 Data (> 90 seconds old since last transmission)
  const isSensorStale = useMemo(() => {
    if (!liveSensor || !liveSensor.timestamp) return true;
    const diffSecs = (Date.now() - liveSensor.timestamp.getTime()) / 1000;
    return diffSecs > 90;
  }, [liveSensor]);

  // Live Relative Timestamp Text ("Just now", "25s ago", etc.)
  const [sensorAgeText, setSensorAgeText] = useState<string>('Awaiting ESP32 stream...');
  useEffect(() => {
    const updateSensorAge = () => {
      if (!liveSensor || !liveSensor.timestamp) {
        setSensorAgeText('Awaiting ESP32 stream...');
        return;
      }
      const secs = Math.floor((Date.now() - liveSensor.timestamp.getTime()) / 1000);
      if (secs < 5) {
        setSensorAgeText('Just now');
      } else if (secs < 60) {
        setSensorAgeText(`${secs}s ago`);
      } else {
        const mins = Math.floor(secs / 60);
        setSensorAgeText(`${mins}m ${secs % 60}s ago`);
      }
    };

    updateSensorAge();
    const timer = setInterval(updateSensorAge, 1000);
    return () => clearInterval(timer);
  }, [liveSensor]);

  // ============================================================
  // TEMPORARY MANUAL DEMONSTRATION & ML PREDICTION HANDLERS
  // ============================================================
  const triggerDemoPrediction = useCallback(
    async (overrides: ManualOverrides) => {
      try {
        setIsPredicting(true);
        const temp = overrides.temperature ?? liveSensorRef.current?.temperature ?? latest?.temperature ?? 28.4;
        const hum = overrides.humidity ?? liveSensorRef.current?.humidity ?? latest?.humidity ?? 76;
        const soil = overrides.soil_moisture ?? liveSensorRef.current?.soil_moisture ?? latest?.soil_moisture ?? 50;
        const wind = overrides.wind_speed ?? liveWeather?.wind_speed ?? latest?.wind_speed ?? 0.8;
        const windDir = overrides.wind_direction ?? liveWeather?.wind_direction ?? latest?.wind_direction ?? 0;
        const precip = overrides.precipitation ?? liveWeather?.precipitation ?? latest?.precipitation ?? 0;

        // Call backend ML Random Forest model with saveToDb = false
        const predRes = await predictionApi.predict(
          {
            temperature: temp,
            humidity: hum,
            soil_moisture: soil,
            wind_speed: wind,
            wind_direction: windDir,
            precipitation: precip,
          },
          false
        );

        if (!mountedRef.current) return;
        setPredictedRisk(predRes.fire_risk);
        setPredictionConfidence(predRes.confidence);
        setPredictionError(null);
      } catch (err: any) {
        console.warn('Demo ML prediction error:', err);
      } finally {
        if (mountedRef.current) setIsPredicting(false);
      }
    },
    [latest, liveWeather]
  );

  const handleAdjustParameter = useCallback(
    (param: keyof ManualOverrides, delta: number) => {
      const baseTemp = manualOverridesRef.current?.temperature ?? liveSensorRef.current?.temperature ?? latest?.temperature ?? 28.4;
      const baseHum = manualOverridesRef.current?.humidity ?? liveSensorRef.current?.humidity ?? latest?.humidity ?? 76;
      const baseSoil = manualOverridesRef.current?.soil_moisture ?? liveSensorRef.current?.soil_moisture ?? latest?.soil_moisture ?? 50;
      const baseWind = manualOverridesRef.current?.wind_speed ?? liveWeather?.wind_speed ?? latest?.wind_speed ?? 0.8;
      const baseWindDir = manualOverridesRef.current?.wind_direction ?? liveWeather?.wind_direction ?? latest?.wind_direction ?? 0;
      const basePrecip = manualOverridesRef.current?.precipitation ?? liveWeather?.precipitation ?? latest?.precipitation ?? 0;

      let nextVal = 0;
      if (param === 'temperature') {
        nextVal = Math.round((baseTemp + delta) * 10) / 10;
      } else if (param === 'humidity') {
        nextVal = Math.max(0, Math.min(100, Math.round(baseHum + delta)));
      } else if (param === 'soil_moisture') {
        nextVal = Math.max(0, Math.min(100, Math.round(baseSoil + delta)));
      } else if (param === 'wind_speed') {
        nextVal = Math.max(0, Math.round((baseWind + delta) * 10) / 10);
      } else if (param === 'wind_direction') {
        nextVal = ((Math.round(baseWindDir + delta) % 360) + 360) % 360;
      } else if (param === 'precipitation') {
        nextVal = Math.max(0, Math.round(basePrecip + delta));
      }

      const nextOverrides: ManualOverrides = {
        temperature: baseTemp,
        humidity: baseHum,
        soil_moisture: baseSoil,
        wind_speed: baseWind,
        wind_direction: baseWindDir,
        precipitation: basePrecip,
        ...(manualOverridesRef.current || {}),
        [param]: nextVal,
      };

      setManualOverrides(nextOverrides);
      triggerDemoPrediction(nextOverrides);
    },
    [latest, liveWeather, triggerDemoPrediction]
  );

  const handleResetToLive = useCallback(async () => {
    setManualOverrides(null);
    setPredictionError(null);

    // Immediately fetch latest live ESP32 reading
    try {
      const latestReading = await sensorApi.getLatestReading();
      if (latestReading && typeof latestReading.temperature === 'number') {
        setLiveSensor({
          temperature: latestReading.temperature,
          humidity: latestReading.humidity,
          soil_moisture: latestReading.soil_moisture,
          timestamp: latestReading.timestamp ? new Date(latestReading.timestamp) : new Date(),
        });
        setSensorError(null);
      }
    } catch (err) {
      console.warn('Error fetching latest reading on reset:', err);
    }

    runPredictionCycle(false);
  }, [runPredictionCycle]);

  // Manual Trigger Handler
  const handleManualPredict = useCallback(() => {
    if (manualOverridesRef.current) {
      triggerDemoPrediction(manualOverridesRef.current);
    } else {
      runPredictionCycle(true);
    }
    setCountdown(predictionInterval);
  }, [runPredictionCycle, triggerDemoPrediction, predictionInterval]);

  const effectiveRisk = predictedRisk || latest?.fire_risk || 'Low';
  const effectiveConfidence =
    predictionConfidence != null
      ? predictionConfidence
      : latest?.confidence != null && !predictedRisk
      ? (latest.probability ?? latest.confidence)
      : null;

  const isHighRisk = effectiveRisk.toUpperCase() === 'HIGH';
  const isEmergencyActive = isHighRisk && !isAlarmMuted;

  // Trigger continuous alarm when fire risk is High
  useEffect(() => {
    if (isHighRisk) {
      if (!isAlarmMuted) {
        triggerAlarm();
      }
    } else {
      acknowledgeAlarm();
    }
  }, [isHighRisk, isAlarmMuted, triggerAlarm, acknowledgeAlarm]);

  const handleToggleMute = () => {
    if (isAlarmMuted) {
      unmuteAlarm();
    } else {
      turnOffAlarm();
    }
  };

  const handleTurnOffAlarm = () => {
    turnOffAlarm();
  };

  const realTemp = liveSensor?.temperature ?? latest?.temperature ?? null;
  const realHum = liveSensor?.humidity ?? latest?.humidity ?? null;
  const realSoil = liveSensor?.soil_moisture ?? latest?.soil_moisture ?? null;
  const realWind = liveWeather?.wind_speed ?? latest?.wind_speed ?? null;
  const realWindDir = liveWeather?.wind_direction ?? latest?.wind_direction ?? null;
  const realPrecip = liveWeather?.precipitation ?? latest?.precipitation ?? null;

  const currentTemp = manualOverrides?.temperature ?? realTemp;
  const currentHum = manualOverrides?.humidity ?? realHum;
  const currentSoil = manualOverrides?.soil_moisture ?? realSoil;
  const currentWind = manualOverrides?.wind_speed ?? realWind;
  const currentWindDir = manualOverrides?.wind_direction ?? realWindDir;
  const currentPrecip = manualOverrides?.precipitation ?? realPrecip;

  const isManualDemoMode = manualOverrides !== null;

  const prev = recentHistory && recentHistory.length > 1 ? recentHistory[1] : null;
  const tempDelta = prev && currentTemp != null ? currentTemp - prev.temperature : null;
  const humDelta = prev && currentHum != null ? currentHum - prev.humidity : null;

  const tempTrend =
    tempDelta != null && Math.abs(tempDelta) >= 0.1
      ? {
          value: `${tempDelta > 0 ? '+' : ''}${tempDelta.toFixed(1)}`,
          direction: (tempDelta >= 0 ? 'up' : 'down') as 'up' | 'down',
        }
      : null;

  const humTrend =
    humDelta != null && Math.abs(humDelta) >= 0.1
      ? {
          value: `${humDelta > 0 ? '+' : ''}${humDelta.toFixed(1)}`,
          direction: (humDelta >= 0 ? 'up' : 'down') as 'up' | 'down',
        }
      : null;

  const envData = (recentHistory || [])
    .slice()
    .reverse()
    .map((r, i) => {
      const d = new Date(r.created_at);
      const timeStr = !isNaN(d.getTime())
        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : `#${i + 1}`;
      return {
        time: timeStr,
        temperature: r.temperature,
        humidity: r.humidity,
        soil_moisture: r.soil_moisture,
        wind_speed: r.wind_speed,
        precipitation: r.precipitation ?? 0,
      };
    });

  const [selectedZone, setSelectedZone] = useState<RiskMapPoint | null>(null);

  if (statsLoading && latestLoading) return <LoadingState message="Loading dashboard..." />;

  // Status assessments for each sensor metric (using live PostgreSQL sensor readings)
  const tempStatus = getTemperatureStatus(currentTemp);
  const humStatus = getHumidityStatus(currentHum);
  const soilStatus = getSoilMoistureStatus(currentSoil);
  const windStatus = getWindSpeedStatus(currentWind);
  const precipStatus = getPrecipitationStatus(currentPrecip);

  return (
    <div className={`dashboard-page ${isEmergencyActive ? 'emergency-blinking-dashboard' : ''}`}>
      {/* Full Viewport Emergency Red Blinking Overlay */}
      {isEmergencyActive && (
        <div className="emergency-blink-overlay" aria-hidden="true" />
      )}

      {/* Emergency Alert Banner (Shown during active High Fire Risk alarm) */}
      {isEmergencyActive && (
        <div className="emergency-alarm-banner">
          <div className="emergency-banner-left">
            <div className="emergency-flame-pulse">
              <Flame size={26} className="text-white" />
            </div>
            <div>
              <div className="emergency-banner-title">
                HIGH RISK ALERT: HIGH FOREST FIRE RISK DETECTED
              </div>
              <div className="emergency-banner-subtitle">
                Extreme fire hazard conditions active. Continuous emergency siren and red visual alerts sounding until turned off.
              </div>
            </div>
          </div>
          <div className="emergency-banner-actions">
            <button
              type="button"
              className="btn-turn-off-alarm"
              onClick={handleTurnOffAlarm}
              title="Turn Off Emergency Alarm Sound and Blinking"
            >
              <VolumeX size={18} />
              <span>Turn Off Alarm</span>
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Flame size={28} className="text-orange-500" /> IGNITE SHIELD Dashboard
          </h1>
          <p className="page-subtitle">AI-Based Forest Fire Monitoring & Early Warning System</p>
        </div>
        <div className="header-actions">
          <LiveDateTimeBadge />
          {lastWeatherUpdate ? (
            <span className="live-weather-badge" title="Live weather data fetched from Open-Meteo API every 30s">
              <span className="live-weather-dot" />
              <span className="live-weather-text">LIVE</span>
              <span className="live-weather-time">
                {lastWeatherUpdate.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </span>
            </span>
          ) : stats?.last_updated ? (
            <span className="last-updated">
              <Clock size={14} />
              Updated {formatRelativeTime(stats.last_updated)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Real-time Location and Prediction Pipeline Status Bar */}
      <div className="location-pipeline-bar" style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '12px 18px',
        marginBottom: '16px',
        background: isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(15, 23, 42, 0.65)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: geo.latitude ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
            color: geo.latitude ? '#22c55e' : '#eab308',
          }}>
            <MapPin size={16} />
          </span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>
              Laptop Location (Browser GPS)
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>
              {geo.latitude != null && geo.longitude != null
                ? `Latitude: ${geo.latitude.toFixed(4)}°, Longitude: ${geo.longitude.toFixed(4)}°`
                : geo.loading
                ? 'Acquiring GPS coordinates...'
                : 'GPS coordinates unavailable'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: isManualDemoMode ? 'rgba(245, 158, 11, 0.15)' : isSensorStale ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            color: isManualDemoMode ? '#f59e0b' : isSensorStale ? '#f59e0b' : '#22c55e',
            fontWeight: 600,
          }}>
            <Radio size={14} /> {isManualDemoMode ? 'ESP32: LIVE (Demo Mode)' : isSensorStale ? `ESP32: OFFLINE / STALE (${sensorAgeText})` : `ESP32: LIVE (${sensorAgeText})`}
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'rgba(6, 182, 212, 0.12)',
            color: '#06b6d4',
            fontWeight: 500,
          }}>
            <Wind size={14} /> Open-Meteo: LIVE
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'rgba(249, 115, 22, 0.12)',
            color: '#f97316',
            fontWeight: 500,
          }}>
            <Flame size={14} /> Random Forest ML
          </span>
        </div>
      </div>

      {/* Error Banners if any service is unavailable */}
      {geo.error && (
        <div className="alert-banner" style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '12px 18px',
          marginBottom: '14px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px',
          color: '#ef4444',
          fontSize: '13px',
          fontWeight: 500,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} />
            <div>
              <span style={{ fontWeight: 600 }}>Location permission required for live weather data.</span>
              <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>
                Click the 🔒 icon in your browser address bar → Set Location to &quot;Allow&quot; → Refresh or click Retry.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => geo.retry()}
              style={{
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry GPS
            </button>
            <button
              type="button"
              onClick={() => {
                const latInput = prompt('Enter Latitude (e.g. 12.2958):', '12.2958');
                const lonInput = prompt('Enter Longitude (e.g. 76.6394):', '76.6394');
                if (latInput && lonInput && !isNaN(Number(latInput)) && !isNaN(Number(lonInput))) {
                  geo.setManualLocation(Number(latInput), Number(lonInput));
                }
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'currentColor',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Enter Coordinates
            </button>
          </div>
        </div>
      )}

      {weatherError && (
        <div className="alert-banner" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 16px',
          marginBottom: '14px',
          background: 'rgba(234, 179, 8, 0.15)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '8px',
          color: '#eab308',
          fontSize: '13px',
          fontWeight: 500,
        }}>
          <CloudOff size={18} />
          <span>Weather data temporarily unavailable</span>
        </div>
      )}

      {sensorError && (
        <div className="alert-banner" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 16px',
          marginBottom: '14px',
          background: 'rgba(234, 179, 8, 0.15)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '8px',
          color: '#eab308',
          fontSize: '13px',
          fontWeight: 500,
        }}>
          <Radio size={18} />
          <span>Sensor data unavailable</span>
        </div>
      )}

      {predictionError && (
        <div className="alert-banner" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 16px',
          marginBottom: '14px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '13px',
          fontWeight: 500,
        }}>
          <AlertTriangle size={18} />
          <span>{predictionError}</span>
        </div>
      )}

      {/* ============================================================
          Live Sensor Telemetry Grid (All readings in a single row)
          ============================================================ */}
      {isManualDemoMode && (
        <div className="demo-simulation-banner" style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 18px',
          marginBottom: '16px',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '12px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.25)',
              color: '#f59e0b',
            }}>
              <Zap size={16} />
            </span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>
                MANUAL DEMO MODE ACTIVE
              </div>
              <div style={{ fontSize: '12px', opacity: 0.85, color: isLight ? '#78350f' : '#fef3c7' }}>
                Temporary simulation values active for demonstration. Real ESP32 hardware & database records remain unchanged.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetToLive}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#f59e0b',
              color: '#1e293b',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
              transition: 'all 0.2s ease',
            }}
            title="Exit manual simulation and return to real live ESP32 sensor values"
          >
            <RotateCcw size={14} />
            <span>Reset to Live Sensor Data</span>
          </button>
        </div>
      )}

      {latestError ? (
        <ErrorState message={latestError} onRetry={refreshLatest} />
      ) : (
        <div className="telemetry-grid">
          {/* Fire Risk Level Card (Left of Temperature) */}
          <FireRiskCard
            risk={effectiveRisk}
            confidence={effectiveConfidence ?? undefined}
            isAlarmActive={isAlarmActive}
            isAlarmMuted={isAlarmMuted}
            isEmergencyActive={isEmergencyActive}
            onToggleMute={handleToggleMute}
            countdown={countdown}
            predictionInterval={predictionInterval}
            isPredicting={isPredicting}
            autoPredictEnabled={autoPredictEnabled}
            onPredictNow={handleManualPredict}
          />

          {/* 1. Temperature (ESP32) */}
          <TelemetryCard
            icon={<Thermometer size={22} />}
            iconColor="#ef4444"
            value={currentTemp != null ? currentTemp.toFixed(1) : '--'}
            unit="°C"
            label="Temperature"
            sourceBadge={isSensorStale ? 'ESP32 (Stale)' : 'ESP32 (Live)'}
            isModified={manualOverrides?.temperature !== undefined}
            realValue={realTemp != null ? realTemp.toFixed(1) : undefined}
            statusText={tempStatus.text}
            statusLevel={tempStatus.level}
            trend={tempTrend}
            onDecrease={() => handleAdjustParameter('temperature', -0.5)}
            onIncrease={() => handleAdjustParameter('temperature', +0.5)}
          />

          {/* 2. Relative Humidity (ESP32) */}
          <TelemetryCard
            icon={<Droplets size={22} />}
            iconColor="#3b82f6"
            value={currentHum != null ? currentHum.toFixed(1) : '--'}
            unit="%"
            label="Relative Humidity"
            sourceBadge={isSensorStale ? 'ESP32 (Stale)' : 'ESP32 (Live)'}
            isModified={manualOverrides?.humidity !== undefined}
            realValue={realHum != null ? realHum.toFixed(1) : undefined}
            statusText={humStatus.text}
            statusLevel={humStatus.level}
            trend={humTrend}
            disableDecrease={currentHum != null && currentHum <= 0}
            disableIncrease={currentHum != null && currentHum >= 100}
            onDecrease={() => handleAdjustParameter('humidity', -1)}
            onIncrease={() => handleAdjustParameter('humidity', +1)}
          />

          {/* 3. Soil Moisture (ESP32) */}
          <TelemetryCard
            icon={<Activity size={22} />}
            iconColor="#22c55e"
            value={currentSoil != null ? currentSoil.toFixed(1) : '--'}
            unit="%"
            label="Soil Moisture"
            sourceBadge={isSensorStale ? 'ESP32 (Stale)' : 'ESP32 (Live)'}
            isModified={manualOverrides?.soil_moisture !== undefined}
            realValue={realSoil != null ? realSoil.toFixed(1) : undefined}
            statusText={soilStatus.text}
            statusLevel={soilStatus.level}
            disableDecrease={currentSoil != null && currentSoil <= 0}
            disableIncrease={currentSoil != null && currentSoil >= 100}
            onDecrease={() => handleAdjustParameter('soil_moisture', -1)}
            onIncrease={() => handleAdjustParameter('soil_moisture', +1)}
          />

          {/* 4. Wind Speed (Open-Meteo) */}
          <TelemetryCard
            icon={<Wind size={22} />}
            iconColor="#f97316"
            value={currentWind != null ? currentWind.toFixed(1) : '--'}
            unit="m/s"
            label="Wind Speed"
            sourceBadge="Open-Meteo"
            isModified={manualOverrides?.wind_speed !== undefined}
            realValue={realWind != null ? realWind.toFixed(1) : undefined}
            statusText={windStatus.text}
            statusLevel={windStatus.level}
            disableDecrease={currentWind != null && currentWind <= 0}
            onDecrease={() => handleAdjustParameter('wind_speed', -0.5)}
            onIncrease={() => handleAdjustParameter('wind_speed', +0.5)}
          />

          {/* 5. Wind Direction (Open-Meteo) */}
          <TelemetryCard
            icon={<Compass size={22} />}
            iconColor="#a855f7"
            value={currentWindDir != null ? `${currentWindDir.toFixed(0)}°` : '--'}
            unit={currentWindDir != null ? getWindDirectionLabel(currentWindDir) : ''}
            label="Wind Direction"
            sourceBadge="Open-Meteo"
            isModified={manualOverrides?.wind_direction !== undefined}
            realValue={realWindDir != null ? `${realWindDir.toFixed(0)}°` : undefined}
            statusText="LOW"
            statusLevel="low"
            onDecrease={() => handleAdjustParameter('wind_direction', -5)}
            onIncrease={() => handleAdjustParameter('wind_direction', +5)}
          />

          {/* 6. Precipitation (Open-Meteo) */}
          <TelemetryCard
            icon={<CloudRain size={22} />}
            iconColor="#06b6d4"
            value={currentPrecip != null ? currentPrecip.toFixed(1) : '--'}
            unit="mm"
            label="Precipitation"
            sourceBadge="Open-Meteo"
            isModified={manualOverrides?.precipitation !== undefined}
            realValue={realPrecip != null ? realPrecip.toFixed(1) : undefined}
            statusText={precipStatus.text}
            statusLevel={precipStatus.level}
            disableDecrease={currentPrecip != null && currentPrecip <= 0}
            onDecrease={() => handleAdjustParameter('precipitation', -1)}
            onIncrease={() => handleAdjustParameter('precipitation', +1)}
          />
        </div>
      )}

      {/* Fire Risk Map — Main Visual Component */}
      <div className="dashboard-map-section">
        <div className="card glass-card dashboard-map-card">
          <h3 className="card-title">
            <MapPin size={20} />
            Fire Risk Map Overview
          </h3>
          <div className="dashboard-map-wrapper">
            <FireMap
              currentSensor={{
                latitude: geo.latitude ?? latest?.latitude ?? 20.5937,
                longitude: geo.longitude ?? latest?.longitude ?? 78.9629,
                wind_speed: currentWind ?? 0,
                wind_direction: currentWindDir ?? 0,
                fire_risk: effectiveRisk,
                temperature: currentTemp ?? 0,
                humidity: currentHum ?? 0,
                soil_moisture: currentSoil ?? 0,
                precipitation: currentPrecip ?? 0,
                isUserLocation: Boolean(geo.latitude != null && geo.longitude != null),
                locationError: geo.error,
              }}
              onZoneSelect={setSelectedZone}
              selectedZoneId={selectedZone?.id}
            />
            {selectedZone && (
              <ZonePanel zone={selectedZone} onClose={() => setSelectedZone(null)} />
            )}
          </div>
        </div>
      </div>

      {/* Assessment & Alerts Grid */}
      {latest && (
        <div className="dashboard-grid">
          {/* Environmental Conditions Multi-Line Chart (Tracks live sensors data) */}
          {/* Environmental Conditions / Sensor Readings Chart with Filters */}
          <div className="card glass-card env-conditions-card">
            <div className="env-header">
              <div className="env-header-title-group">
                <h3 className="card-title">
                  {selectedEnvFilter === 'temperature' ? (
                    <Thermometer size={20} style={{ color: '#ef4444' }} />
                  ) : selectedEnvFilter === 'humidity' ? (
                    <Droplets size={20} style={{ color: '#3b82f6' }} />
                  ) : selectedEnvFilter === 'soil_moisture' ? (
                    <Activity size={20} style={{ color: '#22c55e' }} />
                  ) : selectedEnvFilter === 'wind_speed' ? (
                    <Wind size={20} style={{ color: '#eab308' }} />
                  ) : selectedEnvFilter === 'precipitation' ? (
                    <Droplets size={20} style={{ color: '#06b6d4' }} />
                  ) : (
                    <Leaf size={20} style={{ color: '#22c55e' }} />
                  )}
                  <span>
                    {selectedEnvFilter === 'all'
                      ? 'Environmental Conditions'
                      : 'Sensor Readings (Last 24 Hours)'}
                  </span>
                </h3>

                {selectedEnvFilter === 'all' && (
                  <div className="env-legend">
                    <span className="env-legend-item">
                      <span className="legend-dot" style={{ background: '#ef4444' }} />
                      Temperature (°C)
                    </span>
                    <span className="env-legend-item">
                      <span className="legend-dot" style={{ background: '#3b82f6' }} />
                      Humidity (%)
                    </span>
                    <span className="env-legend-item">
                      <span className="legend-dot" style={{ background: '#22c55e' }} />
                      Soil Moisture (%)
                    </span>
                    <span className="env-legend-item">
                      <span className="legend-dot" style={{ background: '#eab308' }} />
                      Wind Speed (m/s)
                    </span>
                  </div>
                )}
              </div>

              {/* Filter Pills */}
              <div className="env-filters-pills">
                {envFilterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`env-filter-pill ${selectedEnvFilter === opt.key ? 'active' : ''}`}
                    onClick={() => setSelectedEnvFilter(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="env-chart-wrapper">
              {envData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  {selectedEnvFilter === 'all' ? (
                    <AreaChart data={envData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}
                      />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11, fill: isLight ? '#64748b' : '#9ca3af' }}
                        axisLine={{ stroke: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)' }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tick={{ fontSize: 11, fill: isLight ? '#64748b' : '#9ca3af' }}
                        axisLine={{ stroke: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)' }}
                      />
                      <Tooltip content={<CustomEnvTooltip selectedFilter="all" />} />
                      <Area
                        type="monotone"
                        dataKey="temperature"
                        name="Temperature"
                        stroke="#ef4444"
                        strokeWidth={2.5}
                        fill="none"
                        dot={{ r: 3, fill: '#ef4444' }}
                        activeDot={{ r: 5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="humidity"
                        name="Humidity"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        fill="none"
                        dot={{ r: 3, fill: '#3b82f6' }}
                        activeDot={{ r: 5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="soil_moisture"
                        name="Soil Moisture"
                        stroke="#22c55e"
                        strokeWidth={2.5}
                        fill="none"
                        dot={{ r: 3, fill: '#22c55e' }}
                        activeDot={{ r: 5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="wind_speed"
                        name="Wind Speed"
                        stroke="#eab308"
                        strokeWidth={2.5}
                        fill="none"
                        dot={{ r: 3, fill: '#eab308' }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  ) : (
                    <AreaChart data={envData} margin={{ top: 10, right: 20, left: 15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="singleEnvGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={activeFilterOpt.color} stopOpacity={isLight ? 0.3 : 0.4} />
                          <stop offset="95%" stopColor={activeFilterOpt.color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}
                      />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11, fill: isLight ? '#64748b' : '#9ca3af' }}
                        axisLine={{ stroke: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)' }}
                      />
                      <YAxis
                        domain={activeFilterOpt.domain}
                        ticks={activeFilterOpt.ticks}
                        tick={{ fontSize: 11, fill: isLight ? '#64748b' : '#9ca3af' }}
                        axisLine={{ stroke: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)' }}
                        label={{
                          value: `${activeFilterOpt.label} (${activeFilterOpt.unit})`,
                          angle: -90,
                          position: 'insideLeft',
                          offset: 0,
                          style: {
                            textAnchor: 'middle',
                            fontSize: 12,
                            fill: isLight ? '#475569' : '#9ca3af',
                            fontWeight: 600,
                          },
                        }}
                      />
                      <Tooltip content={<CustomEnvTooltip selectedFilter={selectedEnvFilter} />} />
                      <Area
                        type="monotone"
                        dataKey={selectedEnvFilter}
                        name={activeFilterOpt.label}
                        stroke={activeFilterOpt.color}
                        strokeWidth={2.5}
                        fill="url(#singleEnvGrad)"
                        dot={{ r: 3.5, fill: activeFilterOpt.color, stroke: activeFilterOpt.color }}
                        activeDot={{ r: 6, fill: activeFilterOpt.color, stroke: '#ffffff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="env-no-data">Tracking live sensor data...</div>
              )}
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="card glass-card">
            <h3 className="card-title">
              <Bell size={20} />
              Recent Alerts
            </h3>
            {alerts && alerts.length > 0 ? (
              <div className="alerts-list-mini">
                {alerts.map((alert) => (
                  <div key={alert.id} className={`alert-item-mini ${alert.risk_level.toLowerCase()}`}>
                    <div
                      className="alert-dot"
                      style={{
                        background: getRiskColor(
                          alert.risk_level === 'Critical' ? 'High' : alert.risk_level
                        ),
                      }}
                    />
                    <div className="alert-item-content">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span className="alert-message">{alert.message}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                          {(alert.email_status === 'SENT' || alert.email_status === 'sent') && (
                            <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600 }} title={`Email Dispatched to ${alert.email_recipient || 'Alert Recipient'}`}>
                              Email: ✓
                            </span>
                          )}
                          {(alert.email_status === 'FAILED' || alert.email_status === 'failed') && (
                            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }} title={alert.email_error || 'Email Failed'}>
                              Email: ✗
                            </span>
                          )}
                          {(alert.sms_status === 'SENT' || alert.sms_status === 'sent') && (
                            <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600 }} title={`SMS Dispatched to ${alert.sms_recipient || 'Alert Recipient'}`}>
                              SMS: ✓
                            </span>
                          )}
                          {(alert.sms_status === 'FAILED' || alert.sms_status === 'failed') && (
                            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }} title={alert.sms_error || 'SMS Failed'}>
                              SMS: ✗
                            </span>
                          )}
                          {(alert.whatsapp_status === 'SENT' || alert.whatsapp_status === 'sent') && (
                            <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600 }} title={`WhatsApp Dispatched to ${alert.whatsapp_recipient || 'Alert Recipient'}`}>
                              WA: ✓
                            </span>
                          )}
                          {(alert.whatsapp_status === 'FAILED' || alert.whatsapp_status === 'failed') && (
                            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }} title={alert.whatsapp_error || 'WhatsApp Failed'}>
                              WA: ✗
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="alert-time">{formatRelativeTime(alert.created_at)}</span>
                    </div>
                    {alert.is_acknowledged && <span className="alert-ack">✓</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-mini">No alerts recorded yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomEnvTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  selectedFilter?: EnvFilter;
}

function CustomEnvTooltip({ active, payload, label, selectedFilter }: CustomEnvTooltipProps) {
  if (active && payload && payload.length) {
    if (selectedFilter && selectedFilter !== 'all') {
      const entry = payload[0];
      if (!entry) return null;
      const unit =
        entry.dataKey === 'temperature'
          ? '°C'
          : entry.dataKey === 'wind_speed'
          ? 'm/s'
          : '%';
      return (
        <div className="env-single-tooltip">
          <div className="tooltip-time">{label}</div>
          <div className="tooltip-single-value" style={{ color: entry.color }}>
            {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value} {unit}
          </div>
        </div>
      );
    }

    return (
      <div className="env-tooltip">
        <div className="env-tooltip-header">Time: {label}</div>
        <div className="env-tooltip-items">
          {payload.map((entry, index) => {
            const unit =
              entry.dataKey === 'temperature'
                ? '°C'
                : entry.dataKey === 'wind_speed'
                ? 'm/s'
                : '%';
            return (
              <div key={`tooltip-${index}`} className="env-tooltip-row">
                <span className="tooltip-dot" style={{ background: entry.color }} />
                <span className="tooltip-name">{entry.name}:</span>
                <span className="tooltip-val" style={{ color: entry.color }}>
                  {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value} {unit}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds < 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const mm = mins < 10 ? `0${mins}` : `${mins}`;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;
  return `${mm}:${ss}`;
}

// Helper component for telemetry cards
interface FireRiskCardProps {
  risk: string | null | undefined;
  confidence?: number;
  isAlarmActive?: boolean;
  isAlarmMuted: boolean;
  isEmergencyActive?: boolean;
  onToggleMute: () => void;
  countdown: number;
  predictionInterval: number;
  isPredicting: boolean;
  autoPredictEnabled: boolean;
  onPredictNow: () => void;
}

function FireRiskCard({
  risk = 'Low',
  confidence,
  isAlarmActive: _isAlarmActive,
  isAlarmMuted,
  isEmergencyActive = false,
  onToggleMute,
  countdown,
  predictionInterval,
  isPredicting,
  autoPredictEnabled,
  onPredictNow,
}: FireRiskCardProps) {
  const normalizedRisk = risk ? (risk.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW') : 'LOW';
  const isHigh = normalizedRisk === 'HIGH';
  const isMedium = normalizedRisk === 'MEDIUM';

  const riskClass = isHigh ? 'risk-high' : isMedium ? 'risk-medium' : 'risk-low';

  const confidencePercent =
    confidence != null && !isNaN(confidence)
      ? Math.round(confidence <= 1 ? confidence * 100 : confidence)
      : null;

  const progressPercent = Math.min(
    100,
    Math.max(0, (countdown / Math.max(1, predictionInterval)) * 100)
  );

  return (
    <div className={`fire-risk-card ${riskClass} ${isEmergencyActive ? 'card-emergency-active' : ''}`}>
      <div className="fire-risk-card-content">
        <div className="fire-risk-header">
          <div className="fire-risk-icon-wrap">
            <Flame className={`fire-risk-flame ${isHigh ? 'pulse-flame' : ''}`} size={30} />
          </div>
          <div className="fire-risk-title-wrap">
            <span className="fire-risk-title">
              FIRE RISK LEVEL {confidencePercent != null ? `(${confidencePercent}%)` : ''}
            </span>
            <span className={`fire-risk-value ${riskClass}`}>
              {normalizedRisk}
            </span>
          </div>
        </div>

        {/* Real-time AI Prediction Countdown (Admin Configurable in Settings) */}
        <div className="fire-risk-countdown-block">
          <div className="countdown-meta-row">
            <span className="countdown-label">
              <Clock size={11} className="countdown-clock-icon" />
              <span>Next Prediction</span>
            </span>
            <span
              className="countdown-cycle-badge"
              title={`Prediction cycle: every ${predictionInterval}s (configured in Settings)`}
            >
              {autoPredictEnabled
                ? predictionInterval >= 60
                  ? `${predictionInterval / 60}m`
                  : `${predictionInterval}s`
                : 'Paused'}
            </span>
          </div>

          <div className="countdown-timer-row">
            {isPredicting ? (
              <div className="countdown-evaluating-wrap">
                <span className="countdown-live-dot predicting" />
                <span className="countdown-evaluating-text">Predicting...</span>
              </div>
            ) : (
              <div className="countdown-digits-wrap">
                <span className={`countdown-live-dot ${autoPredictEnabled ? 'live' : 'paused'}`} />
                <span className="countdown-digits">{formatCountdown(countdown)}</span>
              </div>
            )}

            <button
              type="button"
              className="countdown-action-btn"
              onClick={onPredictNow}
              disabled={isPredicting}
              title="Predict Now (Force ML Re-evaluation)"
            >
              <Zap size={11} />
              <span>{isPredicting ? '...' : 'Run'}</span>
            </button>
          </div>

          {/* Micro Progress Bar */}
          <div className="countdown-progress-track">
            <div
              className={`countdown-progress-bar ${isPredicting ? 'predicting' : ''}`}
              style={{ width: isPredicting ? '100%' : `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="fire-risk-footer">
          <div className="fire-risk-buzzer-status">
            {isAlarmMuted ? (
              <>
                <VolumeX size={17} className="buzzer-icon muted" />
                <span className="buzzer-text muted">Buzzer Silenced</span>
              </>
            ) : isEmergencyActive ? (
              <>
                <Volume2 size={17} className="buzzer-icon active siren-vibrate" />
                <span className="buzzer-text active" style={{ color: '#ef4444', fontWeight: 700 }}>
                  ALARM SOUNDING
                </span>
              </>
            ) : (
              <>
                <Volume2 size={17} className={`buzzer-icon ${isHigh ? 'active' : ''}`} />
                <span className={`buzzer-text ${isHigh ? 'active' : ''}`}>
                  {isHigh ? 'Buzzer Active' : 'Buzzer Standby'}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            className={`fire-risk-mute-btn ${isAlarmMuted ? 'muted' : isEmergencyActive ? 'alarm-emergency-btn' : ''}`}
            onClick={onToggleMute}
            title={isAlarmMuted ? 'Unmute Buzzer' : isEmergencyActive ? 'Turn Off Alarm' : 'Mute Buzzer'}
          >
            {isAlarmMuted ? (
              <>
                <Volume2 size={15} /> Unmute
              </>
            ) : isEmergencyActive ? (
              <>
                <VolumeX size={15} /> Turn Off Alarm
              </>
            ) : (
              'Mute Buzzer'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TelemetryCardProps {
  icon: React.ReactNode;
  iconColor: string;
  value: string | number;
  unit?: string;
  label: string;
  statusText?: string;
  statusLevel?: 'high' | 'medium' | 'low' | 'normal';
  sourceBadge?: string;
  isModified?: boolean;
  realValue?: string | number;
  trend?: {
    value: string;
    direction: 'up' | 'down';
  } | null;
  onDecrease?: () => void;
  onIncrease?: () => void;
  disableDecrease?: boolean;
  disableIncrease?: boolean;
}

function TelemetryCard({
  icon,
  iconColor,
  value,
  unit,
  label,
  statusLevel = 'normal',
  sourceBadge,
  isModified = false,
  realValue,
  trend,
  onDecrease,
  onIncrease,
  disableDecrease = false,
  disableIncrease = false,
}: TelemetryCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Close stepper controls when clicking elsewhere
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  const hasControls = Boolean(onDecrease && onIncrease);
  const isControlsVisible = hasControls && (isHovered || isSelected);

  const dotColor =
    statusLevel === 'high'
      ? '#ef4444'
      : statusLevel === 'medium'
      ? '#f59e0b'
      : '#22c55e';

  return (
    <div
      ref={cardRef}
      className={`telemetry-card glass-card group ${isModified ? 'telemetry-card-demo' : ''} ${isSelected ? 'is-selected' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (hasControls) setIsSelected((prev) => !prev);
      }}
      style={{
        cursor: hasControls ? 'pointer' : undefined,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        position: 'relative',
        borderColor: isModified ? 'rgba(245, 158, 11, 0.45)' : undefined,
        boxShadow: isModified ? '0 0 16px rgba(245, 158, 11, 0.15)' : undefined,
      }}
    >
      <div className="telemetry-card-top">
        <div className="telemetry-icon-box" style={{ color: iconColor }}>
          {icon}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isModified ? (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '4px',
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                letterSpacing: '0.02em',
              }}
              title={realValue != null ? `Simulated value (Live ESP32: ${realValue})` : 'Simulated demonstration value'}
            >
              DEMO
            </span>
          ) : (
            sourceBadge && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: sourceBadge.includes('ESP32')
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'rgba(6, 182, 212, 0.15)',
                  color: sourceBadge.includes('ESP32') ? '#3b82f6' : '#06b6d4',
                  letterSpacing: '0.02em',
                }}
              >
                {sourceBadge}
              </span>
            )
          )}
          <span
            className="telemetry-status-dot"
            style={{
              background: dotColor,
              boxShadow: `0 0 8px ${dotColor}`,
            }}
          />
        </div>
      </div>

      <div className="telemetry-card-body">
        <div className="telemetry-value-row">
          {hasControls && (
            <button
              type="button"
              className={`telemetry-stepper-btn transition-all duration-300 ease-out transform ${
                isControlsVisible
                  ? 'opacity-100 scale-100 pointer-events-auto'
                  : 'opacity-0 scale-75 pointer-events-none'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onDecrease?.();
              }}
              disabled={disableDecrease}
              title={`Decrease ${label}`}
              aria-label={`Decrease ${label}`}
            >
              <Minus size={13} strokeWidth={2.5} />
            </button>
          )}

          <div className="telemetry-value-wrap">
            <span className="telemetry-value">{value}</span>
            {unit && <span className="telemetry-unit">{unit}</span>}
          </div>

          {hasControls && (
            <button
              type="button"
              className={`telemetry-stepper-btn transition-all duration-300 ease-out transform ${
                isControlsVisible
                  ? 'opacity-100 scale-100 pointer-events-auto'
                  : 'opacity-0 scale-75 pointer-events-none'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onIncrease?.();
              }}
              disabled={disableIncrease}
              title={`Increase ${label}`}
              aria-label={`Increase ${label}`}
            >
              <Plus size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="telemetry-label">{label}</div>

        {isModified && realValue != null && (
          <div
            style={{
              fontSize: '10px',
              color: '#f59e0b',
              marginTop: '2px',
              fontWeight: 500,
            }}
          >
            Live: {realValue}
          </div>
        )}

        {trend && !isModified && (
          <div className={`telemetry-trend ${trend.direction}`}>
            <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
            <span>{trend.value}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Helpers to compute status labels & severity (High, Medium, Low)
function getTemperatureStatus(temp: number | null | undefined): {
  text: string;
  level: 'high' | 'medium' | 'low';
} {
  if (temp == null) return { text: 'NO DATA', level: 'low' };
  if (temp >= 40) return { text: 'HIGH', level: 'high' };
  if (temp >= 30) return { text: 'MEDIUM', level: 'medium' };
  return { text: 'LOW', level: 'low' };
}

function getHumidityStatus(hum: number | null | undefined): {
  text: string;
  level: 'high' | 'medium' | 'low';
} {
  if (hum == null) return { text: 'NO DATA', level: 'low' };
  if (hum < 25) return { text: 'HIGH', level: 'high' };
  if (hum < 40) return { text: 'MEDIUM', level: 'medium' };
  return { text: 'LOW', level: 'low' };
}

function getSoilMoistureStatus(soil: number | null | undefined): {
  text: string;
  level: 'high' | 'medium' | 'low';
} {
  if (soil == null) return { text: 'NO DATA', level: 'low' };
  if (soil < 20) return { text: 'HIGH', level: 'high' };
  if (soil < 40) return { text: 'MEDIUM', level: 'medium' };
  return { text: 'LOW', level: 'low' };
}

function getWindSpeedStatus(wind: number | null | undefined): {
  text: string;
  level: 'high' | 'medium' | 'low';
} {
  if (wind == null) return { text: 'NO DATA', level: 'low' };
  if (wind >= 10) return { text: 'HIGH', level: 'high' };
  if (wind >= 6) return { text: 'MEDIUM', level: 'medium' };
  return { text: 'LOW', level: 'low' };
}

function getPrecipitationStatus(precip: number | null | undefined): {
  text: string;
  level: 'high' | 'medium' | 'low';
} {
  if (precip == null) return { text: 'NO DATA', level: 'low' };
  if (precip <= 0.1) return { text: 'HIGH', level: 'high' };
  if (precip < 2.0) return { text: 'MEDIUM', level: 'medium' };
  return { text: 'LOW', level: 'low' };
}
