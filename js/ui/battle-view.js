/* ============================================================
   BATTLE VIEW — dedicated engagement sheet
   A single balance bar, both fleet manifests with live hull/stats and a
   one-turn concentrated-fire forecast. A patrol on station that will fly
   into the hostile hex is projected as an in-hex combatant (tag INTERCEPT)
   so the forecast includes the hostile return fire; strongholds firing from
   range stay out-of-hex units. Read-only: combat still resolves when the
   turn ends.
   ============================================================ */

function battleUnitHullPercent(unit) {
  if (!unit.hullMax) return 0;
  return clamp((unit.hull / unit.hullMax) * 100, 0, 100);
}

function battleUnitStatsHTML(unit) {
  const stats = [];
  stats.push('<span class="battle-unit-stat attack">⚔ <b>' + unit.attack + '</b> ATK</span>');
  stats.push('<span class="battle-unit-stat hull' + (unit.hull < unit.hullMax ? " damaged" : "") + '">🛡 <b>' +
    unit.hull + '</b>/' + unit.hullMax + '</span>');
  stats.push('<span class="battle-unit-stat power">✦ <b>' + unit.power + '</b> PWR</span>');
  if (unit.kind === "structure") {
    stats.push('<span class="battle-unit-stat range">◎ <b>R' + unit.patrolRadius + '</b></span>');
  } else {
    stats.push('<span class="battle-unit-stat speed">➜ <b>' + unit.speed + '</b> SPD</span>');
    if (unit.patrol) {
      stats.push('<span class="battle-unit-stat patrol">🛡 PATROL R' + unit.patrolRadius + '</span>');
    }
  }
  /* Out-of-hex units show how far they are from the contested hex. */
  if (!unit.inHex) {
    stats.push('<span class="battle-unit-stat range">◎ <b>+' + unit.distance + '</b> HEX</span>');
  }
  return stats.join("");
}

function battleUnitRowHTML(unit) {
  const sideClass = unit.side === "player" ? "player" : "enemy";
  const damaged = unit.hull < unit.hullMax;
  const percentile = battleUnitHullPercent(unit);
  const tag = unit.kind === "structure"
    ? "STATIC"
    : unit.intercepts
      ? "INTERCEPT"
      : !unit.inHex
        ? (unit.canFire ? "RANGED" : "TARGETED")
        : unit.attack > 0 && !unit.canFire
          ? "NO RANGE"
          : damaged ? "DAMAGED" : unit.patrol ? "PATROL" : unit.side === "player" ? "READY" : "HOSTILE";
  const tagClass = unit.kind === "structure"
    ? ""
    : unit.intercepts
      ? " intercept"
      : !unit.inHex
        ? (unit.canFire ? " ranged" : " targeted")
        : unit.attack > 0 && !unit.canFire ? " no-range" : "";
  const owner = unit.empire
    ? unit.empire.name
    : unit.kind === "structure" ? "Player stronghold" : unit.role;
  const style = unit.empire ? ' style="--rival-color:' + unit.empire.color + '"' : "";
  return (
    '<div class="battle-unit ' + sideClass + (damaged ? " damaged" : "") + '"' + style + '>' +
      '<span class="battle-unit-icon" aria-hidden="true">' + unit.emoji + '</span>' +
      '<span class="battle-unit-main">' +
        '<span class="battle-unit-head">' +
          '<span class="battle-unit-name">' + unit.name + '</span>' +
          '<span class="battle-unit-tag' + tagClass + '">' + tag + '</span>' +
        '</span>' +
        '<span class="battle-unit-class">' + unit.typeName + ' · ' + owner + '</span>' +
        '<span class="battle-unit-hull"><span style="width:' + percentile.toFixed(1) + '%"></span></span>' +
        '<span class="battle-unit-stats">' + battleUnitStatsHTML(unit) + '</span>' +
      '</span>' +
    '</div>'
  );
}

function battleCompositionText(units) {
  const parts = [];
  SHIP_ORDER.forEach(function (typeId) {
    const count = units.filter(function (unit) {
      return unit.kind === "ship" && unit.typeId === typeId;
    }).length;
    if (!count) return;
    const type = SHIP_TYPES[typeId];
    parts.push(count + " " + type.name + (count === 1 ? "" : "s"));
  });
  const structures = units.filter(function (unit) { return unit.kind === "structure"; }).length;
  if (structures) parts.push(structures + (structures === 1 ? " stronghold" : " strongholds"));
  return parts.join(" · ");
}

function battleFleetCardHTML(battle, side) {
  const data = battle[side];
  const totals = data.totals;
  const isPlayer = side === "player";
  const label = isPlayer
    ? (data.inHex > 0 ? "YOUR FLEET" : data.intercepts > 0 ? "PATROL RESPONSE" : "YOUR DEFENCE")
    : data.label.toUpperCase();
  const emblem = isPlayer ? "▲" : "⚑";
  const composition = battleCompositionText(data.units);
  const patrols = data.units.filter(function (unit) {
    return unit.kind === "ship" && unit.patrol;
  }).length;
  const intercepts = data.units.filter(function (unit) { return unit.intercepts; }).length;
  const ranged = data.units.filter(function (unit) { return !unit.inHex && !unit.intercepts; }).length;
  const countText = totals.ships + (totals.ships === 1 ? " SHIP" : " SHIPS") +
    (totals.structures ? " + " + totals.structures + " STATIC" : "");
  const style = isPlayer ? "" : ' style="--rival-color:' + battle.rival.color + '"';
  return (
    '<section class="battle-fleet-card ' + (isPlayer ? "player" : "enemy") + '"' + style + '>' +
      '<div class="battle-fleet-head">' +
        '<span class="battle-fleet-emblem" aria-hidden="true">' + emblem + '</span>' +
        '<span class="battle-fleet-title">' +
          '<span class="kicker">' + label + '</span>' +
          '<b>' + countText + '</b>' +
          '<span class="battle-fleet-composition">' + composition +
            (patrols ? " · " + patrols + " on patrol" : "") +
            (intercepts ? " · " + intercepts + " intercepting" : "") +
            (ranged ? " · " + ranged + " at range" : "") + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="battle-total-grid">' +
        '<span class="battle-total"><span>SHIPS</span><b>' + totals.ships + '</b></span>' +
        '<span class="battle-total attack"><span>ATK</span><b>' + totals.attack + '</b></span>' +
        '<span class="battle-total hull"><span>HULL</span><b>' + totals.hull + '/' + totals.hullMax + '</b></span>' +
        '<span class="battle-total power"><span>PWR</span><b>' + totals.power + '</b></span>' +
      '</div>' +
      '<div class="battle-unit-list">' +
        data.units.map(battleUnitRowHTML).join("") +
      '</div>' +
    '</section>'
  );
}

/* "2 ships and 1 stronghold" reads better than listing a zero ship count
   when a stronghold alone is holding the line. */
function battleForceText(totals, isPlayer) {
  const parts = [];
  if (totals.ships) {
    parts.push(totals.ships + (isPlayer ? "" : " hostile") +
      (totals.ships === 1 ? " ship" : " ships"));
  }
  if (totals.structures) {
    parts.push(totals.structures + (totals.structures === 1 ? " stronghold" : " strongholds"));
  }
  return parts.length ? parts.join(" and ") : "no combatants";
}

function battleHeroHTML(battle) {
  const player = battle.player.totals;
  const rival = battle.rival.totals;
  const enemyNames = battle.rival.empires.map(function (empire) { return empire.name; });
  const enemyText = enemyNames.length === 1
    ? enemyNames[0]
    : enemyNames.length > 1 ? "a rival coalition" : "a hostile force";
  const playerText = battleForceText(player, true);
  const rivalText = battleForceText(rival, false);
  let copy = "Your " + playerText + " vs " + rivalText + " from " + enemyText + ".";
  if (battle.intercept) {
    copy += " A patrol on station flies into this hex before the volley, so both sides trade fire at close range.";
  }
  if (battle.ranged) {
    copy += " Static defences outside this hex join only with a firing solution.";
    if (!battle.forecast.enemyStrike.attack) copy += " The hostiles cannot return fire.";
    else if (!battle.forecast.playerStrike.attack) copy += " Your units cannot return fire.";
  }
  copy += " Fire resolves when the turn ends.";
  return (
    '<div class="battle-hero" style="--rival-color:' + battle.rival.color + '">' +
      '<span class="battle-hero-emblem" aria-hidden="true">⚔</span>' +
      '<span class="battle-hero-main">' +
        '<span class="kicker">' + (battle.intercept ? "PATROL INTERCEPT"
          : battle.inHex ? "IN-HEX ENGAGEMENT" : "RANGED ENGAGEMENT") +
          ' · HEX ' + (battle.row + 1) + ':' + (battle.col + 1) + '</span>' +
        '<strong class="battle-hero-title">' + (player.ships || player.count) + ' <small>vs</small> ' +
          (rival.ships || rival.count) + '</strong>' +
        '<span class="battle-hero-copy">' + copy + '</span>' +
      '</span>' +
      '<span class="battle-hero-turn">TURN ' + state.turn + '</span>' +
    '</div>'
  );
}

function battleBalanceHTML(battle) {
  const balance = battle.balance;
  const aria = "Battle balance: player " + balance.playerPercent + " percent, enemy " +
    balance.enemyPercent + " percent. " + balance.label + ".";
  return (
    '<section class="battle-balance">' +
      '<div class="battle-balance-head">' +
        '<span class="kicker">CURRENT BATTLE BALANCE</span>' +
        '<span class="battle-balance-verdict ' + balance.leader + '">' + balance.label + '</span>' +
      '</div>' +
      '<div class="battle-bar" role="img" aria-label="' + aria + '">' +
        '<span class="battle-bar-player" style="width:' + balance.playerPercent + '%"></span>' +
        '<span class="battle-bar-enemy" style="width:' + balance.enemyPercent + '%"></span>' +
        '<span class="battle-bar-marker" style="left:' + balance.playerPercent + '%"></span>' +
        '<span class="battle-bar-even" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="battle-balance-foot">' +
        '<span class="battle-balance-side player"><i></i>PLAYER <b>' + balance.playerPercent + '%</b></span>' +
        '<span class="battle-balance-side enemy"><b>' + balance.enemyPercent + '%</b> ENEMY<i></i></span>' +
      '</div>' +
    '</section>'
  );
}

function battleVolleyRowHTML(side, strike, hullAfter) {
  const isPlayer = side === "player";
  const killParts = [];
  if (strike.shipLosses) {
    killParts.push("UP TO " + strike.shipLosses +
      (strike.shipLosses === 1 ? (isPlayer ? " HOSTILE LOST" : " SHIP LOST") :
        (isPlayer ? " HOSTILES LOST" : " SHIPS LOST")));
  }
  if (strike.structureLosses) {
    killParts.push("UP TO " + strike.structureLosses +
      (strike.structureLosses === 1 ? " STATIC LOST" : " STATICS LOST"));
  }
  const killText = killParts.length
    ? killParts.join(" + ")
    : strike.attack > 0 ? "NO KILL PROJECTED" : "NO OFFENSIVE FIRE";
  const hullLabel = isPlayer ? "ENEMY HULL" : "YOUR HULL";
  return (
    '<div class="battle-volley ' + (isPlayer ? "player" : "enemy") + '">' +
      '<span class="battle-volley-label">' + (isPlayer ? "YOUR VOLLEY" : "ENEMY VOLLEY") + '</span>' +
      '<span class="battle-volley-main">' +
        '<b>' + strike.attack + ' ATK</b>' +
        '<span>' + killText + ' · ' + strike.damage + ' DAMAGE</span>' +
      '</span>' +
      '<span class="battle-volley-hull">' + hullLabel + ' <b>' + hullAfter + '</b></span>' +
    '</div>'
  );
}

function battleForecastHTML(battle) {
  const forecast = battle.forecast;
  const playerTotals = battle.player.totals;
  const rivalTotals = battle.rival.totals;
  const playerLosses = forecast.playerShipLosses;
  const rivalLosses = forecast.rivalShipLosses;
  const playerHullLeft = forecast.playerHullAfter;
  const rivalHullLeft = forecast.rivalHullAfter;
  const playerShipsLeft = playerTotals.ships - playerLosses;
  const rivalShipsLeft = rivalTotals.ships - rivalLosses;
  const staticLosses = [];
  if (forecast.playerStructureLosses) {
    staticLosses.push("You lose " + forecast.playerStructureLosses +
      (forecast.playerStructureLosses === 1 ? " stronghold" : " strongholds"));
  }
  if (forecast.rivalStructureLosses) {
    staticLosses.push("Enemy loses " + forecast.rivalStructureLosses +
      (forecast.rivalStructureLosses === 1 ? " stronghold" : " strongholds"));
  }
  return (
    '<section class="battle-forecast">' +
      '<div class="battle-section-head">' +
        '<h3>NEXT TURN FORECAST</h3>' +
        '<span class="battle-forecast-verdict ' + forecast.leader + '">' + forecast.label + '</span>' +
      '</div>' +
      '<div class="battle-loss-grid">' +
        '<div class="battle-loss player">' +
          '<span>YOU LOSE</span><b>' + playerLosses + '</b><small>' +
            (playerLosses === 1 ? "SHIP" : "SHIPS") + '</small>' +
        '</div>' +
        '<div class="battle-loss-divider" aria-hidden="true">VS</div>' +
        '<div class="battle-loss enemy">' +
          '<span>ENEMY LOSES</span><b>' + rivalLosses + '</b><small>' +
            (rivalLosses === 1 ? "SHIP" : "SHIPS") + '</small>' +
        '</div>' +
      '</div>' +
      (staticLosses.length
        ? '<p class="battle-static-loss">' + staticLosses.join(" · ") + '</p>'
        : "") +
      '<div class="battle-volley-list">' +
        battleVolleyRowHTML("player", forecast.playerStrike, rivalHullLeft) +
        battleVolleyRowHTML("enemy", forecast.enemyStrike, playerHullLeft) +
      '</div>' +
      '<div class="battle-after">' +
        '<div class="battle-after-cell">' +
          '<span>AFTER EXCHANGE</span>' +
          '<b>' + playerShipsLeft + ' <small>vs</small> ' + rivalShipsLeft + '</b>' +
          '<span class="battle-after-sub">SHIPS REMAINING</span>' +
        '</div>' +
        '<div class="battle-after-cell">' +
          '<span>REMAINING HULL</span>' +
          '<b>' + playerHullLeft + ' <small>vs</small> ' + rivalHullLeft + '</b>' +
          '<span class="battle-after-sub">YOU · ENEMY</span>' +
        '</div>' +
      '</div>' +
      '<p class="battle-forecast-note">Concentrated-fire projection for this engagement. Only units with a firing solution contribute; combat picks targets with the seeded military roll and both sides fire simultaneously, so treat the loss count as an upper bound.</p>' +
    '</section>'
  );
}

/* A compact entry point above the fleet manifest. The map's war icon is
   still the primary trigger; this keeps the battle reachable from the hex
   dossier. When the fleet tab belongs to a hex being defended from range,
   `local` names that hex and the callout points at the hostile anchor. */
function battleCalloutHTML(battle, local) {
  const playerCount = battle.player.totals.ships || battle.player.totals.count;
  const rivalCount = battle.rival.totals.ships || battle.rival.totals.count;
  const hasStatic = battle.player.totals.structures > 0 || battle.rival.totals.structures > 0;
  const elsewhere = !!local && (local.row !== battle.row || local.col !== battle.col);
  const intercept = battle.intercept > 0;
  const ranged = !intercept && battle.ranged && (elsewhere || !battle.inHex);
  const patrolElsewhere = elsewhere && !ranged &&
    battle.player.units.some(function (unit) { return unit.kind === "ship" && unit.patrol; });
  const kicker = intercept
    ? "PATROL INTERCEPT" + (elsewhere ? " · HEX " + (battle.row + 1) + ":" + (battle.col + 1) : "")
    : ranged
      ? "RANGED DEFENCE" + (elsewhere ? " · HEX " + (battle.row + 1) + ":" + (battle.col + 1) : "")
      : patrolElsewhere
        ? "PATROL ENGAGED · HEX " + (battle.row + 1) + ":" + (battle.col + 1)
        : elsewhere
          ? "ENGAGEMENT · HEX " + (battle.row + 1) + ":" + (battle.col + 1)
          : "BATTLE IN PROGRESS";
  const combatants = playerCount + rivalCount;
  const countLabel = hasStatic ? " combatants" : combatants > 2 ? " ships" : "";
  return (
    '<div class="battle-callout' + (ranged ? " ranged" : intercept ? " intercept" : "") + '" style="--rival-color:' + battle.rival.color + '">' +
      '<span class="battle-callout-icon" aria-hidden="true">⚔</span>' +
      '<span class="battle-callout-main">' +
        '<span class="kicker">' + kicker + '</span>' +
        '<span class="battle-callout-title">' + playerCount + ' vs ' + rivalCount + countLabel + '</span>' +
        '<span class="battle-callout-sub">' + battle.balance.label + ' · ' +
          battle.balance.playerPercent + '% / ' + battle.balance.enemyPercent + '%</span>' +
      '</span>' +
      '<button class="battle-callout-btn" type="button" data-open-battle="' +
        battle.row + ',' + battle.col + '">FORECAST</button>' +
    '</div>'
  );
}

function battleSheetHTML(battle) {
  return (
    '<div class="battle-sheet">' +
      battleHeroHTML(battle) +
      battleBalanceHTML(battle) +
      '<div class="battle-fleets">' +
        battleFleetCardHTML(battle, "player") +
        battleFleetCardHTML(battle, "rival") +
      '</div>' +
      battleForecastHTML(battle) +
      '<button class="secondary-btn battle-open-hex" type="button" data-battle-open="' +
        battle.row + ',' + battle.col + '">OPEN HEX FLEET</button>' +
    '</div>'
  );
}

function openBattleSheet(row, col) {
  if (state.phase !== "actions") return;
  const sector = getCurrentSector();
  if (!sector) return;
  /* A defender hex has no readout of its own; fall back to the engagement
     that includes its units so the fleet-tab callout always opens a sheet. */
  const battle = getHexBattleReadout(sector.id, row, col) ||
    getBattleInvolvingHex(sector.id, row, col);
  if (!battle) {
    toast("No engagement in this hex.");
    return;
  }
  showSheet({
    kind: "battle",
    kicker: (battle.intercept ? "PATROL INTERCEPT"
      : battle.inHex ? "IN-HEX ENGAGEMENT" : "RANGED ENGAGEMENT") + " · " + sector.name.toUpperCase(),
    title: "Battle · Hex " + (battle.row + 1) + ":" + (battle.col + 1),
    body: battleSheetHTML(battle)
  });
}
