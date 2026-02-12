import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'path'

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Assets', dest: '.' },
        { src: 'node_modules/cesium/Build/Cesium/Workers', dest: '.' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: '.' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: '.' }
      ]
    })
  ],
  optimizeDeps: {
    include: [
      'cesium',
      'mersenne-twister',
      'urijs',
      'grapheme-splitter',
      'bitmap-sdf',
      'kdbush',
      'rbush',
      'earcut',
      'pako',
      'protobufjs',
      'lerc',
      'dompurify',
      'autolinker',
      'topojson-client',
      'xml-utils',
      'geotiff',
      'quick-lru'
    ]
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        tour: resolve(__dirname, 'tour.html'),
      },
      output: {
        manualChunks: (id) => {
          if (id.includes('cesium')) return 'cesium'
        }
      }
    }
  }
})
