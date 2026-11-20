import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, type Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyCesiumAssetsPlugin(): Plugin {
  return {
    name: 'ecohero-copy-cesium-assets',
    apply: 'build',
    closeBundle() {
      const cesiumSrc = path.resolve(__dirname, 'node_modules/cesium/Build/Cesium');
      const cesiumDest = path.resolve(__dirname, 'dist/cesium');
      if (!fs.existsSync(cesiumSrc)) return;

      fs.mkdirSync(cesiumDest, { recursive: true });
      const runtimeEntries = ['Cesium.js', 'Assets', 'Widgets', 'Workers', 'ThirdParty'];
      for (const entry of runtimeEntries) {
        const srcPath = path.join(cesiumSrc, entry);
        const destPath = path.join(cesiumDest, entry);
        if (!fs.existsSync(srcPath)) continue;
        fs.cpSync(srcPath, destPath, {
          recursive: true,
          force: true,
          filter: (item) => !item.endsWith('.map'),
        });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      copyCesiumAssetsPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
