import type { CalendarData, WeatherData } from "@central-command/types";

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
  const ev = (id: string, title: string, dayOffset: number, startH: number, durMin: number, location: string | null = null) => {
    const start = todayAt(startH) + dayOffset * DAY;
    return { id, title, start, end: start + durMin * 60 * 1000, allDay: false, location };
  };

  const events = [
    ev("d1", "Morning standup", 0, 9, 15),
    ev("d2", "Design review", 0, 11, 60, "Zoom"),
    ev("d3", "Lunch with Sam", 0, 13, 60, "Cafe Mura"),
    ev("d4", "Gym session", 0, 18, 60),
    ev("d5", "1:1 with manager", 1, 10, 30),
    ev("d6", "Dentist", 2, 15, 45, "Downtown Dental"),
    ev("d7", "Project kickoff", 3, 9, 90, "Room 4B"),
    ev("d8", "Team offsite", 6, 9, 240),
  ].sort((a, b) => a.start - b.start);

  return { connected: true, events, todayBusyness: 48 };
}
