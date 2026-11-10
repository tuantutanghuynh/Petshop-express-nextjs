// The shop is in Vietnam (UTC+7, no daylight saving): admin date fields are read and shown in that
// time, whatever the admin's computer is set to. The API takes and returns UTC (ISO strings).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// UTC instant → "YYYY-MM-DDTHH:mm" (a datetime-local value) in Vietnam time.
export function toVietnamLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(0, 16);
}

// null when the value is not a real date and time ("2026-02-30T10:00" rolls over in Date, so the
// round trip has to give the same text back).
export function fromVietnamLocal(local: string): string | null {
  if (!LOCAL_DATE_TIME.test(local)) return null;
  const ms = Date.parse(`${local}:00.000Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 16) !== local) return null;
  return new Date(ms - VN_OFFSET_MS).toISOString();
}

// "08:30 10/11/2026" in Vietnam time, for lists and reports.
export function formatVietnamDateTime(iso: string): string {
  const [date, time] = toVietnamLocal(iso).split('T');
  const [y, m, d] = date.split('-');
  return `${time} ${d}/${m}/${y}`;
}
