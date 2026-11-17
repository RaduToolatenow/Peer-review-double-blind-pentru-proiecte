// Deadlines are entered and shown in Romania's time zone, whatever the browser's zone is.
const ZONE = 'Europe/Bucharest';

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function zoneFields(instant: Date): Record<string, number> {
  return Object.fromEntries(
    parts
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

/** Minutes Romania is ahead of UTC at that instant (120 in winter, 180 in summer). */
function offsetMinutes(instant: Date): number {
  const f = zoneFields(instant);
  return (Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute) - instant.getTime()) / 60000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO instant → value for <input type="datetime-local">, in Romanian time. */
export function toLocalInput(iso: string): string {
  const f = zoneFields(new Date(iso));
  return `${f.year}-${pad(f.month)}-${pad(f.day)}T${pad(f.hour)}:${pad(f.minute)}`;
}

/** Value of <input type="datetime-local">, read as Romanian time → ISO instant. */
export function fromLocalInput(value: string): string {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Take the offset at the guess, then again at the result, so the switch to summer time is right.
  let instant = asUtc - offsetMinutes(new Date(asUtc)) * 60000;
  instant = asUtc - offsetMinutes(new Date(instant)) * 60000;
  return new Date(instant).toISOString();
}

const display = new Intl.DateTimeFormat('ro-RO', { timeZone: ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Short Romanian date and time, such as "8 dec., 23:59". */
export function formatShort(iso: string): string {
  return display.format(new Date(iso));
}
