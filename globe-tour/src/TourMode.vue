<template>
    <div class="tour-container">
        <div ref="mapRef" class="map-fullscreen"></div>

        <!-- Loading progress bar -->
        <div v-if="isLoadingTiles" class="loading-overlay">
            <div class="loading-container">
                <div class="loading-text">Loading imagery...</div>
                <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: tileLoadProgress + '%' }"></div>
                </div>
                <div class="progress-text">{{ Math.round(tileLoadProgress) }}%</div>
            </div>
        </div>

        <!-- Tour info overlay -->
        <div class="tour-overlay">
            <div class="tour-info">
                <div v-if="currentStepLabel" class="tour-label">{{ currentStepLabel }}</div>
                <a v-if="currentSourceLink" :href="currentSourceLink" target="_blank" rel="noopener noreferrer" class="tour-attribution">
                    {{ currentSourceLabel }}
                </a>
                <span v-else-if="currentSourceLabel" class="tour-attribution">{{ currentSourceLabel }}</span>
                <span class="tour-step-counter">{{ currentTourStep + 1 }} / {{ tourScript.length }}</span>
            </div>
        </div>

        <!-- Playback controls -->
        <div class="playback-controls">
            <button class="control-btn" @click="prevStep" title="Previous step">⏮</button>
            <button class="control-btn" @click="togglePause" :title="isPaused ? 'Play' : 'Pause'">
                {{ isPaused ? '▶' : '⏸' }}
            </button>
            <button class="control-btn" @click="nextStep" title="Next step">⏭</button>
            <select class="section-jump" @change="jumpToSection($event.target.value)" :value="''">
                <option value="" disabled>Jump to...</option>
                <option value="0">Intro</option>
                <option value="3">Mont Blanc</option>
                <option value="12">Venice Lagoon</option>
            </select>
            <button class="control-btn debug-btn" @click="toggleDebug" :class="{ active: debugMode }" title="Debug mode">
                🛠
            </button>
        </div>

        <!-- Debug panel -->
        <div v-if="debugMode" class="debug-panel">
            <div class="debug-header">Camera Position (click to copy)</div>
            <pre class="debug-code" @click="copyDebugInfo">{{ debugCameraInfo }}</pre>
            <div class="debug-hint">{{ debugCopied ? 'Copied!' : 'Use mouse to navigate, click above to copy' }}</div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, onUnmounted } from 'vue'

// Configuration
const openeoBaseUrl = 'https://api.explorer.eopf.copernicus.eu/openeo/services/xyz'

// Time helper functions
const formatDate = (date) => date.toISOString().split('T')[0]
const today = formatDate(new Date())
const yesterday = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
const daysAgo = (n) => formatDate(new Date(Date.now() - n * 24 * 60 * 60 * 1000))
const daysFromNow = (n) => formatDate(new Date(Date.now() + n * 24 * 60 * 60 * 1000))

// Default layer parameters (can be overridden per step)
const defaultLayerParams = {
    serviceId: '456c1e23-47f2-4567-98cf-dcde378a05f7',
    timeStart: yesterday,
    timeEnd: today,
    cloudCover: null,
    additionalParams: ''
}

// Core state
const mapRef = ref(null)
const currentTourStep = ref(0)
const isLoadingTiles = ref(false)
const tileLoadProgress = ref(0)
const isPaused = ref(false)
const debugMode = ref(false)
const debugCopied = ref(false)
const cameraPosition = ref({ lon: 0, lat: 0, alt: 0, heading: 0, pitch: 0, roll: 0 })

// Cesium instances
let cesiumViewer = null
let Cesium = null
let pauseTimeoutId = null
let isDestroyed = false
let currentXyzLayer = null

// Tour Script - customize your tour waypoints here
// Each step can optionally include layer parameters to change the imagery
// duration = fly-to animation time (seconds), pause = time to stay at scene (seconds)
// waitForTiles = wait for all imagery tiles to load before continuing (default: false)
// sourceLabel = attribution text, sourceLink = clickable URL for attribution
const tourScript = ref([
    {
        lon: 4.5, lat: 43.5, alt: 5000000, heading: 0, pitch: -90, roll: 0,
        duration: 3, pause: 0,
        label: 'Welcome to Globe Tour',
        sourceLabel: 'Copernicus data - EOPF Sentinels Explorer', 
        sourceLink: 'https://explorer.eopf.copernicus.eu/',
        layer: { serviceId: '456c1e23-47f2-4567-98cf-dcde378a05f7', timeStart: today, timeEnd: today, cloudCover: 40 }
    },
    {
        lon: 6.8652, lat: 45.7, alt: 40000, heading: 0, pitch: -60, roll: 0, duration: 1, pause: 0, label: 'Approaching Mont Blanc',
    },
    {
        lon: 6.8652, lat: 45.7, alt: 40000, heading: 0, pitch: -60, roll: 0, duration: 4, pause: 3, label: 'Approaching Mont Blanc',
        sourceLabel: "Copernicus data - EOPF Sentinels Explorer", sourceLink: "https://explorer.eopf.copernicus.eu/",
        waitForTiles: true,
        layer: { serviceId: '456c1e23-47f2-4567-98cf-dcde378a05f7', timeStart: daysAgo(28), timeEnd: today, cloudCover: 40 }
    },
    // Mont Blanc orbit - helicopter flight circling the summit (4808m)
    // Summit coords: 6.8652°E, 45.8326°N - orbiting at ~10km distance, ~8000m altitude
    {
        lon: 6.8652, lat: 45.745, alt: 8000, heading: 0, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - South - Sentinel-2 cloud free mosaic - Last 28 days',
    },
    { lon: 6.78, lat: 45.77, alt: 8000, heading: 45, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - Southwest - Sentinel-2 cloud free mosaic - Last 28 days' },
    { lon: 6.75, lat: 45.8326, alt: 8000, heading: 90, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - West - Sentinel-2 cloud free mosaic - Last 28 days' },
    { lon: 6.78, lat: 45.895, alt: 8000, heading: 135, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - Northwest - Sentinel-2 cloud free mosaic - Last 28 days' },
    { lon: 6.8652, lat: 45.92, alt: 8000, heading: 180, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - North - Sentinel-2 cloud free mosaic - Last 28 days' },
    { lon: 6.95, lat: 45.895, alt: 8000, heading: 225, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - Northeast - Sentinel-2 cloud free mosaic - Last 28 days' },
    { lon: 6.98, lat: 45.8326, alt: 8000, heading: 270, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - East - Sentinel-2 cloud free mosaic - Last 28 days' },
    { lon: 6.95, lat: 45.77, alt: 8000, heading: 315, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - Southeast - Sentinel-2 cloud free mosaic - Last 28 days' },
    { lon: 6.8652, lat: 45.745, alt: 8000, heading: 0, pitch: -17, roll: 0, duration: 5, pause: 3, label: 'Mont Blanc - Completing orbit' },
    
    // ========================================
    // VENICE LAGOON - Cyanobacteria & NDCI Tour
    // ========================================
    
    // Transition from Alps to Venice
    {
        lon: 12.3, lat: 45.27, alt: 200000, heading: 0, pitch: -90, roll: 0,
        duration: 6, pause: 3,
        label: 'Flying to Venice Lagoon - Monitoring Cyanobacteria',
        sourceLabel: 'Copernicus Sentinel-2 - EOPF Explorer',
        sourceLink: 'https://explorer.eopf.copernicus.eu/story/?id=ndci',
        layer: { serviceId: '25107b35-eb1b-4171-8a54-b610a02b9c5c', timeStart: '2025-05-12', timeEnd: '2025-05-13' }
    },
    
    // Venice Lagoon Overview - Natural Color
    {
        lon: 12.3, lat: 45.27, alt: 50000, heading: 0, pitch: -70, roll: 0,
        duration: 4, pause: 5,
        waitForTiles: true,
        label: 'Venice Lagoon - Largest lagoon in the Mediterranean',
    },
    
    // Closer look at algae accumulation
    {
        lon: 12.5, lat: 45.37, alt: 20000, heading: -17, pitch: -60, roll: 0,
        duration: 4, pause: 5,
        label: 'Visible algae blooms on the water surface',
        layer: { serviceId: '453c1856-968a-4862-94cc-fe03da7d427a', timeStart: '2025-05-12', timeEnd: '2025-05-13' },
        sourceLabel: 'Aquatic Plants and Algae Detector (APA)',
    },
    
    // Transition to NDCI
    {
        lon: 12.5, lat: 45.37, alt: 20000, heading: -17, pitch: -60, roll: 0,
        duration: 3, pause: 5,
        label: 'NDCI - Normalised Difference Chlorophyll Index',
        layer: { serviceId: '9551a434-c1a9-4600-bddb-d289f55c670e', timeStart: '2025-05-12', timeEnd: '2025-05-13' },
        sourceLabel: 'NDCI Cyanobacteria Chlorophyll-a',
    },
    
    // Northern Lagoon - Industrial influence
    {
        lon: 12.5081, lat: 45.5428, alt: 4812, heading: 262, pitch: -22, roll: 0,
        duration: 4, pause: 4,
        label: 'Northern Lagoon - Industrial influence zone (Marghera)',
    },
    
    // Central Lagoon - Venice Historic
    {
        lon: 12.2459, lat: 45.4072, alt: 3622, heading: 75, pitch: -18, roll: 0, duration: 4, pause: 3,
        label: 'Central Lagoon - Venice Historic Center',
    },
    
    // Southern Lagoon - Chioggia
    {
        lon: 12.2975, lat: 45.1421, alt: 13612, heading: 360, pitch: -60, roll: 0,
        label: 'Southern Lagoon - Chioggia fishing area',
    },
    
    // Seasonal comparison - back to overview
    {
        lon: 12.3, lat: 45.27, alt: 50000, heading: 0, pitch: -70, roll: 0,
        duration: 4, pause: 3,
        label: 'Spring 2025 - Cyanobacteria awakening',
    },
    
    // Summer peak
    {
        lon: 12.3, lat: 45.27, alt: 50000, heading: 0, pitch: -70, roll: 0,
        duration: 1, pause: 5,
        waitForTiles: true,
        label: 'Summer 2025 - Peak algal activity',
        layer: { serviceId: '9551a434-c1a9-4600-bddb-d289f55c670e', timeStart: '2025-07-26', timeEnd: '2025-07-27' },
    },
    
    // Autumn decline
    {
        lon: 12.3, lat: 45.27, alt: 50000, heading: 0, pitch: -70, roll: 0,
        duration: 1, pause: 5,
        waitForTiles: true,
        label: 'Autumn 2025 - Natural decline',
        layer: { serviceId: '9551a434-c1a9-4600-bddb-d289f55c670e', timeStart: '2025-10-24', timeEnd: '2025-10-25' },
    },

])

// Computed property for current step label
const currentStepLabel = computed(() => {
    const step = tourScript.value[currentTourStep.value]
    return step?.label || ''
})

// Find the most recent sourceLabel (sticky - persists until changed)
const currentSourceLabel = computed(() => {
    for (let i = currentTourStep.value; i >= 0; i--) {
        const step = tourScript.value[i]
        if (step?.sourceLabel !== undefined) {
            return step.sourceLabel
        }
    }
    return ''
})

// Find the most recent sourceLink (sticky - persists until changed)
const currentSourceLink = computed(() => {
    for (let i = currentTourStep.value; i >= 0; i--) {
        const step = tourScript.value[i]
        if (step?.sourceLink !== undefined) {
            return step.sourceLink
        }
    }
    return ''
})

// Track current layer params to detect changes
let currentLayerParams = null

// Check if two layer param objects are equal
function layerParamsEqual(a, b) {
    if (!a && !b) return true
    if (!a || !b) return false
    return a.serviceId === b.serviceId &&
        a.timeStart === b.timeStart &&
        a.timeEnd === b.timeEnd &&
        a.cloudCover === b.cloudCover &&
        a.additionalParams === b.additionalParams
}

// Build XYZ URL from parameters
function buildXYZUrl(params) {
    const p = { ...defaultLayerParams, ...params }
    let url = `${openeoBaseUrl}/${p.serviceId}/tiles/{z}/{x}/{y}`
    const queryParams = []

    if (p.timeStart && p.timeEnd) {
        const timeArray = JSON.stringify([p.timeStart, p.timeEnd])
        queryParams.push(`time=${encodeURIComponent(timeArray)}`)
    }

    if (p.cloudCover !== null && p.cloudCover !== '') {
        queryParams.push(`cloud_cover=${p.cloudCover}`)
    }

    if (p.additionalParams) {
        queryParams.push(p.additionalParams)
    }

    if (queryParams.length > 0) {
        url += '?' + queryParams.join('&')
    }

    return url
}

// Update XYZ layer only if params actually changed
function updateXYZLayer(params) {
    if (!cesiumViewer || !Cesium) return

    const newParams = { ...defaultLayerParams, ...params }

    // Skip if params haven't changed - use explicit field comparison to avoid flickering
    if (layerParamsEqual(currentLayerParams, newParams)) {
        return
    }

    // Store current params for future comparison
    currentLayerParams = { ...newParams }

    // Remove existing layer
    if (currentXyzLayer) {
        cesiumViewer.imageryLayers.remove(currentXyzLayer)
    }

    // Add new layer
    const url = buildXYZUrl(newParams)
    console.log('Tour XYZ URL:', url)

    const imageryProvider = new Cesium.UrlTemplateImageryProvider({
        url: url,
        minimumLevel: 0,
        maximumLevel: 18,
    })

    currentXyzLayer = cesiumViewer.imageryLayers.addImageryProvider(imageryProvider)
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

    // Set Cesium Ion access token
    const cesiumToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (cesiumToken) {
        Cesium.Ion.defaultAccessToken = cesiumToken
    }

    // Create Cesium Viewer - minimal UI for tour mode
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
        // Disable user interaction for tour mode
        scene3DOnly: true,
        // Disable default base layer - we'll add dark OSM
        baseLayer: false,
    })

    // Add dark OSM base layer (CartoDB Dark Matter)
    const darkOsmProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        minimumLevel: 0,
        maximumLevel: 18,
        credit: '© OpenStreetMap contributors, © CARTO'
    })
    cesiumViewer.imageryLayers.addImageryProvider(darkOsmProvider)

    // Disable default camera controls for pure tour experience
    cesiumViewer.scene.screenSpaceCameraController.enableRotate = false
    cesiumViewer.scene.screenSpaceCameraController.enableZoom = false
    cesiumViewer.scene.screenSpaceCameraController.enablePan = false
    cesiumViewer.scene.screenSpaceCameraController.enableTilt = false
    cesiumViewer.scene.screenSpaceCameraController.enableLook = false

    // Set initial camera position
    const firstStep = tourScript.value[0]
    cesiumViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(firstStep.lon, firstStep.lat, firstStep.alt),
        orientation: {
            heading: Cesium.Math.toRadians(firstStep.heading || 0),
            pitch: Cesium.Math.toRadians(firstStep.pitch || -90),
            roll: Cesium.Math.toRadians(firstStep.roll || 0),
        },
    })

    // Add initial XYZ layer (use first step's layer params or defaults)
    updateXYZLayer(firstStep.layer || {})

    // Start the tour after a brief delay
    await nextTick()
    setTimeout(startTour, 1000)
}

// Tour execution
function startTour() {
    currentTourStep.value = 0
    executeTourStep()
}

// Wait for imagery layer tiles to be loaded - simple approach: wait fixed time with progress
function waitForTilesLoaded(timeout = 30000) {
    return new Promise((resolve) => {
        const waitTime = 2000 // Fixed 2 second wait
        const startTime = Date.now()
        
        isLoadingTiles.value = true
        tileLoadProgress.value = 0
        
        const updateProgress = () => {
            if (isDestroyed) {
                isLoadingTiles.value = false
                resolve()
                return
            }
            
            const elapsed = Date.now() - startTime
            const progress = Math.min((elapsed / waitTime) * 100, 100)
            tileLoadProgress.value = progress
            
            if (elapsed >= waitTime) {
                tileLoadProgress.value = 100
                setTimeout(() => {
                    isLoadingTiles.value = false
                    resolve()
                }, 50)
            } else {
                requestAnimationFrame(updateProgress)
            }
        }
        
        requestAnimationFrame(updateProgress)
    })
}

function executeTourStep() {
    if (isDestroyed || !cesiumViewer || !Cesium) return

    const step = tourScript.value[currentTourStep.value]

    // Update XYZ layer if this step has layer params
    if (step.layer) {
        updateXYZLayer(step.layer)
    }

    const camera = cesiumViewer.camera

    camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(step.lon, step.lat, step.alt),
        orientation: {
            heading: Cesium.Math.toRadians(step.heading || 0),
            pitch: Cesium.Math.toRadians(step.pitch || -90),
            roll: Cesium.Math.toRadians(step.roll || 0),
        },
        duration: step.duration || 3,
        easingFunction: Cesium.EasingFunction.LINEAR_NONE,
        complete: async () => {
            if (isDestroyed) return

            // Wait for tiles to load if requested
            if (step.waitForTiles) {
                await waitForTilesLoaded(step.tileTimeout || 30000)
            }

            // Pause at the scene before moving to next step
            const pauseTime = (step.pause || 0) * 1000

            // Clear any existing timeout
            if (pauseTimeoutId) {
                clearTimeout(pauseTimeoutId)
            }

            // Don't auto-advance if paused
            if (isPaused.value) return

            pauseTimeoutId = setTimeout(() => {
                if (isDestroyed || isPaused.value) return

                currentTourStep.value++

                // Loop back to start
                if (currentTourStep.value >= tourScript.value.length) {
                    currentTourStep.value = 0
                }

                // Continue to next step
                executeTourStep()
            }, pauseTime)
        },
    })
}

// Playback controls
function togglePause() {
    isPaused.value = !isPaused.value
    if (!isPaused.value) {
        // Resume - continue from current step
        executeTourStep()
    } else if (pauseTimeoutId) {
        clearTimeout(pauseTimeoutId)
    }
}

function prevStep() {
    if (pauseTimeoutId) clearTimeout(pauseTimeoutId)
    isPaused.value = true
    currentTourStep.value = currentTourStep.value > 0 
        ? currentTourStep.value - 1 
        : tourScript.value.length - 1
    executeTourStep()
}

function nextStep() {
    if (pauseTimeoutId) clearTimeout(pauseTimeoutId)
    isPaused.value = true
    currentTourStep.value = currentTourStep.value < tourScript.value.length - 1 
        ? currentTourStep.value + 1 
        : 0
    executeTourStep()
}

function jumpToSection(stepIndex) {
    if (pauseTimeoutId) clearTimeout(pauseTimeoutId)
    isPaused.value = true
    currentTourStep.value = parseInt(stepIndex, 10)
    executeTourStep()
}

// Debug camera info computed property
const debugCameraInfo = computed(() => {
    const p = cameraPosition.value
    return `{ lon: ${p.lon.toFixed(4)}, lat: ${p.lat.toFixed(4)}, alt: ${Math.round(p.alt)}, heading: ${Math.round(p.heading)}, pitch: ${Math.round(p.pitch)}, roll: ${Math.round(p.roll)}, duration: 4, pause: 3 }`
})

// Debug mode functions
let cameraChangeHandler = null

function toggleDebug() {
    debugMode.value = !debugMode.value
    
    if (!cesiumViewer || !Cesium) return
    
    const controller = cesiumViewer.scene.screenSpaceCameraController
    
    if (debugMode.value) {
        // Enable camera controls
        controller.enableRotate = true
        controller.enableZoom = true
        controller.enablePan = true
        controller.enableTilt = true
        controller.enableLook = true
        
        // Pause tour
        isPaused.value = true
        if (pauseTimeoutId) clearTimeout(pauseTimeoutId)
        
        // Start tracking camera position
        updateCameraPosition()
        cameraChangeHandler = cesiumViewer.camera.changed.addEventListener(updateCameraPosition)
    } else {
        // Disable camera controls
        controller.enableRotate = false
        controller.enableZoom = false
        controller.enablePan = false
        controller.enableTilt = false
        controller.enableLook = false
        
        // Stop tracking
        if (cameraChangeHandler) {
            cameraChangeHandler()
            cameraChangeHandler = null
        }
    }
}

function updateCameraPosition() {
    if (!cesiumViewer || !Cesium) return
    
    const camera = cesiumViewer.camera
    const cartographic = Cesium.Cartographic.fromCartesian(camera.position)
    
    cameraPosition.value = {
        lon: Cesium.Math.toDegrees(cartographic.longitude),
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        alt: cartographic.height,
        heading: Cesium.Math.toDegrees(camera.heading),
        pitch: Cesium.Math.toDegrees(camera.pitch),
        roll: Cesium.Math.toDegrees(camera.roll)
    }
}

function copyDebugInfo() {
    navigator.clipboard.writeText(debugCameraInfo.value)
    debugCopied.value = true
    setTimeout(() => { debugCopied.value = false }, 2000)
}

// Lifecycle
onMounted(async () => {
    await initializeMap()
})

onUnmounted(() => {
    isDestroyed = true
    if (pauseTimeoutId) clearTimeout(pauseTimeoutId)
    if (cameraChangeHandler) cameraChangeHandler()
    if (cesiumViewer) {
        cesiumViewer.destroy()
    }
})
</script>

<style scoped>
.tour-container {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.map-fullscreen {
    width: 100%;
    height: 100%;
}

.tour-overlay {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    pointer-events: none;
}

.tour-info {
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 12px 24px;
    border-radius: 20px;
    font-size: 14px;
    backdrop-filter: blur(10px);
    pointer-events: auto;
    text-align: center;
    min-width: 200px;
}

.tour-label {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
}

.tour-attribution {
    display: block;
    font-size: 12px;
    opacity: 0.8;
    margin-bottom: 6px;
    color: #88ccff;
    text-decoration: none;
    pointer-events: auto;
}

.tour-attribution:hover {
    opacity: 1;
    text-decoration: underline;
}

.tour-step-counter {
    font-size: 12px;
    opacity: 0.7;
}

/* Loading progress bar */
.loading-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    pointer-events: none;
}

.loading-container {
    background: rgba(0, 0, 0, 0.8);
    padding: 20px 40px;
    border-radius: 12px;
    backdrop-filter: blur(10px);
    text-align: center;
    min-width: 250px;
}

.loading-text {
    color: white;
    font-size: 14px;
    margin-bottom: 12px;
}

.progress-bar {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
    border-radius: 3px;
    transition: width 0.1s ease-out;
}

.progress-text {
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    margin-top: 8px;
}

/* Hide Cesium credits for cleaner look */
:deep(.cesium-viewer-bottom) {
    display: none !important;
}

/* Playback controls */
.playback-controls {
    position: absolute;
    bottom: 130px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    gap: 8px;
    align-items: center;
    background: rgba(0, 0, 0, 0.6);
    padding: 8px 12px;
    border-radius: 12px;
    backdrop-filter: blur(10px);
}

.control-btn {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    color: white;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.control-btn:hover {
    background: rgba(255, 255, 255, 0.3);
}

.section-jump {
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.15);
    color: white;
    font-size: 13px;
    cursor: pointer;
    margin-left: 8px;
}

.section-jump option {
    background: #222;
    color: white;
}

.debug-btn.active {
    background: rgba(76, 175, 80, 0.6);
}

/* Debug panel */
.debug-panel {
    position: absolute;
    top: 20px;
    right: 20px;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.85);
    padding: 12px 16px;
    border-radius: 8px;
    backdrop-filter: blur(10px);
    max-width: 500px;
    font-family: monospace;
}

.debug-header {
    color: #4facfe;
    font-size: 12px;
    margin-bottom: 8px;
    font-weight: bold;
}

.debug-code {
    color: #90EE90;
    font-size: 11px;
    margin: 0;
    padding: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    cursor: pointer;
    user-select: all;
    white-space: pre-wrap;
    word-break: break-all;
}

.debug-code:hover {
    background: rgba(255, 255, 255, 0.2);
}

.debug-hint {
    color: rgba(255, 255, 255, 0.6);
    font-size: 10px;
    margin-top: 8px;
}
</style>
