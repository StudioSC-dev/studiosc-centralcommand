/**
 * Condition glyph derived from an OpenWeatherMap icon code (e.g. "01d", "10n").
 * The first two digits select the condition; the d/n suffix switches day/night.
 * Color comes from a `wx-*` class (theme-aware, defined in styles.css) so the glyph
 * tints the surrounding weather visuals via `currentColor`.
 */

type Group =
  | "clear-day"
  | "clear-night"
  | "clouds-day"
  | "clouds-night"
  | "clouds"
  | "rain"
  | "thunder"
  | "snow"
  | "mist";

export function weatherGroup(icon: string): Group {
  const code = icon.slice(0, 2);
  const night = icon.endsWith("n");
  switch (code) {
    case "01":
      return night ? "clear-night" : "clear-day";
    case "02":
      return night ? "clouds-night" : "clouds-day";
    case "03":
    case "04":
      return "clouds";
    case "09":
    case "10":
      return "rain";
    case "11":
      return "thunder";
    case "13":
      return "snow";
    case "50":
      return "mist";
    default:
      return "clouds";
  }
}

const Sun = () => (
  <>
    <circle cx="12" cy="12" r="4.4" />
    <line x1="12" y1="2.5" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="21.5" />
    <line x1="2.5" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="21.5" y2="12" />
    <line x1="5.2" y1="5.2" x2="6.9" y2="6.9" />
    <line x1="17.1" y1="17.1" x2="18.8" y2="18.8" />
    <line x1="5.2" y1="18.8" x2="6.9" y2="17.1" />
    <line x1="17.1" y1="6.9" x2="18.8" y2="5.2" />
  </>
);

const Moon = () => <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />;

const Cloud = ({ y = 0 }: { y?: number }) => (
  <path
    d={`M7 ${18 + y}a4 4 0 0 1 .4-8 5.5 5.5 0 0 1 10.6 1.4A3.6 3.6 0 0 1 17.5 ${18 + y}z`}
  />
);

/** Small sun/moon peeking behind a cloud (few-clouds conditions). */
const PartlyCloud = ({ night }: { night: boolean }) => (
  <>
    {night ? (
      <path d="M16 4.5a4 4 0 0 0 .2 6.8 3.5 3.5 0 1 1-4-5.6 4 4 0 0 0 3.8-1.2z" />
    ) : (
      <g>
        <circle cx="8.5" cy="8" r="2.6" />
        <line x1="8.5" y1="2.4" x2="8.5" y2="3.8" />
        <line x1="3.4" y1="8" x2="4.8" y2="8" />
        <line x1="4.6" y1="4.1" x2="5.6" y2="5.1" />
      </g>
    )}
    <Cloud y={1.5} />
  </>
);

export function WeatherGlyph({ icon, size = 40 }: { icon: string; size?: number }) {
  const group = weatherGroup(icon);
  return (
    <svg
      className={`weather-glyph wx-${group}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={group.replace("-", " ")}
    >
      {group === "clear-day" && <Sun />}
      {group === "clear-night" && <Moon />}
      {group === "clouds-day" && <PartlyCloud night={false} />}
      {group === "clouds-night" && <PartlyCloud night={true} />}
      {group === "clouds" && <Cloud />}
      {group === "rain" && (
        <>
          <Cloud />
          <line className="wx-drop" x1="9" y1="20" x2="8" y2="22.5" />
          <line className="wx-drop" x1="12.5" y1="20" x2="11.5" y2="22.5" />
          <line className="wx-drop" x1="16" y1="20" x2="15" y2="22.5" />
        </>
      )}
      {group === "thunder" && (
        <>
          <Cloud />
          <path className="wx-bolt" d="M12.5 18l-2.5 4h2l-1 3 3.5-5h-2z" />
        </>
      )}
      {group === "snow" && (
        <>
          <Cloud />
          <line x1="9" y1="21" x2="9" y2="21" />
          <line x1="12" y1="22" x2="12" y2="22" />
          <line x1="15" y1="21" x2="15" y2="21" />
        </>
      )}
      {group === "mist" && (
        <>
          <line x1="3.5" y1="8.5" x2="20.5" y2="8.5" />
          <line x1="3.5" y1="12" x2="20.5" y2="12" />
          <line x1="3.5" y1="15.5" x2="20.5" y2="15.5" />
        </>
      )}
    </svg>
  );
}
