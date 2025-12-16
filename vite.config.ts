import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // if using React

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // allows external access
  },
  preview: {
    allowedHosts: ['cers-4.onrender.com']
  }
})
