# Globe Tour

A standalone Vue 3 + Vite application featuring an interactive 3D globe with XYZ tile layers, camera controls, tour scripting, and markers. Built with OpenLayers and Cesium via ol-cesium.

## Features

- 3D globe rendering with Cesium
- XYZ tile layer integration with OpenEO services
- GeoZarr data visualization
- Interactive camera controls (position, heading, pitch)
- Tour scripting with animated camera flights
- Custom marker placement and management

## Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Production Build

```bash
npm run build
npm run preview
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_BASE_URL` | Base URL for deployed assets | `/` |

## Configuration

### Cesium Ion Token

The application uses a Cesium Ion access token for terrain data. You can replace the default token in `src/App.vue`:

```javascript
Cesium.Ion.defaultAccessToken = 'your-token-here'
```

### XYZ Service

Configure the OpenEO XYZ service by modifying the service ID and parameters in the application controls.

## Project Structure

```
globe-tour/
├── index.html          # Entry HTML
├── package.json        # Dependencies and scripts
├── vite.config.js      # Vite configuration with Cesium setup
└── src/
    ├── main.js         # Vue app entry point
    ├── App.vue         # Main application component
    └── style.css       # Global styles
```

## Technologies

- [Vue 3](https://vuejs.org/) - Reactive UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [OpenLayers](https://openlayers.org/) - 2D mapping library
- [Cesium](https://cesium.com/) - 3D globe rendering
- [ol-cesium](https://openlayers.org/ol-cesium/) - OpenLayers-Cesium integration
