import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'  // Import path for resolving aliases

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),  // Adds '@' as an alias for 'src/'
    },
  },
})
