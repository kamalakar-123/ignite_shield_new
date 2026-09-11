import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Map,
  BarChart3,
  Bell,
  FileText,
  Download,
  Settings,
  LogOut,
  Flame,
  Shield,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/live-monitoring', icon: Activity, label: 'Live Monitoring' },
  { to: '/fire-map', icon: Map, label: 'Fire Risk Map' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/data-download', icon: Download, label: 'Data Download' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
  systemOnline: boolean;
}

export default function Sidebar({ systemOnline }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const sidebarContent = (
    <div className="sidebar-inner">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon-wrapper">
          <Flame className="logo-flame" size={collapsed ? 24 : 28} />
          <Shield className="logo-shield" size={collapsed ? 16 : 20} />
        </div>
        {!collapsed && (
          <div className="logo-text">
            <span className="logo-title">IGNITE SHIELD</span>
            <span className="logo-subtitle">Command Center</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
            onClick={() => setMobileOpen(false)}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={20} className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="sidebar-bottom">
        {/* System status */}
        <div className="sidebar-status" title={systemOnline ? 'System Online' : 'System Offline'}>
          {systemOnline ? (
            <Wifi size={16} className="status-online" />
          ) : (
            <WifiOff size={16} className="status-offline" />
          )}
          {!collapsed && (
            <span className={systemOnline ? 'status-online' : 'status-offline'}>
              {systemOnline ? 'System Online' : 'Offline'}
            </span>
          )}
        </div>

        {/* User info */}
        {user && !collapsed && (
          <div className="sidebar-user">
            <div className="user-avatar">
              {user.full_name?.charAt(0) || user.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{user.full_name || user.username}</span>
              <span className="user-role">{user.role || 'Officer'}</span>
            </div>
          </div>
        )}

        {/* Dark to Light Mode Option below the name */}
        <button
          type="button"
          className="sidebar-link theme-toggle-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle dark to light mode"
        >
          {theme === 'dark' ? (
            <Sun size={19} className="theme-icon sun" />
          ) : (
            <Moon size={19} className="theme-icon moon" />
          )}
          {!collapsed && (
            <>
              <span className="theme-toggle-title">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
              <span className="theme-switch-indicator">
                <span className={`theme-switch-knob ${theme === 'light' ? 'active' : ''}`} />
              </span>
            </>
          )}
        </button>

        {/* Logout */}
        <button className="sidebar-link logout-btn" onClick={handleLogout} title="Logout">
          <LogOut size={20} />
          {!collapsed && <span>Logout</span>}
        </button>

        {/* Collapse toggle (desktop only) */}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {sidebarContent}
      </aside>
    </>
  );
}
