/*
 * Copyright (C) 2026 Hye Hosting LLC & LXA contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

// Renders the designer-supplied master assets into the derived files:
//   public/images/lxa-logo.png        trimmed light wordmark (sidebar light mode)
//   public/images/lxa-logo-dark.png   trimmed dark wordmark, solid background keyed to alpha (sidebar dark mode)
//   public/images/favicon-light.png   square-padded favicon for light mode
//   public/images/favicon-dark.png    square-padded favicon for dark mode
//   app/favicon.ico                   ICO container around the dark 256px PNG (pre-JS default)
// Requires sharp, which Next.js provides as an optional dependency.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const repoRoot = join(import.meta.dir, '..');
const lightSource = join(repoRoot, 'public', 'images', 'LXA.png');
const darkSource = join(repoRoot, 'public', 'images', 'LXA-Logo-DarkMode.png');

// The dark artwork ships with an opaque #2B2B2B background. Key it to alpha with a
// distance ramp so antialiased edges stay smooth on any sidebar/tab background.
const DARK_BG = 43;

async function loadRgba(file: string) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function keyDarkBackground({ data, width, height }: Awaited<ReturnType<typeof loadRgba>>) {
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const distance = Math.max(Math.abs(r - DARK_BG), Math.abs(g - DARK_BG), Math.abs(b - DARK_BG));
    data[i * 4 + 3] = Math.max(0, Math.min(255, (distance - 10) * 8));
  }
  return sharp(data, { raw: { width, height, channels: 4 } });
}

// Sidebar wordmarks: crop to content, keep a 128px tall bitmap for crisp retina.
function wordmark(source: sharp.Sharp) {
  return source.trim({ threshold: 12 }).resize({ height: 128, fit: 'inside' }).png();
}

// Favicons: square 256px canvas, transparent padding, wordmark centered.
async function squareFavicon(source: sharp.Sharp): Promise<Buffer> {
  const trimmed = await source.trim({ threshold: 12 }).png().toBuffer();
  const { width = 0, height = 0 } = await sharp(trimmed).metadata();
  const scale = (256 - 24) / Math.max(width, height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return sharp(trimmed)
    .resize(w, h, { fit: 'fill' })
    .extend({
      top: Math.round((256 - h) / 2),
      bottom: 256 - h - Math.round((256 - h) / 2),
      left: Math.round((256 - w) / 2),
      right: 256 - w - Math.round((256 - w) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
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

const darkKeyed = keyDarkBackground(await loadRgba(darkSource));

const lightLogo = await wordmark(sharp(lightSource)).toBuffer();
writeFileSync(join(repoRoot, 'public', 'images', 'lxa-logo.png'), lightLogo);

const darkLogo = await wordmark(darkKeyed.clone()).toBuffer();
writeFileSync(join(repoRoot, 'public', 'images', 'lxa-logo-dark.png'), darkLogo);

const faviconLight = await squareFavicon(sharp(lightSource));
writeFileSync(join(repoRoot, 'public', 'images', 'favicon-light.png'), faviconLight);

const faviconDark = await squareFavicon(darkKeyed);
writeFileSync(join(repoRoot, 'public', 'images', 'favicon-dark.png'), faviconDark);

const ico = buildIco(await sharp(faviconDark).toBuffer());
writeFileSync(join(repoRoot, 'app', 'favicon.ico'), ico);

console.log(
  `wrote lxa-logo.png (${lightLogo.length} B), lxa-logo-dark.png (${darkLogo.length} B),`,
  `favicon-light.png (${faviconLight.length} B), favicon-dark.png (${faviconDark.length} B),`,
  `favicon.ico (${ico.length} B)`,
);
