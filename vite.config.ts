import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** GitHub project pages test URL; set VITE_BASE=/ before dynalgo.fr (step 5). */
const base = process.env.VITE_BASE ?? '/multigraph-lab-pwa/';
const appVersion = JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf-8')
).version as string;

export default defineConfig({
    base,
    publicDir: 'public',
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'MultiGraph Lab',
                short_name: 'MultiGraph',
                description: 'Visualize and edit relationship graphs offline',
                theme_color: '#18181b',
                background_color: '#18181b',
                display: 'standalone',
                start_url: base,
                scope: base,
                icons: [
                    {
                        src: 'favicon.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any',
                    },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,svg,json}'],
                navigateFallback: 'index.html',
            },
        }),
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
