const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const calendarPattern = /^\d{4}-\d{2}-\d{2}$/;
const dubaiOffsetMs = 4 * 60 * 60 * 1000;

function dubaiDate(value: unknown): Date | null {
    if (!(value instanceof Date) && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value))) return null;
    const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp + dubaiOffsetMs) : null;
}

export function dubaiDay(value: unknown): string | null {
    if (typeof value === 'string' && calendarPattern.test(value)) {
        const date = new Date(value);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
    }
    return dubaiDate(value)?.toISOString().slice(0, 10) ?? null;
}

export function formatDay(day: string): string {
    const [year, month, date] = day.split('-').map(Number);
    return `${date} ${months[month - 1]} ${year}`;
}

export function formatDubaiCreated(value: unknown): string | null {
    const date = dubaiDate(value);
    return date && `${formatDay(date.toISOString().slice(0, 10))}, ${date.toISOString().slice(11, 16)}`;
}
