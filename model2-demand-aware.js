/* Demand-aware, short-horizon Model 2 prototype. Standalone; compare.html is untouched. */
const MODEL2_LOOKAHEAD = 8;
const MODEL2_INTERVALS = 16;

function model2CountFeasibleStarts(occ, start, end, duration, capacity) {
  let count = 0;
  for (let s = start; s <= end - duration; s++) {
    let ok = true;
    for (let i = s; i < s + duration; i++) if (occ[i] + 1 > capacity) { ok = false; break; }
    if (ok) count++;
  }
  return count;
}

function model2FutureValue(occ, remaining, fromIndex, capacity, intervalCount, horizon = MODEL2_LOOKAHEAD) {
  const work = occ.slice();
  let accepted = 0, accepted2h = 0, preferenceSatisfied = 0;
  const endIndex = Math.min(remaining.length, fromIndex + horizon);
  for (let k = fromIndex; k < endIndex; k++) {
    const c = remaining[k];
    let bestStart = -1, bestScore = -Infinity;
    for (let s = 0; s <= intervalCount - c.dur; s++) {
      let ok = true, load = 0;
      for (let i = s; i < s + c.dur; i++) {
        if (work[i] + 1 > capacity) { ok = false; break; }
        load += work[i];
      }
      if (!ok) continue;
      const preferencePenalty = c.flexible ? 0 : Math.abs(s - c.pref);
      const score = load * 10 - preferencePenalty * 3;
      if (score > bestScore) { bestScore = score; bestStart = s; }
    }
    if (bestStart < 0) continue;
    for (let i = bestStart; i < bestStart + c.dur; i++) work[i]++;
    accepted++;
    if (c.dur === 4) accepted2h++;
    if (c.flexible || bestStart === c.pref) preferenceSatisfied++;
  }
  const remaining2h = model2CountFeasibleStarts(work, 0, intervalCount, 4, capacity);
  const remaining1h = model2CountFeasibleStarts(work, 0, intervalCount, 2, capacity);
  return { accepted, accepted2h, preferenceSatisfied, remaining2h, remaining1h };
}

function model2ScoreCandidate({ occ, candidateStart, duration, capacity, remaining, nextIndex, intervalCount, preferencePenalty = 0 }) {
  const work = occ.slice();
  for (let i = candidateStart; i < candidateStart + duration; i++) work[i]++;

  const immediateLoad = occ.slice(candidateStart, candidateStart + duration).reduce((a, v) => a + v, 0);
  const before2h = model2CountFeasibleStarts(occ, 0, intervalCount, 4, capacity);
  const after2h = model2CountFeasibleStarts(work, 0, intervalCount, 4, capacity);
  const lostTwoHourOpportunities = Math.max(0, before2h - after2h);
  const future = model2FutureValue(work, remaining, nextIndex, capacity, intervalCount, MODEL2_LOOKAHEAD);

  // Primary objective is immediate booking quality. Look-ahead only breaks close calls;
  // it must not sacrifice an otherwise good current booking merely to preserve hypothetical demand.
  const preferenceScore = -preferencePenalty;
  const packingScore = immediateLoad;
  const futureScore = future.accepted * 0.25 + future.accepted2h * 0.10 + future.preferenceSatisfied * 0.02;
  const preservationScore = -lostTwoHourOpportunities * 0.25;
  const fragmentationScore = (future.remaining2h * 0.005) + (future.remaining1h * 0.001);
  const primary = preferenceScore * 10 + packingScore;
  const secondary = futureScore + preservationScore + fragmentationScore;

  return { score: primary * 100 + secondary, primary, secondary, future, lostTwoHourOpportunities };
}

function assertModel2Capacity(occ, capacity) {
  for (let i = 0; i < occ.length; i++) if (occ[i] > capacity) throw new Error(`Model 2 capacity violation at interval ${i}: ${occ[i]} > ${capacity}`);
}

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(arr, rand) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }

function buildComparableDemand(p, seed) {
  const rand = mulberry32(seed), customers = [];
  for (let k = 0; k < p.demand * 2; k++) customers.push({ dur: rand() < p.twoHourShare / 100 ? 4 : 2, flexible: rand() < p.lastMinuteShare / 100, prefRoll: rand(), cancelRoll: rand(), whenRoll: rand(), rebookRoll: rand() });
  const today = customers.slice(0, p.demand);
  const planners = today.filter(c => !c.flexible), flex = today.filter(c => c.flexible);
  shuffle(planners, rand); shuffle(flex, rand);
  return { ordered: [...planners, ...flex], spare: customers.slice(p.demand) };
}

function prefIndex(c) { return Math.floor(c.prefRoll * (MODEL2_INTERVALS - c.dur + 1)); }

function allocateModel2DemandAware(p, demand) {
  const occ = new Array(MODEL2_INTERVALS).fill(0);
  const capacity = p.seats + (p.overbook || 0);
  const accepted = { 2: 0, 4: 0 }, rejected = { 2: 0, 4: 0 };
  for (let k = 0; k < demand.length; k++) {
    const c = demand[k]; c.pref = prefIndex(c);
    const cap = c.dur === 4 ? capacity - (p.reserve || 0) : capacity;
    const candidates = [];
    for (let s = 0; s <= MODEL2_INTERVALS - c.dur; s++) {
      let ok = true;
      for (let i = s; i < s + c.dur; i++) if (occ[i] + 1 > cap) { ok = false; break; }
      if (ok) candidates.push(s);
    }
    if (!candidates.length) { rejected[c.dur]++; continue; }
    let best = null;
    for (const s of candidates) {
      const preferencePenalty = c.flexible ? 0 : Math.abs(s - c.pref);
      const score = model2ScoreCandidate({ occ, candidateStart: s, duration: c.dur, capacity: cap, remaining: demand, nextIndex: k + 1, intervalCount: MODEL2_INTERVALS, preferencePenalty });
      if (!best || score.score > best.score) best = { start: s, ...score };
    }
    for (let i = best.start; i < best.start + c.dur; i++) occ[i]++;
    accepted[c.dur]++;
    assertModel2Capacity(occ, cap);
  }
  return { occ, accepted, rejected, totalAccepted: accepted[2] + accepted[4] };
}

function simulateModel2DemandAware(p, seed, demandOverride) {
  const demand = demandOverride || buildComparableDemand(p, seed).ordered;
  return allocateModel2DemandAware(p, demand);
}

if (typeof module !== 'undefined') module.exports = { MODEL2_LOOKAHEAD, buildComparableDemand, allocateModel2DemandAware, simulateModel2DemandAware, model2ScoreCandidate, model2FutureValue, assertModel2Capacity };
