// Model 2 — utilisation optimised, aggressive isolated-gap filling.
// This file is intended to replace only runTrialUtilisationOptimised in compare.html.
// It relies on the shared helpers/constants already defined there.

function runTrialUtilisationOptimised(p, demand, dayIndex = 0) {
  const { day, date } = bookingDay(dayIndex);
  const occ = new Array(INTERVALS).fill(0);
  const capBase = p.seats + p.overbook;
  const ordered = [...demand.ordered];
  const startsCache = {
    2: validStarts(2, p.hourAlign),
    4: validStarts(4, p.hourAlign)
  };
  const weightsCache = {};
  const req = { 2: 0, 4: 0 };
  const rej = { 2: 0, 4: 0 };
  const cancels = new CancelBook(p, demand.spare);
  const results = [];
  const booked = [];

  const reserveFor = dur => dur === 2 ? p.reserve : 0;
  const capFor = dur => capBase - reserveFor(dur);

  // Score how much a candidate fills existing occupancy.
  const packingScore = (s, dur) => {
    let load = 0;
    for (let i = s; i < s + dur; i++) load += occ[i];
    return load;
  };

  // Return the lengths of empty runs created by the candidate.
  const gapProfile = (s, dur) => {
    const after = occ.slice();
    for (let i = s; i < s + dur; i++) after[i]++;

    const gaps = [];
    let run = 0;
    for (let i = 0; i <= INTERVALS; i++) {
      if (i < INTERVALS && after[i] === 0) {
        run++;
      } else if (run) {
        gaps.push(run);
        run = 0;
      }
    }
    return gaps;
  };

  // Very strong penalty for an isolated one-slot hole, then progressively
  // weaker penalties for other short unusable gaps.
  const fragmentationPenalty = (s, dur) => {
    const gaps = gapProfile(s, dur);
    let penalty = 0;
    for (const gap of gaps) {
      if (gap === 1) penalty += 80;
      else if (gap === 2) penalty += 28;
      else if (gap === 3) penalty += 10;
    }

    // Specifically reward closing a one-slot hole between occupied periods.
    for (let i = 1; i < INTERVALS - 1; i++) {
      if (occ[i] === 0 && occ[i - 1] > 0 && occ[i + 1] > 0) {
        let closes = false;
        for (let j = s; j < s + dur; j++) if (j === i) closes = true;
        if (closes) penalty -= 120;
      }
    }
    return penalty;
  };

  const feasible = (s, dur, cap) => {
    for (let i = s; i < s + dur; i++) {
      if (occ[i] + 1 > cap) return false;
    }
    return true;
  };

  for (let k = 0; k < ordered.length; k++) {
    cancels.releaseDue(k);
    const c = ordered[k];
    req[c.dur]++;
    const cap = capFor(c.dur);
    const maxStart = INTERVALS - c.dur;

    if (!weightsCache[c.dur]) {
      weightsCache[c.dur] = prefWeights(maxStart, p.peakBias);
    }

    const pref = sampleIdxFrom(weightsCache[c.dur], c.prefRoll);
    let candidates;

    if (c.flexible) {
      candidates = startsCache[c.dur].filter(s => feasible(s, c.dur, cap));
    } else {
      candidates = startsCache[c.dur].filter(
        s => Math.abs(s - pref) <= 1 && feasible(s, c.dur, cap)
      );
    }

    if (!candidates.length) {
      rej[c.dur]++;
      results.push({
        day,
        date,
        duration: c.dur === 2 ? '1h' : '2h',
        flexible: c.flexible,
        accepted: false,
        outcome: 'Rejected',
        startTime: null,
        model: 'Utilisation Optimised'
      });
      continue;
    }

    let pick = candidates[0];
    let best = -Infinity;

    for (const s of candidates) {
      const load = packingScore(s, c.dur);

      // Packing is the primary objective, but isolated-gap avoidance is
      // deliberately much stronger than before.
      const pack = load * 100;
      const gapPenalty = fragmentationPenalty(s, c.dur);
      const preferencePenalty = Math.abs(s - pref) * (c.flexible ? 2 : 8);

      // For 2-hour bookings, avoid consuming scarce contiguous capacity
      // when an equally packed alternative exists.
      let twoHourProtection = 0;
      if (c.dur === 2) {
        for (const s2 of startsCache[4]) {
          let viable = true;
          for (let i = s2; i < s2 + 4; i++) {
            if (occ[i] + 1 > capBase) {
              viable = false;
              break;
            }
          }
          if (viable && s < s2 + 4 && s + c.dur > s2) {
            twoHourProtection += 8;
          }
        }
      }

      const score = pack - gapPenalty - preferencePenalty - twoHourProtection;
      if (score > best) {
        best = score;
        pick = s;
      }
    }

    for (let i = pick; i < pick + c.dur; i++) occ[i]++;

    const row = {
      day,
      date,
      duration: c.dur === 2 ? '1h' : '2h',
      flexible: c.flexible,
      accepted: true,
      outcome: 'Attended',
      startTime: timeLabel(pick),
      model: 'Utilisation Optimised'
    };

    results.push(row);

    const booking = {
      pool: occ,
      start: pick,
      dur: c.dur,
      row,
      live: true
    };
    booked.push(booking);

    cancels.maybeCancel(k, c, booking, ordered);
  }

  cancels.releaseRemaining();

  return {
    occ,
    ...attendance(booked, p),
    cancelled: cancels.count,
    req,
    rej,
    results
  };
}
