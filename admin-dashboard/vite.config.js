import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiOrigin = process.env.MOTION_API_ORIGIN || 'http://127.0.0.1:3100';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api/v1': apiOrigin } },
  preview: { proxy: { '/api/v1': apiOrigin } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'vendor-react';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
        },
      },
    },
  },
});
