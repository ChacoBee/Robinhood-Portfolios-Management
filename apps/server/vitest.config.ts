import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

