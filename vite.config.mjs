import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

const entry = (file) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls: false } })],
  publicDir: false,
  build: {
    rollupOptions: {
      input: { main: entry('index.html'), admin: entry('admin.html') },
    },
  },
});
