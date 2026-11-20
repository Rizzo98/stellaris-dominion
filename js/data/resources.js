/* ============================================================
   RESOURCES — labels, icons and display order
   RESOURCE_META is used by the top bar, sheets and effect pills.
   ============================================================ */

const RESOURCE_META = {
  energy: { name: "Energy", icon: "⚡" },
  minerals: { name: "Minerals", icon: "⛏" },
  research: { name: "Research", icon: "🔬" },
  influence: { name: "Influence", icon: "🏛" },
  stability: { name: "Stability", icon: "⚖" },
  /* People are not a stockpile, but unrest cards can move them and effect
     pills/summaries need a label and an icon. */
  population: { name: "Population", icon: "👥" }
};
const RESOURCE_KEYS = ["energy", "minerals", "research", "influence"];
