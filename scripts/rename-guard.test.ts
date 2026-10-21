/*
 * Copyright (C) 2026 Hye Hosting LLC & LXA contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

// Guard fuer die Umbenennung Ararat -> LXA: der alte Name darf in versionierten
// Dateien nur noch vorkommen, wo er technisch gebunden ist - an die provisionierten
// Golden-VMs der E2E-Infra und an die Artefaktnamen/URLs des unbenannten Upstream-Repos.

import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');

const ALLOWED_PATHS = [
  // an die provisionierten Golden-VMs gebunden (Systemd-Unit, /opt-Pfade, Env-Vars)
  'scripts/spice-incus-fixtures/',
  'scripts/spice-qxl-motion-smoke.mjs',
  'scripts/spice-shared-memory-smoke.mjs',
  // nennen die Artefaktnamen und URLs des nicht umbenannten Upstream-Repos
  'README.md',
  // nennt die Dateinamen der vor der Umbenennung genutzten Dev-Zertifikate
  'CONTRIBUTING.md',
  // dieser Guard selbst
  'scripts/rename-guard.test.ts',
];

function isAllowed(path: string): boolean {
  return ALLOWED_PATHS.some((allowed) => path === allowed || path.startsWith(allowed));
}

function trackedFiles(): string[] {
  const raw = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' });
  return raw.split('\0').filter(Boolean);
}

describe('rename guard', () => {
  test('kein alter Produktname in versionierten Dateien ausserhalb des Ausnahmescopes', () => {
    const offenders: string[] = [];
    for (const path of trackedFiles()) {
      if (isAllowed(path)) continue;
      const bytes = readFileSync(join(repoRoot, path));
      // binaere Dateien ueberspringen (Login-Fotos tragen den Bergnamen in der IPTC-Caption)
      if (bytes.subarray(0, 8000).includes(0)) continue;
      if (/ararat/i.test(bytes.toString('utf8'))) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  test('die zurueckgezogene Produktmarke kommt nirgends mehr vor', () => {
    const retired = ['Hye', 'Ararat'].join(' ');
    const offenders: string[] = [];
    for (const path of trackedFiles()) {
      if (path === 'scripts/rename-guard.test.ts') continue; // der Guard selbst
      const bytes = readFileSync(join(repoRoot, path));
      if (bytes.subarray(0, 8000).includes(0)) continue;
      if (bytes.toString('utf8').includes(retired)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  test('README nennt die zurueckgezogene Marke nicht mehr', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(readme).not.toContain(['Hye', 'Ararat'].join(' '));
  });

  test('Paket- und Artefaktname sind umbenannt', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('lxa');
    const workflow = readFileSync(
      join(repoRoot, '.github', 'workflows', 'ui-build.yml'),
      'utf8',
    );
    expect(workflow).toContain('lxa.tar.gz');
  });
});
