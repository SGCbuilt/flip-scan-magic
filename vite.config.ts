import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — cached forever, changes rarely
          'vendor-react': ['react', 'react-dom'],
          // Heavy UI tabs loaded on demand
          'tab-financial': [
            './src/components/FinancialTools',
            './src/components/RehabEstimator',
            './src/lib/rehabEstimator',
          ],
          'tab-radar': [
            './src/components/LeadRadar',
            './src/lib/leadRadar',
            './src/lib/skipTrace',
            './src/lib/motivationScore',
            './src/lib/compPull',
          ],
          'tab-intelligence': [
            './src/components/NeighborhoodVelocity',
            './src/lib/neighborhoodVelocity',
            './src/components/ListStacking',
            './src/lib/listStacking',
            './src/components/DealGrade',
            './src/lib/dealGrade',
          ],
          'tab-pipeline': [
            './src/components/Pipeline',
            './src/components/DripSequences',
            './src/lib/drip',
            './src/lib/pipeline',
          ],
          'tab-wholesale': [
            './src/components/Wholesale',
            './src/components/BuyerList',
            './src/lib/wholesalePDF',
            './src/lib/buyerList',
            './src/components/DealPL',
            './src/lib/dealPL',
            './src/components/CostingIntelligence',
          ],
          'tab-project': [
            './src/components/ProjectTracker',
            './src/lib/projectTracker',
          ],
          'tab-market': [
            './src/components/MarketPanel',
            './src/components/MarketAnalyzer',
            './src/lib/market',
            './src/lib/marketAnalyzer',
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
