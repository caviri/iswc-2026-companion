// Conference time helpers. Pure: no DOM access. All conference times are Europe/Rome.
const FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const pad = (n) => String(n).padStart(2, "0");

/** ISO-8601 wall-clock time in Rome with its UTC offset (+01:00 CET / +02:00 CEST). */
export function romeNow(date = new Date()) {
  const p = {};
  for (const { type, value } of FMT.formatToParts(date)) p[type] = value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offMin = Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offMin < 0 ? "-" : "+";
  const a = Math.abs(offMin);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/**
 * "2026-10-27", "10:30" -> "2026-10-27T10:30:00+01:00": that Rome wall-clock time with its offset.
 * In the DST fold (02:00–03:00 on the last Sunday of October) the first (+02:00) instant wins.
 */
export function romeISO(day, time) {
  for (const off of ["+02:00", "+01:00"]) {
    const iso = `${day}T${time}:00${off}`;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && romeNow(new Date(t)) === iso) return iso;
  }
  const t = Date.parse(`${day}T${time}:00+01:00`); // spring-forward gap: no such wall time
  if (Number.isNaN(t)) throw new RangeError(`bad Rome time: ${day} ${time}`);
  return romeNow(new Date(t));
}

const DEFAULT_LEN_MS = 30 * 60 * 1000;
const MAX_INFERRED_MS = 3 * 60 * 60 * 1000;
const startMs = (s) => Date.parse(s.startISO);

/**
 * Best-guess end (ms) for sessions with no end time, keyed by id: the next start in the same room that
 * day (an all-rooms session also counts as the room's next item) if within 3 h, else start + 30 min.
 * Pass the whole programme so the following item counts even when it isn't a pick.
 */
export function inferEnds(sessions) {
  const ends = new Map();
  for (const s of sessions) {
    if (s.endISO || Number.isNaN(startMs(s))) continue;
    const t = startMs(s);
    let next = Infinity;
    if (s.roomId) {
      for (const o of sessions) {
        const ot = startMs(o);
        if (o !== s && o.day === s.day && (o.roomId === s.roomId || o.allRooms) && ot > t && ot < next) next = ot;
      }
    }
    ends.set(s.id, next - t <= MAX_INFERRED_MS ? next : t + DEFAULT_LEN_MS);
  }
  return ends;
}

/**
 * now: sessions with start <= t < end. A missing end comes from `ends` (see inferEnds), else 30 min.
 * next: all sessions sharing the earliest start > t.
 * state: before | during | between-days | over. isoNow is expected in Rome time (see romeNow);
 * its first 10 chars are taken as today's date.
 */
export function nowNext(sessions, isoNow, ends = new Map()) {
  const endMs = (s) => (s.endISO ? Date.parse(s.endISO) : ends.get(s.id) ?? startMs(s) + DEFAULT_LEN_MS);
  const t = Date.parse(isoNow);
  const valid = sessions.filter((s) => !Number.isNaN(startMs(s)));
  const now = valid.filter((s) => startMs(s) <= t && t < endMs(s));
  let nextStart = Infinity;
  for (const s of valid) if (startMs(s) > t && startMs(s) < nextStart) nextStart = startMs(s);
  const next = valid.filter((s) => startMs(s) === nextStart);
  if (!now.length && !next.length) return { now, next, state: "over" };
  if (!now.length && t < Math.min(...valid.map(startMs))) return { now, next, state: "before" };
  const today = isoNow.slice(0, 10);
  if (now.length || next[0].day === today) return { now, next, state: "during" };
  return { now, next, state: "between-days" };
}
