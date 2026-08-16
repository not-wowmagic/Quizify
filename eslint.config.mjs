import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    ignores: [
      '.next/**',
      '.next-e2e/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'playwright/.cache/**',
      'node_modules/**',
      'test/**',
      // Auto-generated file - never edit or lint it
      'next-env.d.ts',
      // Next.js template config files that use legacy patterns
      'tailwind.config.ts',
      'postcss.config.mjs',
    ],
  },
];

export default eslintConfig;
