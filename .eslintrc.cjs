module.exports = {
  root: true,
  extends: ['next', 'next/core-web-vitals'],
  settings: {
    next: {
      rootDir: ['app/', 'pages/', 'src/'],
    },
  },
  plugins: ['@typescript-eslint'],
  ignorePatterns: [
    'node_modules/',
    '.next/',
    'dist/',
    'coverage/',
    'scripts/manual-tests/',
    'docs/',
    'pnpm-lock.yaml',
    'package.json',
    'package.json.web-backup',
    'public/',
    '__tests__/**',
    'tests/**',
  ],
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'react-hooks/rules-of-hooks': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'react/no-unescaped-entities': 'off',
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.test.{ts,tsx}'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
