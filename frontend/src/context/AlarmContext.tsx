import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

interface AlarmContextType {
  isAlarmActive: boolean;
  isAlarmMuted: boolean;
  triggerAlarm: () => void;
  acknowledgeAlarm: () => void;
  muteAlarm: () => void;
  unmuteAlarm: () => void;
  turnOffAlarm: () => void;
}

const AlarmContext = createContext<AlarmContextType | undefined>(undefined);

export function AlarmProvider({ children }: { children: ReactNode }) {
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [isAlarmMuted, setIsAlarmMuted] = useState(() => {
    return localStorage.getItem('ignite_shield_alarm_muted') === 'true';
  });

  const soundIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Resume AudioContext on first user interaction to satisfy browser autoplay policies
  useEffect(() => {
    const handleGesture = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('click', handleGesture, { once: true });
    window.addEventListener('keydown', handleGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, []);

  const playSirenBurst = useCallback(() => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Emergency dual-tone warning siren: 880Hz -> 650Hz -> 880Hz
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(650, now + 0.25);
      osc.frequency.setValueAtTime(880, now + 0.5);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.setValueAtTime(0.28, now + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch (e) {
      console.warn('Emergency alarm sound playback warning:', e);
    }
  }, []);

  const stopAlarmSound = useCallback(() => {
    if (soundIntervalRef.current) {
      window.clearInterval(soundIntervalRef.current);
      soundIntervalRef.current = null;
    }
  }, []);

  const startAlarmLoop = useCallback(() => {
    stopAlarmSound();
    playSirenBurst();
    soundIntervalRef.current = window.setInterval(() => {
      playSirenBurst();
    }, 750);
  }, [playSirenBurst, stopAlarmSound]);

  const triggerAlarm = useCallback(() => {
    setIsAlarmActive(true);
    if (!isAlarmMuted) {
      startAlarmLoop();
    }
  }, [isAlarmMuted, startAlarmLoop]);

  const turnOffAlarm = useCallback(() => {
    setIsAlarmActive(false);
    setIsAlarmMuted(true);
    localStorage.setItem('ignite_shield_alarm_muted', 'true');
    stopAlarmSound();
  }, [stopAlarmSound]);

  const muteAlarm = useCallback(() => {
    setIsAlarmMuted(true);
    setIsAlarmActive(false);
    localStorage.setItem('ignite_shield_alarm_muted', 'true');
    stopAlarmSound();
  }, [stopAlarmSound]);

  const unmuteAlarm = useCallback(() => {
    setIsAlarmMuted(false);
    setIsAlarmActive(true);
    localStorage.setItem('ignite_shield_alarm_muted', 'false');
    startAlarmLoop();
  }, [startAlarmLoop]);

  const acknowledgeAlarm = useCallback(() => {
    setIsAlarmActive(false);
    stopAlarmSound();
  }, [stopAlarmSound]);

  useEffect(() => {
    return () => {
      stopAlarmSound();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stopAlarmSound]);

  return (
    <AlarmContext.Provider
      value={{
        isAlarmActive,
        isAlarmMuted,
        triggerAlarm,
        acknowledgeAlarm,
        muteAlarm,
        unmuteAlarm,
        turnOffAlarm,
      }}
    >
      {children}
    </AlarmContext.Provider>
  );
}

export function useAlarm() {
  const context = useContext(AlarmContext);
  if (context === undefined) {
    throw new Error('useAlarm must be used within an AlarmProvider');
  }
  return context;
}
