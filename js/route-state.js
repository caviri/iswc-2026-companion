// What the centre column shows, as a hash ("#/explore?topic=t"), and the desktop panel ids that ride
// along in its `panels` param. Views that rewrite their own URL (a topic opened, a room picked) call
// replaceRoute() instead of history.replaceState, so open desktop panels stay in the URL. On phones
// there are never panels, so it is a plain replaceState.
import { centreOf, withPanels } from "./panels.js";

let panels = [];
let centre = null;

/** Replace the current history entry with centre route `hash`, keeping the open panels. */
export function replaceRoute(hash) {
  centre = centreOf(hash);
  try { history.replaceState(null, "", withPanels(hash, panels)); } catch { /* sandboxed: the view still works */ }
}

/** The centre route currently rendered (null before the first render). */
export const currentCentre = () => centre;
export const setCurrentCentre = (hash) => { centre = hash == null ? null : centreOf(hash); };
/** Panel entries ({ id, collapsed }) currently written to the URL. */
export const currentPanels = () => panels;
export const setCurrentPanels = (entries) => { panels = [...entries]; };
