import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
    },
  },
  preview: { host: '0.0.0.0', port: 3000, strictPort: true },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react-dom/') || id.includes('/node_modules/react/')) return 'react-vendor';
          if (id.includes('/react-router/')) return 'router-vendor';
          if (id.includes('/@supabase/')) return 'supabase-vendor';
          return undefined;
        },
      },
    },
  },
});
