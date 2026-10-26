// Timetable grid (#/grid): one day as columns of rooms and time running down. Pure: no DOM.
// Tested in tests/app/grid.test.mjs.
import { inferEnds } from "./time.js";

const ELSEWHERE = "elsewhere";
const MIN = 60 * 1000;
const ms = (iso) => Date.parse(iso);
const hhmm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

/** Room columns in reading order: Plenary, the numbered Sezioni by number, then the rest by name. */
export function roomOrder(a, b) {
  const rank = (r) => (/^plenary/i.test(r.name) ? 0 : /^sezione/i.test(r.name) ? 1 : 2);
  const num = (r) => parseInt((r.name.match(/\d+/) ?? ["999"])[0], 10);
  return rank(a) - rank(b) || (rank(a) === 1 ? num(a) - num(b) : 0) || a.name.localeCompare(b.name);
}

/** A session spans the whole grid as a band: all-rooms sessions and breaks (coffee, lunch, registration). */
export const isBand = (s) => !!s.allRooms || s.kind === "break";

/** What a block lists inside: a parallel session's papers, or a workshop's published programme. -> [{time, title, id?}] */
export function blockLines(program, s) {
  if (s.agenda?.length) return s.agenda.filter((a) => a.kind !== "break").map((a) => ({ time: a.start, title: a.talkTitle ?? a.title, id: a.paperId ?? null }));
  return s.paperIds.map((id, i) => program.byId.get(id)).filter(Boolean).map((p, i) => ({ time: String(i + 1), title: p.title, id: p.id }));
}

/**
 * One day's grid -> { rooms: [{id, name, floor}] (plus {id: "elsewhere"} when needed), start, end (ms),
 *   blocks: [{ session, col, lane, lanes, top, height (minutes from start), lines }], bands: [{ session, top, height }],
 *   hours: [{ label, top }] }. Sessions without an end take the next start in their room (time.js inferEnds), at
 * least 30 minutes. Sessions overlapping in one room share it side by side (lane / lanes).
 */
export function dayGrid(program, date) {
  const all = program.sessions.filter((s) => s.day === date && !Number.isNaN(ms(s.startISO)));
  const ends = inferEnds(program.sessions);
  const endOf = (s) => (s.endISO ? ms(s.endISO) : ends.get(s.id) ?? ms(s.startISO) + 30 * MIN);
  if (!all.length) return { rooms: [], start: 0, end: 0, blocks: [], bands: [], hours: [] };
  const start = Math.min(...all.map((s) => ms(s.startISO)));
  const end = Math.max(...all.map(endOf));
  const t0 = Math.floor(start / (60 * MIN)) * 60 * MIN; // whole hour above the first session
  const top = (t) => Math.round((t - t0) / MIN);

  const bands = all.filter(isBand).map((s) => ({ session: s, top: top(ms(s.startISO)), height: Math.max(15, top(endOf(s)) - top(ms(s.startISO))) }));
  const placed = all.filter((s) => !isBand(s));
  const rooms = [...new Map(placed.filter((s) => s.roomId && program.byId.get(s.roomId)).map((s) => [s.roomId, program.byId.get(s.roomId)])).values()]
    .map((r) => ({ id: r.id, name: r.name, floor: r.floor ?? null })).sort(roomOrder);
  if (placed.some((s) => !s.roomId || !program.byId.get(s.roomId))) rooms.push({ id: ELSEWHERE, name: "Elsewhere", floor: null });
  const col = new Map(rooms.map((r, i) => [r.id, i]));

  const blocks = [];
  for (const r of rooms) {
    const inRoom = placed.filter((s) => (col.has(s.roomId) && s.roomId === r.id) || (r.id === ELSEWHERE && !col.has(s.roomId)))
      .sort((a, b) => ms(a.startISO) - ms(b.startISO) || (a.id < b.id ? -1 : 1));
    // lanes: greedy, then every block of an overlapping group learns the group's lane count
    const laneEnds = [];
    const items = inRoom.map((s) => {
      const st = ms(s.startISO);
      let lane = laneEnds.findIndex((e) => e <= st);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = endOf(s);
      return { session: s, lane, st, en: endOf(s) };
    });
    for (const it of items) {
      const overlapping = items.filter((o) => o.st < it.en && it.st < o.en);
      blocks.push({ session: it.session, col: col.get(r.id), lane: it.lane, lanes: Math.max(...overlapping.map((o) => o.lane)) + 1,
        top: top(it.st), height: Math.max(20, top(it.en) - top(it.st)), lines: blockLines(program, it.session) });
    }
  }
  const hours = [];
  for (let t = t0; t <= end; t += 60 * MIN) hours.push({ label: hhmm(t), top: top(t) });
  return { rooms, start: t0, end, blocks, bands, hours, height: top(end) };
}

/** Minutes from the grid's start to `nowISO` when it falls inside the day's grid, else null (no "now" line). */
export function nowOffset(grid, nowISO) {
  const t = ms(nowISO);
  if (!grid.rooms.length || Number.isNaN(t) || t < grid.start || t > grid.end) return null;
  return Math.round((t - grid.start) / MIN);
}
