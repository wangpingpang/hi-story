import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { outDir: 'dist/character-pixel', rollupOptions: { input: 'character-pixel.html' } } });
