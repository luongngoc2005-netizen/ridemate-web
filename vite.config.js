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
            // maplibre-gl is now dynamically imported in RouteMap.jsx, it will create its own chunk
            'shared-utils': [
              './src/trip-data.js',
              './src/plans-data.js',
              './src/plan-sync.js',
              './src/planned-places.js',
              './src/route-data.js',
              './src/osrm-data.js',
              './src/domestic-routing.js',
              './src/useNavigationState.js',
              './src/usePlanSync.js',
              './src/supabase.js',
              './src/account-name.js',
              './src/journal-sync.js',
            ],
            'vietnam-routing': [
              './src/motorcycle-routing.js',
              './src/boundary-geometry.js',
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
              './src/journal.css'
            ],
            'stays': [
              './src/stays/Stays.jsx',
              './src/stays/catalog.js',
              './src/stays/booking-data.js',
              './src/stays/BookingContext.jsx',
              './src/stays/booking-store.js'
            ],
            'journey': [
              './src/Journey.jsx',
              './src/TripCompanion.jsx',
              './src/journey.css',
              './src/mobile-journey.css'
            ],
            'plans': [
              './src/Plans.jsx',
            ],
            'map-routing': [
              './src/RouteMap.jsx',
              './src/DestinationMap.jsx'
            ],
          }
        }
      },
      chunkSizeWarningLimit: 600
    }
  };
})
