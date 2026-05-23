/**
 * Decode/scramble text effect: characters cycle through random glyphs
 * and lock in left-to-right until the target string is shown.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const SCRAMBLE_CHARS = "!<>-_\\/[]{}—=+*^?#@&%$";

interface UseScrambleTextOptions {
  target: string;
  // Total duration in ms; the effect distributes character reveals across this window.
  duration?: number;
  // If true, run automatically on mount.
  autoStart?: boolean;
}

export function useScrambleText({
  target,
  duration = 700,
  autoStart = true,
}: UseScrambleTextOptions) {
  const [text, setText] = useState(autoStart ? "" : target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      // Number of characters fully revealed (left-aligned lock-in).
      const revealed = Math.floor(progress * target.length);

      let out = "";
      for (let i = 0; i < target.length; i++) {
        if (i < revealed) {
          out += target[i];
        } else if (target[i] === " ") {
          out += " ";
        } else {
          out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      setText(out);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setText(target);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [target, duration, stop]);

  useEffect(() => {
    if (autoStart) start();
    return stop;
  }, [autoStart, start, stop]);

  return { text, start };
}
