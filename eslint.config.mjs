import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'dist_electron/**', 'node_modules/**', 'out/**'],
  },
  js.configs.recommended,
  ...vue.configs['flat/vue2-essential'],
  ...vue.configs['flat/vue2-recommended'],
  prettierRecommended,
  {
    // Root-level build/config files run in Node (ESM) and use Node + browser
    // globals (vite.config reads process.env and streams through URL/console).
    files: ['*.{js,mjs,cjs}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        __APP_ENV__: 'readonly',
        __APP_PLATFORM__: 'readonly',
        ipcRenderer: 'off',
      },
    },
    rules: {
      'vue/component-definition-name-casing': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/no-reserved-component-names': 'off',
      'vue/require-default-prop': 'off',
    },
  },
];
