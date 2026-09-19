import { useCallback, useEffect, useRef, useState } from 'react';
import './ClearDataDialog.css';

const HOLD_MS = 2000;
const DRAIN_MS = 500;

interface Props {
  vehicleCount: number;
  fillupCount: number;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirmation for a destructive action: instead of a tappable "Yes", the
 * user has to press and hold the button until it fills. Releasing early
 * drains it back, so a stray tap can never wipe the data.
 */
export default function ClearDataDialog({ vehicleCount, fillupCount, onCancel, onConfirm }: Props) {
  const [progress, setProgress] = useState(0); // 0..1
  const [busy, setBusy] = useState(false);
  const progressRef = useRef(0);
  const holding = useRef(false);
  const frame = useRef(0);
  const lastTick = useRef(0);
  const done = useRef(false);

  // One loop drives both directions: fills while held, drains when released.
  const tick = useCallback(
    function tick(now: number) {
      const dt = now - lastTick.current;
      lastTick.current = now;
      const delta = holding.current ? dt / HOLD_MS : -dt / DRAIN_MS;
      const p = Math.min(1, Math.max(0, progressRef.current + delta));
      progressRef.current = p;
      setProgress(p);

      if (p >= 1) {
        done.current = true;
        holding.current = false;
        setBusy(true);
        Promise.resolve(onConfirm()).finally(() => setBusy(false));
        return;
      }
      if (holding.current || p > 0) frame.current = requestAnimationFrame(tick);
    },
    [onConfirm],
  );

  const kick = useCallback(() => {
    cancelAnimationFrame(frame.current);
    lastTick.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  }, [tick]);

  const start = useCallback(() => {
    if (done.current || holding.current) return;
    holding.current = true;
    kick();
  }, [kick]);

  const stop = useCallback(() => {
    if (done.current || !holding.current) return;
    holding.current = false;
    kick();
  }, [kick]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const pct = Math.round(progress * 100);

  return (
    <div className="clear-dialog__backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="clear-dialog card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="clear-dialog__icon" aria-hidden="true">
          ⚠
        </div>
        <h3 id="clear-dialog-title">Clear all data?</h3>
        <p>
          This permanently deletes <strong>{vehicleCount}</strong> vehicle{vehicleCount === 1 ? '' : 's'} and{' '}
          <strong>{fillupCount}</strong> fillup{fillupCount === 1 ? '' : 's'}, along with all service
          records and repeating services. It can&apos;t be undone.
        </p>

        <button
          type="button"
          className="clear-dialog__hold"
          disabled={busy}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start();
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              start();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') stop();
          }}
          onBlur={stop}
        >
          <span className="clear-dialog__hold-fill" style={{ width: `${pct}%` }} />
          <span className="clear-dialog__hold-label">
            {busy ? 'Clearing…' : pct > 0 ? 'Keep holding…' : 'Press and hold to delete everything'}
          </span>
        </button>

        <button type="button" className="clear-dialog__cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
