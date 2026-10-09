import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  X,
  Send,
  Sparkles,
  Thermometer,
  Droplets,
  Wind,
  ShieldAlert,
  Clock,
  Compass,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { aiApi, devicesApi } from '../../services/api';
import type { AIChatResponse, DeviceResponse } from '../../types';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  details?: AIChatResponse;
}

const SUGGESTED_QUERIES = [
  'What is the current fire risk at this monitoring station?',
  'What are the latest sensor readings?',
  'What is the current weather near the incident?',
  'Where is the reported incident?',
  'What should the response team check next?',
  'Summarize the latest incident and its available evidence.',
];

export default function AIAssistantDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello, Ranger. I am the **Ignite Shield AI Assistant**, connected directly to on-site ESP32 telemetry, Open-Meteo weather feeds, and incident logs. How can I assist field operations today?',
      timestamp: new Date(),
    },
  ]);
  const [devices, setDevices] = useState<DeviceResponse[]>([]);
  const [selectedStation, setSelectedStation] = useState('ESP32-NODE-01');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Fetch device list for station selector
  useEffect(() => {
    if (isOpen) {
      devicesApi.getAll()
        .then((res) => {
          if (res && res.length > 0) {
            setDevices(res);
            if (!res.some(d => d.device_id === selectedStation)) {
              setSelectedStation(res[0].device_id);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen, selectedStation]);

  useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input.trim();
    if (!textToSend || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput('');
    setLoading(true);

    try {
      const res = await aiApi.chat({
        message: textToSend,
        station_id: selectedStation,
      });

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        sender: 'assistant',
        text: res.answer,
        timestamp: new Date(res.timestamp || Date.now()),
        details: res,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : 'Network failure communicating with AI service';
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **Unable to complete AI inquiry:** ${errorText}. Please verify backend network connectivity.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        type="button"
        className="ai-floating-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Open Ignite Shield AI Assistant"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 20px',
          background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 50%, #7c2d12 100%)',
          color: '#ffffff',
          borderRadius: '50px',
          border: '1px solid rgba(251, 146, 60, 0.4)',
          boxShadow: '0 8px 32px rgba(234, 88, 12, 0.45)',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '14px',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <Sparkles size={18} className="animate-spin-slow" />
        <span>Ignite AI Assistant</span>
      </button>

      {/* Slide-out Assistant Drawer */}
      {isOpen && (
        <div
          className="ai-assistant-modal glass-card"
          style={{
            position: 'fixed',
            bottom: '84px',
            right: '24px',
            width: '420px',
            maxWidth: 'calc(100vw - 32px)',
            height: '620px',
            maxHeight: 'calc(100vh - 120px)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(251, 146, 60, 0.3)',
            borderRadius: '16px',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(20px)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(180deg, rgba(234, 88, 12, 0.15) 0%, transparent 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: 'rgba(234, 88, 12, 0.25)',
                  border: '1px solid rgba(251, 146, 60, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fb923c',
                }}
              >
                <Bot size={20} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                  Ignite Shield AI
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
                  <span>Telemetry Grounded</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Station select */}
              <select
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '3px 6px',
                  cursor: 'pointer',
                }}
                title="Select monitoring node for context"
              >
                {devices.length > 0 ? (
                  devices.map((d) => (
                    <option key={d.device_id} value={d.device_id}>
                      {d.device_id}
                    </option>
                  ))
                ) : (
                  <option value="ESP32-NODE-01">ESP32-NODE-01</option>
                )}
              </select>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                }}
              >
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: msg.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    background:
                      msg.sender === 'user'
                        ? 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)'
                        : 'rgba(30, 41, 59, 0.85)',
                    border:
                      msg.sender === 'user'
                        ? '1px solid rgba(251, 146, 60, 0.3)'
                        : '1px solid rgba(148, 163, 184, 0.15)',
                    color: '#f8fafc',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.text}
                </div>

                {/* Grounding Details Card for Assistant Responses */}
                {msg.details && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '10px 12px',
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  >
                    {/* Header info */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: '#94a3b8',
                        marginBottom: '6px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        paddingBottom: '4px',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Cpu size={12} /> Provider: <strong>{msg.details.provider}</strong>
                      </span>
                      {msg.details.data_freshness_seconds !== null && msg.details.data_freshness_seconds !== undefined && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> Freshness: {msg.details.data_freshness_seconds}s
                        </span>
                      )}
                    </div>

                    {/* Measured Facts Badges */}
                    {msg.details.measured_facts && (
                      <div style={{ marginBottom: '6px' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>Measured Facts:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                          <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Thermometer size={11} /> {msg.details.measured_facts.temperature_celsius}°C
                          </span>
                          <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Droplets size={11} /> {msg.details.measured_facts.humidity_percent}%
                          </span>
                          <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            Soil: {msg.details.measured_facts.soil_moisture_percent}%
                          </span>
                          <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <ShieldAlert size={11} /> Risk: {msg.details.measured_facts.fire_risk} ({msg.details.measured_facts.risk_confidence_percent}%)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* External Weather Badges */}
                    {msg.details.external_weather && (
                      <div style={{ marginBottom: '6px' }}>
                        <span style={{ color: '#a78bfa', fontWeight: 600 }}>External Weather (Open-Meteo):</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                          <span className="badge" style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#c4b5fd', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Wind size={11} /> Wind: {msg.details.external_weather.wind_speed} m/s
                          </span>
                          <span className="badge" style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#c4b5fd', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Compass size={11} /> Dir: {msg.details.external_weather.wind_direction}°
                          </span>
                          <span className="badge" style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#c4b5fd', padding: '2px 6px', borderRadius: '4px' }}>
                            Precip: {msg.details.external_weather.precipitation} mm
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Recommendations Checklist */}
                    {msg.details.recommendations && msg.details.recommendations.length > 0 && (
                      <div>
                        <span style={{ color: '#4ade80', fontWeight: 600 }}>Tactical Next Actions:</span>
                        <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px', color: '#cbd5e1' }}>
                          {msg.details.recommendations.map((rec, i) => (
                            <li key={i}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#94a3b8',
                  fontSize: '12px',
                }}
              >
                <RefreshCw size={14} className="animate-spin" />
                <span>Consulting verified station state and live weather...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Suggested Query Chips */}
          <div
            style={{
              padding: '8px 14px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              display: 'flex',
              gap: '6px',
            }}
          >
            {SUGGESTED_QUERIES.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                disabled={loading}
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '16px',
                  padding: '4px 10px',
                  color: '#94a3b8',
                  fontSize: '11px',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fb923c';
                  e.currentTarget.style.borderColor = 'rgba(251, 146, 60, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#94a3b8';
                  e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Footer */}
          <div
            style={{
              padding: '12px 14px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              background: 'rgba(15, 23, 42, 0.8)',
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder="Ask about fire risk, sensor values, weather..."
              disabled={loading}
              style={{
                flex: 1,
                background: 'rgba(30, 41, 59, 0.9)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#f8fafc',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              style={{
                background: input.trim() ? '#ea580c' : 'rgba(234, 88, 12, 0.4)',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 14px',
                color: '#ffffff',
                cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
