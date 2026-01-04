import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.tsx',
            refresh: true,
        }),
        react(),
        tailwindcss(),
    ],
    esbuild: {
        jsx: 'automatic',
    },
    resolve: {
        alias: {
            'ziggy-js': resolve(__dirname, 'vendor/tightenco/ziggy'),
        },
        dedupe: ['leaflet'],
    },
    build: {
        rollupOptions: {
            output: {
                // Separate react-icons into its own chunk for better caching
                manualChunks(id) {
                    if (id.includes('react-icons')) {
                        // Extract icon set name (fa, fa6, io5, md, etc.)
                        const match = id.match(/react-icons\/(\w+)/);
                        if (match) {
                            return `icons-${match[1]}`;
                        }
                    }
                    if (id.includes('node_modules')) {
                        if (id.includes('leaflet')) {
                            return 'leaflet';
                        }
                        if (id.includes('recharts')) {
                            return 'recharts';
                        }
                        if (id.includes('react-dom')) {
                            return 'react-vendor';
                        }
                    }
                },
            },
        },
        // Enable minification and tree-shaking
        minify: 'esbuild',
        target: 'es2015',
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'leaflet'],
        exclude: ['react-icons'],
    },
});
