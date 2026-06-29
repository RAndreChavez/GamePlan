/* Search result panels, invite handling, share-ticket dialog, and image gallery controls. */
function bindMapEnhancements() {
  $('#searchThisAreaBtn')?.addEventListener('click', async () => {
    const c = getMapCenter();
    app.searchCenter = c;
    drawSearchMarker('Search area center');
    drawRadiusCircle();
    await loadData();
    renderAll();
    setMobileFiltersOpen(false);
    renderSearchResultsPanel();
  });
}

function renderSearchResultsPanel() {
  const events = visibleEvents();
  app.resultsPanelOpen = true;
  const radius = getRadiusMiles();
  setMobileFiltersOpen(false);
  document.body.classList.add('mobile-panel-open');
  setMobileFiltersOpen(false);
  document.body.classList.add('mobile-panel-open');
  $('#eventPanel').classList.remove('hidden');
  $('#eventPanel').innerHTML = `<button class="panel-close" type="button">×</button><p class="eyebrow">Search results</p><h2>${events.length} plans found</h2><p class="muted-copy">Showing plans within ${radius} ${radius===1?'mile':'miles'} of your selected area. Click a result to open its event profile.</p><div class="panel-results-list">${events.map(e=>eventListCard(e)).join('') || '<p class="empty">No plans found with these filters or radius.</p>'}</div>`;
  $('.panel-close').addEventListener('click',()=>{ app.resultsPanelOpen=false; $('#eventPanel').classList.add('hidden'); document.body.classList.remove('mobile-panel-open'); });
  $$('.event-card').forEach(card=>card.addEventListener('click',()=>selectEvent(card.dataset.id)));
  bindSaveButtons();
}

async function handleInviteHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h.startsWith('invite=')) return;
  const code = decodeURIComponent(h.slice('invite='.length));
  if (!code) return;
  route('map');
  try {
    const data = await api(`/api/events/${encodeURIComponent(code)}`);
    const e = data.event;
    setMapView(app.map, [e.lat,e.lng], 14);
    renderEventPanel(e);
  } catch(error) { toast(error.message, 'error'); }
}
function bindShareTicket() {
  $$('[data-close-share-ticket]').forEach(el=>el.addEventListener('click', closeShareTicket));
  $('#shareTicketForm')?.addEventListener('submit', async(e)=>{
    e.preventDefault();
    if(!app.currentShareTicket) return;
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    try { await api(`/api/tickets/${app.currentShareTicket.id}/share`, { method:'POST', body:JSON.stringify(payload) }); closeShareTicket(); await loadData(); renderSocial(); toast('Activity shared to your feed.'); route('social'); }
    catch(error) { toast(error.message, 'error'); }
  });
}
function openShareTicket(ticketId) {
  if (!requireLogin()) return;
  const ticket = app.tickets.find(t=>t.id===ticketId);
  if (!ticket) return toast('Ticket not found.', 'error');
  app.currentShareTicket = ticket;
  const form = $('#shareTicketForm');
  form.reset();
  form.visibility.value = app.user.profile?.defaultPostVisibility || 'friends_only';
  form.text.value = `I’m going to ${ticket.event.title}.`;
  $('#shareTicketPreview').innerHTML = `<div class="feed-event"><img src="${escapeHtml(firstImage(ticket.event))}" alt=""><span><strong>${escapeHtml(ticket.event.title)}</strong><small>${escapeHtml(ticket.tierName)} · ${fmtTime(ticket.event.startsAt)}</small></span></div>`;
  $('#shareTicketModal').classList.remove('hidden');
}
function closeShareTicket() { $('#shareTicketModal').classList.add('hidden'); app.currentShareTicket=null; }

function bindGallery() {
  $$('[data-close-image]').forEach(el=>el.addEventListener('click', closeGallery));
  $('#galleryPrev')?.addEventListener('click',()=>moveGallery(-1));
  $('#galleryNext')?.addEventListener('click',()=>moveGallery(1));
  window.addEventListener('keydown', e=>{ if($('#imageModal')?.classList.contains('hidden')) return; if(e.key==='Escape') closeGallery(); if(e.key==='ArrowLeft') moveGallery(-1); if(e.key==='ArrowRight') moveGallery(1); });
}
function openGallery(images, index=0) {
  app.galleryImages = images;
  app.galleryIndex = index;
  $('#imageModal').classList.remove('hidden');
  renderGallery();
}
function closeGallery() { $('#imageModal').classList.add('hidden'); }
function moveGallery(delta) {
  if (!app.galleryImages.length) return;
  app.galleryIndex = (app.galleryIndex + delta + app.galleryImages.length) % app.galleryImages.length;
  renderGallery();
}
function renderGallery() {
  const img = app.galleryImages[app.galleryIndex];
  $('#galleryImage').src = img;
  $('#galleryCounter').textContent = `${app.galleryIndex + 1} / ${app.galleryImages.length}`;
}
