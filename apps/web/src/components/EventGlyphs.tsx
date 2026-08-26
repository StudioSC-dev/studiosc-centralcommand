import type { ConferenceProvider, TravelMode } from "@central-command/types";

/**
 * Inline glyphs for event rows — a video badge for calls, a walker or car for
 * travel. Same approach as WeatherGlyph: stroked SVG on `currentColor`, sized in
 * CSS, `aria-hidden` because the row's text already says what it is.
 *
 * One shape for every conference provider, deliberately. Brand marks would mean
 * shipping Zoom's and Microsoft's trademarks in a portfolio project, and at
 * 13px they are indistinguishable anyway — the provider name is on the dialog's
 * Join button, where there is room to read it.
 */
export function ConferenceGlyph({ provider }: { provider: ConferenceProvider }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-provider={provider}
    >
      <path d="M15 10l6-3.5v11L15 14" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function TravelGlyph({ mode }: { mode: TravelMode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {mode === "walk" ? (
        <>
          <circle cx="12" cy="4" r="2" />
          <path d="M10 21l1.5-6L9 12V8l4-1 3 3 3 1" />
          <path d="M11 15l-2 6" />
        </>
      ) : (
        <>
          <path d="M5 17h14M6.5 17v2M17.5 17v2" />
          <path d="M4 17l1.6-5.2A2 2 0 017.5 10h9a2 2 0 011.9 1.8L20 17z" />
        </>
      )}
    </svg>
  );
}

/** Shown where a departure has already passed — the "leave now" state. */
export function ClockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PinGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
