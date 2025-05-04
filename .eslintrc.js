module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'prettier'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended' // Enables eslint-plugin-prettier and eslint-config-prettier. Displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
  ],
  env: {
    node: true,
    es2022: true, // Use ES2022 globals
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json', // Point to your tsconfig.json for type-aware linting
  },
  rules: {
    'prettier/prettier': 'warn', // Show Prettier violations as warnings
    '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }], // Warn about unused vars, allowing underscores
    '@typescript-eslint/explicit-module-boundary-types': 'off', // Allows omitting return types for functions (can be enabled for stricter typing)
    '@typescript-eslint/no-explicit-any': 'warn', // Warn on usage of 'any' type
    'no-console': 'warn', // Warn about console.log statements
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.eslintrc.js',
    'wrangler.toml' // Often generated or has specific formatting
  ]
};
