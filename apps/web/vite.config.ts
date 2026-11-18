import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

const API = `http://127.0.0.1:${process.env.PORT ?? 4310}`;

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5310,
    host: '0.0.0.0',
    strictPort: true,
    // trycloudflare 임시 주소로 폰에서 테스트
    allowedHosts: ['.trycloudflare.com', 'localhost'],
    proxy: {
      '/api': API,
      '/media': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
