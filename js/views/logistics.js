// Logistics: the shared travel/stay page and one page per person, imported per device (see logistics-model.js).
import { h, icon, openSheet, toast } from "../ui.js";
import { dayLong, placeOf } from "../model.js";
import { tripEvents, parsePages, clockOf, dateOf, safeUrl, telUrl } from "../logistics-model.js";

const MODE_LABEL = { walk: "Walk", bus: "Bus", train: "Train", tram: "Tram", metro: "Metro", taxi: "Taxi", car: "Car", ferry: "Ferry" };
const when = (s) => (dateOf(s) ? `${dayLong(dateOf(s))}, ${clockOf(s)}` : "");
const list = (x) => (Array.isArray(x) ? x : []);
const extLink = (url, label) => (safeUrl(url) ? h("a", { class: "pill-btn", href: safeUrl(url), target: "_blank", rel: "noopener noreferrer" }, icon("external", { size: 16 }), label) : null);

function card(title, ...children) {
  return h("section", { class: "logi-card" }, title ? h("h2", { class: "logi-card-title" }, title) : null, children);
}

function notesList(items) {
  const xs = list(items).filter(Boolean);
  return xs.length ? h("ul", { class: "logi-notes" }, xs.map((t) => h("li", {}, String(t)))) : null;
}

function copyButton(text, label) {
  return h("button", {
    type: "button", class: "logi-copy", "aria-label": `Copy ${label}`,
    onclick: (e) => {
      const target = e.currentTarget.previousElementSibling;
      const fallback = () => { getSelection()?.selectAllChildren(target); toast("Selected. Copy it from the menu."); };
      if (!navigator.clipboard?.writeText) return fallback();
      navigator.clipboard.writeText(text).then(() => toast(`${label} copied`), fallback);
    },
  }, "Copy");
}

function kv(rows) {
  const xs = rows.filter(([, v]) => v != null && v !== "" && v !== false);
  return xs.length ? h("dl", { class: "logi-kv" }, xs.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null;
}

function staySection(s) {
  const map = safeUrl(s.map);
  const tel = telUrl(s.phone);
  return card(s.title ?? "Stay",
    h("p", { class: "logi-name" }, s.name ?? ""),
    s.about ? h("p", { class: "logi-sub" }, s.about) : null,
    s.address ? h("p", { class: "logi-address" }, icon("pin", { size: 18 }),
      map ? h("a", { href: map, target: "_blank", rel: "noopener noreferrer" }, s.address) : h("span", {}, s.address)) : null,
    kv([
      ["Check in", when(s.checkIn) && `${when(s.checkIn)} or later`],
      ["Check out", when(s.checkOut) && `${when(s.checkOut)} at the latest`],
      ["Booking code", s.code ? h("span", { class: "logi-code-row" }, h("code", { class: "logi-code" }, s.code), copyButton(s.code, "Booking code")) : null],
      ["Host", s.host || s.phone ? h("span", {}, s.host ?? "", s.host && s.phone ? ", " : "",
        s.phone ? (tel ? h("a", { href: tel }, s.phone) : s.phone) : "") : null],
      ["Guests", list(s.guests).join(", ")],
    ]),
    notesList(s.notes));
}

function routeSection(s) {
  const steps = list(s.steps);
  return card(s.title ?? "Route",
    s.summary ? h("p", { class: "logi-sub" }, s.summary) : null,
    steps.length ? h("ol", { class: "logi-steps" }, steps.map((st) => h("li", {},
      h("span", { class: `logi-mode m-${String(st.mode ?? "").toLowerCase()}` }, MODE_LABEL[String(st.mode ?? "").toLowerCase()] ?? st.mode ?? ""),
      h("span", { class: "logi-step-text" }, st.text ?? ""),
      st.minutes != null ? h("span", { class: "logi-min" }, `${st.minutes} min`) : null))) : null,
    notesList(s.notes),
    extLink(s.map, "Directions"));
}

function tableSection(s) {
  const cols = list(s.columns);
  return card(s.title ?? "",
    h("div", { class: "logi-table-wrap" }, h("table", { class: "logi-table" },
      cols.length ? h("thead", {}, h("tr", {}, cols.map((c) => h("th", { scope: "col" }, String(c))))) : null,
      h("tbody", {}, list(s.rows).map((r) => h("tr", {}, list(r).map((c, i) => (i === 0 ? h("th", { scope: "row" }, String(c)) : h("td", {}, String(c))))))))),
    notesList(s.notes));
}

function flightsSection(s) {
  const fs = list(s.flights);
  if (!fs.length) return card(s.title ?? "Flights", h("p", { class: "logi-sub" }, "No flights added yet."));
  return card(s.title ?? "Flights", h("ul", { class: "logi-flights" }, fs.map((f) => {
    const bag = list(f.bagDrop);
    return h("li", { class: "logi-flight" },
      h("p", { class: "logi-flight-head" }, h("span", { class: "logi-flight-label" }, f.label ?? "Flight"),
        h("span", {}, f.number || "Flight number not added")),
      h("p", { class: "logi-flight-day" }, dateOf(f.departs) ? dayLong(dateOf(f.departs)) : ""),
      h("div", { class: "logi-legs" },
        h("span", { class: "logi-leg" }, h("strong", {}, clockOf(f.departs)), h("span", {}, f.from ?? "")),
        h("span", { class: "logi-arrow", "aria-hidden": "true" }, "→"),
        h("span", { class: "logi-leg" }, h("strong", {}, clockOf(f.arrives)), h("span", {}, f.to ?? ""))),
      bag[0] ? h("p", { class: "logi-sub" }, `Bag drop ${clockOf(bag[0])}${bag[1] ? `–${clockOf(bag[1])}` : ""}`) : null);
  })));
}

/** A workshop's own programme, linked to its session in the conference programme when known. */
export function agendaBlocks(a) {
  return h("ol", { class: "logi-agenda" }, list(a.blocks).map((b) => h("li", { class: "logi-block" },
    h("p", { class: "logi-block-head" },
      h("strong", {}, [b.start, b.end].filter(Boolean).join("–")),
      h("span", {}, [b.title, b.chair ? `chair ${b.chair}` : null].filter(Boolean).join(" · "))),
    h("ul", { class: "logi-talks" }, list(b.items).map((it) => h("li", {},
      h("span", { class: "logi-talk" }, it.title ?? ""),
      it.authors || it.track ? h("span", { class: "logi-talk-meta" }, [it.authors, it.track].filter(Boolean).join(" · ")) : null))))));
}

function agendaSection(program, s) {
  const session = s.session ? program.byId.get(s.session) : null;
  const room = session?.roomId ? program.byId.get(session.roomId) : null;
  const p = session ? placeOf(program, session) : null;
  return card(s.title ?? "Programme",
    session ? h("a", { class: "logi-session", href: `#/item/${encodeURIComponent(session.id)}` },
      h("span", { class: "logi-session-title" }, session.title),
      h("span", { class: "logi-sub" }, [dayLong(session.day), [session.start, session.end].filter(Boolean).join("–"), p?.name, p?.floor].filter(Boolean).join(" · "))) : null,
    room?.floor != null ? h("a", { class: "pill-btn", href: `#/map?room=${encodeURIComponent(room.id)}` }, icon("map", { size: 18 }), "Show on map") : null,
    s.note ? h("p", { class: "logi-sub" }, s.note) : null,
    agendaBlocks(s),
    s.after ? h("p", { class: "logi-sub" }, `After: ${s.after}`) : null,
    extLink(s.source, "Workshop site"));
}

function tripSection(pages, personId, isoNow) {
  const evs = tripEvents(pages, personId, isoNow);
  if (!evs.length) return null;
  return card("Trip", h("ol", { class: "logi-trip" }, evs.map((e) => h("li", { class: `logi-ev ${e.state}` },
    h("span", { class: "logi-ev-when" }, h("strong", {}, clockOf(e.at)), h("span", {}, dayLong(dateOf(e.at)))),
    h("span", { class: "logi-ev-text" },
      e.state === "next" ? h("span", { class: "logi-next" }, "Next") : null,
      h("span", { class: "logi-ev-title" }, e.title),
      e.detail ? h("span", { class: "logi-sub" }, e.detail) : null)))));
}

function renderSection(program, s) {
  if (s.type === "stay") return staySection(s);
  if (s.type === "route") return routeSection(s);
  if (s.type === "table") return tableSection(s);
  if (s.type === "flights") return flightsSection(s);
  if (s.type === "agenda") return agendaSection(program, s);
  if (s.type === "notes") return card(s.title ?? "Notes", notesList(s.items));
  return null;
}

/** Import sheet: pick one or more JSON files, or paste. Pages with the same id are replaced. */
function openImport(logistics, onDone) {
  const err = h("p", { class: "logi-error", role: "alert" });
  const file = h("input", { id: "logi-file", type: "file", accept: ".json,application/json", multiple: true, class: "logi-file" });
  const paste = h("textarea", { id: "logi-paste", class: "note-input", rows: 6, placeholder: "…or paste the JSON here", "aria-label": "Logistics JSON" });
  const sheet = openSheet({ title: "Import logistics" });
  const run = async () => {
    err.textContent = "";
    const texts = [...await Promise.all([...file.files].map((f) => f.text())), ...(paste.value.trim() ? [paste.value] : [])];
    if (!texts.length) { err.textContent = "Choose a file or paste the JSON first."; return; }
    try { texts.forEach((t) => parsePages(t)); } catch (e) { err.textContent = `${e.message} Nothing was imported.`; return; }
    const ids = [];
    let saved = true;
    for (const t of texts) { const r = logistics.importText(t); ids.push(...r.ids); saved &&= r.saved; }
    sheet.close();
    const names = ids.map((id) => logistics.page(id)?.name ?? id);
    toast(`${saved ? "Imported" : "Imported for this visit only:"} ${names.join(", ")}`);
    onDone(ids);
  };
  sheet.body.append(
    h("p", { class: "logi-help" }, "Logistics stay on this device only. Import the bundle made with ",
      h("code", {}, "nix run .#logistics"), " (build/logistics.json), or one page file from logistics/ at a time."),
    h("label", { class: "logi-file-label", for: "logi-file" }, "JSON file"), file, paste, err,
    h("div", { class: "sheet-actions" },
      h("button", { type: "button", class: "pill-btn", onclick: () => sheet.close() }, "Cancel"),
      h("button", { type: "button", class: "pill-btn primary", onclick: run }, "Import")));
}

/** renderLogistics(root, program, logistics, id, isoNow, rerender) -> cleanup() */
export function renderLogistics(root, program, logistics, id, isoNow, rerender) {
  const go = (hash) => { if (location.hash === hash) rerender(); else location.hash = hash; };
  const draw = (ids) => go(ids.length === 1 && ids[0] !== "common" ? `#/logistics/${encodeURIComponent(ids[0])}` : "#/logistics");
  const importBtn = (primary) => h("button", { type: "button", class: `pill-btn${primary ? " primary" : ""}`, onclick: () => openImport(logistics, draw) }, primary ? "Import logistics" : "Import or update");
  const pages = logistics.pages();
  const title = h("h1", { class: "view-title" }, "Logistics");

  if (!pages.length) {
    root.replaceChildren(h("section", { class: "view logi-view" }, title, h("div", { class: "empty" },
      h("h2", {}, "No logistics on this device"),
      h("p", {}, "Your stay, routes and flights, kept on this phone only. Import the JSON file once and it works offline."),
      h("div", { class: "empty-actions" }, importBtn(true)))));
    return () => {};
  }

  const page = logistics.page(id ?? "common") ?? (id ? null : pages[0]);
  const tabs = h("nav", { class: "seg logi-tabs", "aria-label": "Logistics pages" }, pages.map((p) => h("a", {
    class: "seg-btn", href: p.id === "common" ? "#/logistics" : `#/logistics/${encodeURIComponent(p.id)}`,
    "aria-current": p.id === page?.id ? "page" : null,
  }, p.name)));

  let armed = false;
  const remove = h("button", {
    type: "button", class: "pill-btn logi-remove",
    onclick: () => {
      if (!armed) { armed = true; remove.textContent = "Tap again to remove all"; return; }
      logistics.clear(); toast("Logistics removed from this device"); go("#/logistics");
    },
  }, "Remove from this device");

  const content = !page
    ? [h("p", { class: "tl-none" }, `No page called "${id}" on this device.`)]
    : [
        page.id === "common" && page.people.length ? h("p", { class: "logi-sub logi-for" }, `For ${page.people.join(" and ")}`) : null,
        page.id !== "common" ? tripSection(pages, page.id, isoNow) : null,
        ...page.sections.map((s) => renderSection(program, s)),
      ];

  root.replaceChildren(h("section", { class: "view logi-view" },
    title, pages.length > 1 ? tabs : null, ...content,
    h("div", { class: "logi-actions" }, importBtn(false), remove)));
  return () => {};
}
