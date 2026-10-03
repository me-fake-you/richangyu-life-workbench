export function localDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftDay(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function weekDays(date: Date): Date[] {
  const monday = shiftDay(date, -((date.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
}

export function belongsToDay(start: string, end: string, date: Date): boolean {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const until = shiftDay(from, 1);
  return new Date(start).getTime() < until.getTime() && new Date(end).getTime() > from.getTime();
}

export function overlaps(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  return new Date(start).getTime() < new Date(otherEnd).getTime()
    && new Date(end).getTime() > new Date(otherStart).getTime();
}

export type HomeTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_at: string | null;
  today_rank: number | null;
  planned_minutes: number;
  actual_minutes: number;
  completed_at: string | null;
  scheduled_start_at: string | null;
  project_title: string | null;
};

export function taskForDay(task: HomeTask, selected: Date, now: Date): boolean {
  const day = localDay(selected);
  if (task.status === "已取消") return false;
  if (task.status === "已完成") return Boolean(task.completed_at && localDay(task.completed_at) === day);
  const isToday = day === localDay(now);
  return Boolean(
    (task.due_at && localDay(task.due_at) === day)
    || (task.scheduled_start_at && localDay(task.scheduled_start_at) === day)
    || (isToday && (task.today_rank || (task.due_at && new Date(task.due_at) < now))),
  );
}

export function sortHomeTasks(tasks: HomeTask[]): HomeTask[] {
  return [...tasks].sort((a, b) => {
    const done = Number(a.status === "已完成") - Number(b.status === "已完成");
    if (done) return done;
    const rank = (a.today_rank ?? 99) - (b.today_rank ?? 99);
    if (rank) return rank;
    const priority = a.priority.localeCompare(b.priority);
    if (priority) return priority;
    return (a.due_at ? new Date(a.due_at).getTime() : Infinity)
      - (b.due_at ? new Date(b.due_at).getTime() : Infinity);
  });
}
