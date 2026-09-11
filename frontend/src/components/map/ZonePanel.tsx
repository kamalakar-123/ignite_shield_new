import { X, Wind, Thermometer, Layers, MapPin, Clock } from 'lucide-react';
import type { RiskMapPoint } from '../../types';
import { calculateFireSpread, getWindDirectionLabel, getSpreadDirectionLabel } from '../../utils/fireSpreadEngine';
import { formatDateTime, getRiskColor, formatConfidence, formatValue } from '../../utils/formatters';

interface ZonePanelProps {
  zone: RiskMapPoint;
  onClose: () => void;
}

export default function ZonePanel({ zone, onClose }: ZonePanelProps) {
  const hasCoords = zone.latitude != null && zone.longitude != null;
  const spread = hasCoords
    ? calculateFireSpread(
        zone.latitude!, zone.longitude!,
        zone.wind_speed, zone.wind_direction || 0, zone.fire_risk
      )
    : null;

  return (
    <div className="zone-panel glass-card">
      <div className="zone-panel-header">
        <div>
          <h3>
            <MapPin size={18} />
            {zone.zone_name}
          </h3>
          <span className="zone-risk-badge" style={{ background: getRiskColor(zone.fire_risk) }}>
            {zone.fire_risk === 'High' ? '🔥' : zone.fire_risk === 'Medium' ? '⚠️' : '✅'}
            {' '}{zone.fire_risk} Risk
          </span>
        </div>
        <button className="btn-icon" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="zone-panel-section">
        <h4><Thermometer size={16} /> Environmental Data</h4>
        <div className="zone-data-grid">
          <DataRow label="Temperature" value={formatValue(zone.temperature, '°C')} icon="🌡️" />
          <DataRow label="Humidity" value={formatValue(zone.humidity, '%')} icon="💧" />
          <DataRow label="Soil Moisture" value={formatValue(zone.soil_moisture, '%')} icon="🌱" />
          <DataRow label="Wind Speed" value={formatValue(zone.wind_speed, 'm/s')} icon="💨" />
          <DataRow
            label="Wind Direction"
            value={zone.wind_direction != null ? `${zone.wind_direction.toFixed(0)}° (${getWindDirectionLabel(zone.wind_direction)})` : 'Data unavailable'}
            icon="🧭"
          />
          <DataRow
            label="Precipitation"
            value={zone.precipitation != null ? formatValue(zone.precipitation, 'mm') : 'Data unavailable'}
            icon="🌧️"
          />
        </div>
      </div>

      <div className="zone-panel-section">
        <h4><Layers size={16} /> Risk Assessment</h4>
        <div className="zone-data-grid">
          <DataRow label="Fire Risk" value={zone.fire_risk} icon="🔥" highlight={zone.fire_risk} />
          <DataRow label="Confidence" value={formatConfidence(zone.confidence)} icon="📊" />
        </div>
      </div>

      {zone.fire_risk === 'High' && (
        <div className="zone-panel-section spread-section">
          <h4><Wind size={16} /> Fire Spread Simulation</h4>
          {spread ? (
            <div className="zone-data-grid">
              <DataRow
                label="Spread Direction"
                value={getSpreadDirectionLabel(zone.wind_direction || 0)}
                icon="➡️"
              />
              <DataRow label="Intensity" value={spread.spreadIntensity} icon="🔥" />
              <DataRow label="Est. Spread" value={`${spread.spreadDistanceKm.toFixed(1)} km`} icon="📏" />
              <DataRow label="Affected Area" value={`${spread.affectedAreaSqKm} km²`} icon="📐" />
            </div>
          ) : (
            <p className="data-unavailable">Coordinates required for spread calculation</p>
          )}
          <p className="spread-disclaimer">
            ⚠️ Wind-based simulation only. Not a scientifically accurate wildfire prediction.
          </p>
        </div>
      )}

      <div className="zone-panel-footer">
        <Clock size={14} />
        <span>Last Updated: {formatDateTime(zone.created_at)}</span>
      </div>
    </div>
  );
}

function DataRow({ label, value, icon, highlight }: { label: string; value: string; icon: string; highlight?: string }) {
  return (
    <div className="data-row">
      <span className="data-icon">{icon}</span>
      <span className="data-label">{label}</span>
      <span
        className="data-value"
        style={highlight ? { color: getRiskColor(highlight) } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
