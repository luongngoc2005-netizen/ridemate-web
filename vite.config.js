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
            'ai-assistant': [
              './src/AIAssistant.jsx',
              './src/assistant-client.js',
              './src/assistant-chat.js',
              './src/assistant-data.js',
              './src/assistant-draft.js',
              './src/assistant-intake.js',
              './src/assistant-planner.css',
              './src/ai-assistant.css'
            ],
            'journal': [
              './src/Journal.jsx',
              './src/journal-data.js',
              './src/journal-sync.js',
              './src/journal.css'
            ],
            'stays': [
              './src/stays/Stays.jsx',
              './src/stays/catalog.js',
              './src/stays/booking-data.js',
              './src/stays/BookingContext.jsx',
              './src/stays/booking-store.js'
            ],
          }
        }
      },
      chunkSizeWarningLimit: 600
    }
  };
})
