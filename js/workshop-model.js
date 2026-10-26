// The Sci-K page (#/sci-k): a workshop with its own timed programme (session.agenda, scraped from the
// workshop's website by pipeline/research_workshops.py), its people and the projects its papers point to.
// Pure: no DOM. Tested in tests/app/workshop.test.mjs.

export const SCIK_SITE = "https://sci-k.github.io/2026/";
const PROJECT_KINDS = ["code", "dataset", "hf-model", "hf-dataset", "hf-space"];
const ROLE_ORDER = ["organiser", "chair", "keynote", "author"];

const norm = (u) => String(u ?? "").trim().toLowerCase().replace(/\/+$/, "");
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

/** The workshop session behind #/sci-k: the one whose website is Sci-K's, with an agenda; null when absent. */
export function scikSession(program) {
  return program.sessions.find((s) => s.agenda?.length && (norm(s.website) === norm(SCIK_SITE) || norm(s.agendaUrl) === norm(SCIK_SITE))) ?? null;
}

/**
 * Where the day stands at `nowISO`, per agenda index: "past" | "now" | "next" | "" (later, or another day).
 * "next" is the first item after now on the same day (also before the day starts); an item with no end lasts 30 min.
 */
export function agendaStates(session, nowISO) {
  const t = ms(nowISO);
  const items = session?.agenda ?? [];
  const out = items.map(() => "");
  if (Number.isNaN(t) || String(nowISO).slice(0, 10) !== session.day) return out;
  let next = -1;
  items.forEach((a, i) => {
    const s = ms(a.startISO), e = a.endISO ? ms(a.endISO) : s + 30 * 60 * 1000;
    if (e <= t) out[i] = "past";
    else if (s <= t) out[i] = "now";
    else if (next < 0) next = i;
  });
  if (next >= 0) out[next] = "next";
  return out;
}

/**
 * Everyone in the workshop, each once: [{ person, roles: ["organiser"|"chair"|"keynote"|"author"], talkIds }],
 * organisers first (in the session's order), then chairs, the keynote speaker, then authors by first talk.
 * Ids without a person in the programme are skipped.
 */
export function workshopPeople(program, session) {
  const m = new Map();
  const add = (id, role, talkId = null) => {
    const person = id ? program.byId.get(id) : null;
    if (!person?.name) return;
    if (!m.has(id)) m.set(id, { person, roles: [], talkIds: [] });
    const e = m.get(id);
    if (!e.roles.includes(role)) e.roles.push(role);
    if (talkId && !e.talkIds.includes(talkId)) e.talkIds.push(talkId);
  };
  for (const id of session.organizerIds ?? []) add(id, "organiser");
  for (const id of session.chairIds ?? []) add(id, "chair");
  for (const a of session.agenda ?? []) if (a.kind === "keynote") add(a.speakerId, "keynote");
  for (const pid of session.paperIds) {
    const p = program.byId.get(pid);
    for (const id of p?.authorIds ?? []) add(id, "author", pid);
  }
  for (const e of m.values()) e.roles.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  return [...m.values()];
}

/** The projects the workshop's papers point to: [{ paper, links: [code / dataset / Hugging Face links] }], programme order. */
export function workshopProjects(program, session) {
  return session.paperIds.map((id) => program.byId.get(id)).filter(Boolean)
    .map((paper) => ({ paper, links: (paper.links ?? []).filter((l) => PROJECT_KINDS.includes(l.kind)) }))
    .filter((x) => x.links.length);
}

/** "github.com/owner/repo", "doi.org/10.5281/zenodo.1" : a link as short readable text. */
export function shortUrl(url) {
  return String(url).replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}
