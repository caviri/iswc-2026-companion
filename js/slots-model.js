// Time slots: sessions that start together in different rooms, compared side by side on one card so one
// can be picked. Pure: no DOM access. Tested in tests/app/slots.test.mjs.
import { sessionsOverlap } from "./model.js";

const startMs = (s) => Date.parse(s.startISO);

/** Every parallel slot (2+ sessions with the same day and start, not breaks or all-rooms items), in time order. */
export function parallelSlots(program) {
  const by = new Map();
  for (const s of program.sessions) {
    if (s.kind === "break" || s.allRooms || !s.startISO) continue;
    const key = `${s.day}|${s.start}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(s);
  }
  return [...by.entries()]
    .filter(([, ss]) => ss.length > 1)
    .map(([key, sessions]) => ({ key, day: sessions[0].day, start: sessions[0].start, at: startMs(sessions[0]), sessions }))
    .sort((a, b) => a.at - b.at);
}

/**
 * Slots still to decide, in time order, each with `open` (its sessions not skipped: unsorted or maybe),
 * `ruledOut` (skipped) and `maybe` (marked maybe). A slot is decided when one of its sessions is kept, when
 * all are skipped, or when a session kept elsewhere overlaps every open one (a full-day workshop kept at
 * 09:00 covers the 14:10 slot). A maybe never decides a slot. `day` limits to one day.
 */
export function slotsToDecide(program, store, { day = null } = {}) {
  const kept = program.sessions.filter((s) => store.verdict(s.id) === "right");
  const out = [];
  for (const slot of parallelSlots(program)) {
    if (day && slot.day !== day) continue;
    if (slot.sessions.some((s) => store.verdict(s.id) === "right")) continue;
    const open = slot.sessions.filter((s) => store.verdict(s.id) !== "left");
    if (!open.length) continue;
    if (kept.some((k) => open.every((s) => sessionsOverlap(k, s)))) continue;
    const maybe = open.filter((s) => store.verdict(s.id) === "up").length;
    out.push({ ...slot, open, ruledOut: slot.sessions.length - open.length, maybe });
  }
  return out;
}

/** The slot to show: the first open slot at or after `at` (ms), wrapping to the first. */
export function slotAt(slots, at) {
  return slots.find((s) => at == null || s.at >= at) ?? slots[0] ?? null;
}

/** Verdicts for picking `id`: it is kept, the other open sessions of the slot (maybes too) are skipped. */
export function pickChanges(slot, id) {
  return slot.open.map((s) => ({ id: s.id, v: s.id === id ? "right" : "left" }));
}

/** "until 12:50" when sessions in the slot end at different times, else "" (all end together). */
export function untilLabel(slot, s) {
  const ends = new Set(slot.open.map((x) => x.end));
  return ends.size > 1 && /^\d\d:\d\d$/.test(s.end ?? "") ? `until ${s.end}` : "";
}

/** "None of these": every open session of the slot (maybes too) is skipped. */
export function noneChanges(slot) {
  return slot.open.map((s) => ({ id: s.id, v: "left" }));
}

/** Toggle maybe on one session: maybe it, or clear a maybe back to unsorted (v null). */
export function maybeChanges(store, id) {
  return [{ id, v: store.verdict(id) === "up" ? null : "up" }];
}

/** The session preselected when a slot opens: its only maybe, if exactly one; else none. */
export function defaultSelection(slot, store) {
  const ms = slot.open.filter((s) => store.verdict(s.id) === "up");
  return ms.length === 1 ? ms[0].id : null;
}

/**
 * A swipe on the whole slot card -> what to do: right keeps the selected session ("keep"), or, with nothing
 * selected, asks to choose first ("nudge"); left is "none" (rule them all out); up is "later" (decide later).
 */
export function slotSwipe(outcome, selected) {
  if (outcome === "right") return selected ? "keep" : "nudge";
  if (outcome === "left") return "none";
  if (outcome === "up") return "later";
  return null;
}

/** Selection moved by `step` (+1 / -1) through the open sessions; from nothing, → selects the first and ← the last. */
export function moveSelection(slot, selected, step) {
  const ids = slot.open.map((s) => s.id);
  if (!ids.length) return null;
  const i = ids.indexOf(selected);
  if (i < 0) return step > 0 ? ids[0] : ids[ids.length - 1];
  return ids[Math.max(0, Math.min(ids.length - 1, i + step))];
}

/** Time-slot keys, in legend order: [keys shown, action, description]. */
export const SLOT_KEYS = [
  [["←", "→"], "move", "Move between the sessions"],
  [["Enter", "K"], "keep", "Keep the selected one (skips the rest)"],
  [["↑", "M"], "maybe", "Maybe the selected one"],
  [["S"], "none", "None of these"],
  [["↓", "L"], "later", "Decide later"],
  [["U"], "undo", "Undo"],
  [["?"], "legend", "Show or hide these shortcuts"],
];

/** A keydown in Time slots -> { act, step? } or null. Cmd/Alt/Ctrl combos never map (except Ctrl+Z undo). */
export function slotKeyAction({ key, ctrlKey = false, metaKey = false, altKey = false } = {}) {
  if (metaKey || altKey) return null;
  if ((key === "z" && ctrlKey) || ((key === "u" || key === "U" || key === "Backspace") && !ctrlKey)) return { act: "undo" };
  if (ctrlKey) return null;
  if (key === "ArrowRight") return { act: "move", step: 1 };
  if (key === "ArrowLeft") return { act: "move", step: -1 };
  if (key === "Enter" || key === "k" || key === "K") return { act: "keep" };
  if (key === "ArrowUp" || key === "m" || key === "M") return { act: "maybe" };
  if (key === "s" || key === "S") return { act: "none" };
  if (key === "ArrowDown" || key === "l" || key === "L") return { act: "later" };
  if (key === "?") return { act: "legend" };
  return null;
}
