import { isoWeekday, minutesToTime, timeToMinutes } from "./dates";

export type SlotInfo = {
  time: string;
  taken: boolean;
  label: string;
};

export function workDaysArray(workDays: string): number[] {
  return workDays
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => d >= 1 && d <= 7);
}

export function isWorkDay(day: string, workDays: string): boolean {
  return workDaysArray(workDays).includes(isoWeekday(day));
}

/** Genera todos los horarios del dia segun la configuracion del negocio. */
export function buildSlots(opts: {
  openHour: number;
  closeHour: number;
  slotMinutes: number;
}): string[] {
  const { openHour, closeHour } = opts;
  const step = Math.max(5, opts.slotMinutes || 30);
  const start = openHour * 60;
  const end = closeHour * 60;
  const out: string[] = [];
  for (let t = start; t + step <= end; t += step) out.push(minutesToTime(t));
  return out;
}

export function endTimeFor(startTime: string, durationMin: number): string {
  return minutesToTime(timeToMinutes(startTime) + Math.max(5, durationMin));
}
