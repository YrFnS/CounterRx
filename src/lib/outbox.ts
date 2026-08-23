/**
 * Offline outbox (W3.3)
 *
 * While the terminal is offline, mutations can't reach Supabase. Instead of the
 * previous silent-drop (persistBackendData just `warn()`s on failure), every
 * changed row is enqueued here as an outbox entry keyed by its primary id. On
 * reconnect the queue replays FIFO; each entry resolves a last-write-wins (LWW)
 * conflict by comparing `updatedAt` (falling back to `createdAt`/`at`) against the
 * current remote row. Winning-local writes go through; losing-local writes are
 * dropped and surfaced to the UI as a conflict banner.
 *
 * The outbox stores the persisted (snake_case) row shape produced by `rowsFor`
 * in sync.ts, so live replay reuses the exact same serialization as online sync.
 */

const OUTBOX_KEY = "counterrx:outbox:v1";

/** Which persisted column (if any) carries the row's last-write timestamp. */
type TableClock = { updatedAt?: string; createdAt?: string; at?: string };

export interface OutboxEntry {
  id: string;
  action: "upsert" | "delete";
  payload: Record<string, unknown>;
  at: number; // when the local mutation happened
  updatedAt: number; // LWW clock of the local row
  table: string; // snake_case persisted table (e.g. "products")
  key: string; // primary key value of the row
}

export interface ConflictReport {
  table: string;
  key: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Coerce a persisted column to an epoch-ms number (accepts ms or ISO string). */
function clockOf(row: TableClock): number {
  for (const col of ["updatedAt", "createdAt", "at"] as const) {
    const v = row[col];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
      const t = Date.parse(v);
      if (Number.isFinite(t)) return t;
    }
  }
  return 0;
}

export function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeOutbox(entries: OutboxEntry[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
  } catch {
    /* storage full / unavailable — queue is best-effort */
  }
}

export function clearOutbox(): void {
  try {
    localStorage.removeItem(OUTBOX_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Diff `prev`/`next` row arrays for one table and enqueue changed/added rows.
 * Deletes are enqueued when a row present in prev is absent from next. Returns
 * the new queue (previous + new entries). One entry per row key (latest wins).
 */
export function enqueueChanges(
  table: string,
  keyField: string,
  prev: Record<string, unknown>[],
  next: Record<string, unknown>[],
): OutboxEntry[] {
  const prevById = new Map<string, Record<string, unknown>>();
  for (const row of prev) {
    const k = row[keyField];
    if (typeof k === "string" || typeof k === "number")
      prevById.set(String(k), row);
  }
  const nextById = new Map<string, Record<string, unknown>>();
  for (const row of next) {
    const k = row[keyField];
    if (typeof k === "string" || typeof k === "number")
      nextById.set(String(k), row);
  }

  const entries: OutboxEntry[] = [];
  const now = Date.now();

  for (const [key, row] of nextById) {
    const before = prevById.get(key);
    if (before && JSON.stringify(before) === JSON.stringify(row)) continue; // unchanged
    entries.push({
      id: `${table}:${key}:${now}:${entries.length}`,
      action: "upsert",
      payload: row,
      at: now,
      updatedAt: clockOf(row as TableClock),
      table,
      key,
    });
  }
  for (const [key, row] of prevById) {
    if (!nextById.has(key)) {
      entries.push({
        id: `${table}:${key}:${now}:d${entries.length}`,
        action: "delete",
        payload: row,
        at: now,
        updatedAt: clockOf(row as TableClock),
        table,
        key,
      });
    }
  }

  const base = readOutbox();
  // Merge: existing entries for the same table+key are replaced by the newest.
  const byKey = new Map<string, OutboxEntry>();
  for (const e of base) byKey.set(`${e.table}:${e.key}`, e);
  for (const e of entries) byKey.set(`${e.table}:${e.key}`, e);
  return [...byKey.values()].sort((a, b) => a.at - b.at);
}

export interface DrainOptions {
  /** Fetch the current remote row for a key, or null if absent/error. */
  fetchRow: (
    table: string,
    key: string,
  ) => Promise<Record<string, unknown> | null>;
  /** Best-effort write of the winning row to Supabase. */
  writeRow: (table: string, payload: Record<string, unknown>) => Promise<void>;
  /** Optional: force a local row through even if remote is newer (keep-local). */
  force?: { table: string; key: string };
}

export interface DrainResult {
  drained: number;
  remaining: number;
  conflicts: ConflictReport[];
}

/**
 * Replay the queue in FIFO order. For each entry, compare its LWW clock against
 * the live remote row. Local wins → write; remote wins → drop the entry and
 * record a conflict; forced → write regardless. Resolves all conflicts.
 */
export async function drainOutbox(opts: DrainOptions): Promise<DrainResult> {
  const queued = readOutbox();
  const conflicts: ConflictReport[] = [];
  const failures: OutboxEntry[] = [];
  const forced = opts.force ? `${opts.force.table}:${opts.force.key}` : "";

  for (const entry of queued) {
    const isForced = `${entry.table}:${entry.key}` === forced;
    if (entry.action === "delete" && !isForced) {
      await opts.writeRow(entry.table, entry.payload);
      continue;
    }
    if (isForced) {
      await opts.writeRow(entry.table, entry.payload);
      continue;
    }
    const remote = await opts
      .fetchRow(entry.table, entry.key)
      .catch(() => null);
    const remoteClock = remote ? clockOf(remote as TableClock) : 0;
    if (remote && remoteClock > entry.updatedAt) {
      // Remote is newer — local change was overwritten. Drop the op, report it.
      conflicts.push({
        table: entry.table,
        key: entry.key,
        local: entry.payload,
        remote,
      });
      continue;
    }
    try {
      await opts.writeRow(entry.table, entry.payload);
    } catch {
      failures.push(entry);
    }
  }

  writeOutbox(failures);
  return {
    drained: queued.length - failures.length,
    remaining: failures.length,
    conflicts,
  };
}

/** Count of queued entries — used to badge the offline banner. */
export function outboxCount(): number {
  return readOutbox().length;
}
