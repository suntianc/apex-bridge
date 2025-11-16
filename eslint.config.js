// ESLint v9 flat config
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginImport from 'eslint-plugin-import'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts','**/*.tsx','**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tseslint.parser,
    },
    plugins: {
      import: pluginImport
    },
    rules: {
      'import/no-unresolved': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-useless-escape': 'off'
    }
  },
  {
    files: ['tests/*.{ts,tsx,js}','tests/**/*.{ts,tsx,js}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off'
    }
  },
  {
    rules: {
      '@typescript-eslint/prefer-as-const': 'off'
    }
  },
  {
    files: ['test-memory.js'],
    rules: {
      'no-undef': 'off'
    }
  }
]
