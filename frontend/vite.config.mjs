// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     allowedHosts: [
//       'unpenciled-unhumored-thora.ngrok-free.dev',
//     ],
//   }
// })
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    allowedHosts: ['.ngrok-free.dev'],
    hmr: false,
    host: true,
  }
})
