import type { RunEntry, RunState } from "./types";

/** The runs of one bot, in the host's order. */
export interface BotRuns {
  bot: string;
  runs: RunEntry[];
}

/** The list grouped by bot, each group where the host's list first names it. */
export function byBot(runs: RunEntry[]): BotRuns[] {
  const groups: BotRuns[] = [];
  for (const run of runs) {
    const group = groups.find((one) => one.bot === run.bot);
    if (group) group.runs.push(run);
    else groups.push({ bot: run.bot, runs: [run] });
  }
  return groups;
}

/** A group's heading count, such as "4 running · 1 stopped". */
export function counts(runs: RunEntry[]): string {
  return (["running", "paused", "stopped"] as RunState[])
    .map((state) => ({ state, n: runs.filter((run) => run.state === state).length }))
    .filter(({ n }) => n > 0)
    .map(({ state, n }) => `${n} ${state}`)
    .join(" · ");
}

/** What tells a run from the others of its bot: its instance, or when it started where it has none. */
export function tileName(run: RunEntry): string {
  if (run.instance) return run.instance;
  const started = new Date(run.startedMillis);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(started.getHours())}:${two(started.getMinutes())}`;
}

/** The status line's name for the run shown. With one run there is nothing to tell apart, so the bot alone. */
export function runName(runs: RunEntry[], shown: string | null): string {
  // No run shown means the host shows the open project's idle views: never name a listed run for them.
  const run = runs.find((one) => one.id === shown);
  if (!run) return "BotPilot";
  return runs.length === 1 ? run.bot : `${run.bot} · ${tileName(run)}`;
}

/** Whether there is a run to switch to: a second one, or a single one while none is shown. */
export function choosable(runs: RunEntry[], shown: string | null): boolean {
  return runs.length > 1 || (runs.length === 1 && shown === null);
}

/** The runs a swipe on the status line moves between: those of the shown run's bot. */
export function siblings(runs: RunEntry[], shown: string | null): RunEntry[] {
  const run = runs.find((one) => one.id === shown);
  return run ? runs.filter((one) => one.bot === run.bot) : [];
}

/** The sibling `step` places from the shown run, or null at either end. */
export function neighbour(runs: RunEntry[], shown: string | null, step: -1 | 1): string | null {
  const own = siblings(runs, shown);
  const at = own.findIndex((run) => run.id === shown);
  return at < 0 ? null : (own[at + step]?.id ?? null);
}
