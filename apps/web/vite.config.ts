import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: '../../', // reads the single root .env (only VITE_* vars reach the browser)
});
