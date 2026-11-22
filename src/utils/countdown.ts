import { useEffect, useRef, useState } from 'react';

export interface LiveCountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  isExpired: boolean;
}

export function computeCountdownParts(
  targetEndsAtMs: number | null,
  adjustedNowMs: number,
  fallback?: { days?: number; hours?: number; minutes?: number; seconds?: number }
): LiveCountdownParts {
  if (targetEndsAtMs !== null && Number.isFinite(targetEndsAtMs)) {
    const diffMs = Math.max(0, targetEndsAtMs - adjustedNowMs);
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return {
      days,
      hours,
      minutes,
      seconds,
      totalMs: diffMs,
      isExpired: diffMs <= 0,
    };
  }
  const days = Math.max(0, Number(fallback?.days || 0));
  const hours = Math.max(0, Number(fallback?.hours || 0));
  const minutes = Math.max(0, Number(fallback?.minutes || 0));
  const seconds = Math.max(0, Number(fallback?.seconds || 0));
  return {
    days,
    hours,
    minutes,
    seconds,
    totalMs: ((days * 24 + hours) * 60 + minutes) * 60000 + seconds * 1000,
    isExpired: days === 0 && hours === 0 && minutes === 0 && seconds === 0,
  };
}

export function useLiveCountdown(params: {
  endsAt?: string | null;
  serverNow?: string | null;
  fallbackDays?: number;
  fallbackHours?: number;
  fallbackMinutes?: number;
  fallbackSeconds?: number;
  onExpire?: () => void;
}): LiveCountdownParts {
  const { endsAt, serverNow, fallbackDays, fallbackHours, fallbackMinutes, fallbackSeconds, onExpire } = params;

  const targetMs = endsAt ? Date.parse(endsAt) : NaN;
  const validTargetMs = Number.isFinite(targetMs) ? targetMs : null;

  const offsetRef = useRef<number>(0);
  useEffect(() => {
    if (serverNow) {
      const parsedServer = Date.parse(serverNow);
      if (Number.isFinite(parsedServer)) {
        offsetRef.current = parsedServer - Date.now();
      }
    }
  }, [serverNow]);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const expiredFiredRef = useRef<string | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const parts = computeCountdownParts(validTargetMs, nowMs + offsetRef.current, {
    days: fallbackDays,
    hours: fallbackHours,
    minutes: fallbackMinutes,
    seconds: fallbackSeconds,
  });

  useEffect(() => {
    if (validTargetMs !== null && parts.isExpired && onExpire && expiredFiredRef.current !== endsAt) {
      expiredFiredRef.current = endsAt || '__expired__';
      onExpire();
    }
  }, [validTargetMs, parts.isExpired, endsAt, onExpire]);

  return parts;
}
