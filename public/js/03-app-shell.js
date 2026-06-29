/* Navigation, session UI, authentication, and discovery filter bindings. */
async function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark', false);
  bindNav(); bindAuth(); bindHostForm(); bindFilters(); bindPlans(); bindGallery(); bindSocial(); bindProfile(); bindUserMenu(); bindShareTicket(); bindMobileShell(); updateRangeLabels(); bindMapEnhancements();
  await loadMe();
  await resolveInitialLocation();
  initMap();
  startLiveLocationTracking();
  await loadData();
  renderAll();
  stabilizeMobileMapUI();
  handleInviteHash();
  setInterval(() => { renderTickets(); updateEventPanelCountdown(); }, 1000);
}

async function resolveInitialLocation() {
  app.searchCenter = DEFAULT_CENTER;
  if (!navigator.geolocation) return;
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 4200, maximumAge: 300000 });
    });
    app.searchCenter = [pos.coords.latitude, pos.coords.longitude];
    app.userLocation = [pos.coords.latitude, pos.coords.longitude];
    app.userLocated = true;
  } catch (_) {
    app.userLocated = false;
  }
}

async function loadMe() {
  const data = await api('/api/me');
  app.user=data.user; app.csrf=data.csrf;
  if (app.user?.profile?.themePreference) applyTheme(app.user.profile.themePreference, true);
  renderSession();
}
async function loadData() {
  const radius = getRadiusMiles();
  const [lat,lng] = app.searchCenter || getMapCenter();
  const ev = await api(`/api/events?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`);
  app.events = ev.events;
  if (app.user) {
    app.tickets=(await api('/api/tickets')).tickets;
    app.savedEvents=(await api('/api/saved-events')).events;
    app.hostEvents=(await api('/api/host/events')).events;
    const social = await api('/api/friends');
    app.friends = social.users || [];
    app.incomingRequests = social.incoming || [];
    app.outgoingRequests = social.outgoing || [];
    app.friendActivity = social.friendActivity || [];
    app.hostFollows = (await api('/api/host-follows')).hosts || [];
    app.feed = (await api(`/api/feed?mode=${encodeURIComponent(app.feedMode)}&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`)).posts || [];
  } else {
    app.tickets=[]; app.savedEvents=[]; app.hostEvents=[]; app.friends=[]; app.incomingRequests=[]; app.outgoingRequests=[]; app.friendActivity=[]; app.hostFollows=[]; app.feed=[];
  }
}
function getMapCenter() { if (app.map) { const c=app.map.getCenter(); return [c.lat,c.lng]; } return DEFAULT_CENTER; }

const mobileRouteLabels = {
  map: ['Map', 'Discover nearby plans'],
  tickets: ['Plans', 'Upcoming, saved, and activity'],
  social: ['Social', 'Friends, feed, and profiles'],
  host: ['Host', 'Create and manage events'],
};
function isMobileViewport() {
  return window.matchMedia('(max-width: 860px), (pointer: coarse) and (max-width: 1024px)').matches;
}
function mapUrlWithoutHash() {
  return `${location.pathname}${location.search}` || '/';
}
function normalizeMobileMapHash() {
  if (isMobileViewport() && (location.hash === '#map' || location.hash === '#')) {
    history.replaceState(null, '', mapUrlWithoutHash());
  }
}
function setMobileFiltersOpen(open) {
  app.mobileFiltersOpen = Boolean(open);
  document.body.classList.toggle('mobile-filters-open', app.mobileFiltersOpen);
  $('.map-sidebar')?.classList.toggle('mobile-open', app.mobileFiltersOpen);
  $('#mobileFilterBtn')?.setAttribute('aria-expanded', String(app.mobileFiltersOpen));
  setTimeout(resizeMaps, 80);
}
function updateMobileShell(routeName = (location.hash || '#map').slice(1) || 'map') {
  normalizeMobileMapHash();
  app.mobileMode = isMobileViewport();
  document.body.classList.toggle('mobile-mode', app.mobileMode);
  document.body.dataset.mobileRoute = routeName;
  const labels = mobileRouteLabels[routeName] || mobileRouteLabels.map;
  if ($('#mobileScreenTitle')) $('#mobileScreenTitle').textContent = labels[0];
  if ($('#mobileScreenSubtitle')) $('#mobileScreenSubtitle').textContent = labels[1];
  $$('.mobile-nav-link').forEach(b => b.classList.toggle('active', b.dataset.route === routeName));
  const profileBtn = $('#mobileProfileNavBtn');
  if (profileBtn) {
    profileBtn.classList.remove('active');
    profileBtn.querySelector('b').textContent = app.user ? 'Profile' : 'Log in';
    profileBtn.querySelector('span').textContent = app.user ? '👤' : '🔐';
  }
  $('#mobileFilterBtn')?.classList.toggle('hidden', routeName !== 'map');
  if (routeName !== 'map') setMobileFiltersOpen(false);
  renderMobileSessionShortcut();
  setTimeout(resizeMaps, 80);
}
function renderMobileSessionShortcut() {
  const area = $('#mobileSessionShortcut');
  if (!area) return;
  if (!app.user) {
    area.innerHTML = '<button id="mobileLoginBtn" class="mobile-account-btn" type="button">Log in</button>';
    $('#mobileLoginBtn')?.addEventListener('click', () => openAuth('login'));
    return;
  }
  area.innerHTML = `<button id="mobileAccountBtn" class="mobile-account-btn avatar-only" type="button" aria-label="Open account center"><img src="${escapeHtml(avatar(app.user))}" alt=""></button>`;
  $('#mobileAccountBtn')?.addEventListener('click', () => openProfileModal('edit'));
}
function bindMobileShell() {
  syncMobileViewportVars();
  $('#mobileFilterBtn')?.addEventListener('click', () => setMobileFiltersOpen(!app.mobileFiltersOpen));
  $('#mobileProfileNavBtn')?.addEventListener('click', () => {
    if (app.user) openProfileModal('edit');
    else openAuth('login');
  });
  window.addEventListener('resize', () => stabilizeMobileMapUI());
  window.visualViewport?.addEventListener('resize', () => stabilizeMobileMapUI());
  window.visualViewport?.addEventListener('scroll', () => stabilizeMobileMapUI());
  window.addEventListener('orientationchange', () => setTimeout(() => stabilizeMobileMapUI(), 260));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.mobileFiltersOpen) setMobileFiltersOpen(false); });
  normalizeMobileMapHash();
  updateMobileShell((location.hash || '#map').slice(1) || 'map');
}

function bindNav() {
  $$('[data-route]').forEach(btn=>btn.addEventListener('click', e=>{ e.preventDefault(); const r=btn.dataset.route; route(r); }));
  window.addEventListener('hashchange',()=>{ normalizeMobileMapHash(); const h=(location.hash||'#map').slice(1); if(h.startsWith('invite=')) return handleInviteHash(); route(h || 'map'); });
}
function route(name='map') {
  $$('.route').forEach(r=>r.classList.remove('active'));
  $(`#route-${name}`)?.classList.add('active');
  $$('.nav-link').forEach(b=>b.classList.toggle('active', b.dataset.route===name));
  updateMobileShell(name);
  if (isMobileViewport() && name === 'map') {
    if (location.hash) history.replaceState(null, '', mapUrlWithoutHash());
  } else if (location.hash !== `#${name}`) {
    location.hash = name;
  }
  if (name === 'host') ensureLocationMapReady();
  setTimeout(resizeMaps, 80);
  setTimeout(resizeMaps, 350);
  setTimeout(resizeMaps, 900);
  renderAll();
}

function renderTopStats() {
  $('#topStats').innerHTML = `
    <div><strong>${app.tickets.length}</strong><span>my plans</span></div>
    <div><strong>${app.hostEvents.length}</strong><span>hosting</span></div>
    <div><strong>${app.friends.length}</strong><span>friends</span></div>`;
}
function renderSession() {
  if (!app.user) {
    $('#sessionArea').innerHTML = `<button id="loginBtn" class="secondary-btn small" type="button">Log in</button><button id="registerBtn" class="primary-btn small" type="button">Create account</button>`;
    $('#loginBtn')?.addEventListener('click',()=>openAuth('login'));
    $('#registerBtn')?.addEventListener('click',()=>openAuth('register'));
    renderMobileSessionShortcut();
    return;
  }
  $('#sessionArea').innerHTML = `
    <div class="user-menu-wrap">
      <button id="userMenuBtn" class="user-menu-btn" type="button" aria-expanded="false">
        <img src="${escapeHtml(avatar(app.user))}" alt=""><span>${escapeHtml(app.user.name)}</span><b>⌄</b>
      </button>
      <div id="userDropdown" class="user-dropdown hidden">
        <button data-view-profile="${escapeHtml(app.user.id)}" type="button">👤 View profile</button>
        <button data-profile-action="edit" type="button">✏️ Edit profile</button>
        <button data-profile-action="privacy" type="button">🔒 Privacy settings</button>
        <button data-profile-action="account" type="button">⚙️ Account settings</button>
        <button id="logoutBtn" type="button">↪ Logout</button>
      </div>
    </div>`;
  $('#userMenuBtn')?.addEventListener('click', (e)=>{ e.stopPropagation(); toggleUserMenu(); });
  $$('[data-profile-action]').forEach(btn=>btn.addEventListener('click',()=>{ closeUserMenu(); openProfileModal(btn.dataset.profileAction); }));
  $('#userDropdown')?.querySelectorAll('[data-view-profile]').forEach(btn=>btn.addEventListener('click',()=>{ closeUserMenu(); openProfileView(btn.dataset.viewProfile); }));
  renderMobileSessionShortcut();
  $('#logoutBtn')?.addEventListener('click', async()=>{ await api('/api/auth/logout',{method:'POST',body:'{}'}); app.user=null; app.csrf=null; await loadData(); renderAll(); toast('Logged out.'); });
}
function bindUserMenu() { document.addEventListener('click', closeUserMenu); }
function toggleUserMenu() { const d=$('#userDropdown'); d?.classList.toggle('hidden'); $('#userMenuBtn')?.setAttribute('aria-expanded', String(!d?.classList.contains('hidden'))); }
function closeUserMenu() { $('#userDropdown')?.classList.add('hidden'); $('#userMenuBtn')?.setAttribute('aria-expanded','false'); }

function bindAuth() {
  $$('[data-close-modal]').forEach(el=>el.addEventListener('click', closeAuth));
  $('#switchAuth').addEventListener('click',()=>openAuth(app.authMode==='login'?'register':'login'));
  $('#authForm').addEventListener('submit', async(e)=>{
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    const err = $('#authError'); err.classList.add('hidden'); err.textContent='';
    if (app.authMode === 'register' && !payload.name?.trim()) return showAuthError('You need to add your name to create an account.');
    if (!payload.email?.trim()) return showAuthError('You need to add an email to continue.');
    if (!payload.password?.trim()) return showAuthError('You need to add a password to continue.');
    if (app.authMode === 'register' && payload.password.length < 8) return showAuthError('Password must be at least 8 characters.');
    try {
      const data = await api(`/api/auth/${app.authMode}`, { method:'POST', body: JSON.stringify(payload) });
      app.user=data.user; app.csrf=data.csrf; if (app.user?.profile?.themePreference) applyTheme(app.user.profile.themePreference, true); closeAuth(); await loadData(); renderAll(); toast(app.authMode==='register'?'Account created.':'Logged in.');
    } catch(error) { showAuthError(error.message); }
  });
}
function showAuthError(msg) { const e=$('#authError'); e.textContent=msg; e.classList.remove('hidden'); toast(msg,'error'); }
function openAuth(mode='login') {
  app.authMode = mode; $('#authModal').classList.remove('hidden'); $('#authForm').reset(); $('#authError').classList.add('hidden');
  const register = mode === 'register';
  $('#authTitle').textContent = register ? 'Create your GamePlan account' : 'Log in to GamePlan';
  $('#authModeLabel').textContent = register ? 'New account' : 'Account access';
  $('#authSubmit').textContent = register ? 'Create account' : 'Log in';
  $('#switchAuth').textContent = register ? 'Already have an account? Log in' : 'Need an account? Create one';
  $('.auth-name-field').classList.toggle('hidden', !register); $('.auth-role-field').classList.toggle('hidden', !register);
  $('#authForm input[name="password"]').setAttribute('autocomplete', register ? 'new-password' : 'current-password');
}
function closeAuth() { $('#authModal').classList.add('hidden'); }

function bindFilters() {
  ['#searchInput','#sortSelect','#priceFilter','#timeStartFilter','#timeEndFilter','#categoryFilter'].forEach(sel => $(sel)?.addEventListener('input', ()=>{ updateRangeLabels(); renderMapEvents(); if(app.resultsPanelOpen) renderSearchResultsPanel(); }));
  $('#radiusSelect')?.addEventListener('input', async()=>{ updateRangeLabels(); await loadData(); renderAll(); drawRadiusCircle(); if(app.resultsPanelOpen) renderSearchResultsPanel(); });
  $('#mapSearchBtn')?.addEventListener('click', async()=>{ await loadData(); renderMapEvents(); setMobileFiltersOpen(false); renderSearchResultsPanel(); });
  $('#nearMeMode')?.addEventListener('click',()=>setSearchMode('nearMe'));
  $('#cityMode')?.addEventListener('click',()=>setSearchMode('city'));
  $('#citySearchBtn')?.addEventListener('click', searchCityArea);
  $('#citySearchInput')?.addEventListener('keydown', e=>{ if(e.key === 'Enter') { e.preventDefault(); searchCityArea(); } });
  $('#timeNowBtn')?.addEventListener('click',()=>{ const now=new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset()); $('#timeStartFilter').value = now.toISOString().slice(0,16); renderMapEvents(); if(app.resultsPanelOpen) renderSearchResultsPanel(); });
  $('#clearTimeBtn')?.addEventListener('click',()=>{ $('#timeStartFilter').value=''; $('#timeEndFilter').value=''; renderMapEvents(); if(app.resultsPanelOpen) renderSearchResultsPanel(); });
  $('#locateBtn').addEventListener('click',()=>navigator.geolocation?.getCurrentPosition(async pos=>{
    const c=[pos.coords.latitude,pos.coords.longitude];
    app.searchCenter = c;
    setMapView(app.map, c, 13);
    setSearchMode('nearMe', false);
    await loadData(); renderAll(); drawSearchMarker('You are searching from here'); drawRadiusCircle();
  },()=>toast('Location permission was denied or unavailable.','error')));
}
function setSearchMode(mode, reload=true) {
  app.searchMode = mode;
  $('#nearMeMode')?.classList.toggle('active', mode==='nearMe');
  $('#cityMode')?.classList.toggle('active', mode==='city');
  $('#citySearchBox')?.classList.toggle('hidden', mode!=='city');
  if (reload) loadData().then(()=>{ renderAll(); drawRadiusCircle(); });
}
async function searchCityArea() {
  const q = $('#citySearchInput').value.trim();
  if (!q) return toast('Enter a city or ZIP code to search that area.', 'error');
  try {
    const { lat, lng, label } = await geocode(q);
    app.searchCenter = [lat, lng];
    setMapView(app.map, app.searchCenter, 12);
    drawSearchMarker(label || q);
    await loadData(); renderAll(); drawRadiusCircle();
    toast(`Searching around ${label || q}.`);
  } catch(error) { toast(error.message, 'error'); }
}
async function geocode(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!data[0]) throw new Error('No location found. Try a more specific city, ZIP, or address.');
  return { lat:Number(data[0].lat), lng:Number(data[0].lon), label:data[0].display_name };
}
