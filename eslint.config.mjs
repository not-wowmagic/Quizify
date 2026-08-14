import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
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
      'node_modules/**',
      'test/**',
      // Auto-generated file — never edit or lint it
      'next-env.d.ts',
      // Next.js template config files that use legacy patterns
      'tailwind.config.ts',
      'postcss.config.mjs',
    ],
  },
];

export default eslintConfig;
