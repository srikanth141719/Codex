import { useEffect } from 'react';
import confetti from 'canvas-confetti';

export default function ConfettiAnimation({ trigger }) {
  useEffect(() => {
    if (!trigger) return;

    // Fire confetti
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ['#10b981', '#059669', '#34d399', '#6ee7b7', '#fbbf24', '#f9fafb'];

    function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }

    // Initial burst
    confetti({
      particleCount: 100,
      spread: 100,
      origin: { y: 0.6 },
      colors,
    });

    frame();
  }, [trigger]);

  return null;
}
