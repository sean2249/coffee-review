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
        files: ['eslint.config.js', 'vitest.config.ts', 'playwright.config.js', 'scripts/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },
    {
        // Playwright：Node 跑測試，page.evaluate 的回呼在瀏覽器裡跑。
        files: ['e2e/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
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
