import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // eslint-plugin-react-hooks@7 (bundled with eslint-config-next 16) ships the
    // React Compiler lint rules. This codebase predates them; these flags are
    // accumulated legacy debt, not regressions introduced by a change. Warnings
    // keep `lint` (and therefore `ci`) green while the debt stays visible in
    // lint output. Proper rework for each bucket should land over time.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.cursor/**',
    '.github/**',
    '.kiro/**',
    'public/spice-client/**',
    'public/vendor/**',
    'app/(main)/instance/console/_runtime/source/**',
  ]),
]);

export default eslintConfig;
