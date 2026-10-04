import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import './ResizableSplit.css';

type ResizableSplitProps = {
  left: ReactNode;
  right: ReactNode;
  storageKey?: string;
};

const DIVIDER_WIDTH = 18;
const clamp = (value: number, min = 30, max = 70) => Math.min(max, Math.max(min, value));

function readRatio(key: string) {
  try {
    const stored = localStorage.getItem(key);
    const value = stored === null || stored.trim() === '' ? NaN : Number(stored);
    return Number.isFinite(value) ? clamp(value) : 45;
  } catch {
    return 45;
  }
}

/** Keeps the form and live graph visible together, with a persisted column ratio. */
export function ResizableSplit({
  left,
  right,
  storageKey = 'flow4gold.competition.columnRatio',
}: ResizableSplitProps) {
  const container = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const leftId = useId();
  const [width, setWidth] = useState(0);
  const [preferredRatio, setPreferredRatio] = useState(() => readRatio(storageKey));
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => setPreferredRatio(readRatio(storageKey)), [storageKey]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const available = Math.max(1, width - DIVIDER_WIDTH);
  const stacked = width > 0 && width < 320 + 360 + DIVIDER_WIDTH;
  const min = width && !stacked ? Math.max(30, (320 / available) * 100) : 30;
  const max = width && !stacked ? Math.min(70, (1 - 360 / available) * 100) : 70;
  const ratio = clamp(preferredRatio, min, max);

  function updateRatio(value: number) {
    const next = clamp(value, min, max);
    setPreferredRatio(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      // The splitter remains usable when browser storage is unavailable.
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    const values: Record<string, number> = {
      ArrowLeft: ratio - step,
      ArrowRight: ratio + step,
      Home: min,
      End: max,
    };
    if (!(event.key in values)) return;
    event.preventDefault();
    updateRatio(values[event.key]);
  }

  return (
    <div
      ref={container}
      className={`resizable-split${stacked ? ' resizable-split--stacked' : ''}${isDragging ? ' resizable-split--dragging' : ''}`}
      style={{ '--split-left': `${ratio}fr`, '--split-right': `${100 - ratio}fr` } as CSSProperties}
    >
      <div id={leftId} className="resizable-split__pane resizable-split__pane--left">{left}</div>
      <div
        className="resizable-split__divider"
        role="separator"
        aria-label="Contestant or admin panel width"
        aria-orientation="vertical"
        aria-controls={leftId}
        aria-valuemin={Math.round(min * 10) / 10}
        aria-valuemax={Math.round(max * 10) / 10}
        aria-valuenow={Math.round(ratio * 10) / 10}
        aria-valuetext={`${Math.round(ratio)} percent panel, ${Math.round(100 - ratio)} percent graph`}
        tabIndex={0}
        title="Drag to resize. Use arrow keys, Home or End when focused."
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0 || dragging.current !== null) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = event.pointerId;
          setIsDragging(true);
        }}
        onPointerMove={(event) => {
          if (dragging.current !== event.pointerId || !container.current) return;
          const bounds = container.current.getBoundingClientRect();
          updateRatio(((event.clientX - bounds.left - DIVIDER_WIDTH / 2) / available) * 100);
        }}
        onPointerUp={(event) => {
          if (dragging.current !== event.pointerId) return;
          dragging.current = null;
          setIsDragging(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = null;
          setIsDragging(false);
        }}
        onLostPointerCapture={() => {
          dragging.current = null;
          setIsDragging(false);
        }}
      >
        <span aria-hidden="true" />
      </div>
      <div className="resizable-split__pane resizable-split__pane--right">{right}</div>
    </div>
  );
}
