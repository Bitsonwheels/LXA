/*
 * Copyright (C) 2026 Hye Hosting LLC & LXA contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

// Makes the tab favicon follow the active app theme. The media attribute on
// <link rel="icon"> is not honored by every browser, so swap the href after
// hydration instead. Until then app/favicon.ico (dark variant) is in place.
// The hardcoded /ui basePath matches the existing house pattern (sidebar logout).
const FAVICONS = {
  light: '/ui/images/favicon-light.png',
  dark: '/ui/images/favicon-dark.png',
} as const;

export default function ThemeFavicon() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') {
      return;
    }
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (link) {
      link.setAttribute('href', FAVICONS[resolvedTheme]);
    }
  }, [resolvedTheme]);

  return null;
}
