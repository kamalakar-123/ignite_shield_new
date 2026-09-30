import { useCallback, useEffect, useState, useRef } from 'react';
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
import { weatherService } from '../services/weatherService';
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

  const { data: stats, loading: statsLoading } = usePolling<DashboardStats>(fetchStats, 15000);
  const { data: latest, loading: latestLoading, error: latestError, refresh: refreshLatest } =
    usePolling<ReadingResponse>(fetchLatest, 10000);
  const { data: alerts } = usePolling<AlertResponse[]>(fetchAlerts, 15000);
  const { data: recentHistory, refresh: refreshRecent } = usePolling<ReadingResponse[]>(fetchRecent, 10000);

  const { isAlarmActive, isAlarmMuted, triggerAlarm, acknowledgeAlarm, unmuteAlarm, turnOffAlarm } = useAlarm();

  // ============================================================
  // DEMO SENSOR MODE STATE
  // Allows manual adjustment of temperature and periodic Random Forest prediction
  // ============================================================
  const [demoSensors, setDemoSensors] = useState<{
    temperature: number;
    humidity: number;
    soil_moisture: number;
    wind_speed: number;
    wind_direction: number;
    precipitation: number;
  }>({
    temperature: 46.0,
    humidity: 45.0,
    soil_moisture: 34.0,
    wind_speed: 3.0,
    wind_direction: 120.0,
    precipitation: 0.0,
  });

  const hasUserModifiedSensors = useRef(false);
  const demoSensorsRef = useRef(demoSensors);

  useEffect(() => {
    demoSensorsRef.current = demoSensors;
  }, [demoSensors]);

  const [predictedRisk, setPredictedRisk] = useState<string | null>(null);
  const [predictionConfidence, setPredictionConfidence] = useState<number | null>(null);
  const mountedRef = useRef(true);

  // ============================================================
  // OPEN-METEO LIVE WEATHER STATE & POLLING (Every 30 seconds)
  // Replaces static/mock initial values with real-time live data
  // ============================================================
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);
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

  // Execute prediction against real Random Forest in FastAPI backend
  const executePrediction = useCallback(async (sensors: typeof demoSensors) => {
    if (!mountedRef.current) return;
    setIsPredicting(true);
    try {
      const res = await predictionApi.predict({
        temperature: sensors.temperature,
        humidity: sensors.humidity,
        soil_moisture: sensors.soil_moisture,
        wind_speed: sensors.wind_speed,
        wind_direction: sensors.wind_direction,
        precipitation: sensors.precipitation,
      });
      if (mountedRef.current) {
        const predictedClass = res.prediction || res.fire_risk || 'Low';
        const upperClass = predictedClass.toUpperCase();

        // Exact probability belonging to the predicted class from the model
        let classProbability = res.probability ?? res.confidence;
        if (res.probabilities) {
          const matchedProb =
            res.probabilities[upperClass] ??
            res.probabilities[predictedClass] ??
            res.probabilities[predictedClass.charAt(0).toUpperCase() + predictedClass.slice(1).toLowerCase()];
          if (matchedProb != null && !isNaN(matchedProb)) {
            classProbability = matchedProb;
          }
        }

        setPredictedRisk(predictedClass);
        setPredictionConfidence(classProbability);
        refreshRecent();
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        console.warn('Prediction request unavailable:', err);
      }
    } finally {
      if (mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current) setIsPredicting(false);
        }, 400);
      }
    }
  }, [refreshRecent]);

  // Open-Meteo Live Weather Polling (Every 30 seconds, using dynamic device GPS coordinates)
  const fetchLiveWeatherData = useCallback(async (isInitial: boolean = false, lat?: number, lon?: number) => {
    if (!mountedRef.current) return;
    if (isInitial) {
      setWeatherLoading(true);
    }
    try {
      const targetLat = lat ?? geoRef.current.latitude ?? undefined;
      const targetLon = lon ?? geoRef.current.longitude ?? undefined;
      const data = await weatherService.fetchLiveWeather(targetLat, targetLon);
      if (!mountedRef.current) return;

      const liveSensors = {
        temperature: data.temperature,
        humidity: data.humidity,
        soil_moisture: data.soilMoisture,
        wind_speed: data.windSpeed,
        wind_direction: data.windDirection,
        precipitation: data.precipitation,
      };

      // Keep valid values visible and update state with live Open-Meteo values
      setDemoSensors(liveSensors);
      demoSensorsRef.current = liveSensors;
      hasUserModifiedSensors.current = false;
      setLastWeatherUpdate(new Date());
      setWeatherError(null);

      // Trigger fire risk prediction with the fresh live weather data
      executePrediction(liveSensors);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      console.warn('Open-Meteo live weather fetch error:', err);
      // Keep previous valid values visible while flagging error state
      setWeatherError('Failed to fetch live weather data from Open-Meteo');
    } finally {
      if (mountedRef.current) {
        setWeatherLoading(false);
      }
    }
  }, [executePrediction]);

  // When GPS lock is acquired or device moves, fetch weather for the real-time position
  const lastGeoFetchRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (geo.latitude != null && geo.longitude != null) {
      const prev = lastGeoFetchRef.current;
      if (!prev || Math.abs(prev.lat - geo.latitude) > 0.001 || Math.abs(prev.lon - geo.longitude) > 0.001) {
        lastGeoFetchRef.current = { lat: geo.latitude, lon: geo.longitude };
        fetchLiveWeatherData(false, geo.latitude, geo.longitude);
      }
    }
  }, [geo.latitude, geo.longitude, fetchLiveWeatherData]);

  // Run initial prediction and live Open-Meteo weather fetch on load
  useEffect(() => {
    mountedRef.current = true;
    // Execute immediate dynamic prediction for current sensor inputs
    executePrediction(demoSensorsRef.current);

    fetchLiveWeatherData(true, geoRef.current.latitude ?? undefined, geoRef.current.longitude ?? undefined);

    // Automatically refresh weather data every 30 seconds
    const weatherTimer = setInterval(() => {
      fetchLiveWeatherData(false, geoRef.current.latitude ?? undefined, geoRef.current.longitude ?? undefined);
    }, 30000);

    return () => {
      mountedRef.current = false;
      clearInterval(weatherTimer);
    };
  }, [fetchLiveWeatherData, executePrediction]);

  // 1-second countdown ticker
  useEffect(() => {
    if (!autoPredictEnabled) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          executePrediction(demoSensorsRef.current);
          return predictionInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [autoPredictEnabled, predictionInterval, executePrediction]);

  // Manual Trigger Handler
  const handleManualPredict = useCallback(() => {
    executePrediction(demoSensorsRef.current);
    setCountdown(predictionInterval);
  }, [executePrediction, predictionInterval]);

  // Sensor Adjustment Handlers (Invisible Two-Zone Controls)
  const handleDecreaseTemp = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        temperature: Math.max(0, Math.round((prev.temperature - 1) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleIncreaseTemp = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        temperature: Math.min(65, Math.round((prev.temperature + 1) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleDecreaseHum = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        humidity: Math.max(0, Math.round((prev.humidity - 1) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleIncreaseHum = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        humidity: Math.min(100, Math.round((prev.humidity + 1) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleDecreaseSoil = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        soil_moisture: Math.max(0, Math.round((prev.soil_moisture - 1) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleIncreaseSoil = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        soil_moisture: Math.min(100, Math.round((prev.soil_moisture + 1) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleDecreaseWind = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        wind_speed: Math.max(0, Math.round((prev.wind_speed - 0.5) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleIncreaseWind = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        wind_speed: Math.min(50, Math.round((prev.wind_speed + 0.5) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleDecreaseWindDir = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        wind_direction: (prev.wind_direction - 10 + 360) % 360,
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleIncreaseWindDir = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        wind_direction: (prev.wind_direction + 10) % 360,
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleDecreasePrecip = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        precipitation: Math.max(0, Math.round((prev.precipitation - 0.1) * 10) / 10),
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

  const handleIncreasePrecip = () => {
    hasUserModifiedSensors.current = true;
    setDemoSensors((prev) => {
      const next = {
        ...prev,
        precipitation: Math.round((prev.precipitation + 0.1) * 10) / 10,
      };
      demoSensorsRef.current = next;
      executePrediction(next);
      return next;
    });
  };

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

  const prev = recentHistory && recentHistory.length > 1 ? recentHistory[1] : null;
  const tempDelta = prev ? demoSensors.temperature - prev.temperature : null;
  const humDelta = prev ? demoSensors.humidity - prev.humidity : null;

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

  // Status assessments for each sensor metric (using active demo sensor state)
  const tempStatus = getTemperatureStatus(demoSensors.temperature);
  const humStatus = getHumidityStatus(demoSensors.humidity);
  const soilStatus = getSoilMoistureStatus(demoSensors.soil_moisture);
  const windStatus = getWindSpeedStatus(demoSensors.wind_speed);
  const precipStatus = getPrecipitationStatus(demoSensors.precipitation);

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

      {/* ============================================================
          Live Sensor Telemetry Grid (All readings in a single row)
          ============================================================ */}
      {latestError ? (
        <ErrorState message={latestError} onRetry={refreshLatest} />
      ) : (
        <div className="telemetry-grid">
          {/* Fire Risk Level Card (Left of Temperature) */}
          <FireRiskCard
            risk={effectiveRisk}
            confidence={effectiveConfidence}
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

          {/* 1. Temperature */}
          <TelemetryCard
            icon={<Thermometer size={22} />}
            iconColor="#ef4444"
            value={demoSensors.temperature.toFixed(1)}
            unit="°C"
            label="Temperature"
            statusText={tempStatus.text}
            statusLevel={tempStatus.level}
            trend={tempTrend}
            onDecrease={handleDecreaseTemp}
            onIncrease={handleIncreaseTemp}
          />

          {/* 2. Relative Humidity */}
          <TelemetryCard
            icon={<Droplets size={22} />}
            iconColor="#3b82f6"
            value={demoSensors.humidity.toFixed(1)}
            unit="%"
            label="Relative Humidity"
            statusText={humStatus.text}
            statusLevel={humStatus.level}
            trend={humTrend}
            onDecrease={handleDecreaseHum}
            onIncrease={handleIncreaseHum}
          />

          {/* 3. Soil Moisture */}
          <TelemetryCard
            icon={<Activity size={22} />}
            iconColor="#22c55e"
            value={demoSensors.soil_moisture.toFixed(1)}
            unit="%"
            label="Soil Moisture"
            statusText={soilStatus.text}
            statusLevel={soilStatus.level}
            onDecrease={handleDecreaseSoil}
            onIncrease={handleIncreaseSoil}
          />

          {/* 4. Wind Speed */}
          <TelemetryCard
            icon={<Wind size={22} />}
            iconColor="#f97316"
            value={demoSensors.wind_speed.toFixed(1)}
            unit="m/s"
            label="Wind Speed"
            statusText={windStatus.text}
            statusLevel={windStatus.level}
            onDecrease={handleDecreaseWind}
            onIncrease={handleIncreaseWind}
          />

          {/* 5. Wind Direction */}
          <TelemetryCard
            icon={<Compass size={22} />}
            iconColor="#a855f7"
            value={`${demoSensors.wind_direction.toFixed(0)}°`}
            unit={getWindDirectionLabel(demoSensors.wind_direction)}
            label="Wind Direction"
            statusText="LOW"
            statusLevel="low"
            onDecrease={handleDecreaseWindDir}
            onIncrease={handleIncreaseWindDir}
          />

          {/* 6. Precipitation */}
          <TelemetryCard
            icon={<CloudRain size={22} />}
            iconColor="#06b6d4"
            value={demoSensors.precipitation.toFixed(1)}
            unit="mm/day"
            label="Precipitation"
            statusText={precipStatus.text}
            statusLevel={precipStatus.level}
            onDecrease={handleDecreasePrecip}
            onIncrease={handleIncreasePrecip}
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
                wind_speed: demoSensors.wind_speed,
                wind_direction: demoSensors.wind_direction,
                fire_risk: effectiveRisk,
                temperature: demoSensors.temperature,
                humidity: demoSensors.humidity,
                soil_moisture: demoSensors.soil_moisture,
                precipitation: demoSensors.precipitation,
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
                      <span className="alert-message">{alert.message}</span>
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
  statusText: string;
  statusLevel: 'high' | 'medium' | 'low' | 'normal';
  trend?: {
    value: string;
    direction: 'up' | 'down';
  } | null;
  onDecrease?: () => void;
  onIncrease?: () => void;
}

function TelemetryCard({
  icon,
  iconColor,
  value,
  unit,
  label,
  statusText,
  statusLevel,
  trend,
  onDecrease,
  onIncrease,
}: TelemetryCardProps) {
  const dotColor =
    statusLevel === 'high'
      ? '#ef4444'
      : statusLevel === 'medium'
      ? '#f59e0b'
      : '#22c55e';

  // Invisible two-zone control: Left half decreases, Right half increases
  // Supports mouse clicks and touchscreen taps
  const handleCardInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onDecrease || !onIncrease) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isLeft = clickX < rect.width / 2;
    if (isLeft) {
      onDecrease();
    } else {
      onIncrease();
    }
  };

  return (
    <div
      className="telemetry-card glass-card"
      onClick={handleCardInteraction}
      style={{
        cursor: onDecrease && onIncrease ? 'pointer' : undefined,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      <div className="telemetry-card-top">
        <div className="telemetry-icon-box" style={{ color: iconColor }}>
          {icon}
        </div>
        <span
          className="telemetry-status-dot"
          style={{
            background: dotColor,
            boxShadow: `0 0 8px ${dotColor}`,
          }}
        />
      </div>

      <div className="telemetry-card-body">
        <div className="telemetry-value-wrap">
          <span className="telemetry-value">{value}</span>
          {unit && <span className="telemetry-unit">{unit}</span>}
        </div>
        <div className="telemetry-label">{label}</div>
        {trend && (
          <div className={`telemetry-trend ${trend.direction}`}>
            <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
            <span>{trend.value}</span>
          </div>
        )}
      </div>

      <div className="telemetry-card-bottom">
        <span className={`telemetry-status-text ${statusLevel}`}>
          {statusText}
        </span>
        <div className="telemetry-card-bar" />
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
