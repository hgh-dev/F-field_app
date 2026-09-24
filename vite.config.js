import { defineConfig } from 'vite';

const vendorChunks = {
  'vendor-map': [
    'leaflet',
    '@turf/area',
    '@turf/boolean-point-in-polygon',
    '@turf/boolean-within',
    '@turf/distance',
    '@turf/flatten',
    '@turf/helpers',
    '@turf/length',
    'proj4'
  ],
  'vendor-auth': ['@supabase'],
  'vendor-storage': ['localforage'],
  'vendor-native': ['@capacitor']
};

function manualChunks(id) {
  const normalizedId = id.replaceAll('\\', '/');
  if (!normalizedId.includes('/node_modules/')) return undefined;

  for (const [chunkName, packageNames] of Object.entries(vendorChunks)) {
    if (packageNames.some(packageName => normalizedId.includes(`/node_modules/${packageName}/`))) {
      return chunkName;
    }
  }

  return undefined;
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  }
});
