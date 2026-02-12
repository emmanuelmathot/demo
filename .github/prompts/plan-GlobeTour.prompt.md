## Plan: Standalone Globe Tour Repository

**TL;DR**: Create a minimal Vue 3 + Vite standalone application that replicates all globe-tour functionality (3D globe, XYZ tile layers, camera controls, tour scripting, markers) without VitePress. The project will use OpenLayers + Cesium via ol-cesium, with proper Vite configuration for Cesium's CommonJS dependencies and static assets.

**Steps**

1. **Initialize project structure**
   - Create new directory with `npm create vite@latest globe-tour -- --template vue`
   - Single-page app with one main component

2. **Configure package.json dependencies**
   - Runtime: `vue@^3.4`, `ol@^10.4.0`, `cesium@^1.121.0`, `olcs@^2.18.0`
   - Dev: `vite@^6.0`, `@vitejs/plugin-vue`, `vite-plugin-static-copy@^3.2.0`

3. **Create vite.config.js with Cesium-specific settings**
   - Add `viteStaticCopy` to copy Cesium Assets, Workers, ThirdParty, Widgets folders
   - Configure `optimizeDeps.include` for Cesium's CommonJS dependencies: `mersenne-twister`, `urijs`, `grapheme-splitter`, `bitmap-sdf`, `kdbush`, `rbush`, `earcut`, `pako`, `protobufjs`, `lerc`, `dompurify`, `autolinker`, `topojson-client`, `xml-utils`, `geotiff`, `quick-lru`
   - Set `optimizeDeps.exclude: ['olcs']`
   - Configure `build.rollupOptions.output.manualChunks` for cesium/olcs

4. **Create src/App.vue as main component**
   - Port all reactive state (XYZ params, camera controls, tour state, markers)
   - Port all functions: `initializeMap`, `buildXYZUrl`, `updateXYZLayer`, camera functions, tour functions, marker functions
   - Implement `checkWebGLSupport()` inline (simple canvas test)
   - Full-screen layout with collapsible side panel

5. **Create src/main.js entry point**
   - Mount Vue app, import OpenLayers CSS

6. **Create src/style.css**
   - Port `.tour-controls`, `.control-group`, `.button-group`, `.tour-script` styles
   - Add `.map-container`, `.button`, `.warning` base styles
   - Full-viewport layout CSS

7. **Create index.html**
   - Minimal HTML with mount point and viewport meta

8. **Add .gitignore**
   - Standard Vite/Node ignores: `node_modules`, `dist`, `.vite`

9. **Add README.md**
   - Setup instructions, environment variable docs for `VITE_BASE_URL`

**Verification**
- Run `npm install && npm run dev` - globe should load with terrain and XYZ tiles
- Test tour playback, marker creation, camera controls
- Run `npm run build && npm run preview` - verify production build works

**Decisions**
- Vue 3 + Vite (simplest modern setup, no SSR complexity)
- Single App.vue component (all functionality in one file for simplicity, can refactor later)
- No TypeScript initially (faster to port, can add later)
- Dynamic Cesium/olcs imports retained (supports lazy loading)

---

### File Structure

```
globe-tour/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── README.md
└── src/
    ├── main.js
    ├── App.vue
    └── style.css
```

### Key Configuration Files

**package.json** (key sections):
```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "ol": "^10.4.0",
    "cesium": "^1.121.0",
    "olcs": "^2.18.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "vite-plugin-static-copy": "^3.2.0"
  }
}
```

**vite.config.js** (critical for Cesium):
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
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
      'cesium', 'mersenne-twister', 'urijs', 'grapheme-splitter',
      'bitmap-sdf', 'kdbush', 'rbush', 'earcut', 'pako', 'protobufjs',
      'lerc', 'dompurify', 'autolinker', 'topojson-client', 'xml-utils',
      'geotiff', 'quick-lru'
    ],
    exclude: ['olcs']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('cesium')) return 'cesium'
          if (id.includes('olcs')) return 'olcs'
        }
      }
    }
  }
})
```

---

## Detailed Inventory from Source

### Package Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vue` | ^3.4.0 | Reactivity, lifecycle hooks (`ref`, `onMounted`, `nextTick`, `watch`) |
| `ol` | ^10.4.0 | OpenLayers - Map, View, TileLayer, GeoZarr, OSM |
| `cesium` | ^1.121.0 | 3D globe rendering, camera control, terrain, imagery |
| `olcs` | ^2.18.0 | OLCesium bridge between OpenLayers and Cesium |
| `vite-plugin-static-copy` | ^3.2.0 (dev) | Copy Cesium assets to build output |

### Configuration Settings

**Cesium Ion Access Token:**
```javascript
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2ZWYyOGFkZC0wYzY3LTQwYzUtYjkyNC1iNzFiMDJhNTc1ZWMiLCJpZCI6Mzg4NzYwLCJpYXQiOjE3NzA2NDE3OTB9.YtJeGJVM-72pePu1lNFy8p3AHhODAAhsy65LxYp8ums'
```

**Service URLs:**
```javascript
const zarrUrl = 'https://s3.explorer.eopf.copernicus.eu/esa-zarr-sentinel-explorer-fra/tests-output/sentinel-2-l2a-staging/S2A_MSIL2A_20251227T100441_N0511_R122_T33TVF_20251227T121715.zarr'
const openeoBaseUrl = 'https://api.explorer.eopf.copernicus.eu/openeo/services/xyz'
```

**Cesium Base URL:**
```javascript
const isDev = import.meta.env.DEV
window.CESIUM_BASE_URL = isDev ? '/node_modules/cesium/Build/Cesium/' : import.meta.env.BASE_URL
```

### Reactive State Variables

**XYZ Layer Parameters:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `openeoServiceId` | `'456c1e23-47f2-4567-98cf-dcde378a05f7'` | OpenEO service identifier |
| `timeStart` | `'2026-01-22'` | Start date for temporal query |
| `timeEnd` | `'2026-01-23'` | End date for temporal query |
| `cloudCover` | `''` | Cloud cover filter (0-100) |
| `additionalParams` | `''` | Extra URL query params |

**Camera Controls:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `longitude` | `4.5` | Camera longitude |
| `latitude` | `43.5` | Camera latitude |
| `altitude` | `5000000` | Camera altitude in meters |
| `heading` | `0` | Camera heading (0-360°) |
| `pitch` | `-90` | Camera pitch (-90 to 0°) |
| `roll` | `0` | Camera roll |

**Tour State:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `isTourActive` | `false` | Tour running state |
| `tourSpeed` | `1000` | Milliseconds per step |
| `tourScript` | `[...]` | Array of tour waypoints (14 default steps) |
| `currentTourStep` | `0` | Current step index |

**Markers:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `markers` | `[]` | Array of marker entities |
| `markerName` | `''` | New marker name input |
| `markerLon` | `6.8` | New marker longitude |
| `markerLat` | `45.8` | New marker latitude |

**Core State:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `webglSupport` | `null` | WebGL availability check |
| `mapRef` | `ref()` | DOM ref for map container |
| `is3DEnabled` | `true` | 3D mode enabled |

### Functions to Preserve

**Map & Layer Functions:**
| Function | Purpose |
|----------|---------|
| `initializeMap()` | Async: imports Cesium/olcs, creates OL map with GeoZarr, inits OLCesium, adds terrain |
| `buildXYZUrl()` | Constructs XYZ tile URL with time range and parameters |
| `updateXYZLayer()` | Removes old Cesium imagery layer, adds new one with updated params |
| `checkWebGLSupport()` | Checks WebGL availability via canvas test |

**Camera Functions:**
| Function | Purpose |
|----------|---------|
| `setCameraPosition()` | Instant camera move (setView) |
| `flyToCameraPosition()` | Animated camera flight (flyTo) |
| `getCurrentCameraPosition()` | Reads camera position into reactive vars |

**Tour Functions:**
| Function | Purpose |
|----------|---------|
| `startTour()` | Starts/stops tour execution |
| `executeTourStep()` | Executes single tour step with flyTo animation and layer updates |
| `stopTour()` | Stops tour and resets step counter |
| `clearTourScript()` | Clears all tour waypoints |
| `addCurrentPositionToTour()` | Adds current camera position to tour script |

**Marker Functions:**
| Function | Purpose |
|----------|---------|
| `addMarker()` | Creates Cesium point entity with label |
| `removeMarker(index)` | Removes marker by index |
| `clearMarkers()` | Removes all markers |
| `addMarkerAtCurrentPosition()` | Sets marker coords from camera position |
| `flyToMarker(marker)` | Flies camera to marker location |

### GeoZarr Source Configuration

```javascript
const source = new GeoZarr({
  url: zarrUrl,
  group: 'measurements/reflectance',
  bands: ['b04', 'b03', 'b02'],
})

// Style for WebGLTile layer
style: {
  gamma: 1.5,
  color: [
    'color',
    ['interpolate', ['linear'], ['band', 1], 0, 0, 0.5, 255],
    ['interpolate', ['linear'], ['band', 2], 0, 0, 0.5, 255],
    ['interpolate', ['linear'], ['band', 3], 0, 0, 0.5, 255],
    ['case', ['==', ['+', ['band', 1], ['band', 2], ['band', 3]], 0], 0, 1],
  ],
}
```

### CSS Requirements

**Imported Styles:**
- `ol/ol.css` - OpenLayers base styles
- `cesium/Build/Cesium/Widgets/widgets.css` - Cesium widgets (dynamically imported)

**Component Styles:**
```css
.tour-controls { background: white; padding: 15px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.control-group { margin-bottom: 15px; }
.control-group label { display: block; font-weight: bold; margin-bottom: 5px; }
.control-group input, .control-group select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
.button-group { display: flex; gap: 10px; margin-top: 10px; }
.tour-script { font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px; max-height: 200px; overflow-y: auto; }
```
