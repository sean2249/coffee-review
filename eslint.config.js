import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: ['node_modules/**', '.wrangler/**', 'src/worker/worker-configuration.d.ts'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended.map(c => ({ ...c, files: ['src/worker/**/*.ts', 'test/worker/**/*.ts'] })),
    {
        files: ['src/worker/**/*.ts', 'test/worker/**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
    },
    {
        files: ['public/app.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
        },
    },
    {
        files: ['public/sw.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                ...globals.serviceworker,
            },
        },
    },
    {
        files: ['eslint.config.js', 'scripts/**/*.mjs', 'vitest.config.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },
];
