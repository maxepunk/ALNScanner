/**
 * GmCommand Action-Enum Conformance (AC-1/CC-6/AC-4 safety net)
 *
 * Parses the AsyncAPI GmCommand action enum and asserts every action string
 * emitted by the admin controllers (sendCommand(this.connection, '<action>', ...))
 * is a member. Turns action-string drift into a hard failure.
 *
 * EXPECTED RED until the AC-1/CC-6 fix: AdminOperations.restartSystem()/clearData()
 * emit 'system:restart'/'system:clear' which are NOT in the enum.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const CONTRACT_PATH = path.resolve(__dirname, '../../../../backend/contracts/asyncapi.yaml');
const ADMIN_DIR = path.resolve(__dirname, '../../../src/admin');

function loadActionEnum() {
  const doc = yaml.load(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  return new Set(
    doc.components.messages.GmCommand.payload.properties.data.properties.action.enum
  );
}

function collectControllerActions() {
  const found = new Map(); // action -> [files]
  const re = /sendCommand\(\s*this\.connection,\s*'([^']+)'/g;
  for (const file of fs.readdirSync(ADMIN_DIR)) {
    if (!file.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(ADMIN_DIR, file), 'utf8');
    let m;
    while ((m = re.exec(src)) !== null) {
      const action = m[1];
      if (!found.has(action)) found.set(action, []);
      found.get(action).push(file);
    }
  }
  return found;
}

describe('GmCommand action-enum conformance', () => {
  it('every controller-emitted action is a member of the AsyncAPI GmCommand enum', () => {
    const enumSet = loadActionEnum();
    const actions = collectControllerActions();

    expect(actions.size).toBeGreaterThan(0); // sanity: we actually parsed something

    const violations = [];
    for (const [action, files] of actions) {
      if (!enumSet.has(action)) {
        violations.push(`${action} (emitted by ${files.join(', ')})`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('the enum contains the contract-defined system reset action', () => {
    const enumSet = loadActionEnum();
    expect(enumSet.has('system:reset')).toBe(true);
  });
});
