/* Shared application state, formatting helpers, filtering, and startup data loaders. */
const app = {
  user:null,
  csrf:null,
  events:[],
  tickets:[],
  savedEvents:[],
  hostEvents:[],
  friends:[],
  incomingRequests:[],
  outgoingRequests:[],
  friendActivity:[],
  hostFollows:[],
  feed:[],
  map:null,
  locationMap:null,
  markers:[],
  searchMarker:null,
  locationPickMarker:null,
  selectedLocation:null,
  selectedEventId:null,
  selectedImages:[],
  authMode:'login',
  themePreference: currentTheme(),
  searchMode:'nearMe',
  searchCenter: DEFAULT_CENTER,
  userLocation:null,
  userLocationMarker:null,
  userWatchId:null,
  navigation:{ active:false, eventId:null, route:null, lastRouteAt:0, lastRouteOrigin:null },
  planTab:'upcoming',
  feedMode:'friends',
  resultsPanelOpen:false,
  previewEventId:null,
  currentShareTicket:null,
  galleryImages:[],
  galleryIndex:0,
  mobileMode:false,
  mobileFiltersOpen:false,
  currentEditEventId:null,
  currentCheckinEventId:null,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const money = (cents) => cents === 0 ? 'Free' : `$${(Number(cents || 0)/100).toFixed(2)}`;
const eventImages = (event) => (Array.isArray(event?.images) && event.images.length ? event.images : [event?.imageUrl || DEFAULT_MEDIA_IMAGE]);
const firstImage = (event) => eventImages(event)[0];
const avatar = (user) => user?.avatarUrl || user?.profile?.avatarUrl || DEFAULT_MEDIA_IMAGE;
const profileBanner = (user) => user?.profile?.bannerUrl || '';
const roleLabel = (role='both') => ({ guest:'Guest', host:'Host', both:'Both' }[role] || String(role || 'Member').replace(/^./, c => c.toUpperCase()));
const profileButton = (user, extraClass='') => user ? `<button class="profile-inline-button ${extraClass}" data-view-profile="${escapeHtml(user.id)}" type="button"><img src="${escapeHtml(avatar(user))}" alt=""><span>${escapeHtml(user.name || 'User')}</span></button>` : '';
const imageButton = (src, className='', label='Image') => src ? `<button class="image-open-button ${className}" data-open-image="${escapeHtml(src)}" type="button" aria-label="Open ${escapeHtml(label)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(label)}"></button>` : '';
const escapeHtml = (v='') => String(v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = (v) => new Date(v).toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
const isoFromLocalValue = (v) => v ? new Date(v).toISOString() : '';
const formatMiles = (m) => Number.isFinite(Number(m)) ? `${Number(m).toFixed(Number(m) < 10 ? 1 : 0)} mi` : 'Distance unavailable';
const formatEta = (seconds) => { const min = Math.max(1, Math.round(Number(seconds || 0) / 60)); if (min < 60) return `${min} min`; const h = Math.floor(min / 60); const m = min % 60; return `${h}h ${m}m`; };
const isSaved = (eventId) => (app.savedEvents || []).some((e) => e.id === eventId);
const isFollowingHost = (hostId) => (app.hostFollows || []).some((h) => h.id === hostId);
function distanceBetweenMiles(lat1, lng1, lat2, lng2) { const R=3958.8; const toRad=d=>d*Math.PI/180; const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1); const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
function eventDistanceMiles(event) { if (app.userLocation) return distanceBetweenMiles(app.userLocation[0], app.userLocation[1], event.lat, event.lng); if (Number.isFinite(Number(event.distanceMiles))) return Number(event.distanceMiles); return NaN; }
function eventDistanceText(event) { const m = eventDistanceMiles(event); return Number.isFinite(m) ? formatMiles(m) : 'Enable location for distance'; }

function toast(msg, type='info') {
  const t=$('#toast');
  t.textContent=msg;
  t.className=`toast ${type}`;
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.add('hidden'), 4500);
}

async function api(path, opts={}) {
  const headers = opts.body instanceof FormData ? {} : { 'Content-Type':'application/json' };
  if (app.csrf && !['GET','HEAD'].includes((opts.method||'GET').toUpperCase())) headers['x-csrf-token'] = app.csrf;
  const res = await fetch(path, { ...opts, headers:{ ...headers, ...(opts.headers||{}) } });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function requireLogin() {
  if (app.user) return true;
  openAuth('login');
  toast('Log in or create an account to continue.', 'error');
  return false;
}

function toIsoFromLocal(v) { return v ? new Date(v).toISOString() : ''; }
function countdown(startsAt) {
  const diff = new Date(startsAt) - new Date();
  if (diff <= 0) return 'Happening now';
  const d = Math.floor(diff/86400000);
  const h = Math.floor(diff%86400000/3600000);
  const m = Math.floor(diff%3600000/60000);
  const s = Math.floor(diff%60000/1000);
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function countdownParts(startsAt) {
  const diff = new Date(startsAt) - new Date();
  if (diff <= 0) return { live: true, d: '00', h: '00', m: '00', s: '00' };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff % 86400000 / 3600000);
  const m = Math.floor(diff % 3600000 / 60000);
  const sec = Math.floor(diff % 60000 / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return { live: false, d: pad(d), h: pad(h), m: pad(m), s: pad(sec) };
}
function eventCountdownMarkup(startsAt) {
  const c = countdownParts(startsAt);
  if (c.live) return `<div class="event-countdown live"><span>Event is live</span><strong>Happening now</strong></div>`;
  return `<div class="event-countdown" data-countdown-target="${escapeHtml(startsAt)}"><span>Event starts in</span><div><b>${c.d}</b><small>days</small></div><div><b>${c.h}</b><small>hrs</small></div><div><b>${c.m}</b><small>mins</small></div><div><b>${c.s}</b><small>secs</small></div></div>`;
}
function updateEventPanelCountdown() {
  const box = document.querySelector('[data-countdown-target]');
  if (!box) return;
  const startsAt = box.dataset.countdownTarget;
  const c = countdownParts(startsAt);
  if (c.live) {
    box.outerHTML = `<div class="event-countdown live"><span>Event is live</span><strong>Happening now</strong></div>`;
    return;
  }
  const nums = box.querySelectorAll('b');
  [c.d, c.h, c.m, c.s].forEach((v, i) => { if (nums[i]) nums[i].textContent = v; });
}
function friendAvatarStack(event) {
  const attending = new Set(event.attendees || []);
  const people = [];
  if (app.user && attending.has(app.user.id)) people.push(app.user);
  (app.friends || []).forEach((f) => { if (attending.has(f.id)) people.push(f); });
  const visible = people.slice(0, 4);
  const remaining = Math.max(0, attending.size - visible.length);
  if (!visible.length && !attending.size) return `<div class="attendee-stack muted"><span>👥</span><small>Be the first friend going</small></div>`;
  return `<div class="attendee-stack">${visible.map((u) => `<img src="${escapeHtml(avatar(u))}" alt="${escapeHtml(u.name || 'Attendee')}">`).join('')}${remaining ? `<b>+${remaining}</b>` : ''}<small>${attending.size || visible.length} going</small></div>`;
}
function hostCardMarkup(event) {
  const hosted = app.events.filter((x) => x.hostId === event.hostId).length || 1;
  const sold = totalSold(event);
  const rating = Math.min(5, Math.max(4.6, 4.7 + Math.min(sold, 12) / 40)).toFixed(1);
  const following = isFollowingHost(event.hostId);
  const selfHost = app.user?.id === event.hostId;
  return `<article class="host-profile-card"><button class="host-avatar" data-view-host-profile="${escapeHtml(event.hostId || '')}" type="button">${escapeHtml((event.hostName || 'H').slice(0,1).toUpperCase())}</button><div><p class="eyebrow">Host</p><h3><button class="plain-profile-link" data-view-host-profile="${escapeHtml(event.hostId || '')}" type="button">${escapeHtml(event.hostName || 'GamePlan Host')}</button></h3><small>${hosted} events hosted · ★ ${rating} rating · ${sold} tickets reserved</small></div><div class="host-card-actions"><button class="secondary-btn small" data-view-host-profile="${escapeHtml(event.hostId || '')}" type="button">Profile</button>${selfHost ? '' : `<button class="secondary-btn small ${following ? 'active' : ''}" data-follow-host="${escapeHtml(event.hostId || '')}" type="button">${following ? 'Following' : 'Follow'}</button>`}</div></article>`;
}
function whatsappSvg() {
  return `<svg class="share-icon whatsapp-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2.1a9.8 9.8 0 0 0-8.36 14.9L2.6 21.8l4.92-1.05A9.82 9.82 0 1 0 12.04 2.1Zm0 1.8a8.02 8.02 0 0 1 6.8 12.3 8.03 8.03 0 0 1-10.9 2.7l-.34-.2-2.5.54.55-2.43-.22-.36A8.02 8.02 0 0 1 12.04 3.9Zm-3.6 4.2c-.18 0-.46.07-.7.33-.24.27-.93.91-.93 2.23s.96 2.59 1.1 2.77c.14.18 1.86 2.98 4.6 4.05 2.27.9 2.74.72 3.23.68.49-.05 1.58-.65 1.8-1.27.23-.62.23-1.15.16-1.27-.07-.11-.25-.18-.53-.32l-1.87-.91c-.28-.14-.49-.2-.7.11-.2.3-.8.98-.99 1.18-.18.2-.36.22-.66.07-.3-.14-1.25-.46-2.38-1.47-.88-.78-1.47-1.74-1.64-2.04-.17-.29-.02-.45.13-.6.13-.13.3-.34.45-.51.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.52L8.98 8.8c-.21-.52-.43-.68-.54-.7Z"/></svg>`;
}
function shareEventButtons(event) {
  const text = encodeURIComponent(`Check out ${event.title} on GamePlan`);
  const url = encodeURIComponent(`${location.origin}${location.pathname}#invite=${event.inviteCode || event.id}`);
  return `<div class="event-share-row"><span>Share event</span><button class="share-pill" data-copy-event-link="${escapeHtml(event.inviteCode || event.id)}" type="button" aria-label="Copy event link">🔗<em>Copy link</em></button><button class="share-pill" data-share-url="https://twitter.com/intent/tweet?text=${text}&url=${url}" type="button" aria-label="Share on X">𝕏<em>X</em></button><button class="share-pill" data-share-url="https://www.facebook.com/sharer/sharer.php?u=${url}" type="button" aria-label="Share on Facebook">f<em>Facebook</em></button><button class="share-pill share-pill-wa" data-share-url="https://wa.me/?text=${text}%20${url}" type="button" aria-label="Share on WhatsApp">${whatsappSvg()}<em>WhatsApp</em></button></div>`;
}
function recommendedEvents(excludeId = '') {
  return visibleEvents().filter((e) => e.id !== excludeId).slice(0, 8);
}
function bindEventPanelActions(event) {
  $$('[data-follow-host]').forEach(btn => btn.addEventListener('click', () => toggleHostFollow(btn.dataset.followHost, event?.id)));
  $$('[data-view-host-profile]').forEach(btn => btn.addEventListener('click', () => openProfileView(btn.dataset.viewHostProfile)));
  $$('[data-copy-event-link]').forEach(btn => btn.addEventListener('click', async () => {
    const link = `${location.origin}${location.pathname}#invite=${encodeURIComponent(btn.dataset.copyEventLink)}`;
    try { await navigator.clipboard.writeText(link); toast('Event link copied.'); }
    catch { toast(link); }
  }));
  $$('[data-share-url]').forEach(btn => btn.addEventListener('click', () => window.open(btn.dataset.shareUrl, '_blank', 'noopener,noreferrer')));
}
function tierSummary(event) {
  const tiers = event.ticketTiers || [];
  if (!tiers.length) return 'No tickets';
  const min = Math.min(...tiers.map(t=>t.priceCents));
  const max = Math.max(...tiers.map(t=>t.priceCents));
  return min === max ? money(min) : `${money(min)} - ${money(max)}`;
}
function totalSold(event) { return (event.ticketTiers || []).reduce((s,t)=>s+Number(t.sold||0),0); }
function totalCap(event) { return (event.ticketTiers || []).reduce((s,t)=>s+Number(t.capacity||0),0); }
function minPrice(event) { return Math.min(...(event.ticketTiers || [{ priceCents:0 }]).map(t=>t.priceCents)); }
function maxPrice(event) { return Math.max(...(event.ticketTiers || [{ priceCents:0 }]).map(t=>t.priceCents)); }
function availability(event) { return Math.max(0, totalCap(event) - totalSold(event)); }
function isSameDate(a,b) { return a.toDateString() === b.toDateString(); }
function isToday(event) { return isSameDate(new Date(event.startsAt), new Date()); }
function isTonight(event) {
  const d = new Date(event.startsAt), n = new Date();
  return isSameDate(d,n) && d.getHours() >= 17;
}
function isThisWeekend(event) {
  const d = new Date(event.startsAt);
  const now = new Date();
  const day = d.getDay();
  const diffDays = Math.floor((new Date(d.getFullYear(),d.getMonth(),d.getDate()) - new Date(now.getFullYear(),now.getMonth(),now.getDate())) / 86400000);
  return diffDays >= 0 && diffDays <= 7 && (day === 5 || day === 6 || day === 0);
}
function isNextWeek(event) { return new Date(event.startsAt) - new Date() <= 7*86400000 && new Date(event.startsAt) >= new Date(Date.now()-3600000); }

function getControls() {
  const priceMax = Number($('#priceFilter')?.value || 250);
  return {
    q: $('#searchInput')?.value?.trim().toLowerCase() || '',
    sort: $('#sortSelect')?.value || 'soonest',
    priceMax,
    timeStart: isoFromLocalValue($('#timeStartFilter')?.value || ''),
    timeEnd: isoFromLocalValue($('#timeEndFilter')?.value || ''),
    category: $('#categoryFilter')?.value || 'all',
  };
}
function getRadiusMiles() { return Number($('#radiusSelect')?.value || 25); }
function updateRangeLabels() {
  const radius = getRadiusMiles();
  const price = Number($('#priceFilter')?.value || 250);
  if ($('#radiusValue')) $('#radiusValue').textContent = `${radius} ${radius === 1 ? 'mile' : 'miles'}`;
  if ($('#priceValue')) $('#priceValue').textContent = price >= 250 ? 'Any price' : `Up to $${price}`;
}

function visibleEvents() {
  const c = getControls();
  const filtered = app.events.filter(e => {
    const matchesText = !c.q || [e.title,e.category,e.description,e.locationName,e.address,e.hostName].some(v=>String(v||'').toLowerCase().includes(c.q));
    const price = minPrice(e);
    const matchesPrice = c.priceMax >= 250 || price <= c.priceMax * 100;
    const startTime = new Date(e.startsAt).getTime();
    const minTime = c.timeStart ? new Date(c.timeStart).getTime() : -Infinity;
    const maxTime = c.timeEnd ? new Date(c.timeEnd).getTime() : Infinity;
    const matchesTime = startTime >= minTime && startTime <= maxTime;
    const matchesCategory = c.category === 'all' || e.category === c.category;
    return matchesText && matchesPrice && matchesTime && matchesCategory;
  });

  filtered.sort((a,b) => {
    switch(c.sort) {
      case 'distance': return (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999);
      case 'priceLow': return minPrice(a) - minPrice(b);
      case 'priceHigh': return maxPrice(b) - maxPrice(a);
      case 'popular': return totalSold(b) - totalSold(a);
      case 'capacity': return availability(b) - availability(a);
      default: return new Date(a.startsAt) - new Date(b.startsAt);
    }
  });
  return filtered;
}

