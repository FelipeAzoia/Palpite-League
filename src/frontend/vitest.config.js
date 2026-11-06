import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: '../..',
  test: {
    include: ['tests/frontend/**/*.test.js'],
  },
})