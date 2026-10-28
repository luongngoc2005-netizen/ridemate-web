import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { assistantMiddleware } from './server/assistant-api.js'
import { serverConfig } from './server/config.js'

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  const assistant=()=>assistantMiddleware(serverConfig({...env,...process.env},{production:false}));
  return {
    plugins:[react(),{name:'ridemate-assistant-api',configureServer(server){server.middlewares.use(assistant());}}],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-map': ['maplibre-gl'],
            'vietnam-routing': [
              './src/motorcycle-routing.js',
              './src/osrm-data.js',
              './src/domestic-routing.js'
            ],
          }
        }
      },
      chunkSizeWarningLimit: 600
    }
  };
})
