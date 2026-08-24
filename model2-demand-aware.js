/*
 * Demand-aware, short-horizon Model 2 prototype.
 *
 * This file is deliberately standalone while the algorithm is developed.
 * It does not modify compare.html yet.
 */

const MODEL2_LOOKAHEAD = 8;

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

      const preferencePenalty = c.flexible ? 0 : Math.abs(s - (c.pref ?? s));
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

  const future = model2FutureValue(
    work,
    remaining,
    nextIndex,
    capacity,
    intervalCount,
    MODEL2_LOOKAHEAD
  );

  return {
    score:
      immediateLoad * 10
      - preferencePenalty * 8
      + future.score
      - lostTwoHourOpportunities * 25,
    future,
    lostTwoHourOpportunities
  };
}

// Optional invariant helper for the eventual integration/test harness.
function assertModel2Capacity(occ, capacity) {
  for (let i = 0; i < occ.length; i++) {
    if (occ[i] > capacity) {
      throw new Error(`Model 2 capacity violation at interval ${i}: ${occ[i]} > ${capacity}`);
    }
  }
}
