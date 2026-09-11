import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Download,
  FileDown,
  Database,
  AlertTriangle,
  BarChart3,
  Clock,
  Flame,
  History,
  Eye,
  Search,
  X,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { exportApi, sensorApi, alertsApi } from '../services/api';
import { downloadBlob, formatDateTime, formatRelativeTime, getRiskColor, formatConfidence } from '../utils/formatters';
import { getWindDirectionLabel } from '../utils/fireSpreadEngine';
import type { ReadingResponse, AlertResponse } from '../types';

interface ExportOption {
  id: string;
  exportKey: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  badgeLabel: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'sensor',
    exportKey: 'sensor',
    icon: <Database size={22} />,
    title: 'Sensor Data',
    description: 'All sensor readings with temperature, humidity, soil moisture, wind speed, and fire risk predictions',
    color: '#3b82f6',
    badgeLabel: 'Telemetries',
  },
  {
    id: 'sensor',
    exportKey: 'fire_risk',
    icon: <Flame size={22} />,
    title: 'Fire Risk Data',
    description: 'Sensor data focused on fire risk predictions, confidence levels, and risk classifications',
    color: '#f97316',
    badgeLabel: 'Predictions',
  },
  {
    id: 'alerts',
    exportKey: 'alerts',
    icon: <AlertTriangle size={22} />,
    title: 'Alert Data',
    description: 'All fire risk alerts with risk levels, zones, messages, and acknowledgment status',
    color: '#ef4444',
    badgeLabel: 'Alerts',
  },
  {
    id: 'sensor',
    exportKey: 'incidents',
    icon: <BarChart3 size={22} />,
    title: 'Fire Incident Data',
    description: 'High-risk fire incidents extracted from sensor predictions for incident analysis',
    color: '#dc2626',
    badgeLabel: 'High Risk',
  },
  {
    id: 'sensor',
    exportKey: 'historical',
    icon: <History size={22} />,
    title: 'Historical Data',
    description: 'Complete historical sensor readings and predictions for trend analysis and research',
    color: '#8b5cf6',
    badgeLabel: 'Timeline',
  },
];

export default function DataDownloadPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [limit, setLimit] = useState(1000);
  const [message, setMessage] = useState('');
  
  // In-place Data Inspection State
  const [activeDataset, setActiveDataset] = useState<string>('sensor');
  const [readings, setReadings] = useState<ReadingResponse[]>([]);
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const previewRef = useRef<HTMLDivElement>(null);

  // Fetch live data from backend
  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [readingsData, alertsData] = await Promise.all([
        sensorApi.getAll(limit),
        alertsApi.getAll(undefined, limit),
      ]);
      setReadings(readingsData || []);
      setAlerts(alertsData || []);
    } catch (err) {
      console.error('Failed to fetch data for preview:', err);
    } finally {
      setLoadingData(false);
    }
  }, [limit]);

  useEffect(() => {
    let active = true;
    Promise.all([
      sensorApi.getAll(limit),
      alertsApi.getAll(undefined, limit),
    ]).then(([readingsData, alertsData]) => {
      if (active) {
        setReadings(readingsData || []);
        setAlerts(alertsData || []);
        setLoadingData(false);
      }
    }).catch((err) => {
      console.error('Failed to fetch data for preview:', err);
      if (active) {
        setLoadingData(false);
      }
    });

    return () => {
      active = false;
    };
  }, [limit]);

  // Handle CSV Download
  const handleDownload = async (dataType: string, exportLabel: string) => {
    const downloadKey = exportLabel || dataType;
    setDownloading(downloadKey);
    setMessage('');
    try {
      const blob = await exportApi.downloadCsv(dataType, limit);
      const date = new Date().toISOString().split('T')[0];
      downloadBlob(blob, `ignite_shield_${downloadKey}_${date}.csv`);
      setMessage(`✅ ${downloadKey} data downloaded successfully!`);
    } catch (err) {
      setMessage(`❌ Failed to download ${downloadKey} data. Make sure the backend is running.`);
      console.error(err);
    } finally {
      setDownloading(null);
    }
  };

  // Handle client-side CSV export of current filtered view
  const handleDownloadCurrentView = () => {
    const isAlerts = activeDataset === 'alerts';
    let csvContent = '';
    const date = new Date().toISOString().split('T')[0];

    if (isAlerts) {
      const alertItems = filteredData as AlertResponse[];
      const headers = ['ID', 'Timestamp', 'Alert Type', 'Risk Level', 'Zone', 'Message', 'Acknowledged'];
      const rows = alertItems.map(a => [
        a.id,
        `"${a.created_at}"`,
        `"${a.alert_type}"`,
        `"${a.risk_level === 'Critical' ? 'High' : a.risk_level}"`,
        `"${a.zone_name || ''}"`,
        `"${(a.message || '').replace(/"/g, '""')}"`,
        a.is_acknowledged ? 'Yes' : 'No',
      ]);
      csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    } else {
      const readingItems = filteredData as ReadingResponse[];
      const headers = ['ID', 'Timestamp', 'Temperature (°C)', 'Humidity (%)', 'Soil Moisture (%)', 'Wind Speed (m/s)', 'Wind Direction (°)', 'Precipitation (mm)', 'Fire Risk', 'Confidence'];
      const rows = readingItems.map(r => [
        r.id,
        `"${r.created_at}"`,
        r.temperature,
        r.humidity,
        r.soil_moisture,
        r.wind_speed,
        r.wind_direction ?? '',
        r.precipitation ?? '',
        `"${r.fire_risk}"`,
        r.confidence,
      ]);
      csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `ignite_shield_${activeDataset}_view_${date}.csv`);
    setMessage(`✅ Exported current view (${filteredData.length} records) to CSV!`);
  };

  // Select dataset to view
  const handleSelectDataset = (exportKey: string) => {
    setActiveDataset(exportKey);
    setCurrentPage(1);
    setSearchQuery('');
    setRiskFilter('All');
    if (previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Active option info
  const currentOption = useMemo(() => {
    return EXPORT_OPTIONS.find(opt => opt.exportKey === activeDataset) || EXPORT_OPTIONS[0];
  }, [activeDataset]);

  // Derive raw dataset for active category
  const rawData = useMemo(() => {
    switch (activeDataset) {
      case 'sensor':
        return readings;
      case 'fire_risk':
        return [...readings].sort((a, b) => b.confidence - a.confidence);
      case 'incidents':
        return readings.filter(r => r.fire_risk === 'High');
      case 'historical':
        return [...readings].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'alerts':
        return alerts;
      default:
        return readings;
    }
  }, [activeDataset, readings, alerts]);

  // Filtered dataset
  const query = searchQuery.trim().toLowerCase();
  const filteredData = activeDataset === 'alerts'
    ? (rawData as AlertResponse[]).filter(a => {
        const matchesRisk =
          riskFilter === 'All' ||
          a.risk_level.toLowerCase() === riskFilter.toLowerCase() ||
          (riskFilter === 'High' && a.risk_level.toLowerCase() === 'critical');
        const matchesSearch =
          !query ||
          String(a.id).includes(query) ||
          a.message.toLowerCase().includes(query) ||
          a.alert_type.toLowerCase().includes(query) ||
          a.risk_level.toLowerCase().includes(query) ||
          (a.zone_name && a.zone_name.toLowerCase().includes(query));
        return matchesRisk && matchesSearch;
      })
    : (rawData as ReadingResponse[]).filter(r => {
        const matchesRisk =
          riskFilter === 'All' ||
          r.fire_risk.toLowerCase() === riskFilter.toLowerCase();
        const matchesSearch =
          !query ||
          String(r.id).includes(query) ||
          r.fire_risk.toLowerCase().includes(query) ||
          String(r.temperature).includes(query) ||
          String(r.humidity).includes(query) ||
          String(r.soil_moisture).includes(query) ||
          String(r.wind_speed).includes(query) ||
          (r.zone_name && r.zone_name.toLowerCase().includes(query));
        return matchesRisk && matchesSearch;
      });

  // Pagination calculations
  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const start = (currentPage - 1) * pageSize;
  const paginatedData = filteredData.slice(start, start + pageSize);

  // Counts for each card
  const getCardCount = (exportKey: string) => {
    switch (exportKey) {
      case 'sensor':
        return readings.length;
      case 'fire_risk':
        return readings.length;
      case 'alerts':
        return alerts.length;
      case 'incidents':
        return readings.filter(r => r.fire_risk === 'High').length;
      case 'historical':
        return readings.length;
      default:
        return 0;
    }
  };

  return (
    <div className="download-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Download size={28} /> Data Download & Inspection
          </h1>
          <p className="page-subtitle">
            Download CSV files or inspect actual real-time database records directly in the viewer below
          </p>
        </div>
      </div>

      {/* Record Limit Config */}
      <div className="download-config glass-card">
        <div className="config-row">
          <label>
            <Clock size={16} /> Max Records
          </label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="config-select"
          >
            <option value={100}>100 records</option>
            <option value={500}>500 records</option>
            <option value={1000}>1,000 records</option>
            <option value={5000}>5,000 records</option>
            <option value={10000}>All available</option>
          </select>
          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchData}
            title="Refresh database records"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCw size={14} className={loadingData ? 'spin-icon' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Dataset Cards */}
      <div className="download-grid">
        {EXPORT_OPTIONS.map((opt) => {
          const isSelected = activeDataset === opt.exportKey;
          const count = getCardCount(opt.exportKey);
          return (
            <div
              key={opt.exportKey}
              className={`download-card glass-card ${isSelected ? 'active-preview-card' : ''}`}
              style={{
                borderColor: isSelected ? opt.color : undefined,
              }}
            >
              <div className="download-card-header">
                <div
                  className="download-card-icon"
                  style={{
                    color: opt.color,
                    background: `${opt.color}15`,
                    border: `1px solid ${opt.color}30`,
                  }}
                >
                  {opt.icon}
                </div>
                <div className="download-card-info">
                  <div className="download-card-title-row">
                    <h3>{opt.title}</h3>
                    <span className="download-count-badge" style={{ color: opt.color }}>
                      {count} {opt.badgeLabel.toLowerCase()}
                    </span>
                  </div>
                  <p>{opt.description}</p>
                </div>
              </div>

              <div className="download-card-actions">
                <button
                  className={`btn btn-sm ${isSelected ? 'btn-accent-active' : 'btn-secondary'}`}
                  onClick={() => handleSelectDataset(opt.exportKey)}
                  title="View data table directly on this page"
                >
                  <Eye size={15} />
                  {isSelected ? 'Viewing' : 'View Data'}
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDownload(opt.id, opt.exportKey)}
                  disabled={downloading === opt.exportKey}
                  title="Download as CSV file"
                >
                  {downloading === opt.exportKey ? (
                    <span className="btn-loading">
                      <span className="loading-spinner small" /> Downloading...
                    </span>
                  ) : (
                    <>
                      <FileDown size={15} /> Download CSV
                    </>
                  )}
                </button>
              </div>

              {isSelected && (
                <div className="card-active-indicator" style={{ background: opt.color }} />
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <div className={`download-message ${message.startsWith('✅') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}

      {/* ============================================================
          IN-PLACE DATA PREVIEW TABLE
          ============================================================ */}
      <div ref={previewRef} className="data-preview-section glass-card">
        {/* Preview Section Header */}
        <div className="data-preview-header">
          <div className="preview-header-left">
            <div
              className="preview-badge-icon"
              style={{
                color: currentOption.color,
                background: `${currentOption.color}20`,
              }}
            >
              {currentOption.icon}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 className="preview-title">{currentOption.title} Preview</h2>
                <span className="preview-count-pill">
                  {filteredData.length} {filteredData.length === 1 ? 'Record' : 'Records'}
                </span>
              </div>
              <p className="preview-subtitle">
                Live database records ({activeDataset === 'alerts' ? 'alerts table' : 'sensor_predictions table'}).
              </p>
            </div>
          </div>

          <div className="preview-header-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadCurrentView}
              disabled={filteredData.length === 0}
              title="Download currently filtered view as CSV"
            >
              <FileDown size={15} /> Export View CSV
            </button>
            <button
              className="btn btn-secondary btn-sm btn-icon-only"
              onClick={fetchData}
              title="Reload from database"
            >
              <RotateCw size={15} className={loadingData ? 'spin-icon' : ''} />
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="preview-toolbar">
          <div className="preview-search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder={
                activeDataset === 'alerts'
                  ? 'Search alerts by message, type, zone...'
                  : 'Search by temp, humidity, risk, id...'
              }
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="preview-search-input"
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Risk Level Filter */}
          <div className="preview-risk-pills">
            <span className="filter-label">Risk:</span>
            {['All', 'High', 'Medium', 'Low'].map((level) => (
              <button
                key={level}
                className={`risk-pill-btn ${riskFilter === level ? 'active' : ''}`}
                style={{
                  borderColor:
                    riskFilter === level
                      ? level === 'High'
                        ? '#ef4444'
                        : level === 'Medium'
                        ? '#eab308'
                        : level === 'Low'
                        ? '#22c55e'
                        : 'var(--accent-blue)'
                      : undefined,
                  color:
                    riskFilter === level
                      ? level === 'High'
                        ? '#ef4444'
                        : level === 'Medium'
                        ? '#eab308'
                        : level === 'Low'
                        ? '#22c55e'
                        : '#60a5fa'
                      : undefined,
                }}
                onClick={() => {
                  setRiskFilter(level);
                  setCurrentPage(1);
                }}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Page size selector */}
          <div className="preview-page-size">
            <label>Rows:</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="page-size-select"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="preview-table-container">
          {loadingData ? (
            <div className="table-loading-state">
              <span className="loading-spinner" />
              <p>Loading records from database...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="table-empty-state">
              <AlertCircle size={36} style={{ color: 'var(--text-muted)' }} />
              <h4>No records found</h4>
              <p>
                {searchQuery || riskFilter !== 'All'
                  ? 'No records match your active search or risk filters.'
                  : 'No data currently stored in this category.'}
              </p>
              {(searchQuery || riskFilter !== 'All') && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setSearchQuery('');
                    setRiskFilter('All');
                    setCurrentPage(1);
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : activeDataset === 'alerts' ? (
            /* Alerts Table */
            <table className="preview-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}># ID</th>
                  <th style={{ width: 170 }}>Date & Time</th>
                  <th style={{ width: 110 }}>Risk Level</th>
                  <th style={{ width: 140 }}>Alert Type</th>
                  <th>Message</th>
                  <th style={{ width: 120 }}>Zone / Point</th>
                  <th style={{ width: 100 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(paginatedData as AlertResponse[]).map((alert) => (
                  <tr key={alert.id}>
                    <td className="cell-mono text-muted">#{alert.id}</td>
                    <td className="cell-time">
                      <div className="time-primary">{formatDateTime(alert.created_at)}</div>
                      <div className="time-relative">{formatRelativeTime(alert.created_at)}</div>
                    </td>
                    <td>
                      <span
                        className="badge-risk-pill"
                        style={{
                          background: `${getRiskColor(alert.risk_level === 'Critical' ? 'High' : alert.risk_level)}15`,
                          borderColor: `${getRiskColor(alert.risk_level === 'Critical' ? 'High' : alert.risk_level)}40`,
                          color: getRiskColor(alert.risk_level === 'Critical' ? 'High' : alert.risk_level),
                        }}
                      >
                        {alert.risk_level === 'Critical' ? 'High' : alert.risk_level}
                      </span>
                    </td>
                    <td className="cell-mono text-xs">{alert.alert_type}</td>
                    <td className="cell-message">{alert.message}</td>
                    <td>
                      <span className="zone-tag">
                        {alert.zone_name || `Point-${alert.prediction_id || alert.id}`}
                      </span>
                    </td>
                    <td>
                      {alert.is_acknowledged ? (
                        <span className="status-badge acknowledged">
                          <CheckCircle size={13} /> Acknowledged
                        </span>
                      ) : (
                        <span className="status-badge active">
                          <span className="pulse-dot" /> Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Sensor / Predictions Table */
            <table className="preview-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}># ID</th>
                  <th style={{ width: 170 }}>Date & Time</th>
                  <th>Temperature</th>
                  <th>Humidity</th>
                  <th>Soil Moisture</th>
                  <th>Wind Telemetry</th>
                  <th>Precipitation</th>
                  <th>Fire Risk</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {(paginatedData as ReadingResponse[]).map((reading) => {
                  const riskColor = getRiskColor(reading.fire_risk);
                  return (
                    <tr key={reading.id}>
                      <td className="cell-mono text-muted">#{reading.id}</td>
                      <td className="cell-time">
                        <div className="time-primary">{formatDateTime(reading.created_at)}</div>
                        <div className="time-relative">{formatRelativeTime(reading.created_at)}</div>
                      </td>
                      <td className="cell-mono">
                        <span
                          className="metric-value temp-metric"
                          style={{
                            color:
                              reading.temperature > 40
                                ? '#ef4444'
                                : reading.temperature > 30
                                ? '#f97316'
                                : '#3b82f6',
                          }}
                        >
                          {reading.temperature.toFixed(1)}°C
                        </span>
                      </td>
                      <td className="cell-mono">{reading.humidity.toFixed(1)}%</td>
                      <td className="cell-mono">{reading.soil_moisture.toFixed(1)}%</td>
                      <td className="cell-mono">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span>{reading.wind_speed.toFixed(1)} m/s</span>
                          {reading.wind_direction != null && (
                            <span className="text-muted text-xs">
                              {reading.wind_direction.toFixed(0)}° (
                              {getWindDirectionLabel(reading.wind_direction)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="cell-mono">
                        {reading.precipitation != null ? `${reading.precipitation.toFixed(1)} mm` : '0.0 mm'}
                      </td>
                      <td>
                        <span
                          className="badge-risk-pill"
                          style={{
                            background: `${riskColor}18`,
                            borderColor: `${riskColor}50`,
                            color: riskColor,
                            boxShadow:
                              reading.fire_risk === 'High'
                                ? '0 0 10px rgba(239, 68, 68, 0.25)'
                                : undefined,
                          }}
                        >
                          {reading.fire_risk === 'High' ? '🔥 ' : ''}
                          {reading.fire_risk}
                        </span>
                      </td>
                      <td className="cell-mono">
                        <div className="confidence-pill">
                          <div
                            className="confidence-fill"
                            style={{
                              width: `${Math.round(reading.confidence * 100)}%`,
                              background: riskColor,
                            }}
                          />
                          <span className="confidence-text">
                            {formatConfidence(reading.confidence)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Footer & Pagination */}
        {filteredData.length > 0 && (
          <div className="preview-pagination-bar">
            <div className="pagination-info">
              Showing{' '}
              <strong>
                {(currentPage - 1) * pageSize + 1} -{' '}
                {Math.min(currentPage * pageSize, filteredData.length)}
              </strong>{' '}
              of <strong>{filteredData.length}</strong> records
              {filteredData.length !== rawData.length && (
                <span className="text-muted"> (filtered from {rawData.length} total)</span>
              )}
            </div>

            <div className="pagination-controls">
              <button
                className="btn btn-secondary btn-sm pagination-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={16} /> Previous
              </button>

              <span className="pagination-pages">
                Page {currentPage} of {totalPages}
              </span>

              <button
                className="btn btn-secondary btn-sm pagination-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
