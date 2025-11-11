import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig({
  root: './', // Project root is current directory
  publicDir: 'data', // Static assets (tokens data)

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,

    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },

  server: {
    port: 8443,
    https: true, // Required for NFC API
    open: true,
    host: '0.0.0.0' // Allow network access
  },

  plugins: [
    // HTML processing
    createHtmlPlugin({
      minify: true
    })
  ],

  // Resolve configuration
  resolve: {
    alias: {
      '@': '/src',
      '@app': '/src/app',
      '@core': '/src/core',
      '@network': '/src/network',
      '@ui': '/src/ui',
      '@utils': '/src/utils'
    }
  }
});
