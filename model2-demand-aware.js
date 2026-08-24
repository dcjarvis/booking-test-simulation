/*
 * Demand-aware, short-horizon Model 2 prototype.
 *
 * Standalone development version. compare.html is not modified by this file.
 */

const MODEL2_LOOKAHEAD = 8;
const MODEL2_INTERVALS = 30;

function model2CountFeasibleStarts(occ, start, end, duration, capacity) {
  let count = 0;
  const maxStart = end - duration;
  for (let s = start; s <= maxStart; s++) {
    let feasible = true;
    for (let i = s; i < s + duration; i++) {
      if (occ[i] + 1 > capacity) {
        feasible = false;
        break;
      }
    }
    if (feasible) count++;
  }
  return count;
}

function model2FutureValue(occ, remaining, fromIndex, capacity, intervalCount, horizon = MODEL2_LOOKAHEAD) {
  const work = occ.slice();
  let accepted = 0;
  let accepted2h = 0;
  let preferenceSatisfied = 0;
  const endIndex = Math.min(remaining.length, fromIndex + horizon);

  for (let k = fromIndex; k < endIndex; k++) {
    const c = remaining[k];
    const duration = c.dur;
    const maxStart = intervalCount - duration;
    let bestStart = -1;
    let bestScore = -Infinity;

    for (let s = 0; s <= maxStart; s++) {
      let feasible = true;
      let load = 0;
      for (let i = s; i < s + duration; i++) {
        if (work[i] + 1 > capacity) {
          feasible = false;
          break;
        }
        load += work[i];
      }
      if (!feasible) continue;

      const preferencePenalty = c.flexible ? 0 : Math.abs(s - c.pref);
      const score = load * 10 - preferencePenalty * 3;
      if (score > bestScore) {
        bestScore = score;
        bestStart = s;
      }
    }

    if (bestStart < 0) continue;

    for (let i = bestStart; i < bestStart + duration; i++) work[i]++;
    accepted++;
    if (duration === 2) accepted2h++;
    if (c.flexible || bestStart === c.pref) preferenceSatisfied++;
  }

  const remaining2h = model2CountFeasibleStarts(work, 0, intervalCount, 2, capacity);
  const remaining1h = model2CountFeasibleStarts(work, 0, intervalCount, 1, capacity);

  return {
    accepted,
    accepted2h,
    preferenceSatisfied,
    remaining2h,
    remaining1h,
    score: accepted * 100 + accepted2h * 20 + preferenceSatisfied * 5 + remaining2h * 2 + remaining1h
  };
}

function model2ScoreCandidate({ occ, candidateStart, duration, capacity, remaining, nextIndex, intervalCount, preferencePenalty = 0 }) {
  const work = occ.slice();
  for (let i = candidateStart; i < candidateStart + duration; i++) work[i]++;

  const immediateLoad = work.slice(candidateStart, candidateStart + duration)
    .reduce((sum, value) => sum + value, 0);

  const before2h = model2CountFeasibleStarts(occ, 0, intervalCount, 2, capacity);
  const after2h = model2CountFeasibleStarts(work, 0, intervalCount, 2, capacity);
  const lostTwoHourOpportunities = Math.max(0, before2h - after2h);

  const future = model2FutureValue(work, remaining, nextIndex, capacity, intervalCount, MODEL2_LOOKAHEAD);

  return {
    score: immediateLoad * 10 - preferencePenalty * 8 + future.score - lostTwoHourOpportunities * 25,
    future,
    lostTwoHourOpportunities
  };
}

function assertModel2Capacity(occ, capacity) {
  for (let i = 0; i < occ.length; i++) {
    if (occ[i] > capacity) {
      throw new Error(`Model 2 capacity violation at interval ${i}: ${occ[i]} > ${capacity}`);
    }
  }
}

// Deterministic demand generator used only by the standalone stress test.
function model2TestDemand(seed, intervalCount) {
  let state = (seed >>> 0) || 1;
  const rand = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const demand = [];
  const count = 120;
  for (let i = 0; i < count; i++) {
    const dur = rand() < 0.38 ? 2 : 1;
    const flexible = rand() < 0.42;
    const pref = Math.floor(rand() * (intervalCount - dur + 1));
    demand.push({ dur, flexible, pref });
  }
  return demand;
}

function simulateModel2DemandAware(p = {}, seed = 1, demand = null) {
  const seats = Math.max(1, Number(p.seats) || 1);
  const overbook = Math.max(0, Number(p.overbook) || 0);
  const capacity = seats + overbook;
  const intervalCount = Number(p.intervals) || MODEL2_INTERVALS;
  const remaining = demand || model2TestDemand(seed, intervalCount);
  const occ = new Array(intervalCount).fill(0);
  let accepted = 0;
  let rejected = 0;

  for (let k = 0; k < remaining.length; k++) {
    const c = remaining[k];
    const maxStart = intervalCount - c.dur;
    let bestStart = -1;
    let bestScore = -Infinity;

    for (let s = 0; s <= maxStart; s++) {
      let feasible = true;
      for (let i = s; i < s + c.dur; i++) {
        if (occ[i] + 1 > capacity) {
          feasible = false;
          break;
        }
      }
      if (!feasible) continue;

      const preferencePenalty = c.flexible ? 0 : Math.abs(s - c.pref);
      const candidate = model2ScoreCandidate({
        occ,
        candidateStart: s,
        duration: c.dur,
        capacity,
        remaining,
        nextIndex: k + 1,
        intervalCount,
        preferencePenalty
      });

      if (candidate.score > bestScore) {
        bestScore = candidate.score;
        bestStart = s;
      }
    }

    if (bestStart < 0) {
      rejected++;
      continue;
    }

    for (let i = bestStart; i < bestStart + c.dur; i++) occ[i]++;
    accepted++;
    assertModel2Capacity(occ, capacity);
  }

  assertModel2Capacity(occ, capacity);
  return { occ, accepted, rejected, capacity };
}

if (typeof module !== 'undefined') {
  module.exports = {
    MODEL2_LOOKAHEAD,
    model2CountFeasibleStarts,
    model2FutureValue,
    model2ScoreCandidate,
    assertModel2Capacity,
    simulateModel2DemandAware
  };
}
