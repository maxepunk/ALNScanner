#!/usr/bin/env node
/**
 * Coverage Ratchet — generates per-file coverage thresholds from current data.
 * Tracks unit test coverage only (default jest config).
 *
 * Usage:
 *   node scripts/coverage-ratchet.js generate   # Write .coverage-thresholds.json
 *   node scripts/coverage-ratchet.js check       # Verify no file regressed
 */
const fs = require('fs');
const path = require('path');

const COVERAGE_FILE = path.resolve(__dirname, '../coverage/coverage-final.json');
const THRESHOLDS_FILE = path.resolve(__dirname, '../.coverage-thresholds.json');
const ROUND_DOWN_TO = 5; // Round down to nearest 5%

function roundDown(value) {
  return Math.floor(value / ROUND_DOWN_TO) * ROUND_DOWN_TO;
}

/**
 * Calculate line coverage matching Istanbul/Jest's method:
 * Group statements by their start line; a line's hit count is the minimum
 * of all statement hits on that line. This matches what Jest reports as "Lines".
 */
function calculateLineCoverage(data) {
  const lineHits = {};
  for (const [stmtId, count] of Object.entries(data.s)) {
    const line = data.statementMap[stmtId].start.line;
    if (lineHits[line] === undefined) {
      lineHits[line] = count;
    } else {
      lineHits[line] = Math.min(lineHits[line], count);
    }
  }
  const total = Object.keys(lineHits).length;
  const covered = Object.values(lineHits).filter(v => v > 0).length;
  return { total, covered };
}

function generate() {
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error('No coverage data found. Run: npm test -- --coverage');
    process.exit(1);
  }

  const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
  const thresholds = {};

  for (const [filePath, data] of Object.entries(coverage)) {
    // Convert absolute path to relative with ./ prefix (Jest requirement —
    // keys without ./ prefix silently fail to match)
    const relative = './' + path.relative(path.resolve(__dirname, '..'), filePath);

    // Skip files outside coverage collection scope (both src/ and js/ directories)
    if (!relative.startsWith('./src/') && !relative.startsWith('./js/')) continue;

    const { b: branches, f: functions } = data;

    // Calculate percentages
    const { total: lineTotal, covered: lineCovered } = calculateLineCoverage(data);
    const branchTotal = Object.values(branches).flat().length;
    const branchCovered = Object.values(branches).flat().filter(v => v > 0).length;
    const fnTotal = Object.keys(functions).length;
    const fnCovered = Object.values(functions).filter(v => v > 0).length;

    const linesPct = lineTotal > 0 ? roundDown((lineCovered / lineTotal) * 100) : 0;
    const branchPct = branchTotal > 0 ? roundDown((branchCovered / branchTotal) * 100) : 0;
    const fnPct = fnTotal > 0 ? roundDown((fnCovered / fnTotal) * 100) : 0;

    thresholds[relative] = {
      branches: branchPct,
      functions: fnPct,
      lines: linesPct,
    };
  }

  // Sort keys for stable diffs
  const sorted = Object.fromEntries(
    Object.entries(thresholds).sort(([a], [b]) => a.localeCompare(b))
  );

  fs.writeFileSync(THRESHOLDS_FILE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(sorted).length} file thresholds to .coverage-thresholds.json`);
}

function check() {
  if (!fs.existsSync(THRESHOLDS_FILE)) {
    console.error('No .coverage-thresholds.json found. Run: npm run coverage:ratchet');
    process.exit(1);
  }
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error('No coverage data found. Run: npm test -- --coverage');
    process.exit(1);
  }

  const thresholds = JSON.parse(fs.readFileSync(THRESHOLDS_FILE, 'utf8'));
  const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
  const failures = [];

  for (const [relative, threshold] of Object.entries(thresholds)) {
    const absolute = path.resolve(__dirname, '..', relative);
    const data = coverage[absolute];
    if (!data) continue; // File removed — skip

    const { b: branches, f: functions } = data;
    const { total: lineTotal, covered: lineCovered } = calculateLineCoverage(data);
    const branchTotal = Object.values(branches).flat().length;
    const branchCovered = Object.values(branches).flat().filter(v => v > 0).length;
    const fnTotal = Object.keys(functions).length;
    const fnCovered = Object.values(functions).filter(v => v > 0).length;

    const actual = {
      lines: lineTotal > 0 ? (lineCovered / lineTotal) * 100 : 0,
      branches: branchTotal > 0 ? (branchCovered / branchTotal) * 100 : 0,
      functions: fnTotal > 0 ? (fnCovered / fnTotal) * 100 : 0,
    };

    for (const metric of ['branches', 'functions', 'lines']) {
      if (actual[metric] < threshold[metric]) {
        failures.push(`${relative}: ${metric} dropped to ${actual[metric].toFixed(1)}% (threshold: ${threshold[metric]}%)`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('Coverage ratchet failures:');
    failures.forEach(f => console.error(`  ✗ ${f}`));
    process.exit(1);
  }

  console.log(`✓ All ${Object.keys(thresholds).length} files meet coverage thresholds`);
}

const command = process.argv[2];
if (command === 'generate') generate();
else if (command === 'check') check();
else {
  console.error('Usage: coverage-ratchet.js <generate|check>');
  process.exit(1);
}
