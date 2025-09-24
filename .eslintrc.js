module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'no-console': 'warn',
    'no-unused-vars': ['error', { 
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_'
    }],
    'no-control-regex': 'off',
    'no-constant-condition': 'off',
    'no-useless-escape': 'off',
    'quotes': ['error', 'single'],
    'indent': ['error', 2],
    'prefer-const': 'error'
  },
  globals: {
    'require': 'readonly',
    'module': 'readonly',
    'process': 'readonly',
    'Buffer': 'readonly',
    '__dirname': 'readonly',
    '__filename': 'readonly',
    'global': 'readonly'
  }
};