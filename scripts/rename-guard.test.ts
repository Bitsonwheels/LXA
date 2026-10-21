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
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
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

// Liest nur die ersten 8 KB, um binaere Dateien zu erkennen (Login-Fotos tragen den
// Bergnamen in der IPTC-Caption). Textdateien werden danach vollstaendig geprueft.
function readHead(path: string): Buffer {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(8000);
    const read = readSync(fd, buffer, 0, 8000, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

function isTextFile(path: string): boolean {
  if (!existsSync(join(repoRoot, path))) return false;
  return !readHead(path).includes(0);
}

function filesWithContent(needle: RegExp | string): string[] {
  const hits: string[] = [];
  for (const path of trackedFiles()) {
    if (!isTextFile(path)) continue;
    const content = readFileSync(join(repoRoot, path), 'utf8');
    const found = typeof needle === 'string' ? content.includes(needle) : needle.test(content);
    if (found) hits.push(path);
  }
  return hits;
}

describe('rename guard', () => {
  test('kein alter Produktname in versionierten Dateien ausserhalb des Ausnahmescopes', () => {
    const offenders = filesWithContent(/ararat/i).filter((path) => !isAllowed(path));
    expect(offenders).toEqual([]);
  });

  test('die zurueckgezogene Produktmarke kommt nirgends mehr vor', () => {
    const retired = ['Hye', 'Ararat'].join(' ');
    const offenders = filesWithContent(retired).filter(
      (path) => path !== 'scripts/rename-guard.test.ts', // der Guard selbst
    );
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
