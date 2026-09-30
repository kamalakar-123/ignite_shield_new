import React, { useState } from 'react';
import { Map, Filter, Search, X } from 'lucide-react';
import FireMap from '../components/map/FireMap';
import ZonePanel from '../components/map/ZonePanel';
import { useGeolocation } from '../hooks/useGeolocation';
import type { RiskMapPoint } from '../types';

export default function FireMapPage() {
  const geo = useGeolocation();
  const [selectedZone, setSelectedZone] = useState<RiskMapPoint | null>(null);
  const [riskFilter, setRiskFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const filterOptions = ['Low', 'Medium', 'High'];

  const toggleFilter = (level: string) => {
    setRiskFilter((prev) =>
      prev.includes(level) ? prev.filter((f) => f !== level) : [...prev, level]
    );
  };

  return (
    <div className="fire-map-page">
      <div className="page-header compact">
        <div>
          <h1 className="page-title"><Map size={28} /> Fire Risk Map</h1>
        </div>
        <div className="map-toolbar">
          {/* Search */}
          <div className="map-search">
            <Search size={14} className="map-search-icon" />
            <input
              type="text"
              placeholder="Search zones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="map-search-input"
            />
            {searchQuery && (
              <button className="map-search-clear" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="map-filters">
            <Filter size={16} />
            {filterOptions.map((level) => (
              <button
                key={level}
                className={`filter-chip ${riskFilter.length === 0 || riskFilter.includes(level) ? 'active' : ''}`}
                onClick={() => toggleFilter(level)}
                style={{
                  '--chip-color': level === 'High' ? '#ef4444' : level === 'Medium' ? '#eab308' : '#22c55e',
                } as React.CSSProperties}
              >
                {level}
              </button>
            ))}
            {riskFilter.length > 0 && (
              <button className="filter-chip clear" onClick={() => setRiskFilter([])}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="map-layout">
        <FireMap
          fullScreen
          currentSensor={
            geo.latitude != null && geo.longitude != null
              ? {
                  latitude: geo.latitude,
                  longitude: geo.longitude,
                  wind_speed: 3.0,
                  wind_direction: 120.0,
                  fire_risk: 'Low',
                  isUserLocation: true,
                  locationError: geo.error,
                }
              : undefined
          }
          onZoneSelect={setSelectedZone}
          selectedZoneId={selectedZone?.id}
          riskFilter={riskFilter.length > 0 ? riskFilter : undefined}
          searchQuery={searchQuery}
        />
        {selectedZone && (
          <ZonePanel zone={selectedZone} onClose={() => setSelectedZone(null)} />
        )}
      </div>
    </div>
  );
}
