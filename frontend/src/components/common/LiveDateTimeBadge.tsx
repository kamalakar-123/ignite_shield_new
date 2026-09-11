import { useState, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';

export default function LiveDateTimeBadge() {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentDateTime.toLocaleDateString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = currentDateTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="top-datetime-pill" title="Current Live Date & Time">
      <div className="datetime-item">
        <Calendar size={15} className="datetime-icon" />
        <span>{formattedDate}</span>
      </div>
      <span className="datetime-divider">•</span>
      <div className="datetime-item">
        <Clock size={15} className="datetime-icon" />
        <span className="datetime-time">{formattedTime}</span>
      </div>
    </div>
  );
}
