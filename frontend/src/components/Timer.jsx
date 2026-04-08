import React, { useState, useEffect } from 'react';

export default function Timer({ targetTime, label = 'Starts in' }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const target = new Date(targetTime).getTime();

    function update() {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setExpired(true);
        setTimeLeft('00:00:00');
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setTimeLeft(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  if (expired) return null;

  return (
    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
      <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
      <div>
        <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-mono font-bold text-emerald-800 tracking-widest">{timeLeft}</p>
      </div>
    </div>
  );
}
