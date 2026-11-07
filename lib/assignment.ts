/**
 * Balanced random assignment to study cells (condition × seeded error).
 *
 * A cell's load = completed sessions + sessions still in progress.
 * "In progress" means assigned within the last ASSIGN_PENDING_MINUTES
 * (default 60) and not yet submitted. A participant who drops out stops
 * counting once that window passes, so their slot is re-filled. Each new
 * participant goes to one of the least-loaded cells (ties broken at random).
 *
 * KV keys:
 *   cell_done:<cell>       integer — completed (non-test) sessions
 *   cell_pending:<cell>    sorted set — sessionId → assignment time (ms)
 *   session_cell:<sid>     the cell a session was assigned to (expires after 3 days)
 */

import { kv } from "@vercel/kv";
import { ALL_CONDITIONS, isCondition, type Condition } from "@/lib/study-config";

export type Cell = { condition: Condition; seedError: boolean; key: string };

function pendingWindowMs(): number {
  const m = Number(process.env.ASSIGN_PENDING_MINUTES);
  return (Number.isFinite(m) && m > 0 ? m : 60) * 60_000;
}

export function activeCells(): Cell[] {
  const raw = process.env.STUDY_CONDITIONS;
  const listed = raw ? raw.split(",").map((s) => s.trim()).filter(isCondition) : [];
  const conditions = listed.length ? listed : ALL_CONDITIONS;
  const errorLevels = process.env.SEEDED_ERROR === "off" ? [false] : [false, true];
  return conditions.flatMap((condition) =>
    errorLevels.map((seedError) => ({ condition, seedError, key: `${condition}:${seedError ? 1 : 0}` }))
  );
}

/** Current load per cell (completed + in progress). */
export async function cellLoads(cells: Cell[]): Promise<{ cell: Cell; done: number; pending: number }[]> {
  const cutoff = Date.now() - pendingWindowMs();
  return Promise.all(
    cells.map(async (cell) => {
      await kv.zremrangebyscore(`cell_pending:${cell.key}`, 0, cutoff);
      const [done, pending] = await Promise.all([
        kv.get<number>(`cell_done:${cell.key}`),
        kv.zcard(`cell_pending:${cell.key}`),
      ]);
      return { cell, done: Number(done ?? 0), pending: Number(pending ?? 0) };
    })
  );
}

/**
 * Pick a least-loaded cell. When `reserve` is true (real participants) a slot
 * is reserved for this session; test sessions never touch the counts.
 */
export async function assignBalanced(sessionId: string, reserve = true): Promise<Cell> {
  const loads = await cellLoads(activeCells());
  const total = (l: { done: number; pending: number }) => l.done + l.pending;
  const min = Math.min(...loads.map(total));
  const candidates = loads.filter((l) => total(l) === min);
  const chosen = candidates[Math.floor(Math.random() * candidates.length)].cell;
  if (!reserve) return chosen;
  await kv.zadd(`cell_pending:${chosen.key}`, { score: Date.now(), member: sessionId });
  await kv.set(`session_cell:${sessionId}`, chosen.key, { ex: 3 * 24 * 3600 });
  return chosen;
}

/** Mark a session's cell as completed (called once, when the session is saved). */
export async function completeAssignment(sessionId: string): Promise<void> {
  const cellKey = await kv.get<string>(`session_cell:${sessionId}`);
  if (!cellKey) return; // test session, URL override, or already counted
  await kv.zrem(`cell_pending:${cellKey}`, sessionId);
  await kv.incr(`cell_done:${cellKey}`);
  await kv.del(`session_cell:${sessionId}`);
}
