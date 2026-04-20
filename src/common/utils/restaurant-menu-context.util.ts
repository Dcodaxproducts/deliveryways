const DEFAULT_MENU_TIMEZONE = 'Asia/Karachi';
const DAY_ORDER = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

type DayName = (typeof DAY_ORDER)[number];

type TimingWindow = {
  day: DayName;
  startMinutes: number;
  endMinutes: number;
};

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function parseMinutes(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function normalizeDay(value: unknown): DayName | null {
  if (typeof value !== 'string') {
    return null;
  }

  const upper = value.trim().toUpperCase();
  return DAY_ORDER.includes(upper as DayName) ? (upper as DayName) : null;
}

function nextDay(day: DayName): DayName {
  const index = DAY_ORDER.indexOf(day);
  return DAY_ORDER[(index + 1) % DAY_ORDER.length];
}

function extractWindows(timingConfig: unknown): TimingWindow[] {
  const config = toObject(timingConfig);
  const rawWindows = Array.isArray(config.windows) ? config.windows : [];

  return rawWindows
    .map((windowValue) => {
      const windowObject = toObject(windowValue);
      const day = normalizeDay(windowObject.day);
      const startMinutes = parseMinutes(windowObject.start);
      const endMinutes = parseMinutes(windowObject.end);

      if (!day || startMinutes === null || endMinutes === null) {
        return null;
      }

      return {
        day,
        startMinutes,
        endMinutes,
      } satisfies TimingWindow;
    })
    .filter((window): window is TimingWindow => window !== null);
}

function resolveTimezone(timingConfig: unknown): string {
  const config = toObject(timingConfig);
  return typeof config.timezone === 'string' && config.timezone.trim().length
    ? config.timezone.trim()
    : DEFAULT_MENU_TIMEZONE;
}

function getLocalDateParts(orderTime: string | Date, timezone: string) {
  const date = orderTime instanceof Date ? orderTime : new Date(orderTime);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = normalizeDay(
    parts.find((part) => part.type === 'weekday')?.value,
  );
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? NaN);
  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value ?? NaN,
  );

  if (!weekday || Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return {
    weekday,
    minutes: hour * 60 + minute,
  };
}

export function isRestaurantMenuAvailableAt(
  timingConfig: unknown,
  orderTime: string | Date,
): boolean {
  const windows = extractWindows(timingConfig);
  if (!windows.length) {
    return false;
  }

  const preferredTimezone = resolveTimezone(timingConfig);
  const local =
    getLocalDateParts(orderTime, preferredTimezone) ??
    getLocalDateParts(orderTime, DEFAULT_MENU_TIMEZONE);

  if (!local) {
    return false;
  }

  return windows.some((window) => {
    if (window.startMinutes <= window.endMinutes) {
      return (
        local.weekday === window.day &&
        local.minutes >= window.startMinutes &&
        local.minutes < window.endMinutes
      );
    }

    return (
      (local.weekday === window.day && local.minutes >= window.startMinutes) ||
      (local.weekday === nextDay(window.day) &&
        local.minutes < window.endMinutes)
    );
  });
}
