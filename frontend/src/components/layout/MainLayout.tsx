import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AIAssistantDrawer from '../ai/AIAssistantDrawer';
import { healthApi } from '../../services/api';

export default function MainLayout() {
  const [systemOnline, setSystemOnline] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = () => {
      healthApi.check()
        .then((res) => {
          if (mounted) setSystemOnline(res.status === 'ok');
        })
        .catch(() => {
          if (mounted) setSystemOnline(false);
        });
    };

    check();
    const interval = setInterval(check, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="app-layout">
      <Sidebar systemOnline={systemOnline} />
      <main className="main-content">
        <Outlet />
      </main>
      <AIAssistantDrawer />
    </div>
  );
}
