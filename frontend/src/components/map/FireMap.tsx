import React, { useCallback, useState, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polygon,
  Polyline,
  useMap,
  LayersControl,
  CircleMarker,
  Tooltip,
} from 'react-leaflet';
import L from 'leaflet';
import { usePolling } from '../../hooks/usePolling';
import { riskMapApi } from '../../services/api';
import {
  calculateFireSpread,
  getWindDirectionLabel,
  type FireSpreadData,
} from '../../utils/fireSpreadEngine';
import { formatDateTime, getRiskColor, formatConfidence } from '../../utils/formatters';
import type { RiskMapPoint } from '../../types';

// Fix Leaflet default marker icon
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface CurrentSensorState {
  latitude: number;
  longitude: number;
  wind_speed: number;
  wind_direction: number;
  fire_risk: string;
  temperature?: number;
  humidity?: number;
  soil_moisture?: number;
  precipitation?: number;
  isUserLocation?: boolean;
  locationError?: string | null;
}

interface FireMapProps {
  currentSensor?: CurrentSensorState;
  onZoneSelect?: (zone: RiskMapPoint) => void;
  selectedZoneId?: number | null;
  fullScreen?: boolean;
  riskFilter?: string[];
  searchQuery?: string;
}

// Custom marker icons by risk level
function createRiskIcon(risk: string): L.DivIcon {
  const color = getRiskColor(risk);
  const isHigh = risk.toUpperCase() === 'HIGH';
  return L.divIcon({
    className: 'custom-fire-marker',
    html: `
      <div style="
        width: ${isHigh ? 22 : 16}px;
        height: ${isHigh ? 22 : 16}px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 ${isHigh ? 14 : 6}px ${color}80;
        ${isHigh ? 'animation: pulse-fire 1.5s ease-in-out infinite;' : ''}
      "></div>
    `,
    iconSize: [isHigh ? 22 : 16, isHigh ? 22 : 16],
    iconAnchor: [isHigh ? 11 : 8, isHigh ? 11 : 8],
  });
}

// Prominent fire-origin marker for High Risk
function createFireOriginIcon(): L.DivIcon {
  return L.divIcon({
    className: 'custom-fire-origin-marker',
    html: `
      <div style="
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle, #ef4444 20%, #b91c1c 70%, #7f1d1d 100%);
        border: 2.5px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 16px rgba(239, 68, 68, 0.95), 0 0 30px rgba(239, 68, 68, 0.6);
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        animation: pulse-fire 1.2s ease-in-out infinite;
      ">
        🔥
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

// Active sensor / user location icon by risk level
function createActiveSensorIcon(risk: string, isUserLocation?: boolean): L.DivIcon {
  const normalized = risk.toUpperCase();
  if (normalized === 'HIGH') {
    return createFireOriginIcon();
  }
  const isMedium = normalized === 'MEDIUM';
  const color = isMedium ? '#f59e0b' : isUserLocation ? '#38bdf8' : '#22c55e';
  const icon = isMedium ? '⚠️' : isUserLocation ? '📍' : '📡';
  return L.divIcon({
    className: 'custom-sensor-marker',
    html: `
      <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
        ${isUserLocation ? `<div style="
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: ${color}40;
          animation: pulse-gps-ring 2s infinite ease-out;
        "></div>` : ''}
        <div style="
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.88);
          border: 2px solid ${color};
          border-radius: 50%;
          box-shadow: 0 0 14px ${color}90;
          font-size: 15px;
          line-height: 1;
          backdrop-filter: blur(4px);
          cursor: pointer;
          z-index: 2;
        ">
          ${icon}
        </div>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

// Component to recenter map when data loads or when device/currentSensor position updates
function MapAutoCenter({
  points,
  currentSensor,
}: {
  points: RiskMapPoint[];
  currentSensor?: CurrentSensorState;
}) {
  const map = useMap();
  const lastCoordsRef = React.useRef<{ lat: number; lng: number } | null>(null);

  React.useEffect(() => {
    // Center on currentSensor on initial mount or when device coordinates change
    if (
      currentSensor &&
      currentSensor.latitude != null &&
      currentSensor.longitude != null
    ) {
      const prev = lastCoordsRef.current;
      // Recenter if first time or moved noticeably (> ~10 meters)
      if (
        !prev ||
        Math.abs(prev.lat - currentSensor.latitude) > 0.0001 ||
        Math.abs(prev.lng - currentSensor.longitude) > 0.0001
      ) {
        map.setView([currentSensor.latitude, currentSensor.longitude], prev ? map.getZoom() : 13, {
          animate: true,
        });
        lastCoordsRef.current = {
          lat: currentSensor.latitude,
          lng: currentSensor.longitude,
        };
      }
      return;
    }

    if (!lastCoordsRef.current) {
      const withCoords = points.filter((p) => p.latitude != null && p.longitude != null);
      if (withCoords.length > 0) {
        const bounds = L.latLngBounds(
          withCoords.map((p) => [p.latitude!, p.longitude!] as [number, number])
        );
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }
    }
  }, [points, currentSensor, map]);

  return null;
}

// Wind direction arrow overlay
function WindArrow({
  lat,
  lng,
  direction,
  speed,
}: {
  lat: number;
  lng: number;
  direction: number;
  speed: number;
}) {
  const size = Math.min(40, 20 + speed * 3);
  return (
    <Marker
      position={[lat, lng]}
      icon={L.divIcon({
        className: 'wind-arrow-marker',
        html: `<div style="
          transform: rotate(${direction}deg);
          font-size: ${size}px;
          color: rgba(255,255,255,0.85);
          text-shadow: 0 0 4px rgba(0,0,0,0.8);
          line-height: 1;
        ">↑</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      })}
    >
      <Tooltip direction="top" offset={[0, -20]}>
        Wind: {speed.toFixed(1)} m/s, {getWindDirectionLabel(direction)} ({direction}°)
      </Tooltip>
    </Marker>
  );
}

export default function FireMap({
  currentSensor,
  onZoneSelect,
  selectedZoneId,
  fullScreen = false,
  riskFilter,
  searchQuery,
}: FireMapProps) {
  const fetchMapData = useCallback(() => riskMapApi.get(), []);
  const { data: mapPoints, loading, error } = usePolling<RiskMapPoint[]>(fetchMapData, 15000);
  const [showSpread, setShowSpread] = useState(true);

  // Default center (uses currentSensor if available, else standard fallback)
  const defaultCenter: [number, number] = [
    currentSensor?.latitude ?? 20.5937,
    currentSensor?.longitude ?? 78.9629,
  ];
  const defaultZoom = currentSensor ? 13 : 5;

  // Filter points by risk level and search query
  const filteredPoints = useMemo(() => {
    if (!mapPoints) return [];
    let result = mapPoints;
    if (riskFilter && riskFilter.length > 0) {
      result = result.filter((p) => riskFilter.includes(p.fire_risk));
    }
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter((p) => p.zone_name.toLowerCase().includes(query));
    }
    return result;
  }, [mapPoints, riskFilter, searchQuery]);

  // Compute fire spread for high-risk points with coordinates from database
  const spreadData = useMemo(() => {
    if (!showSpread || !filteredPoints) return [];
    return filteredPoints
      .filter((p) => p.fire_risk === 'High' && p.latitude != null && p.longitude != null)
      .map((p) => ({
        point: p,
        spread: calculateFireSpread(
          p.latitude!,
          p.longitude!,
          p.wind_speed,
          p.wind_direction || 0,
          p.fire_risk
        ),
      }));
  }, [filteredPoints, showSpread]);

  // Dynamic fire spread calculation for the monitored sensor
  const activeSensorSpread: FireSpreadData | null = useMemo(() => {
    if (!currentSensor || currentSensor.latitude == null || currentSensor.longitude == null) {
      return null;
    }
    const isHigh = currentSensor.fire_risk.toUpperCase() === 'HIGH';
    const isMedium = currentSensor.fire_risk.toUpperCase() === 'MEDIUM';

    if (!isHigh && !isMedium) return null;

    return calculateFireSpread(
      currentSensor.latitude,
      currentSensor.longitude,
      currentSensor.wind_speed,
      currentSensor.wind_direction,
      currentSensor.fire_risk
    );
  }, [currentSensor]);

  if (loading && !mapPoints && !currentSensor) {
    return <div className="map-loading">Loading map data...</div>;
  }

  if (error && !currentSensor) {
    return <div className="map-error">Failed to load map data: {error}</div>;
  }

  const hasCoordinates =
    Boolean(currentSensor && currentSensor.latitude != null && currentSensor.longitude != null) ||
    filteredPoints.some((p) => p.latitude != null && p.longitude != null);

  const isCurrentHigh = currentSensor?.fire_risk.toUpperCase() === 'HIGH';
  const isCurrentMedium = currentSensor?.fire_risk.toUpperCase() === 'MEDIUM';

  return (
    <div className={`fire-map-container ${fullScreen ? 'full-screen' : ''}`}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="fire-map"
        zoomControl={true}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="&copy; Esri, Maxar, Earthstar Geographics"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Dark Map">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Light Map">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Terrain">
            <TileLayer
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenTopoMap"
              maxZoom={17}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {hasCoordinates && (
          <MapAutoCenter points={filteredPoints} currentSensor={currentSensor} />
        )}

        {/* ============================================================
            1. Monitored Active Sensor Layer (Dynamic Wind Spread)
            ============================================================ */}
        {currentSensor && (
          <React.Fragment key="current-sensor-layer">
            {/* Sensor Origin / Your Location Marker */}
            <Marker
              position={[currentSensor.latitude, currentSensor.longitude]}
              icon={createActiveSensorIcon(currentSensor.fire_risk, currentSensor.isUserLocation)}
            >
              <Popup>
                <div className="map-popup">
                  <h4>{isCurrentHigh ? '🔥 FIRE ORIGIN' : currentSensor.isUserLocation ? '📍 YOUR LOCATION' : '📡 MONITORED SENSOR'}</h4>
                  <div className="popup-coords" style={{ fontSize: '11px', color: '#38bdf8', marginBottom: '6px', fontWeight: 600 }}>
                    Lat: {currentSensor.latitude.toFixed(5)}°, Lon: {currentSensor.longitude.toFixed(5)}°
                  </div>
                  <div
                    className="popup-risk"
                    style={{
                      color: getRiskColor(currentSensor.fire_risk),
                      fontWeight: 700,
                    }}
                  >
                    {isCurrentHigh ? '🔥' : isCurrentMedium ? '⚠️' : '✅'}{' '}
                    {currentSensor.fire_risk.toUpperCase()} Risk
                  </div>
                  <div className="popup-details">
                    <span>🌡️ {currentSensor.temperature?.toFixed(1) ?? '46.0'}°C</span>
                    <span>💧 {currentSensor.humidity?.toFixed(1) ?? '45.0'}%</span>
                    <span>💨 {currentSensor.wind_speed.toFixed(1)} m/s</span>
                    <span>🧭 {currentSensor.wind_direction.toFixed(0)}° ({getWindDirectionLabel(currentSensor.wind_direction)})</span>
                  </div>
                  {isCurrentHigh && activeSensorSpread && (
                    <div style={{ marginTop: 8, fontSize: '11px', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6 }}>
                      <strong style={{ color: '#f97316' }}>Potential Fire Spread:</strong><br />
                      Direction: {getWindDirectionLabel(activeSensorSpread.spreadDirection)} ({activeSensorSpread.spreadDirection}°)<br />
                      Wind Speed: {currentSensor.wind_speed.toFixed(1)} m/s ({activeSensorSpread.scalingCategory})<br />
                      Est. Reach: {activeSensorSpread.spreadDistanceKm.toFixed(1)} km<br />
                      <em style={{ fontSize: '10px' }}>Based on wind conditions</em>
                    </div>
                  )}
                </div>
              </Popup>
              <Tooltip direction="top" offset={[0, -18]}>
                {currentSensor.isUserLocation
                  ? `Your Location (${currentSensor.latitude.toFixed(4)}°, ${currentSensor.longitude.toFixed(4)}°)`
                  : isCurrentHigh
                  ? 'Fire Origin (High Risk)'
                  : `Sensor Station (${currentSensor.fire_risk})`}
              </Tooltip>
            </Marker>

            {/* HIGH RISK: Dynamic Potential Fire Spread Cone */}
            {showSpread && isCurrentHigh && activeSensorSpread && (
              <>
                {/* Fire Spread Cone / Sector Polygon */}
                <Polygon
                  positions={activeSensorSpread.spreadPolygon}
                  pathOptions={{
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 0.28,
                    weight: 2,
                    dashArray: '6 4',
                  }}
                >
                  <Tooltip direction="center">
                    <div className="map-spread-tooltip">
                      <strong style={{ color: '#f87171', fontSize: '12px' }}>Potential Fire Spread</strong><br />
                      <span style={{ fontSize: '11px', color: '#cbd5e1' }}>Based on wind conditions</span><br />
                      <hr style={{ margin: '4px 0', borderColor: 'rgba(255,255,255,0.15)' }} />
                      Direction: <strong>{getWindDirectionLabel(activeSensorSpread.spreadDirection)} ({activeSensorSpread.spreadDirection}°)</strong><br />
                      Wind Speed: <strong>{currentSensor.wind_speed.toFixed(1)} m/s ({activeSensorSpread.scalingCategory})</strong><br />
                      Est. Reach: <strong>{activeSensorSpread.spreadDistanceKm.toFixed(1)} km</strong><br />
                      Affected Area: <strong>~{activeSensorSpread.affectedAreaSqKm} km²</strong><br />
                      <span style={{ fontSize: '10px', color: '#fca5a5' }}>
                        Simulation only. Not an exact fire boundary.
                      </span>
                    </div>
                  </Tooltip>
                </Polygon>

                {/* Central Spread Vector (Direction of Spread) */}
                <Polyline
                  positions={[
                    [currentSensor.latitude, currentSensor.longitude],
                    [activeSensorSpread.arrowTip.lat, activeSensorSpread.arrowTip.lng],
                  ]}
                  pathOptions={{
                    color: '#f97316',
                    weight: 3.5,
                    dashArray: '8 5',
                    opacity: 0.9,
                  }}
                />

                {/* Spread Front Pointer Arrow */}
                <Marker
                  position={[activeSensorSpread.arrowTip.lat, activeSensorSpread.arrowTip.lng]}
                  icon={L.divIcon({
                    className: 'spread-front-marker',
                    html: `
                      <div style="
                        transform: rotate(${activeSensorSpread.spreadDirection}deg);
                        font-size: 24px;
                        color: #f97316;
                        text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 0 10px #f97316;
                        font-weight: 900;
                        line-height: 1;
                      ">▲</div>
                    `,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                  })}
                >
                  <Tooltip direction="top" offset={[0, -12]}>
                    Potential Spread Front: {activeSensorSpread.spreadDistanceKm.toFixed(1)} km ({getWindDirectionLabel(activeSensorSpread.spreadDirection)})
                  </Tooltip>
                </Marker>

                {/* Intensity Heat Points */}
                {activeSensorSpread.spreadPoints.map((sp, i) => (
                  <CircleMarker
                    key={`sensor-heat-${i}`}
                    center={[sp.lat, sp.lng]}
                    radius={Math.max(4, sp.intensity * 12)}
                    pathOptions={{
                      color: 'transparent',
                      fillColor: sp.intensity > 0.6 ? '#ef4444' : '#f97316',
                      fillOpacity: sp.intensity * 0.45,
                    }}
                  />
                ))}
              </>
            )}

            {/* MEDIUM RISK: Subtle Directional Risk Indicator */}
            {showSpread && isCurrentMedium && activeSensorSpread && (
              <Polyline
                positions={[
                  [currentSensor.latitude, currentSensor.longitude],
                  [activeSensorSpread.arrowTip.lat, activeSensorSpread.arrowTip.lng],
                ]}
                pathOptions={{
                  color: '#f59e0b',
                  weight: 2,
                  dashArray: '6 6',
                  opacity: 0.65,
                }}
              >
                <Tooltip direction="top">
                  Potential Risk Direction: {getWindDirectionLabel(activeSensorSpread.spreadDirection)} ({currentSensor.wind_speed.toFixed(1)} m/s)
                </Tooltip>
              </Polyline>
            )}

            {/* Sensor perimeter circle */}
            <CircleMarker
              center={[currentSensor.latitude, currentSensor.longitude]}
              radius={isCurrentHigh ? 32 : isCurrentMedium ? 22 : 14}
              pathOptions={{
                color: getRiskColor(currentSensor.fire_risk),
                fillColor: getRiskColor(currentSensor.fire_risk),
                fillOpacity: 0.12,
                weight: 1.5,
              }}
            />
          </React.Fragment>
        )}

        {/* ============================================================
            2. Database Risk Map Points (Other Monitored Zones)
            ============================================================ */}
        {filteredPoints.map((point) => {
          if (point.latitude == null || point.longitude == null) return null;
          // Avoid duplicating the current sensor point
          if (
            currentSensor &&
            Math.abs(point.latitude - currentSensor.latitude) < 0.0001 &&
            Math.abs(point.longitude - currentSensor.longitude) < 0.0001
          ) {
            return null;
          }

          return (
            <React.Fragment key={`zone-point-${point.id}`}>
              <Marker
                position={[point.latitude, point.longitude]}
                icon={createRiskIcon(point.fire_risk)}
                eventHandlers={{
                  click: () => onZoneSelect?.(point),
                }}
              >
                <Popup>
                  <div className="map-popup">
                    <h4>{point.zone_name}</h4>
                    <div className="popup-risk" style={{ color: getRiskColor(point.fire_risk) }}>
                      {point.fire_risk === 'High' ? '🔥' : point.fire_risk === 'Medium' ? '⚠️' : '✅'}{' '}
                      {point.fire_risk} Risk ({formatConfidence(point.confidence)})
                    </div>
                    <div className="popup-details">
                      <span>🌡️ {point.temperature.toFixed(1)}°C</span>
                      <span>💧 {point.humidity.toFixed(1)}%</span>
                      <span>💨 {point.wind_speed.toFixed(1)} m/s</span>
                    </div>
                    <div className="popup-time">{formatDateTime(point.created_at)}</div>
                  </div>
                </Popup>
              </Marker>

              {point.wind_direction != null && (
                <WindArrow
                  lat={point.latitude + 0.01}
                  lng={point.longitude + 0.01}
                  direction={point.wind_direction}
                  speed={point.wind_speed}
                />
              )}

              <CircleMarker
                center={[point.latitude, point.longitude]}
                radius={point.fire_risk === 'High' ? 30 : point.fire_risk === 'Medium' ? 20 : 12}
                pathOptions={{
                  color: getRiskColor(point.fire_risk),
                  fillColor: getRiskColor(point.fire_risk),
                  fillOpacity: 0.12,
                  weight: 1,
                }}
              />

              {selectedZoneId === point.id && (
                <CircleMarker
                  center={[point.latitude, point.longitude]}
                  radius={35}
                  pathOptions={{
                    color: '#ffffff',
                    fillColor: 'transparent',
                    fillOpacity: 0,
                    weight: 2,
                    dashArray: '6 4',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Database points spread visualization */}
        {spreadData.map(({ point, spread }: { point: RiskMapPoint; spread: FireSpreadData }) => (
          <React.Fragment key={`spread-${point.id}`}>
            <Polygon
              positions={spread.spreadPolygon}
              pathOptions={{
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.2,
                weight: 1,
                dashArray: '4 4',
              }}
            >
              <Tooltip>
                <div>
                  <strong>Potential Fire Spread</strong><br />
                  Direction: {getWindDirectionLabel(spread.spreadDirection)}<br />
                  Intensity: {spread.spreadIntensity}<br />
                  Distance: {spread.spreadDistanceKm.toFixed(1)} km<br />
                  Area: {spread.affectedAreaSqKm} km²<br />
                  <em style={{ fontSize: '10px' }}>{spread.note}</em>
                </div>
              </Tooltip>
            </Polygon>

            {point.latitude != null && point.longitude != null && (
              <Polyline
                positions={[
                  [point.latitude, point.longitude],
                  [spread.arrowTip.lat, spread.arrowTip.lng],
                ]}
                pathOptions={{
                  color: '#ff6b35',
                  weight: 3,
                  dashArray: '8 6',
                  opacity: 0.8,
                }}
              />
            )}
          </React.Fragment>
        ))}
      </MapContainer>

      {/* Real-time GPS status overlay badge */}
      {currentSensor && (
        <div className="map-gps-indicator">
          <span className={`map-gps-dot ${currentSensor.isUserLocation ? 'active' : 'fallback'}`} />
          <span className="map-gps-label">
            {currentSensor.isUserLocation ? 'Your Location:' : 'Location:'}
          </span>
          <span className="map-gps-coords">
            {currentSensor.latitude.toFixed(4)}°, {currentSensor.longitude.toFixed(4)}°
          </span>
          {currentSensor.locationError && (
            <span className="map-gps-error" title={currentSensor.locationError}>
              ({currentSensor.locationError})
            </span>
          )}
        </div>
      )}

      {/* Map Legend */}
      <div className="map-legend">
        <h4>Legend</h4>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#22c55e' }} />
          <span>Low Risk</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#eab308' }} />
          <span>Medium Risk</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ background: '#ef4444' }} />
          <span>High Risk</span>
        </div>
        {showSpread && (
          <div className="legend-item">
            <span
              className="legend-dot"
              style={{
                background: '#ef4444',
                opacity: 0.35,
                width: 16,
                height: 16,
                borderRadius: '4px',
              }}
            />
            <span>Potential Spread</span>
          </div>
        )}
        <label className="legend-toggle">
          <input
            type="checkbox"
            checked={showSpread}
            onChange={(e) => setShowSpread(e.target.checked)}
          />
          <span>Show Spread</span>
        </label>
      </div>

      {/* No coordinates warning */}
      {!hasCoordinates && filteredPoints.length > 0 && !currentSensor && (
        <div className="map-no-coords">
          <p>📍 Sensor data available but no coordinates provided.</p>
          <p>Submit sensor readings with latitude and longitude to see them on the map.</p>
        </div>
      )}
    </div>
  );
}
