import { useCallback, useEffect, useRef, useState } from "react";
import { useCreateFocusSession, useFocusSessions } from "../lib/focus";
import { useClampList } from "../lib/useClampList";
import { Card } from "./Card";
import { ClippedNote } from "./ClippedNote";

/**
 * Focus Timer — Pomodoro intervals with session history.
 *
 * **Fit strategy:** timer display and controls NEVER drop. The session
 * history list clamps with `useClampList` and is shedable at 1x1 via
 * `data-drop-order`.
 */

const PRESETS = [
  { label: "Focus", seconds: 25 * 60 },
  { label: "Short break", seconds: 5 * 60 },
  { label: "Long break", seconds: 15 * 60 },
] as const;

type Phase = "idle" | "running" | "paused";

const pad = (n: number) => String(n).padStart(2, "0");
const fmtTime = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
const fmtTotal = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export function TimerCard() {
  const { data } = useFocusSessions();
  const createSession = useCreateFocusSession();
  const { ref, clippedCount } = useClampList<HTMLUListElement>();

  const [presetIdx, setPresetIdx] = useState(0);
  const [remaining, setRemaining] = useState(PRESETS[0].seconds);
  const [phase, setPhase] = useState<Phase>("idle");
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Safe: presetIdx is always 0–2, but TS can't prove PRESETS[number] is defined.
  const preset = PRESETS[presetIdx] ?? PRESETS[0];
  const totalDuration = preset.seconds;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    setPhase("running");
    setSessionStart(Date.now());
    clearTimer();
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  const pause = useCallback(() => {
    setPhase("paused");
    clearTimer();
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setPhase("idle");
    setRemaining(preset.seconds);
    setSessionStart(null);
  }, [clearTimer, preset.seconds]);

  // When the timer hits 0, record the session.
  useEffect(() => {
    if (remaining === 0 && phase === "running") {
      setPhase("idle");
      if (sessionStart && preset.label === "Focus") {
        createSession.mutate({
          startedAt: sessionStart,
          duration: totalDuration,
          completed: true,
        });
      }
      setRemaining(preset.seconds);
      setSessionStart(null);
    }
  }, [remaining, phase, sessionStart, totalDuration, preset, createSession]);

  useEffect(() => clearTimer, [clearTimer]);

  const switchPreset = (idx: number) => {
    if (phase !== "idle") return;
    const p = PRESETS[idx];
    if (!p) return;
    setPresetIdx(idx);
    setRemaining(p.seconds);
  };

  const skip = () => {
    clearTimer();
    if (sessionStart && preset.label === "Focus") {
      const elapsed = totalDuration - remaining;
      if (elapsed > 0) {
        createSession.mutate({
          startedAt: sessionStart,
          duration: elapsed,
          completed: false,
        });
      }
    }
    setPhase("idle");
    setRemaining(preset.seconds);
    setSessionStart(null);
  };

  const todayTotal = data?.todayTotal ?? 0;
  const sessions = data?.sessions ?? [];

  return (
    <Card title="Focus Timer" pillar="timer">
      <div className="timer-display">
        <div className="timer-presets">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              className={`timer-preset${i === presetIdx ? " is-active" : ""}`}
              onClick={() => switchPreset(i)}
              disabled={phase !== "idle"}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="timer-countdown">{fmtTime(remaining)}</div>

        <div className="timer-controls">
          {phase === "idle" && (
            <button type="button" className="timer-btn timer-btn-start" onClick={start}>
              Start
            </button>
          )}
          {phase === "running" && (
            <>
              <button type="button" className="timer-btn" onClick={pause}>Pause</button>
              <button type="button" className="timer-btn" onClick={skip}>Skip</button>
            </>
          )}
          {phase === "paused" && (
            <>
              <button type="button" className="timer-btn timer-btn-start" onClick={start}>
                Resume
              </button>
              <button type="button" className="timer-btn" onClick={reset}>Reset</button>
            </>
          )}
        </div>

        <p className="timer-today">
          Today: <strong>{fmtTotal(todayTotal)}</strong>
        </p>
      </div>

      <div data-drop-order="1">
        {sessions.length > 0 && (
          <>
            <ul className="timer-history" ref={ref}>
              {sessions.map((s) => (
                <li key={s.id} className={`timer-session${s.completed ? "" : " is-skipped"}`}>
                  <span className="timer-session-time">
                    {new Date(s.startedAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="timer-session-dur">{fmtTotal(s.duration)}</span>
                  {!s.completed && <span className="timer-session-tag">skipped</span>}
                </li>
              ))}
            </ul>
            <ClippedNote count={clippedCount} noun="session" />
          </>
        )}
      </div>
    </Card>
  );
}
