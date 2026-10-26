// Pure map logic: pan/zoom maths, default floor, sessions-in-room selection. No DOM; tested in tests/app/mapmath.test.mjs.
// View = { scale, x, y }: CSS `translate(x px, y px) scale(scale)` with transform-origin 0 0 on a w x h plan.

export const FLOORS = [-1, 1, 2];
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
const FOCUS_MAX = 3;

const IDENTITY = () => ({ scale: 1, x: 0, y: 0 });

/** Clamp scale to 1..4 and translation so the scaled plan always covers the w x h viewport. */
export function clampView({ scale, x, y }, w, h) {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(scale) ? scale : 1));
  const cl = (v, size) => Math.min(0, Math.max(size - size * s, Number.isFinite(v) ? v : 0));
  return { scale: s, x: cl(x, w), y: cl(y, h) };
}

/** Multiply the scale by `factor`, keeping the viewport point (cx, cy) fixed. */
export function zoomAt(view, factor, cx, cy, w, h) {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const k = s / view.scale;
  return clampView({ scale: s, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k }, w, h);
}

/** Two-finger gesture: `start`/`now` = { dist, cx, cy } of the finger pair; `view0` = view when the pinch began. */
export function pinchView(view0, start, now, w, h) {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view0.scale * (now.dist / (start.dist || 1))));
  const k = s / view0.scale;
  return clampView({ scale: s, x: now.cx - (start.cx - view0.x) * k, y: now.cy - (start.cy - view0.y) * k }, w, h);
}

/** View that centres a normalised box in the viewport, zoomed so it fills ~40% (capped at 3x). */
export function focusView(box, w, h) {
  if (!box || !(box.w > 0) || !(box.h > 0)) return IDENTITY();
  const fit = Math.min(0.4 / box.w, 0.4 / box.h);
  const scale = Math.min(FOCUS_MAX, fit);
  if (scale <= 1.05) return IDENTITY();
  const cx = (box.x + box.w / 2) * w, cy = (box.y + box.h / 2) * h;
  return clampView({ scale, x: w / 2 - cx * scale, y: h / 2 - cy * scale }, w, h);
}

/** Floor to show: the selected room's floor, else the `floor` param if valid, else -1. */
export function defaultFloor(room, floor) {
  if (room && FLOORS.includes(room.floor)) return room.floor;
  return FLOORS.includes(floor) ? floor : -1;
}

/**
 * Sessions held in a room on `today` (YYYY-MM-DD, Rome); if none, the first later day that has sessions there,
 * else the first day it has any. -> { day, isToday, sessions } (day null when the room is never used).
 */
export function roomSessions(program, roomId, today) {
  const mine = program.sessions.filter((s) => s.roomId === roomId && !s.allRooms);
  const days = [...new Set(mine.map((s) => s.day))].sort();
  if (!days.length) return { day: null, isToday: false, sessions: [] };
  const isToday = days.includes(today);
  const day = isToday ? today : (days.find((d) => d > today) ?? days[0]);
  const sessions = mine.filter((s) => s.day === day).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { day, isToday, sessions };
}
