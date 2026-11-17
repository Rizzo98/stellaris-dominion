/* ============================================================
   ETHICS — origin choices shown on the start screen
   Each entry carries its modifiers, starting bonuses and option locks.
   ============================================================ */

const ETHICS = {
  militarist: {
    id: "militarist",
    name: "Militarist",
    emoji: "⚔️",
    color: "#ff9b73",
    blurb: "Strength is the only currency the void respects.",
    modifiers: ["+10% minerals", "−1 influence / turn"],
    mineralMult: 1.1,
    influenceFlat: -1
  },
  pacifist: {
    id: "pacifist",
    name: "Pacifist",
    emoji: "🕊️",
    color: "#8ee6a3",
    blurb: "A civilization is measured by what it chooses not to destroy.",
    modifiers: ["+1 influence / turn", "[Military] choices locked"],
    influenceFlat: 1,
    blocksMilitary: true
  },
  xenophile: {
    id: "xenophile",
    name: "Xenophile",
    emoji: "🛸",
    color: "#c6a8ff",
    blurb: "Every alien signal is an invitation, not a threat.",
    modifiers: ["+10% research", "Unlocks [Xeno] choices"],
    researchMult: 1.1,
    unlocksXeno: true
  }
};
const ETHIC_ORDER = ["militarist", "pacifist", "xenophile"];
