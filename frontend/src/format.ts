// Format utilities — all display formatting lives here, never in components

const LONDON_TZ = 'Europe/London';

const londonDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const londonDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const londonTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return londonDateTimeFormatter.format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return londonDateFormatter.format(new Date(iso));
  } catch {
    return iso ?? '—';
  }
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return londonTimeFormatter.format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatMW(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined) return '—';
  return `${val.toLocaleString('en-GB', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })} MW`;
}

export function formatSignedMW(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toLocaleString('en-GB', { maximumFractionDigits: 0 })} MW`;
}

export function formatPct(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(decimals)}%`;
}

export function formatLeadHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  return `${h.toFixed(1)} h`;
}

/** Return a local London date label like "02 Jan 14:30" for charts */
export function shortLabel(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = d.toLocaleString('en-GB', { timeZone: LONDON_TZ, day: '2-digit', month: 'short' });
    const time = d.toLocaleString('en-GB', {
      timeZone: LONDON_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${day} ${time}`;
  } catch {
    return iso;
  }
}

/** For chart axis ticks — just the date */
export function axisDayLabel(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: LONDON_TZ,
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return iso;
  }
}
