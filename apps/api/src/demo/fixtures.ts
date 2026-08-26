import type { CalendarData, CalendarEvent, WeatherData } from "@central-command/types";

/**
 * Request-time fixtures for the demo's live-fetch pillars (weather, calendar).
 * Computed relative to "now" so the demo always looks current without any
 * OpenWeatherMap / Google call (and without seeding time-sensitive rows).
 */

/** Today at the given local hour:minute, as epoch ms. */
function todayAt(hour: number, minute = 0): number {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function demoWeather(): WeatherData {
  const now = Date.now();
  const forecast = Array.from({ length: 8 }, (_, i) => {
    const at = now + i * 3 * HOUR;
    const temp = 21 + Math.round(3 * Math.sin(i / 2));
    const wet = i === 3 || i === 4;
    return {
      at,
      temp,
      pop: wet ? 0.4 : 0,
      description: wet ? "light rain" : "few clouds",
      icon: wet ? "10d" : "02d",
    };
  });

  const daily = Array.from({ length: 5 }, (_, i) => {
    const date = new Date(now + i * DAY).toISOString().slice(0, 10);
    const base = 19 + i;
    return {
      date,
      min: base - 4,
      max: base + 5,
      pop: i === 1 ? 0.5 : i === 3 ? 0.2 : 0,
      icon: i === 1 ? "10d" : i % 2 === 0 ? "01d" : "03d",
    };
  });

  return {
    location: { lat: 40.71, lon: -74.01, label: "New York, NY" },
    units: "metric",
    current: {
      temp: 22,
      feelsLike: 21,
      humidity: 58,
      windSpeed: 4,
      windDeg: 210,
      windGust: 7,
      pressure: 1014,
      clouds: 30,
      visibility: 10000,
      sunrise: todayAt(6, 12),
      sunset: todayAt(19, 48),
      timezoneOffsetSec: 0,
      rain1h: null,
      description: "few clouds",
      icon: "02d",
      observedAt: now,
    },
    forecast,
    daily,
  };
}

export function demoCalendar(): CalendarData {
  const ev = (
    id: string,
    title: string,
    dayOffset: number,
    startH: number,
    durMin: number,
    location: string | null = null,
    extra: Partial<CalendarEvent> = {},
  ): CalendarEvent => {
    const start = todayAt(startH) + dayOffset * DAY;
    return { id, title, start, end: start + durMin * 60 * 1000, allDay: false, location, ...extra };
  };

  // The demo is the only place a portfolio visitor sees this feature, so the
  // fixture has to exercise each branch of it rather than a happy path: a Zoom
  // call with a code and passcode, a bare Meet link, a walkable lunch, a drive
  // that is tight, and a plain event with neither call nor location.
  const events = [
    ev("d1", "Morning standup", 0, 9, 15, null, {
      conference: { provider: "meet", url: "https://meet.google.com/abc-defg-hij", label: "Join Google Meet" },
    }),
    ev("d2", "Design review", 0, 11, 60, "https://zoom.us/j/81244609931", {
      conference: {
        provider: "zoom",
        url: "https://zoom.us/j/81244609931",
        label: "Join Zoom Meeting",
        meetingCode: "812 4460 9931",
        passcode: "4417",
      },
      description: "Walk through the revised lighting schedule before the client call.",
    }),
    ev("d3", "Lunch with Sam", 0, 13, 60, "Cafe Mura, Manila", {
      travel: { mode: "walk", minutes: 14, km: 1.1, leaveBy: todayAt(13) - 24 * 60 * 1000, originLabel: null, bufferMinutes: 86 },
      mapLinkUrl: "https://www.google.com/maps/search/?api=1&query=Cafe+Mura%2C+Manila",
    }),
    ev("d4", "Client workshop", 0, 15, 90, "Bonifacio Global City, Taguig", {
      travel: {
        mode: "drive",
        minutes: 27,
        km: 14.2,
        leaveBy: todayAt(15) - 37 * 60 * 1000,
        originLabel: "Cafe Mura, Manila",
        bufferMinutes: 9,
      },
      mapLinkUrl: "https://www.google.com/maps/search/?api=1&query=Bonifacio+Global+City%2C+Taguig",
      attendeeCount: 6,
    }),
    ev("d5", "Gym session", 0, 19, 60),
    ev("d6", "1:1 with manager", 1, 10, 30, null, {
      conference: { provider: "meet", url: "https://meet.google.com/klm-nopq-rst", label: "Join Google Meet" },
    }),
    ev("d7", "Dentist", 2, 15, 45, "Downtown Dental"),
    ev("d8", "Project kickoff", 3, 9, 90, "Room 4B"),
    ev("d9", "Team offsite", 6, 9, 240),
  ].sort((a, b) => a.start - b.start);

  return {
    connected: true,
    events,
    todayBusyness: 48,
    // Above density (48) because the 9-minute connection to the workshop is
    // what actually makes the demo day feel tight — which is the whole point of
    // the second number.
    todayStress: 66,
    stressFactors: [
      { label: "9 min to get out the door", tone: "warn" },
      { label: "4h 25m scheduled", tone: "neutral" },
      { label: "41m in transit", tone: "neutral" },
    ],
  };
}

