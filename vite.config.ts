import { defineConfig } from 'vitest/config';
export default defineConfig({base:'./',test:{testTimeout:30000,include:['tests/*.test.ts']}});
