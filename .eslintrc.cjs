module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['node_modules/', 'public/', 'dist/', 'coverage/'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    // The current runtime intentionally keeps several compatibility symbols and
    // evaluation fixtures that are consumed dynamically rather than by imports.
    '@typescript-eslint/no-unused-vars': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
  },
};
