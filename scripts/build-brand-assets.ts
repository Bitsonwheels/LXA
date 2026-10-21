/*
 * Copyright (C) 2026 Hye Hosting LLC & LXA contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

// Renders assets/lxa-wordmark.svg into the two derived brand files:
//   app/favicon.ico      256px PNG wrapped in an ICO container
//   public/images/logo.png  500px PNG
// Requires rsvg-convert (librsvg) on PATH; Poppins Bold must be installed as a system font.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');
const source = join(repoRoot, 'assets', 'lxa-wordmark.svg');
const workDir = mkdtempSync(join(tmpdir(), 'lxa-brand-'));

function render(size: number): Buffer {
  const out = join(workDir, `lxa-${size}.png`);
  try {
    execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), source, '-o', out], {
      stdio: 'inherit',
    });
  } catch {
    throw new Error(
      'rsvg-convert not found. Install librsvg2-bin and the Poppins Bold font, then re-run.',
    );
  }
  return readFileSync(out);
}

// ICO container: ICONDIR + one ICONDIRENTRY + the PNG payload (allowed for 256px).
function buildIco(png: Buffer): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(0, 6); // width 0 means 256
  header.writeUInt8(0, 7); // height 0 means 256
  header.writeUInt8(0, 8); // palette size
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // offset of the PNG payload
  return Buffer.concat([header, png]);
}

const favicon = buildIco(render(256));
writeFileSync(join(repoRoot, 'app', 'favicon.ico'), favicon);

const logo = render(500);
writeFileSync(join(repoRoot, 'public', 'images', 'logo.png'), logo);

console.log(`wrote app/favicon.ico (${favicon.length} bytes) and public/images/logo.png (${logo.length} bytes)`);
