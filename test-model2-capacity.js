/*
 * Stress-test harness for model2-demand-aware.js
 *
 * Objective: verify that the Model 2 allocator never exceeds configured
 * capacity for every physical seat count 1..40.
 *
 * This file is intentionally standalone. It does not alter compare.html.
 * Run with Node once the prototype exposes its allocator as required by the
 * harness below.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const MODEL_FILE = './model2-demand-aware.js';
const modelSource = fs.readFileSync(MODEL_FILE, 'utf8');

// The prototype should expose `simulateModel2DemandAware`.
const sandbox = {
  console,
  module: { exports: {} },
  exports: {},
  require,
  assert
};
vm.createContext(sandbox);
vm.runInContext(modelSource, sandbox, { filename: MODEL_FILE });

const simulate = sandbox.module.exports.simulateModel2DemandAware || sandbox.simulateModel2DemandAware;
if (typeof simulate !== 'function') {
  throw new Error(
    'model2-demand-aware.js must export simulateModel2DemandAware(p, seed, demand).'
  );
}

function runCase(seats, overbook, seed) {
  const p = {
    seats,
    overbook,
    reserve: 0,
    hourAlign: true,
    smart: true,
    lookahead: 8
  };

  const result = simulate(p, seed);
  const allowed = seats + overbook;
  const occupancy = result.occ || result.occupancy || [];
  const maxOccupancy = occupancy.length ? Math.max(...occupancy) : 0;

  assert(
    maxOccupancy <= allowed,
    `Capacity violation: seats=${seats}, overbook=${overbook}, ` +
    `maxOccupancy=${maxOccupancy}, allowed=${allowed}, seed=${seed}`
  );

  return { seats, overbook, seed, maxOccupancy, allowed };
}

const results = [];

// Physical-capacity test: every seat count 1..40, with no overbooking.
for (let seats = 1; seats <= 40; seats++) {
  for (const seed of [1, 17, 101, 999]) {
    results.push(runCase(seats, 0, seed));
  }
}

// Explicit overbooking tests.
for (let seats = 1; seats <= 40; seats++) {
  for (const overbook of [1, 2, 5]) {
    for (const seed of [1, 101, 999]) {
      results.push(runCase(seats, overbook, seed));
    }
  }
}

console.log(`PASS: ${results.length} capacity cases; no allocation exceeded configured capacity.`);
console.log('No-overbook cases: seats 1..40 all passed.');
console.log('Overbook cases: overbook 1, 2 and 5 all passed.');
