/* Host workflow, event creation, event editing, ticket tiers, and check-in tools. */
function ensureLocationMapReady() {
  if (!app.locationMap) initLocationMap();
  [50,150,350,900].forEach(ms=>setTimeout(()=>{
    app.locationMap?.resize?.();
    if (app.selectedLocation && app.locationPickMarker) app.locationPickMarker.setLngLat([app.selectedLocation[1], app.selectedLocation[0]]);
  }, ms));
}
function initLocationMap() {
  if (app.locationMap) return;
  assertMapLibre();
  app.locationMap = new maplibregl.Map({
    container: 'eventLocationMap',
    style: currentMapStyle(),
    center: [app.searchCenter[1], app.searchCenter[0]],
    zoom: 12,
    attributionControl: false,
  });
  app.locationMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  app.locationMap.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  app.locationMap.on('click', e=>selectHostLocation(e.lngLat.lat, e.lngLat.lng));
  app.locationMap.on('load', () => setTimeout(()=>app.locationMap?.resize?.(), 100));
  $('#addressSearchBtn').addEventListener('click', async()=>{
    const q = $('#addressInput').value.trim(); if(!q) return toast('Enter an address or zip code first.','error');
    try {
      ensureLocationMapReady();
      const { lat, lng } = await geocode(q);
      setMapView(app.locationMap, [lat,lng], 15);
      selectHostLocation(lat,lng, false);
      toast('Map focused and pin placed. Click to fine tune exact spot.');
    } catch(error) { toast(error.message || 'Address search failed.', 'error'); }
  }, { once:false });
}
function selectHostLocation(lat, lng, pan=true) {
  ensureLocationMapReady();
  app.selectedLocation=[lat,lng];
  $('#latInput').value=Number(lat).toFixed(6); $('#lngInput').value=Number(lng).toFixed(6);
  if(!app.locationPickMarker) {
    app.locationPickMarker=createMapMarker('host-pick-marker', '<span>⌖</span>', lat, lng, 'bottom').addTo(app.locationMap);
  } else app.locationPickMarker.setLngLat([Number(lng), Number(lat)]);
  if (pan) setMapView(app.locationMap, [lat,lng], app.locationMap.getZoom());
  $('#selectedLocationStatus').textContent = 'Selected location:';
  [0,80,180,420].forEach(ms=>setTimeout(()=>{ app.locationMap?.resize?.(); app.locationPickMarker?.setLngLat([Number(lng), Number(lat)]); }, ms));
}

function bindPinCustomization() {
  const picker = $('#emojiPicker');
  const btn = $('#emojiPickerBtn');
  const input = $('#markerEmojiInput');
  const preview = $('#selectedEmojiPreview');
  if (picker && !picker.dataset.ready) {
    picker.innerHTML = emojiOptions.map(e=>`<button type="button" class="emoji-option" data-emoji="${escapeHtml(e)}" aria-label="Use ${escapeHtml(e)} as pin icon">${escapeHtml(e)}</button>`).join('');
    picker.dataset.ready='true';
    picker.addEventListener('click', e=>{
      const option = e.target.closest('[data-emoji]');
      if (!option) return;
      input.value = option.dataset.emoji;
      preview.textContent = option.dataset.emoji;
      picker.classList.add('hidden');
      btn?.setAttribute('aria-expanded','false');
    });
  }
  btn?.addEventListener('click', e=>{ e.stopPropagation(); picker?.classList.toggle('hidden'); btn.setAttribute('aria-expanded', String(!picker?.classList.contains('hidden'))); });
  document.addEventListener('click', e=>{ if (!e.target.closest('.pin-emoji-field')) { picker?.classList.add('hidden'); btn?.setAttribute('aria-expanded','false'); } });
  const color = $('#markerColorInput');
  const swatch = $('#markerColorPreview');
  const text = $('#markerColorText');
  const syncColor = () => { if (!color) return; swatch?.style.setProperty('--picked', color.value); if(text) text.textContent = color.value.toUpperCase(); };
  color?.addEventListener('input', syncColor);
  syncColor();
}

function bindHostForm() {
  bindPinCustomization();
  $('#imageInput').addEventListener('change', e=>{
    const incoming = Array.from(e.target.files || []);
    const available = Math.max(0, 8 - app.selectedImages.length);
    if (!available) { toast('Maximum 8 images per event.', 'error'); e.target.value=''; return; }
    app.selectedImages.push(...incoming.slice(0, available));
    if (incoming.length > available) toast('Only the first 8 images were kept.', 'error');
    e.target.value='';
    renderSelectedImages();
  });
  $('#addTierBtn').addEventListener('click',()=>addTierRow());
  addTierRow('Standard', 0, 50, 'General admission');
  $('#eventForm').addEventListener('submit', async(e)=>{
    e.preventDefault(); if(!requireLogin()) return;
    const form=e.currentTarget; const fd=new FormData(form);
    fd.delete('images');
    fd.set('showTicketAvailability', form.showTicketAvailability.checked ? 'true' : 'false');
    app.selectedImages.forEach(file=>fd.append('images', file));
    if (!fd.get('lat') || !fd.get('lng')) return toast('Search the address, then click the map to select the exact location.','error');
    const tiers = $$('.tier-row').map(row=>({ name: row.querySelector('[name=tierName]').value, price: row.querySelector('[name=tierPrice]').value, capacity: row.querySelector('[name=tierCapacity]').value, description: row.querySelector('[name=tierDescription]').value })).filter(t=>t.name && t.capacity);
    if (!tiers.length) return toast('Add at least one ticket tier.', 'error');
    fd.set('startsAt', toIsoFromLocal(fd.get('startsAt'))); fd.set('endsAt', toIsoFromLocal(fd.get('endsAt'))); fd.set('ticketTiers', JSON.stringify(tiers));
    try {
      await api('/api/events', { method:'POST', body:fd });
      form.reset();
      $('#markerEmojiInput').value='🎸'; $('#selectedEmojiPreview').textContent='🎸'; $('#markerColorInput').value='#7CFF4F'; $('#markerColorPreview').style.setProperty('--picked','#7CFF4F'); $('#markerColorText').textContent='#7CFF4F';
      app.selectedImages=[]; renderSelectedImages();
      $('#tierList').innerHTML=''; addTierRow('Standard',0,50,'General admission');
      app.locationPickMarker?.remove(); app.locationPickMarker=null; app.selectedLocation=null; $('#selectedLocationStatus').textContent='No exact event location selected yet.';
      await loadData(); renderAll(); toast('Event published.'); route('map');
    } catch(error) { toast(error.message, 'error'); }
  });
}
function renderSelectedImages() {
  const box = $('#imagePreview');
  if (!app.selectedImages.length) {
    box.innerHTML = '<div class="empty-preview">No pictures selected yet. Default GamePlan artwork will be used.</div>';
    return;
  }
  box.innerHTML = app.selectedImages.map((file,i)=>`
    <div class="image-thumb-wrap" data-img-index="${i}">
      <img src="${URL.createObjectURL(file)}" alt="Selected image ${i+1}">
      <button class="thumb-remove" type="button" data-remove-image="${i}" aria-label="Remove image">×</button>
      <div class="thumb-order"><button type="button" data-move-image="${i}:left" ${i===0?'disabled':''}>←</button><span>${i+1}</span><button type="button" data-move-image="${i}:right" ${i===app.selectedImages.length-1?'disabled':''}>→</button></div>
    </div>`).join('');
  $$('[data-remove-image]').forEach(btn=>btn.addEventListener('click',()=>{ app.selectedImages.splice(Number(btn.dataset.removeImage),1); renderSelectedImages(); }));
  $$('[data-move-image]').forEach(btn=>btn.addEventListener('click',()=>{
    const [idxRaw, dir] = btn.dataset.moveImage.split(':');
    const i=Number(idxRaw), j=dir==='left'?i-1:i+1;
    if (j < 0 || j >= app.selectedImages.length) return;
    [app.selectedImages[i], app.selectedImages[j]] = [app.selectedImages[j], app.selectedImages[i]];
    renderSelectedImages();
  }));
}
function addTierRow(name='', price=0, capacity=50, description='') {
  const wrap=document.createElement('div'); wrap.className='tier-row';
  wrap.innerHTML=`
    <label>Tier name<input name="tierName" placeholder="Standard, VIP, SuperVIP" value="${escapeHtml(name)}" required></label>
    <label>Price per ticket<input name="tierPrice" type="number" min="0" step="0.01" placeholder="0.00" value="${price}" required></label>
    <label>Available tickets<input name="tierCapacity" type="number" min="1" step="1" placeholder="50" value="${capacity}" required></label>
    <label>Tier description<input name="tierDescription" placeholder="General admission, lounge access, table included..." value="${escapeHtml(description)}"></label>
    <button type="button" class="icon-btn remove-tier" aria-label="Remove tier">×</button>`;
  wrap.querySelector('.remove-tier').addEventListener('click',()=>{ if($$('.tier-row').length > 1) wrap.remove(); else toast('You need at least one tier.','error'); });
  $('#tierList').appendChild(wrap);
}

function renderHost() {
  $('#hostEvents').innerHTML = app.user ? app.hostEvents.map(e=>hostEventCard(e)).join('') || '<p class="empty">You are not hosting events yet.</p>' : '<p class="empty">Log in to create and manage events.</p>';
  $$('[data-open-checkins]').forEach(btn=>btn.addEventListener('click',()=>openCheckinListModal(btn.dataset.openCheckins)));
  $$('[data-open-event-editor]').forEach(btn=>btn.addEventListener('click',()=>openEventEditorModal(btn.dataset.openEventEditor)));
  $$('[data-copy-invite]').forEach(btn=>btn.addEventListener('click', async()=>{ const code=btn.dataset.copyInvite; const link=`${location.origin}${location.pathname}#invite=${encodeURIComponent(code)}`; try { await navigator.clipboard.writeText(link); toast('Private invite link copied.'); } catch { toast(link); } }));
}
function moveExistingImage(btn) {
  const item = btn.closest('.existing-image-item');
  const grid = btn.closest('.existing-images');
  const card = btn.closest('[data-edit-event]');
  if (!item || !grid) return;
  const items = Array.from(grid.children);
  const idx = items.indexOf(item);
  const dir = btn.dataset.existingMove.split(':')[1];
  const target = dir === 'left' ? idx - 1 : idx + 1;
  if (target < 0 || target >= items.length) return;
  if (dir === 'left') grid.insertBefore(item, items[target]);
  else grid.insertBefore(items[target], item);
  refreshExistingImageOrder(card);
  if (card) card.dataset.dirty='true';
}
function refreshExistingImageOrder(card) {
  const items = Array.from(card?.querySelectorAll('.existing-image-item') || []);
  items.forEach((item,i)=>{
    const controls = item.querySelector('.existing-image-order');
    if (!controls) return;
    const [left, right] = controls.querySelectorAll('button');
    const span = controls.querySelector('span');
    if (left) { left.dataset.existingMove = `${i}:left`; left.disabled = i === 0; }
    if (right) { right.dataset.existingMove = `${i}:right`; right.disabled = i === items.length - 1; }
    if (span) span.textContent = String(i + 1);
  });
}

function hostEventCard(e) {
  const pending = (e.tickets || []).filter(t => t.status !== 'used' && t.status !== 'cancelled').length;
  const checked = (e.tickets || []).filter(t => t.status === 'used').length;
  return `<article class="host-event" data-host-event="${e.id}">
    <img src="${escapeHtml(firstImage(e))}" alt="">
    <div class="host-event-body">
      <h3>${escapeHtml(e.title)}</h3>
      <p>${totalSold(e)}/${totalCap(e)} tickets sold · ${escapeHtml(privacyLabels[e.visibility] || e.visibility)}</p>
      <div>${e.ticketTiers.map(t=>`<span class="mini-pill">${escapeHtml(t.name)} ${t.sold}/${t.capacity}</span>`).join('')}</div>
      <div class="host-event-actions">
        <button class="primary-btn small" data-open-checkins="${e.id}" type="button">Check-in list</button>
        <button class="secondary-btn small" data-open-event-editor="${e.id}" type="button">Edit event profile</button>
        <button class="secondary-btn small" data-copy-invite="${escapeHtml(e.inviteCode)}" type="button">Copy invite link</button>
      </div>
      <div class="checkin-summary"><span>${checked} checked in</span><span>${pending} pending</span></div>
    </div>
  </article>`;
}


function ensureUtilityModal(id, label='GamePlan dialog') {
  let modal = document.getElementById(id);
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = id;
  modal.className = 'modal hidden';
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', label);
  modal.innerHTML = `<div class="modal-backdrop" data-close-utility></div><div class="modal-card glass-card utility-modal-card"><button class="modal-close" data-close-utility type="button" aria-label="Close">×</button><div class="utility-modal-content"></div></div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close-utility]').forEach(el => el.addEventListener('click', () => modal.classList.add('hidden')));
  return modal;
}
function closeUtilityModal(id) { document.getElementById(id)?.classList.add('hidden'); }

async function openCheckinListModal(eventId) {
  if (!requireLogin()) return;
  const modal = ensureUtilityModal('checkinListModal', 'Event check-in list');
  const content = modal.querySelector('.utility-modal-content');
  content.innerHTML = '<p class="eyebrow">Host access</p><h2>Loading check-in list...</h2>';
  modal.classList.remove('hidden');
  try {
    const data = await api(`/api/events/${eventId}/checkins`);
    renderCheckinListModal(data.event, data.tickets || [], data.summary || {});
  } catch (error) {
    content.innerHTML = `<p class="eyebrow">Check-in list</p><h2>Could not load list</h2><p class="inline-error">${escapeHtml(error.message)}</p>`;
  }
}
function renderCheckinListModal(event, tickets, summary={}) {
  const modal = ensureUtilityModal('checkinListModal', 'Event check-in list');
  app.currentCheckinEventId = event.id;
  const checkedIn = summary.checkedIn ?? tickets.filter(t => t.status === 'used').length;
  const pending = summary.pending ?? tickets.filter(t => t.status !== 'used').length;
  const rows = tickets.map(t => {
    const u = t.user || { name:'Guest', email:'', avatarUrl:'' };
    const used = t.status === 'used';
    return `<article class="checkin-row ${used ? 'checked-in' : ''}" data-ticket-row="${escapeHtml(t.id)}">
      <img src="${escapeHtml(avatar(u))}" alt="${escapeHtml(u.name || 'Guest')}">
      <div><strong>${escapeHtml(u.name || 'Guest')}</strong><small>${escapeHtml(t.tierName || 'Ticket')} · ${used ? `Checked in ${fmtTime(t.checkedInAt)}` : 'Waiting for check-in'}</small><code>${escapeHtml(t.code || '')}</code></div>
      <button class="${used ? 'secondary-btn' : 'primary-btn'} small" data-checkin-ticket-id="${escapeHtml(t.id)}" type="button" ${used ? 'disabled' : ''}>${used ? 'Checked in' : 'Check in'}</button>
    </article>`;
  }).join('') || '<p class="empty">No tickets have been reserved for this event yet.</p>';
  modal.querySelector('.utility-modal-content').innerHTML = `
    <p class="eyebrow">Host check-in</p>
    <h2>${escapeHtml(event.title)}</h2>
    <p class="muted-copy">Tap guests from this list instead of manually typing ticket codes.</p>
    <div class="checkin-stats"><div><strong>${tickets.length}</strong><span>Total</span></div><div><strong>${checkedIn}</strong><span>Checked in</span></div><div><strong>${pending}</strong><span>Pending</span></div></div>
    <div class="checkin-list">${rows}</div>`;
  modal.querySelectorAll('[data-checkin-ticket-id]').forEach(btn => btn.addEventListener('click', () => checkInTicketById(btn.dataset.checkinTicketId)));
}
async function checkInTicketById(ticketId) {
  try {
    await api(`/api/tickets/${ticketId}/check-in`, { method:'POST', body:'{}' });
    await loadData();
    const eventId = app.currentCheckinEventId;
    if (eventId) {
      const fresh = await api(`/api/events/${eventId}/checkins`);
      renderCheckinListModal(fresh.event, fresh.tickets || [], fresh.summary || {});
    }
    renderAll();
    toast('Guest checked in.');
  } catch (error) { toast(error.message, 'error'); }
}

function openEventEditorModal(eventId) {
  const event = app.hostEvents.find(e => e.id === eventId);
  if (!event) return toast('Hosted event not found.', 'error');
  const modal = ensureUtilityModal('eventEditorModal', 'Edit event profile');
  app.currentEditEventId = event.id;
  const images = eventImages(event);
  const hidden = event.showTicketAvailability === false;
  modal.querySelector('.utility-modal-card').classList.add('event-editor-modal-card');
  modal.querySelector('.utility-modal-content').innerHTML = `
    <p class="eyebrow">Host tools</p>
    <h2>Edit event profile</h2>
    <p class="muted-copy">Update the event profile content guests see without touching ticket purchases or check-in history.</p>
    <section class="event-editor-window" data-edit-event="${escapeHtml(event.id)}">
      <div class="event-editor-preview"><img src="${escapeHtml(firstImage(event))}" alt="${escapeHtml(event.title)}"><div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.address)}</p></div></div>
      <div class="host-edit-grid modal-edit-grid">
        <label>Map/privacy visibility<select name="editVisibility"><option value="public" ${event.visibility==='public'?'selected':''}>Public map</option><option value="friends_only" ${event.visibility==='friends_only'?'selected':''}>Friends only</option><option value="link_only" ${event.visibility==='link_only'?'selected':''}>Link only</option><option value="private" ${event.visibility==='private'?'selected':''}>Private invite only</option></select></label>
        <label class="toggle-row"><input name="editShowAvailability" type="checkbox" ${hidden?'':'checked'}> Show ticket availability</label>
        <label class="span-2">Add more pictures<input name="editImages" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label>
      </div>
      <h3>Event carousel order</h3>
      <p class="muted-copy">Remove images or move them left/right to choose how the event gallery displays.</p>
      <div class="existing-images editor-existing-images">${images.map((img,i)=>`<div class="existing-image-item" data-existing-image="${escapeHtml(img)}"><img src="${escapeHtml(img)}" alt="${escapeHtml(event.title)} image ${i+1}"><button class="thumb-remove" data-existing-remove="${i}" type="button">×</button><div class="existing-image-order"><button type="button" data-existing-move="${i}:left" ${i===0?'disabled':''}>←</button><span>${i+1}</span><button type="button" data-existing-move="${i}:right" ${i===images.length-1?'disabled':''}>→</button></div></div>`).join('')}</div>
      <div class="event-editor-actions"><button class="secondary-btn" data-copy-invite="${escapeHtml(event.inviteCode)}" type="button">Copy invite link</button><button class="primary-btn" data-save-event="${escapeHtml(event.id)}" type="button">Save event profile changes</button></div>
    </section>`;
  modal.classList.remove('hidden');
  modal.querySelector('[data-save-event]')?.addEventListener('click', async () => { await saveHostEvent(event.id); closeUtilityModal('eventEditorModal'); });
  modal.querySelector('[data-copy-invite]')?.addEventListener('click', async()=>{ const link=`${location.origin}${location.pathname}#invite=${encodeURIComponent(event.inviteCode)}`; try { await navigator.clipboard.writeText(link); toast('Private invite link copied.'); } catch { toast(link); } });
  modal.querySelectorAll('[data-existing-remove]').forEach(btn=>btn.addEventListener('click',()=>{ const card=btn.closest('[data-edit-event]'); btn.closest('.existing-image-item')?.remove(); refreshExistingImageOrder(card); card.dataset.dirty='true'; }));
  modal.querySelectorAll('[data-existing-move]').forEach(btn=>btn.addEventListener('click',()=>moveExistingImage(btn)));
}

async function saveHostEvent(eventId) {
  const card = $(`[data-edit-event="${CSS.escape(eventId)}"]`);
  if (!card) return;
  const fd = new FormData();
  fd.set('visibility', card.querySelector('[name="editVisibility"]').value);
  fd.set('showTicketAvailability', card.querySelector('[name="editShowAvailability"]').checked ? 'true' : 'false');
  const keepImages = Array.from(card.querySelectorAll('[data-existing-image]')).map(el=>el.dataset.existingImage);
  fd.set('keepImages', JSON.stringify(keepImages));
  Array.from(card.querySelector('[name="editImages"]').files || []).forEach(file=>fd.append('images', file));
  try { await api(`/api/events/${eventId}`, { method:'PATCH', body:fd }); await loadData(); renderAll(); toast('Event profile updated.'); }
  catch(error) { toast(error.message, 'error'); }
}

