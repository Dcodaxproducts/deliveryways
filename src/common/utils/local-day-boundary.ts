export function restaurantLocalDayBoundary(
  localDate: string,
  timezone: string,
  nextDay = false,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new RangeError('Invalid local date');

  const ordinal = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (nextDay) ordinal.setUTCDate(ordinal.getUTCDate() + 1);
  const targetAsUtc = Date.UTC(
    ordinal.getUTCFullYear(),
    ordinal.getUTCMonth(),
    ordinal.getUTCDate(),
  );
  let candidate = new Date(targetAsUtc);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const representedAsUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute'),
      read('second'),
    );
    candidate = new Date(candidate.getTime() + targetAsUtc - representedAsUtc);
  }

  return candidate;
}
