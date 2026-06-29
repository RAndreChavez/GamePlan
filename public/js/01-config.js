/* App configuration and map utility helpers. */
const DEFAULT_CENTER = [36.0626, -94.1574];
const categoryIcons = { Nightlife:'🍸', Music:'🎵', Food:'🌮', Sports:'🏃', Art:'🎨', Study:'📚', Gaming:'🎮', Community:'✨' };
const DEFAULT_MEDIA_IMAGE = '/assets/gameplan-default.png';
const DARK_WORDMARK_SRC = '/assets/gameplan-wordmark-regular.png';
const LIGHT_WORDMARK_SRC = '/assets/gameplan-wordmark-darktext.png';
const emojiOptions = ['🎸','🪩','🎤','🎧','🎮','🏀','⚽','🌮','🍕','🍸','☕','🎨','📚','✨','🎬','🎟️','🏖️','🛍️','🚗','💼','🔥','💃','🧠','🎲'];
const privacyLabels = { public:'Public', friends_only:'Friends only', private:'Private', link_only:'Link only' };

const DARK_MAP_STYLE = {
  version: 8,
  sources: {
    cartoDark: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [{ id: 'carto-dark', type: 'raster', source: 'cartoDark', paint: { 'raster-opacity': 0.92 } }],
};
const LIGHT_MAP_STYLE = {
  version: 8,
  sources: {
    cartoLight: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [{ id: 'carto-light', type: 'raster', source: 'cartoLight', paint: { 'raster-opacity': 0.96 } }],
};
const THEME_KEY = 'gp_theme';
function currentTheme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function currentMapStyle() { return currentTheme() === 'light' ? LIGHT_MAP_STYLE : DARK_MAP_STYLE; }
const RADIUS_SOURCE_ID = 'gameplan-search-radius';
const RADIUS_FILL_ID = 'gameplan-search-radius-fill';
const RADIUS_LINE_ID = 'gameplan-search-radius-line';
const NAV_ROUTE_SOURCE_ID = 'gameplan-navigation-route';
const NAV_ROUTE_LINE_ID = 'gameplan-navigation-route-line';
const NAV_ROUTE_GLOW_ID = 'gameplan-navigation-route-glow';

function assertMapLibre() {
  if (!window.maplibregl) throw new Error('MapLibre GL failed to load. Check your internet connection and refresh.');
}
function lngLatFromLatLng(latLng) {
  return Array.isArray(latLng) ? [Number(latLng[1]), Number(latLng[0])] : [Number(latLng.lng), Number(latLng.lat)];
}
function setMapView(map, latLng, zoom = undefined, animate = true) {
  if (!map) return;
  const center = lngLatFromLatLng(latLng);
  const opts = { center, zoom: zoom ?? map.getZoom(), essential: true };
  if (animate && typeof map.flyTo === 'function') map.flyTo(opts);
  else map.jumpTo(opts);
}
function syncMobileViewportVars() {
  const vv = window.visualViewport;
  const height = vv?.height || window.innerHeight || document.documentElement.clientHeight || 0;
  if (height) document.documentElement.style.setProperty('--app-vh', `${Math.round(height)}px`);
}
function resizeMaps() {
  syncMobileViewportVars();
  app.map?.resize?.();
  app.locationMap?.resize?.();
}
function applyTheme(theme = 'dark', persist = true) {
  const safeTheme = theme === 'light' ? 'light' : 'dark';
  app.themePreference = safeTheme;
  document.documentElement.dataset.theme = safeTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', safeTheme === 'light' ? '#f6fbff' : '#02050b');
  document.querySelectorAll('.brand-wordmark, .mobile-brand-wordmark').forEach(img => { img.src = safeTheme === 'light' ? LIGHT_WORDMARK_SRC : DARK_WORDMARK_SRC; });
  if (persist) localStorage.setItem(THEME_KEY, safeTheme);
  const selector = $('#themePreferenceSelect');
  if (selector) selector.value = safeTheme;
  if (app.user && $('#accountSettingsPanel') && !$('#profileModal')?.classList.contains('hidden')) renderAccountSettingsPanel();
  updateMapTheme();
}
function updateMapTheme() {
  const style = currentMapStyle();
  const refreshMain = () => {
    drawRadiusCircle();
    if (app.navigation?.route) drawNavigationRoute(app.navigation.route);
    if (app.searchCenter) drawSearchMarker(app.userLocated ? 'You are searching from here' : 'Search area center');
    renderMapEvents();
    setTimeout(resizeMaps, 80);
  };
  if (app.map && typeof app.map.setStyle === 'function') {
    app.map.setStyle(style);
    app.map.once('styledata', refreshMain);
  }
  if (app.locationMap && typeof app.locationMap.setStyle === 'function') {
    app.locationMap.setStyle(style);
    app.locationMap.once('styledata', () => setTimeout(() => app.locationMap?.resize?.(), 80));
  }
}
function stabilizeMobileMapUI() {
  syncMobileViewportVars();
  updateMobileShell((location.hash || '#map').slice(1) || 'map');
  if (app.mobileMode) {
    setMobileFiltersOpen(false);
    if ($('#eventPanel')?.classList.contains('hidden')) document.body.classList.remove('mobile-panel-open');
    requestAnimationFrame(() => {
      app.map?.resize?.();
      drawRadiusCircle();
      positionActiveFloatingEventPreview();
    });
    [80, 220, 520, 1000].forEach(ms => setTimeout(() => {
      syncMobileViewportVars();
      app.map?.resize?.();
      drawRadiusCircle();
      positionActiveFloatingEventPreview();
    }, ms));
  }
}
function createMapMarker(className, html, lat, lng, anchor = 'bottom') {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = html;
  return new maplibregl.Marker({ element: el, anchor }).setLngLat([Number(lng), Number(lat)]);
}
function removeMapLayerAndSource(map, layerIds = [], sourceId = '') {
  if (!map) return;
  layerIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  if (sourceId && map.getSource(sourceId)) map.removeSource(sourceId);
}
function circleGeoJSON(centerLat, centerLng, radiusMiles, points = 96) {
  const earthRadiusKm = 6371.0088;
  const radiusKm = Number(radiusMiles) * 1.609344;
  const lat = Number(centerLat) * Math.PI / 180;
  const lng = Number(centerLng) * Math.PI / 180;
  const angularDistance = radiusKm / earthRadiusKm;
  const coordinates = [];
  for (let i = 0; i <= points; i += 1) {
    const bearing = (i / points) * Math.PI * 2;
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(angularDistance) + Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing));
    const lng2 = lng + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
      Math.cos(angularDistance) - Math.sin(lat) * Math.sin(lat2)
    );
    coordinates.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coordinates] }, properties: {} }] };
}
