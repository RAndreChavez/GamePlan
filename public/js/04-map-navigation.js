/* Map rendering, live location, navigation, event preview, and event profile interactions. */
let radiusCircle = false;
function drawSearchMarker(label='Search center') {
  if (!app.map) return;
  app.searchMarker?.remove();
  app.searchMarker = createMapMarker('search-center-marker', '<span>⌖</span>', app.searchCenter[0], app.searchCenter[1], 'center').addTo(app.map);
  app.searchMarker.getElement().setAttribute('title', label);
}
function drawRadiusCircle() {
  if (!app.map || !app.searchCenter || !app.map.isStyleLoaded()) return;
  const miles = getRadiusMiles();
  const data = circleGeoJSON(app.searchCenter[0], app.searchCenter[1], miles);
  if (app.map.getSource(RADIUS_SOURCE_ID)) {
    app.map.getSource(RADIUS_SOURCE_ID).setData(data);
  } else {
    app.map.addSource(RADIUS_SOURCE_ID, { type: 'geojson', data });
    app.map.addLayer({
      id: RADIUS_FILL_ID,
      type: 'fill',
      source: RADIUS_SOURCE_ID,
      paint: { 'fill-color': '#00d8ff', 'fill-opacity': 0.08 },
    });
    app.map.addLayer({
      id: RADIUS_LINE_ID,
      type: 'line',
      source: RADIUS_SOURCE_ID,
      paint: { 'line-color': '#00d8ff', 'line-width': 2.5, 'line-opacity': 0.72 },
    });
  }
  radiusCircle = true;
}


function startLiveLocationTracking() {
  if (!navigator.geolocation || app.userWatchId !== null) return;
  app.userWatchId = navigator.geolocation.watchPosition((pos) => {
    const loc = [pos.coords.latitude, pos.coords.longitude];
    app.userLocation = loc;
    updateUserLocationMarker(loc, pos.coords.accuracy);
    if (app.navigation.active) updateNavigationLive();
    if (app.selectedEventId) updateEventPanelDistance();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 });
}
function updateUserLocationMarker(loc, accuracy = null) {
  if (!app.map || !loc) return;
  const color = app.user?.profile?.locatorColor || '#00d8ff';
  const html = `<span class="user-dot" style="--user-locator:${escapeHtml(color)}"></span>${Number.isFinite(accuracy) ? `<b style="--user-locator:${escapeHtml(color)}" title="Accuracy ${Math.round(accuracy)}m"></b>` : ''}`;
  if (!app.userLocationMarker) {
    app.userLocationMarker = createMapMarker('user-location-marker', html, loc[0], loc[1], 'center').addTo(app.map);
  } else {
    app.userLocationMarker.setLngLat([loc[1], loc[0]]);
    app.userLocationMarker.getElement().innerHTML = html;
  }
}
function routeGeoJSON(coords) {
  return { type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'LineString', coordinates: coords }, properties:{} }] };
}
function straightRoute(origin, event) {
  const dist = distanceBetweenMiles(origin[0], origin[1], event.lat, event.lng);
  return { coordinates:[[origin[1], origin[0]],[Number(event.lng), Number(event.lat)]], distanceMiles:dist, durationSeconds:(dist / 25) * 3600, provider:'straight-line fallback' };
}
async function fetchRouteToEvent(event) {
  if (!app.userLocation) return straightRoute(app.searchCenter || DEFAULT_CENTER, event);
  const [startLat, startLng] = app.userLocation;
  try {
    const data = await api(`/api/directions?startLat=${encodeURIComponent(startLat)}&startLng=${encodeURIComponent(startLng)}&endLat=${encodeURIComponent(event.lat)}&endLng=${encodeURIComponent(event.lng)}&profile=driving-car`);
    return data.route || straightRoute(app.userLocation, event);
  } catch (_) {
    return straightRoute(app.userLocation, event);
  }
}
function drawNavigationRoute(route) {
  if (!app.map || !route?.coordinates?.length || !app.map.isStyleLoaded()) return;
  const data = routeGeoJSON(route.coordinates);
  if (app.map.getSource(NAV_ROUTE_SOURCE_ID)) {
    app.map.getSource(NAV_ROUTE_SOURCE_ID).setData(data);
  } else {
    app.map.addSource(NAV_ROUTE_SOURCE_ID, { type:'geojson', data });
    app.map.addLayer({ id:NAV_ROUTE_GLOW_ID, type:'line', source:NAV_ROUTE_SOURCE_ID, layout:{ 'line-cap':'round', 'line-join':'round' }, paint:{ 'line-color':'#00d8ff', 'line-width':10, 'line-opacity':0.18 } });
    app.map.addLayer({ id:NAV_ROUTE_LINE_ID, type:'line', source:NAV_ROUTE_SOURCE_ID, layout:{ 'line-cap':'round', 'line-join':'round' }, paint:{ 'line-color':'#7CFF4F', 'line-width':4, 'line-opacity':0.9 } });
  }
}
function clearNavigationRoute() { removeMapLayerAndSource(app.map, [NAV_ROUTE_LINE_ID, NAV_ROUTE_GLOW_ID], NAV_ROUTE_SOURCE_ID); }
function fitNavigationBounds(route) {
  if (!app.map || !route?.coordinates?.length) return;
  const bounds = new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]);
  route.coordinates.forEach(c => bounds.extend(c));
  const mobilePad = isMobileViewport() ? { top: 96, bottom: 260, left: 32, right: 32 } : { top:120, bottom:220, left:480, right:480 };
  app.map.fitBounds(bounds, { padding: mobilePad, maxZoom:15, essential:true });
}
async function startNavigation(eventId) {
  if (!requireLogin()) return;
  const event = app.events.find(e => e.id === eventId) || app.savedEvents.find(e => e.id === eventId);
  if (!event) return toast('Event not found.', 'error');
  if (!app.userLocation && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy:true, timeout:8000, maximumAge:10000 }));
      app.userLocation = [pos.coords.latitude, pos.coords.longitude];
      updateUserLocationMarker(app.userLocation, pos.coords.accuracy);
    } catch (_) { toast('Using approximate route preview. Allow location for real-time navigation.', 'error'); }
  }
  app.navigation.active = true;
  app.navigation.eventId = event.id;
  app.navigation.lastRouteAt = 0;
  await updateNavigationLive(true);
  toast(`Navigation started for ${event.title}.`);
}
async function updateNavigationLive(force = false) {
  if (!app.navigation.active) return;
  const event = app.events.find(e => e.id === app.navigation.eventId) || app.savedEvents.find(e => e.id === app.navigation.eventId);
  if (!event) return stopNavigation(false);
  const now = Date.now();
  const origin = app.userLocation || app.searchCenter || DEFAULT_CENTER;
  const moved = !app.navigation.lastRouteOrigin || distanceBetweenMiles(origin[0], origin[1], app.navigation.lastRouteOrigin[0], app.navigation.lastRouteOrigin[1]) > 0.03;
  if (force || moved || now - app.navigation.lastRouteAt > 20000) {
    const route = await fetchRouteToEvent(event);
    app.navigation.route = route;
    app.navigation.lastRouteAt = now;
    app.navigation.lastRouteOrigin = origin;
    drawNavigationRoute(route);
    if (force) fitNavigationBounds(route);
  }
  renderNavigationHud(event);
}
function renderNavigationHud(event) {
  const hud = $('#navigationHud');
  if (!hud) return;
  const route = app.navigation.route || straightRoute(app.userLocation || app.searchCenter || DEFAULT_CENTER, event);
  hud.classList.remove('hidden');
  hud.innerHTML = `<div class="nav-hud-top"><div><p class="eyebrow">Live navigation</p><h3>${escapeHtml(event.title)}</h3></div><button id="stopNavigationBtn" class="icon-btn" type="button">×</button></div><div class="nav-hud-grid compact"><div><strong>${formatMiles(route.distanceMiles)}</strong><span>distance</span></div><div><strong>${formatEta(route.durationSeconds)}</strong><span>ETA</span></div></div><small>${app.userLocation ? 'Tracking your live location. Route refreshes as you move.' : 'Enable location permission for live tracking.'}</small>`;
  $('#stopNavigationBtn')?.addEventListener('click', () => stopNavigation());
}
function stopNavigation(showToast = true) {
  app.navigation = { active:false, eventId:null, route:null, lastRouteAt:0, lastRouteOrigin:null };
  clearNavigationRoute();
  $('#navigationHud')?.classList.add('hidden');
  if (showToast) toast('Navigation stopped.');
}
function updateEventPanelDistance() {
  const el = $('#eventDistanceValue');
  const e = app.events.find(x => x.id === app.selectedEventId) || app.savedEvents.find(x => x.id === app.selectedEventId);
  if (el && e) el.textContent = eventDistanceText(e);
}


function initMap() {
  if (app.map) return;
  assertMapLibre();
  app.map = new maplibregl.Map({
    container: 'map',
    style: currentMapStyle(),
    center: [app.searchCenter[1], app.searchCenter[0]],
    zoom: 12,
    attributionControl: false,
  });
  app.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  app.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  app.map.on('load', () => {
    setTimeout(() => { app.map.resize(); if(app.userLocation) updateUserLocationMarker(app.userLocation); drawSearchMarker(app.userLocated ? 'You are searching from here' : 'Fayetteville demo search center'); drawRadiusCircle(); renderMapEvents(); stabilizeMobileMapUI(); }, 100);
  });
  app.map.on('move', positionActiveFloatingEventPreview);
  app.map.on('zoom', positionActiveFloatingEventPreview);
  app.map.on('resize', positionActiveFloatingEventPreview);
  [200,600,1200].forEach(ms=>setTimeout(()=>app.map?.resize?.(), ms));
}
function renderMapEvents() {
  if (!app.map) return;
  app.markers.forEach(m=>m.remove()); app.markers=[];
  const events = visibleEvents();
  $('#eventList').innerHTML = '';
  events.forEach(e=>{
    const markerColor = e.markerColor || '#7CFF4F';
    const markerEmoji = e.markerEmoji || categoryIcons[e.category] || '📍';
    const marker = createMapMarker('gp-marker', `<span class="pin-shell" style="--pin:${escapeHtml(markerColor)}"><i class="pin-core">${escapeHtml(markerEmoji)}</i></span><b class="pin-pulse"></b>`, e.lat, e.lng, 'bottom').addTo(app.map);
    const markerEl = marker.getElement();
    markerEl.style.setProperty('--pin', markerColor);
    markerEl.dataset.eventId = e.id;
    markerEl.classList.toggle('selected', app.selectedEventId === e.id);
    markerEl.addEventListener('click', (event)=>{ event.stopPropagation(); selectEvent(e.id); renderFloatingEventPreview(e); });
    markerEl.addEventListener('mouseenter', ()=>renderFloatingEventPreview(e));
    app.markers.push(marker);
  });
  app.map.resize();
  bindSaveButtons();
  renderNearbyCarousel();
  renderTopStats();
}
function eventListCard(e) {
  const imgs = eventImages(e);
  const saved = isSaved(e.id);
  return `<article class="event-card" data-id="${e.id}"><img src="${escapeHtml(firstImage(e))}" alt=""><div><div class="event-card-head"><h3>${escapeHtml(e.title)}</h3><button class="save-event-btn ${saved?'active':''}" data-toggle-save="${e.id}" type="button" aria-label="${saved?'Unsave':'Save'} event">${saved?'★':'☆'}</button></div><p>${escapeHtml(e.category)}${e.locationName ? ` · ${escapeHtml(e.locationName)}` : ''} · ${fmtTime(e.startsAt)} · ${eventDistanceText(e)}</p><div class="meter"><span style="width:${Math.min(100,totalSold(e)/Math.max(1,totalCap(e))*100)}%"></span></div><small>${tierSummary(e)} · ${e.showTicketAvailability === false ? 'availability hidden' : `${totalSold(e)}/${totalCap(e)} sold`} · ${escapeHtml(privacyLabels[e.visibility] || e.visibility)}${imgs.length>1 ? ` · ${imgs.length} photos` : ''}</small></div></article>`;
}
function updateSelectedMapMarker() {
  app.markers.forEach((marker) => {
    const el = marker.getElement?.();
    if (el) el.classList.toggle('selected', el.dataset.eventId === app.selectedEventId);
  });
}
function selectEvent(id) { app.selectedEventId=id; updateSelectedMapMarker(); const e=app.events.find(x=>x.id===id) || app.savedEvents.find(x=>x.id===id); if(!e)return; setMobileFiltersOpen(false); setMapView(app.map, [e.lat,e.lng], 14); renderFloatingEventPreview(e); renderEventPanel(e); }
function ageIcon(age='') { const a=String(age).toLowerCase(); if(a.includes('all')) return '👨‍👩‍👧'; if(a.includes('21')) return '🍸'; if(a.includes('18')) return '🔞'; return '✅'; }
function availabilityText(e) { return e.showTicketAvailability === false ? 'Availability hidden by host' : `${totalSold(e)}/${totalCap(e)} sold`; }

function positionFloatingEventPreview(event) {
  const box = $('#eventPreviewCard');
  if (!box || !event || !app.map || box.classList.contains('hidden')) return;
  const pt = app.map.project([Number(event.lng), Number(event.lat)]);
  const pad = 14;
  const boxWidth = Math.min(380, Math.max(280, box.offsetWidth || 340));
  const mapRect = $('#map')?.getBoundingClientRect?.();
  const mapWidth = mapRect?.width || window.innerWidth;
  const mapHeight = mapRect?.height || window.innerHeight;
  const left = Math.min(Math.max(pt.x, boxWidth / 2 + pad), mapWidth - boxWidth / 2 - pad);
  const top = Math.min(Math.max(pt.y, 110), mapHeight - 110);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.right = 'auto';
  box.style.bottom = 'auto';
  box.style.transform = 'translate(-50%, calc(-100% - 28px))';
}
function positionActiveFloatingEventPreview() {
  if (!app.previewEventId) return;
  const event = app.events.find(e => e.id === app.previewEventId) || app.savedEvents.find(e => e.id === app.previewEventId);
  if (event) positionFloatingEventPreview(event);
}
function renderFloatingEventPreview(e) {
  const box = $('#eventPreviewCard');
  if (!box || !e) return;
  app.previewEventId = e.id;
  box.classList.remove('hidden');
  box.innerHTML = `<button class="floating-preview-close" type="button">×</button><img src="${escapeHtml(firstImage(e))}" alt=""><div><p class="eyebrow">${escapeHtml(e.category)}</p><h3>${escapeHtml(e.title)}</h3><small>${fmtTime(e.startsAt)} · ${eventDistanceText(e)}</small><div class="floating-preview-actions"><button class="primary-btn small" data-floating-open="${e.id}" type="button">Open</button><button class="primary-btn small go-btn mini-go" data-floating-go="${e.id}" type="button">GO</button><button class="secondary-btn small" data-toggle-save="${e.id}" type="button">${isSaved(e.id) ? '★ Saved' : '☆ Save'}</button></div></div>`;
  positionFloatingEventPreview(e);
  box.querySelector('.floating-preview-close')?.addEventListener('click',()=>{ app.previewEventId=null; box.classList.add('hidden'); });
  box.querySelector('[data-floating-open]')?.addEventListener('click',()=>selectEvent(e.id));
  box.querySelector('[data-floating-go]')?.addEventListener('click',(event)=>{ event.preventDefault(); event.stopPropagation(); startNavigation(e.id); });
  bindSaveButtons(box);
}

function renderEventPanel(e) {
  const imgs = eventImages(e);
  const related = recommendedEvents(e.id).slice(0, 4);
  setMobileFiltersOpen(false);
  document.body.classList.add('mobile-panel-open');
  $('#eventPanel').classList.remove('hidden');
  $('#eventPanel').innerHTML = `
    <button class="panel-close" type="button">×</button>
    <div class="panel-gallery">${imgs.map((img,i)=>`<button class="gallery-thumb ${i===0?'main-thumb':''}" data-gallery-index="${i}" type="button"><img src="${escapeHtml(img)}" alt="${escapeHtml(e.title)} image ${i+1}"></button>`).join('')}</div>
    <p class="eyebrow">${escapeHtml(e.category)} · ${escapeHtml(privacyLabels[e.visibility] || e.visibility)}</p>
    <h2>${escapeHtml(e.title)}</h2>
    <p>${escapeHtml(e.description)}</p>
    ${eventCountdownMarkup(e.startsAt)}
    <div class="detail-grid">${e.locationName ? `<span>🏷 ${escapeHtml(e.locationName)}</span>` : ''}<span>📍 ${escapeHtml(e.address)}</span><span>🧭 <b id="eventDistanceValue">${eventDistanceText(e)}</b> away</span><span>🕒 ${fmtTime(e.startsAt)}</span><span>${ageIcon(e.ageRestriction)} ${escapeHtml(e.ageRestriction)}</span><span>🎟 ${availabilityText(e)}</span></div>
    ${friendAvatarStack(e)}
    ${hostCardMarkup(e)}
    <h3>Ticket tiers</h3>
    <div class="tier-buy-list ticket-tier-cards">${e.ticketTiers.map(t=>`<label class="tier-option tier-card"><input type="radio" name="tierPick" value="${t.id}" ${t.sold>=t.capacity?'disabled':''}><span><b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.description||'')}${e.showTicketAvailability === false ? '' : ` · ${t.sold}/${t.capacity} sold`}</small></span><strong>${money(t.priceCents)}</strong></label>`).join('')}</div>
    <div class="event-action-stack">
      <button id="buyBtn" class="primary-btn full" type="button">Reserve / Buy ticket</button>
      <button id="navigateBtn" class="primary-btn full navigation-cta go-btn" type="button">GO</button>
      <div class="event-secondary-actions">
        <button id="saveEventBtn" class="secondary-btn" data-toggle-save="${e.id}" type="button">${isSaved(e.id) ? '★ Saved' : '☆ Save'}</button>
        <button id="directionsBtn" class="secondary-btn" type="button">Google Maps</button>
      </div>
    </div>
    ${shareEventButtons(e)}
    ${related.length ? `<section class="recommended-mini"><h3>Recommended for you</h3>${related.map(eventListCard).join('')}</section>` : ''}`;
  $('.panel-close').addEventListener('click',()=>{ if(app.resultsPanelOpen) renderSearchResultsPanel(); else { $('#eventPanel').classList.add('hidden'); document.body.classList.remove('mobile-panel-open'); } });
  $$('.gallery-thumb').forEach(btn=>btn.addEventListener('click',()=>openGallery(imgs, Number(btn.dataset.galleryIndex || 0))));
  $('#directionsBtn').addEventListener('click',()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(e.address)}`,'_blank','noopener'));
  $('#navigateBtn')?.addEventListener('click',()=>startNavigation(e.id));
  $('#buyBtn').addEventListener('click',()=>purchaseTicket(e.id));
  $('.recommended-mini')?.querySelectorAll('.event-card').forEach(card=>card.addEventListener('click',()=>selectEvent(card.dataset.id)));
  bindEventPanelActions(e);
  bindSaveButtons();
}

async function toggleSaveEvent(eventId) {
  if (!requireLogin()) return;
  try {
    const data = await api(`/api/events/${eventId}/save`, { method:'POST', body:'{}' });
    await loadData();
    renderAll();
    if (app.resultsPanelOpen) renderSearchResultsPanel();
    const current = app.events.find(e=>e.id===eventId) || app.savedEvents.find(e=>e.id===eventId);
    if (current && app.selectedEventId === eventId) renderEventPanel(current);
    toast(data.saved ? 'Event saved for later.' : 'Event removed from saved.');
  } catch(error) { toast(error.message, 'error'); }
}
function bindSaveButtons(scope=document) {
  (scope || document).querySelectorAll('[data-toggle-save]').forEach(btn => {
    if (btn.dataset.boundSave) return;
    btn.dataset.boundSave = 'true';
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleSaveEvent(btn.dataset.toggleSave); });
  });
}

async function toggleHostFollow(hostId, eventId = null) {
  if (!requireLogin()) return;
  if (!hostId) return toast('Host unavailable.', 'error');
  try {
    const data = await api(`/api/hosts/${hostId}/follow`, { method:'POST', body:'{}' });
    app.hostFollows = data.following
      ? [...(app.hostFollows || []).filter((h) => h.id !== hostId), data.host]
      : (app.hostFollows || []).filter((h) => h.id !== hostId);
    renderTopStats();
    if (eventId && app.selectedEventId === eventId) {
      const event = app.events.find((e) => e.id === eventId) || app.savedEvents.find((e) => e.id === eventId);
      if (event) renderEventPanel(event);
    }
    toast(data.following ? 'Host followed.' : 'Host unfollowed.');
  } catch(error) { toast(error.message, 'error'); }
}

async function purchaseTicket(eventId) {
  if (!requireLogin()) return;
  const tierId = $('input[name="tierPick"]:checked')?.value;
  if (!tierId) return toast('Select a ticket tier first.', 'error');
  try { await api(`/api/events/${eventId}/purchase`, { method:'POST', body:JSON.stringify({tierId}) }); await loadData(); renderAll(); toast('Ticket added to your wallet.'); route('tickets'); }
  catch(error) { toast(error.message, 'error'); }
}

