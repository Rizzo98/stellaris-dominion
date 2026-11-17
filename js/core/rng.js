/* ============================================================
   RNG — seeded pseudo-random numbers
   Galaxy generation uses this instead of Math.random so the same
   seed always produces the same sectors, lanes and systems.
   ============================================================ */

function createRng(seed) {
  let stateValue = seed >>> 0;
  function next() {
    stateValue = (stateValue + 0x6D2B79F5) | 0;
    let t = Math.imul(stateValue ^ (stateValue >>> 15), 1 | stateValue);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /* The save system needs the exact stream position: a saved run must keep
     dealing the same encounter deck after a reload, not restart from the
     seed. The position is the only hidden state in the stream. */
  next.getState = function () {
    return stateValue >>> 0;
  };
  next.setState = function (value) {
    if (typeof value !== "number" || !isFinite(value)) return false;
    stateValue = value >>> 0;
    return true;
  };
  return next;
}

function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function rngPick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function rngShuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
