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

// Cesium instances
let cesiumViewer = null
let Cesium = null
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
        duration: 3, pause: 2,
        label: 'Welcome to Globe Tour',
        sourceLabel: 'Copernicus data - EOPF Sentinels Explorer', 
        sourceLink: 'https://explorer.eopf.copernicus.eu/',
        layer: { serviceId: '456c1e23-47f2-4567-98cf-dcde378a05f7', timeStart: today, timeEnd: today, cloudCover: 40 }
    },
    {
        lon: 6.8652, lat: 45.7, alt: 40000, heading: 0, pitch: -60, roll: 0, duration: 4, pause: 0, label: 'Approaching Mont Blanc',
    },
    {
        lon: 6.8652, lat: 45.7, alt: 40000, heading: 0, pitch: -60, roll: 0, duration: 4, pause: 3, label: 'Approaching Mont Blanc',
        sourceLabel: "Copernicus data - EOPF Sentinels Explorer", sourceLink: "https://explorer.eopf.copernicus.eu/",
        waitForTiles: true,
        layer: { serviceId: '456c1e23-47f2-4567-98cf-dcde378a05f7', timeStart: daysAgo(10), timeEnd: today, cloudCover: 40 }
    },
    // Mont Blanc orbit - helicopter flight circling the summit (4808m)
    // Summit coords: 6.8652°E, 45.8326°N - orbiting at ~10km distance, ~8000m altitude
    {
        lon: 6.8652, lat: 45.745, alt: 8000, heading: 0, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - South - Sentinel-2 cloud free mosaic - Last 7 days',
    },
    { lon: 6.78, lat: 45.77, alt: 8000, heading: 45, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - Southwest - Sentinel-2 cloud free mosaic - Last 7 days' },
    { lon: 6.75, lat: 45.8326, alt: 8000, heading: 90, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - West - Sentinel-2 cloud free mosaic - Last 7 days' },
    { lon: 6.78, lat: 45.895, alt: 8000, heading: 135, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - Northwest - Sentinel-2 cloud free mosaic - Last 7 days' },
    { lon: 6.8652, lat: 45.92, alt: 8000, heading: 180, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - North - Sentinel-2 cloud free mosaic - Last 7 days' },
    { lon: 6.95, lat: 45.895, alt: 8000, heading: 225, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - Northeast - Sentinel-2 cloud free mosaic - Last 7 days' },
    { lon: 6.98, lat: 45.8326, alt: 8000, heading: 270, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - East - Sentinel-2 cloud free mosaic - Last 7 days' },
    { lon: 6.95, lat: 45.77, alt: 8000, heading: 315, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - Southeast - Sentinel-2 cloud free mosaic - Last 7 days' },
    { lon: 6.8652, lat: 45.745, alt: 8000, heading: 0, pitch: -17, roll: 0, duration: 5, pause: 0, label: 'Mont Blanc - South - Sentinel-2 cloud free mosaic - Last 7 days' },
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

// Wait for imagery layer tiles to be loaded using network activity monitoring
function waitForTilesLoaded(timeout = 30000) {
    return new Promise((resolve) => {
        const startTime = Date.now()
        
        let stableFrames = 0
        const requiredStableFrames = 6
        let lastResourceCount = 0
        
        // Show loading bar immediately
        isLoadingTiles.value = true
        tileLoadProgress.value = 0
        
        // Get current count of resources loaded
        const getResourceCount = () => {
            try {
                const entries = performance.getEntriesByType('resource')
                // Count only XYZ tile requests
                return entries.filter(e => e.name.includes('/tiles/')).length
            } catch (e) {
                return 0
            }
        }
        
        const initialResourceCount = getResourceCount()

        const checkTiles = () => {
            if (isDestroyed) {
                isLoadingTiles.value = false
                resolve()
                return
            }

            const elapsed = Date.now() - startTime
            const currentResourceCount = getResourceCount()
            const newResources = currentResourceCount - initialResourceCount
            
            // Resources stable if count hasn't changed since last check
            const resourcesStable = currentResourceCount === lastResourceCount
            
            console.log(`Tiles check: newResources=${newResources}, stable=${resourcesStable}, stableFrames=${stableFrames}, elapsed=${elapsed}ms`)
            
            if (resourcesStable && elapsed > 300) {
                stableFrames++
            } else if (!resourcesStable) {
                stableFrames = 0
            }
            
            lastResourceCount = currentResourceCount
            
            // Update progress bar
            const progress = Math.min((stableFrames / requiredStableFrames) * 100, 99)
            tileLoadProgress.value = Math.max(progress, Math.min((elapsed / 2000) * 80, 80))

            // Done conditions
            if (stableFrames >= requiredStableFrames) {
                console.log(`Imagery tiles loaded: ${newResources} tiles in ${elapsed}ms`)
                tileLoadProgress.value = 100
                setTimeout(() => {
                    isLoadingTiles.value = false
                    resolve()
                }, 100)
            } else if (elapsed > timeout) {
                console.log('Tile loading timeout, continuing...')
                tileLoadProgress.value = 100
                isLoadingTiles.value = false
                resolve()
            } else {
                setTimeout(checkTiles, 100)
            }
        }

        // Start checking after brief delay
        setTimeout(checkTiles, 100)
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

            setTimeout(() => {
                if (isDestroyed) return

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

// Lifecycle
onMounted(async () => {
    await initializeMap()
})

onUnmounted(() => {
    isDestroyed = true
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
</style>
