import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'src/manifest.json',
          dest: '.',
        },
        {
          src: 'public/icons/*',
          dest: 'icons',
        },
      ],
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,

    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        contentLoader: resolve(__dirname, 'src/content/content-loader.js'),
        content: resolve(__dirname, 'src/content/index.ts'),
        bridge: resolve(__dirname, 'src/content/page-bridge.ts'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },

      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'contentLoader') return 'content-loader.js';
          if (chunk.name === 'content') return 'content.js';
          if (chunk.name === 'bridge') return 'page-bridge.js';
          if (chunk.name === 'background') return 'background.js';
          return 'assets/[name].js';
        },

        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'popup.css') return 'assets/popup.css';
          if (assetInfo.name === 'style.css') return 'assets/content.css';
          return 'assets/[name][extname]';
        },
      },
    },
  },
});