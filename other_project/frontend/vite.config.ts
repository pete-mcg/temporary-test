/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: '../static',
        emptyOutDir: true,
        sourcemap: true,
    },
    server: {
        proxy: {
            '/ask': 'http://localhost:5000',
            '/chat': 'http://localhost:5000',
            '/api': {
                target: 'http://localhost:50505',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['tests/**/*.ts', 'tests/**/*.tsx'],
    },
});
