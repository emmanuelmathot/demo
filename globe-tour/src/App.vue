<template>
  <div class="app-container">
    <div ref="mapRef" class="map-container"></div>
    
    <button class="toggle-panel-btn" @click="panelCollapsed = !panelCollapsed">
      {{ panelCollapsed ? '◀' : '▶' }}
    </button>

    <div class="side-panel" :class="{ collapsed: panelCollapsed }" v-show="!panelCollapsed">
      <h2>Globe Tour Controls</h2>

      <div v-if="webglSupport === false" class="warning">
        WebGL is not supported in your browser. 3D globe features will not work.
      </div>

      <!-- XYZ Layer Section -->
      <div class="section">
        <h3>XYZ Layer Parameters</h3>
        <div class="tour-controls">
          <div class="control-group">
            <label>OpenEO Service ID</label>
            <input v-model="openeoServiceId" type="text" placeholder="Service ID" />
          </div>
          <div class="row">
            <div class="control-group">
              <label>Time Start</label>
              <input v-model="timeStart" type="date" />
            </div>
            <div class="control-group">
              <label>Time End</label>
              <input v-model="timeEnd" type="date" />
            </div>
          </div>
          <div class="control-group">
            <label>Cloud Cover (%)</label>
            <input v-model="cloudCover" type="number" min="0" max="100" placeholder="0-100" />
          </div>
          <div class="control-group">
            <label>Additional Parameters</label>
            <input v-model="additionalParams" type="text" placeholder="param1=value1&param2=value2" />
          </div>
          <div class="button-group">
            <button class="button button-primary" @click="updateXYZLayer">Update Layer</button>
          </div>
        </div>
      </div>

      <!-- Camera Controls Section -->
      <div class="section">
        <h3>Camera Controls</h3>
        <div class="tour-controls">
          <div class="row">
            <div class="control-group">
              <label>Longitude</label>
              <input v-model.number="longitude" type="number" step="0.1" />
            </div>
            <div class="control-group">
              <label>Latitude</label>
              <input v-model.number="latitude" type="number" step="0.1" />
            </div>
          </div>
          <div class="control-group">
            <label>Altitude (m)</label>
            <input v-model.number="altitude" type="number" step="1000" />
          </div>
          <div class="row">
            <div class="control-group">
              <label>Heading (°)</label>
              <input v-model.number="heading" type="number" min="0" max="360" />
            </div>
            <div class="control-group">
              <label>Pitch (°)</label>
              <input v-model.number="pitch" type="number" min="-90" max="0" />
            </div>
          </div>
          <div class="control-group">
            <label>Roll (°)</label>
            <input v-model.number="roll" type="number" />
          </div>
          <div class="button-group">
            <button class="button button-primary" @click="setCameraPosition">Set Position</button>
            <button class="button button-success" @click="flyToCameraPosition">Fly To</button>
            <button class="button button-secondary" @click="getCurrentCameraPosition">Get Current</button>
          </div>
        </div>
      </div>

      <!-- Tour Section -->
      <div class="section">
        <h3>Tour Controls</h3>
        <div class="tour-controls">
          <div class="control-group">
            <label>Tour Speed (ms per step)</label>
            <input v-model.number="tourSpeed" type="number" min="100" step="100" />
          </div>
          <div class="button-group">
            <button 
              class="button" 
              :class="isTourActive ? 'button-danger' : 'button-success'"
              @click="startTour"
            >
              {{ isTourActive ? 'Stop Tour' : 'Start Tour' }}
            </button>
            <button class="button button-warning" @click="addCurrentPositionToTour">
              Add Current Position
            </button>
            <button class="button button-secondary" @click="clearTourScript">Clear Tour</button>
          </div>
          <div class="control-group" style="margin-top: 15px;">
            <label>Tour Script ({{ tourScript.length }} steps)</label>
            <div class="tour-script">
              <div 
                v-for="(step, index) in tourScript" 
                :key="index"
                class="tour-step"
                :class="{ active: index === currentTourStep && isTourActive }"
                @click="flyToTourStep(index)"
              >
                {{ index + 1 }}. lon: {{ step.lon?.toFixed(2) }}, lat: {{ step.lat?.toFixed(2) }}, alt: {{ step.alt }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Markers Section -->
      <div class="section">
        <h3>Markers</h3>
        <div class="tour-controls">
          <div class="control-group">
            <label>Marker Name</label>
            <input v-model="markerName" type="text" placeholder="Enter marker name" />
          </div>
          <div class="row">
            <div class="control-group">
              <label>Longitude</label>
              <input v-model.number="markerLon" type="number" step="0.1" />
            </div>
            <div class="control-group">
              <label>Latitude</label>
              <input v-model.number="markerLat" type="number" step="0.1" />
            </div>
          </div>
          <div class="button-group">
            <button class="button button-primary" @click="addMarker">Add Marker</button>
            <button class="button button-secondary" @click="addMarkerAtCurrentPosition">
              Use Current Position
            </button>
            <button class="button button-danger" @click="clearMarkers" :disabled="markers.length === 0">
              Clear All
            </button>
          </div>
          <div v-if="markers.length > 0" class="marker-list" style="margin-top: 15px;">
            <div v-for="(marker, index) in markers" :key="index" class="marker-item">
              <span class="marker-item-info" @click="flyToMarker(marker)">
                {{ marker.name }} ({{ marker.lon.toFixed(2) }}, {{ marker.lat.toFixed(2) }})
              </span>
              <button class="button button-danger" @click="removeMarker(index)">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'

// Configuration
const openeoBaseUrl = 'https://api.explorer.eopf.copernicus.eu/openeo/services/xyz'

// Core state
const mapRef = ref(null)
const webglSupport = ref(null)
const panelCollapsed = ref(false)

// Cesium instances (non-reactive for performance)
let cesiumViewer = null
let xyzImageryLayer = null
let Cesium = null

// XYZ Layer Parameters
const openeoServiceId = ref('456c1e23-47f2-4567-98cf-dcde378a05f7')
const timeStart = ref('2026-01-22')
const timeEnd = ref('2026-01-23')
const cloudCover = ref('')
const additionalParams = ref('')

// Camera Controls
const longitude = ref(4.5)
const latitude = ref(43.5)
const altitude = ref(5000000)
const heading = ref(0)
const pitch = ref(-90)
const roll = ref(0)

// Tour State
const isTourActive = ref(false)
const tourSpeed = ref(1000)
const currentTourStep = ref(0)
let tourInterval = null

const tourScript = ref([
  { lon: 4.5, lat: 43.5, alt: 5000000, heading: 0, pitch: -90, roll: 0 },
  { lon: 6.8, lat: 45.8, alt: 500000, heading: 0, pitch: -45, roll: 0 },
  { lon: 11.25, lat: 43.77, alt: 100000, heading: 0, pitch: -30, roll: 0 },
  { lon: 12.49, lat: 41.89, alt: 50000, heading: 45, pitch: -30, roll: 0 },
  { lon: 14.26, lat: 40.85, alt: 30000, heading: 0, pitch: -45, roll: 0 },
  { lon: 23.73, lat: 37.98, alt: 80000, heading: -30, pitch: -30, roll: 0 },
  { lon: 28.98, lat: 41.01, alt: 50000, heading: 0, pitch: -45, roll: 0 },
  { lon: 35.21, lat: 31.78, alt: 100000, heading: 0, pitch: -30, roll: 0 },
  { lon: 55.27, lat: 25.2, alt: 50000, heading: 90, pitch: -30, roll: 0 },
  { lon: 77.21, lat: 28.61, alt: 80000, heading: 0, pitch: -45, roll: 0 },
  { lon: 100.5, lat: 13.75, alt: 60000, heading: 0, pitch: -30, roll: 0 },
  { lon: 121.47, lat: 31.23, alt: 50000, heading: -45, pitch: -30, roll: 0 },
  { lon: 139.69, lat: 35.69, alt: 40000, heading: 0, pitch: -45, roll: 0 },
  { lon: 4.5, lat: 43.5, alt: 5000000, heading: 0, pitch: -90, roll: 0 }
])

// Markers
const markers = ref([])
const markerName = ref('')
const markerLon = ref(6.8)
const markerLat = ref(45.8)

// Check WebGL support
function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return gl !== null
  } catch (e) {
    return false
  }
}

// Build XYZ URL
function buildXYZUrl() {
  let url = `${openeoBaseUrl}/${openeoServiceId.value}/tiles/{z}/{x}/{y}`
  const params = []
  
  if (timeStart.value && timeEnd.value) {
    // Format as JSON array for TemporalInterval
    const timeArray = JSON.stringify([timeStart.value, timeEnd.value])
    params.push(`time=${encodeURIComponent(timeArray)}`)
  }
  
  if (cloudCover.value !== '' && cloudCover.value !== null) {
    params.push(`cloudCover=${cloudCover.value}`)
  }
  
  if (additionalParams.value) {
    params.push(additionalParams.value)
  }
  
  if (params.length > 0) {
    url += '?' + params.join('&')
  }
  
  return url
}

// Initialize Globe
async function initializeMap() {
  if (!mapRef.value) return

  // Set Cesium base URL
  const isDev = import.meta.env.DEV
  window.CESIUM_BASE_URL = isDev ? '/node_modules/cesium/Build/Cesium/' : import.meta.env.BASE_URL

  // Dynamic import for Cesium
  Cesium = await import('cesium')

  // Import Cesium CSS
  await import('cesium/Build/Cesium/Widgets/widgets.css')

  // Set Cesium Ion access token from environment variable
  const cesiumToken = import.meta.env.VITE_CESIUM_ION_TOKEN
  if (cesiumToken) {
    Cesium.Ion.defaultAccessToken = cesiumToken
  } else {
    console.warn('VITE_CESIUM_ION_TOKEN not set - terrain may not load')
  }

  // Create Cesium Viewer directly
  cesiumViewer = new Cesium.Viewer(mapRef.value, {
    terrainProvider: await Cesium.CesiumTerrainProvider.fromIonAssetId(1),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    vrButton: false,
    infoBox: false,
    selectionIndicator: false,
  })

  // Set initial camera position
  cesiumViewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      longitude.value,
      latitude.value,
      altitude.value
    ),
    orientation: {
      heading: Cesium.Math.toRadians(heading.value),
      pitch: Cesium.Math.toRadians(pitch.value),
      roll: Cesium.Math.toRadians(roll.value),
    },
  })

  // Add initial XYZ layer
  await nextTick()
  updateXYZLayer()
}

// Update XYZ Layer
function updateXYZLayer() {
  if (!cesiumViewer || !Cesium) return

  // Remove existing XYZ layer if any
  if (xyzImageryLayer) {
    cesiumViewer.imageryLayers.remove(xyzImageryLayer)
  }

  // Create new XYZ imagery provider
  const url = buildXYZUrl()
  console.log('XYZ URL:', url)

  const imageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: url,
    minimumLevel: 0,
    maximumLevel: 18,
  })

  xyzImageryLayer = cesiumViewer.imageryLayers.addImageryProvider(imageryProvider)
}

// Set camera position instantly
function setCameraPosition() {
  if (!cesiumViewer || !Cesium) return

  const camera = cesiumViewer.camera
  camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      longitude.value,
      latitude.value,
      altitude.value
    ),
    orientation: {
      heading: Cesium.Math.toRadians(heading.value),
      pitch: Cesium.Math.toRadians(pitch.value),
      roll: Cesium.Math.toRadians(roll.value),
    },
  })
}

// Fly to camera position with animation
function flyToCameraPosition() {
  if (!cesiumViewer || !Cesium) return

  const camera = cesiumViewer.camera
  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      longitude.value,
      latitude.value,
      altitude.value
    ),
    orientation: {
      heading: Cesium.Math.toRadians(heading.value),
      pitch: Cesium.Math.toRadians(pitch.value),
      roll: Cesium.Math.toRadians(roll.value),
    },
    duration: 2,
  })
}

// Get current camera position
function getCurrentCameraPosition() {
  if (!cesiumViewer || !Cesium) return

  const camera = cesiumViewer.camera
  const position = camera.positionCartographic

  longitude.value = Cesium.Math.toDegrees(position.longitude)
  latitude.value = Cesium.Math.toDegrees(position.latitude)
  altitude.value = position.height
  heading.value = Cesium.Math.toDegrees(camera.heading)
  pitch.value = Cesium.Math.toDegrees(camera.pitch)
  roll.value = Cesium.Math.toDegrees(camera.roll)
}

// Tour functions
function startTour() {
  if (isTourActive.value) {
    stopTour()
    return
  }

  if (tourScript.value.length === 0) {
    alert('Tour script is empty. Add some waypoints first.')
    return
  }

  isTourActive.value = true
  currentTourStep.value = 0
  executeTourStep()
}

function executeTourStep() {
  if (!isTourActive.value || currentTourStep.value >= tourScript.value.length) {
    stopTour()
    return
  }

  if (!cesiumViewer || !Cesium) return

  const step = tourScript.value[currentTourStep.value]
  const camera = cesiumViewer.camera
  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(step.lon, step.lat, step.alt),
    orientation: {
      heading: Cesium.Math.toRadians(step.heading || 0),
      pitch: Cesium.Math.toRadians(step.pitch || -90),
      roll: Cesium.Math.toRadians(step.roll || 0),
    },
    duration: tourSpeed.value / 1000,
    complete: () => {
      currentTourStep.value++
      if (currentTourStep.value < tourScript.value.length) {
        setTimeout(executeTourStep, 200)
      } else {
        stopTour()
      }
    },
  })
}

function stopTour() {
  isTourActive.value = false
  currentTourStep.value = 0
  if (tourInterval) {
    clearInterval(tourInterval)
    tourInterval = null
  }
}

function clearTourScript() {
  tourScript.value = []
  stopTour()
}

function addCurrentPositionToTour() {
  getCurrentCameraPosition()
  nextTick(() => {
    tourScript.value.push({
      lon: longitude.value,
      lat: latitude.value,
      alt: altitude.value,
      heading: heading.value,
      pitch: pitch.value,
      roll: roll.value,
    })
  })
}

function flyToTourStep(index) {
  const step = tourScript.value[index]
  if (!step) return

  longitude.value = step.lon
  latitude.value = step.lat
  altitude.value = step.alt
  heading.value = step.heading || 0
  pitch.value = step.pitch || -90
  roll.value = step.roll || 0

  flyToCameraPosition()
}

// Marker functions
function addMarker() {
  if (!cesiumViewer) return
  if (!markerName.value.trim()) {
    alert('Please enter a marker name')
    return
  }

  import('cesium').then((Cesium) => {
    const viewer = olCesium.getCesiumScene()
    const entities = viewer.primitives

    // For simplicity, we'll use the scene's primitives or create billboard
    // Since we don't have direct entity access, store marker data
    markers.value.push({
      name: markerName.value,
      lon: markerLon.value,
      lat: markerLat.value,
    })

    // Reset inputs
    markerName.value = ''
  })
}

function removeMarker(index) {
  markers.value.splice(index, 1)
}

function clearMarkers() {
  markers.value = []
}

function addMarkerAtCurrentPosition() {
  getCurrentCameraPosition()
  nextTick(() => {
    markerLon.value = longitude.value
    markerLat.value = latitude.value
  })
}

function flyToMarker(marker) {
  longitude.value = marker.lon
  latitude.value = marker.lat
  altitude.value = 50000
  heading.value = 0
  pitch.value = -45
  roll.value = 0

  flyToCameraPosition()
}

// Lifecycle
onMounted(async () => {
  webglSupport.value = checkWebGLSupport()

  if (webglSupport.value) {
    await initializeMap()
  }
})
</script>

<style scoped>
/* Component-specific styles are in style.css for global access */
</style>
