import { useRef, useState, type ReactNode } from "react";

/**
 * Click-to-edit field with no Save/Cancel chrome and no edit icon: the display
 * reads as normal text/value until clicked, then becomes an input that
 * **commits on blur or Enter** and **reverts on Esc**. Shared by the Tasks and
 * Health rows so both cards edit the same way.
 *
 * - `display` lets the resting state render a formatted label (e.g. "7h 30m")
 *   while the input edits the raw `value` ("7.5").
 * - `placeholder` renders a faint "add" affordance when `value` is empty.
 * - `allowEmpty` permits committing an empty string (callers map it to null for
 *   optional fields); otherwise an empty edit reverts.
 *
 * `className` is applied to both the display button and the input so callers can
 * keep per-field typography/width; `inline-text` / `inline-input` carry the
 * shared affordance + field chrome.
 */
export function InlineText({
  value,
  onCommit,
  display,
  placeholder,
  allowEmpty = false,
  className = "",
  ariaLabel,
  inputMode,
}: {
  value: string;
  onCommit: (next: string) => void;
  display?: ReactNode;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
  ariaLabel?: string;
  inputMode?: "text" | "numeric" | "decimal";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);

  const start = () => {
    setDraft(value);
    cancelled.current = false;
    setEditing(true);
  };

  const finish = () => {
    setEditing(false);
    if (cancelled.current) return;
    const next = draft.trim();
    if (next === value) return;
    if (next === "" && !allowEmpty) return;
    onCommit(next);
  };

  if (editing) {
    return (
      <input
        className={`inline-input ${className}`.trim()}
        value={draft}
        autoFocus
        aria-label={ariaLabel}
        inputMode={inputMode}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    );
  }

  if (value === "" && placeholder) {
    return (
      <button type="button" className={`inline-text inline-add ${className}`.trim()} onClick={start}>
        {placeholder}
      </button>
    );
  }

  return (
    <button type="button" className={`inline-text ${className}`.trim()} onClick={start}>
      {display ?? value}
    </button>
  );
}
