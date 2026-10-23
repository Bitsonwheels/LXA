// shortcut: minimal self-check for Issue #68 CPU delta logic.
// When usageDelta < 0 (instance restart/reset), percent should not drop below 0.

function calcCpuPercent(usageDelta: number, timeDelta: number, cpuCount: number) {
  if (timeDelta <= 0 || usageDelta < 0) return null; // reset case
  return ((usageDelta / timeDelta) * 100) / cpuCount;
}

// Self-check: negative delta must be skipped, not yield negative percent.
console.assert(calcCpuPercent(-100, 1000, 2) === null, 'negative delta => skip');
console.assert(calcCpuPercent(2000000000, 1000000000, 2) === 100, 'full load on 2 cores => 100%');
console.log('CPU check: OK');
