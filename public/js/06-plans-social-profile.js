/* Plans, social feed, user profiles, and nearby event carousel rendering. */
function ticketCard(t, mode='upcoming') {
  const event = t.event;
  const actionButtons = mode === 'activity'
    ? `<button class="secondary-btn full" data-share-ticket="${t.id}" type="button">Share memory</button>`
    : `<button class="share-activity-btn full" data-share-ticket="${t.id}" type="button">Share activity</button><button class="primary-btn full navigation-cta" data-navigate-event="${event.id}" type="button">GO</button>`;
  return `<article class="ticket-card glass-card"><div class="ticket-top"><img class="clickable-img" data-ticket-gallery="${t.id}" src="${escapeHtml(firstImage(event))}" alt=""><div><p class="eyebrow">${escapeHtml(t.tierName)}</p><h2>${escapeHtml(event.title)}</h2><p>${fmtTime(event.startsAt)} · ${eventDistanceText(event)}</p></div></div>${mode === 'activity' ? `<div class="countdown"><span>Attended</span><strong>${t.checkedInAt ? fmtTime(t.checkedInAt) : fmtTime(event.startsAt)}</strong></div>` : `<div class="countdown"><span>Starts in</span><strong>${countdown(event.startsAt)}</strong></div>`}<div class="qr-code">${escapeHtml(t.code)}</div><p>${escapeHtml(event.address)}</p>${actionButtons}<button class="secondary-btn full" type="button" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.address)}','_blank','noopener')">Open in Google Maps</button></article>`;
}
function savedEventCard(e) {
  return `<article class="ticket-card glass-card saved-plan-card"><div class="ticket-top"><img class="clickable-img" data-saved-gallery="${e.id}" src="${escapeHtml(firstImage(e))}" alt=""><div><p class="eyebrow">Saved plan</p><h2>${escapeHtml(e.title)}</h2><p>${fmtTime(e.startsAt)} · ${eventDistanceText(e)}</p></div></div>${eventCountdownMarkup(e.startsAt)}<p>${escapeHtml(e.address)}</p><button class="primary-btn full" data-open-saved-event="${e.id}" type="button">View event profile</button><button class="primary-btn full navigation-cta" data-navigate-event="${e.id}" type="button">GO</button><button class="secondary-btn full" data-toggle-save="${e.id}" type="button">★ Remove from saved</button></article>`;
}
function renderPlanOverview(upcoming, saved, activity) {
  const next = upcoming[0];
  const summary = $('#plansOverview');
  if (!summary) return;
  summary.innerHTML = app.user ? `<article class="glass-card plan-widget next-up-widget"><p class="eyebrow">Next up in your plan</p>${next ? `<div class="next-up-body"><img src="${escapeHtml(firstImage(next.event))}" alt=""><div><h2>${escapeHtml(next.event.title)}</h2><p>${fmtTime(next.event.startsAt)} · ${eventDistanceText(next.event)}</p><strong>${countdown(next.event.startsAt)}</strong></div></div><button class="primary-btn full navigation-cta" data-navigate-event="${next.event.id}" type="button">GO to next plan</button>` : '<p class="empty">No upcoming plans yet.</p>'}</article><article class="glass-card plan-widget"><p class="eyebrow">Plan summary</p><div class="account-summary-grid"><div><strong>${upcoming.length}</strong><span>Upcoming</span></div><div><strong>${saved.length}</strong><span>Saved</span></div><div><strong>${activity.length}</strong><span>Activity</span></div></div></article>` : '';
  summary.querySelectorAll('[data-navigate-event]').forEach(btn=>btn.addEventListener('click',()=>{ route('map'); setTimeout(()=>startNavigation(btn.dataset.navigateEvent),120); }));
}
function renderTickets() {
  if (!app.user) {
    if ($('#plansOverview')) $('#plansOverview').innerHTML = '';
    $('#ticketsList').innerHTML = '<p class="empty">Log in to see your plans.</p>';
    $('#savedList').innerHTML = '<p class="empty">Log in to see saved events.</p>';
    $('#activityList').innerHTML = '<p class="empty">Log in to see activity.</p>';
    return;
  }
  const now = Date.now();
  const upcoming = app.tickets.filter(t => t.status !== 'used' && new Date(t.event.startsAt).getTime() >= now - 3600000).sort((a,b)=>new Date(a.event.startsAt)-new Date(b.event.startsAt));
  const activity = app.tickets.filter(t => t.status === 'used' || new Date(t.event.startsAt).getTime() < now - 3600000).sort((a,b)=>new Date(b.event.startsAt)-new Date(a.event.startsAt));
  renderPlanOverview(upcoming, app.savedEvents || [], activity);
  $('#ticketsList').innerHTML = upcoming.map(t=>ticketCard(t,'upcoming')).join('') || '<p class="empty">No upcoming plans yet. Open the map and reserve one.</p>';
  $('#savedList').innerHTML = (app.savedEvents || []).map(savedEventCard).join('') || '<p class="empty">No saved events yet. Use the Save button on event cards or event profiles.</p>';
  $('#activityList').innerHTML = activity.map(t=>ticketCard(t,'activity')).join('') || '<p class="empty">No previous attended events yet. Checked-in or past events will show here.</p>';
  $$('[data-ticket-gallery]').forEach(img=>img.addEventListener('click',()=>{ const ticket=app.tickets.find(t=>t.id===img.dataset.ticketGallery); if(ticket) openGallery(eventImages(ticket.event),0); }));
  $$('[data-saved-gallery]').forEach(img=>img.addEventListener('click',()=>{ const event=app.savedEvents.find(e=>e.id===img.dataset.savedGallery); if(event) openGallery(eventImages(event),0); }));
  $$('[data-share-ticket]').forEach(btn=>btn.addEventListener('click',()=>openShareTicket(btn.dataset.shareTicket)));
  $$('[data-open-saved-event]').forEach(btn=>btn.addEventListener('click',()=>{ route('map'); setTimeout(()=>selectEvent(btn.dataset.openSavedEvent),120); }));
  $$('[data-navigate-event]').forEach(btn=>btn.addEventListener('click',()=>{ route('map'); setTimeout(()=>startNavigation(btn.dataset.navigateEvent),120); }));
  bindSaveButtons();
}
function bindPlans() {
  $$('[data-plan-tab]').forEach(btn => btn.addEventListener('click', () => {
    app.planTab = btn.dataset.planTab;
    $$('[data-plan-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.planTab === app.planTab));
    $$('[data-plan-section]').forEach(sec => sec.classList.toggle('active', sec.dataset.planSection === app.planTab));
  }));
}



function bindSocial() {
  $('#userSearchBtn')?.addEventListener('click', searchUsers);
  $('#userSearchInput')?.addEventListener('keydown', e=>{ if(e.key === 'Enter') { e.preventDefault(); searchUsers(); } });
  $('#postFeedBtn')?.addEventListener('click', createPost);
  $$('[data-feed-mode]').forEach(btn=>btn.addEventListener('click', async()=>{ app.feedMode = btn.dataset.feedMode; await loadData(); renderSocial(); }));
}
async function searchUsers() {
  if (!requireLogin()) return;
  const q = $('#userSearchInput').value.trim();
  if (q.length < 2) return toast('Type at least 2 characters to search users.', 'error');
  try {
    const data = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    $('#userSearchResults').innerHTML = data.users.map(userSearchCard).join('') || '<p class="empty">No users found.</p>';
    bindFriendButtons();
  } catch(error) { toast(error.message, 'error'); }
}
function userSearchCard(u) {
  const label = u.friendshipStatus === 'accepted' ? 'Friends' : u.friendshipStatus === 'pending' ? (u.requestedByMe ? 'Request sent' : 'Accept') : 'Add friend';
  const disabled = u.friendshipStatus === 'accepted' || (u.friendshipStatus === 'pending' && u.requestedByMe);
  return `<div class="social-user"><div class="user-identity clickable-profile-identity" data-view-profile="${u.id}" role="button" tabindex="0"><img src="${escapeHtml(avatar(u))}" alt=""><span><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(u.email)} · ${escapeHtml(roleLabel(u.role))}</small></span></div><div class="row-actions"><button class="secondary-btn small" data-view-profile="${u.id}" type="button">Profile</button><button class="secondary-btn small" data-add-friend="${u.id}" ${disabled?'disabled':''} type="button">${label}</button></div></div>`;
}
function bindFriendButtons() {
  $$('[data-add-friend]').forEach(btn=>btn.addEventListener('click', async()=>{
    try { await api('/api/friends/request', { method:'POST', body:JSON.stringify({ targetUserId: btn.dataset.addFriend }) }); await loadData(); renderSocial(); toast('Friend request sent or accepted.'); }
    catch(error) { toast(error.message, 'error'); }
  }));
  $$('[data-friend-respond]').forEach(btn=>btn.addEventListener('click', async()=>{
    const [id, action] = btn.dataset.friendRespond.split(':');
    try { await api(`/api/friends/${id}/respond`, { method:'POST', body:JSON.stringify({ action }) }); await loadData(); renderSocial(); toast(action === 'reject' ? 'Friend request denied.' : 'Friend request accepted.'); }
    catch(error) { toast(error.message, 'error'); }
  }));
  $$('[data-view-profile]').forEach(btn=>btn.addEventListener('click',()=>openProfileView(btn.dataset.viewProfile)));
  $$('.clickable-profile-identity').forEach(el=>el.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfileView(el.dataset.viewProfile); } }));
  $$('[data-feed-gallery]').forEach(btn=>btn.addEventListener('click',()=>{ const [postId, idx] = btn.dataset.feedGallery.split(':'); const post = (app.feed || []).find(p=>p.id===postId); if(post?.event) openGallery(eventImages(post.event), Number(idx || 0)); }));
  $$('[data-focus-comment]').forEach(btn=>btn.addEventListener('click',()=>{ const input = $(`[data-comment-input="${btn.dataset.focusComment}"]`); input?.focus(); }));
  $$('[data-activity-event]').forEach(btn=>btn.addEventListener('click',()=>{ route('map'); setTimeout(()=>selectEvent(btn.dataset.activityEvent),120); }));
  bindImageOpenButtons();
}

async function createPost() {
  if (!requireLogin()) return;
  const text = $('#feedPostInput').value.trim();
  const visibility = $('#feedVisibility').value;
  if (text.length < 2) return toast('Write something before posting.', 'error');
  try {
    await api('/api/feed', { method:'POST', body:JSON.stringify({ text, visibility }) });
    $('#feedPostInput').value='';
    await loadData(); renderSocial(); toast('Posted to your feed.');
  } catch(error) { toast(error.message, 'error'); }
}
function renderSocial() {
  if (!app.user) {
    $('#friendsList').innerHTML = '<p class="empty">Log in to add friends.</p>';
    $('#friendActivity').innerHTML = '<p class="empty">Log in to see friend activity.</p>';
    $('#friendRequestsList').innerHTML = '<p class="empty">Log in to see friend requests.</p>';
    $('#userSearchResults').innerHTML = '';
    $('#socialFeed').innerHTML = '<p class="empty">Log in to use the social feed.</p>';
    $('#composerName').textContent = 'GamePlan user'; $('#composerAvatar').src = DEFAULT_MEDIA_IMAGE;
    return;
  }
  $('#composerName').textContent = app.user.name; $('#composerAvatar').src = avatar(app.user); $('#feedVisibility').value = app.user.profile?.defaultPostVisibility || 'friends_only';
  $$('[data-feed-mode]').forEach(btn=>btn.classList.toggle('active', btn.dataset.feedMode === app.feedMode));
  const incoming = app.incomingRequests || [];
  $('#friendRequestsList').innerHTML = incoming.length ? incoming.map(r=>`<div class="social-user"><div class="user-identity clickable-profile-identity" data-view-profile="${r.id}" role="button" tabindex="0"><img src="${escapeHtml(avatar(r))}" alt=""><span><strong>${escapeHtml(r.name)}</strong><small>Wants to connect</small></span></div><div class="row-actions"><button class="primary-btn small" data-friend-respond="${r.friendshipId}:accept" type="button">Accept</button><button class="secondary-btn small" data-friend-respond="${r.friendshipId}:reject" type="button">Deny</button></div></div>`).join('') : '<p class="empty">No pending requests.</p>';
  const friends = app.friends || [];
  $('#friendsList').innerHTML = friends.map(f=>`<div class="social-user"><div class="user-identity clickable-profile-identity" data-view-profile="${f.id}" role="button" tabindex="0"><img src="${escapeHtml(avatar(f))}" alt=""><span><strong>${escapeHtml(f.name)}</strong><small>${escapeHtml(roleLabel(f.role))}</small></span></div><button class="secondary-btn small" data-view-profile="${f.id}" type="button">Profile</button></div>`).join('') || '<p class="empty">No friends yet. Search users to add them.</p>';
  $('#friendActivity').innerHTML = (app.friendActivity||[]).map(e=>`<button class="activity-card" type="button" data-activity-event="${e.eventId}"><img src="${escapeHtml(firstImage(e))}" alt=""><span><strong>${escapeHtml(e.title)}</strong><small>${fmtTime(e.startsAt)} · ${escapeHtml(e.category)}</small></span></button>`).join('') || '<p class="empty">No friend-connected events yet.</p>';
  $('#socialFeed').innerHTML = (app.feed || []).map(feedPostCard).join('') || '<p class="empty">No posts yet. Add friends or create the first update.</p>';
  bindFriendButtons(); bindFeedButtons();
  $$('[data-activity-event]').forEach(btn=>btn.addEventListener('click',()=>{ route('map'); setTimeout(()=>selectEvent(btn.dataset.activityEvent),150); }));
}
function feedPostCard(p) {
  const reacted = p.reactedByMe ? 'active' : '';
  const imgs = p.event ? eventImages(p.event).slice(0, 4) : [];
  const media = imgs.length ? `<div class="feed-media-carousel">${imgs.map((img,i)=>`<button data-feed-gallery="${p.id}:${i}" type="button"><img src="${escapeHtml(img)}" alt="Event image"></button>`).join('')}</div>` : '';
  const event = p.event ? `<button class="feed-event shared-event-card" data-activity-event="${p.event.id}" type="button"><img src="${escapeHtml(firstImage(p.event))}" alt=""><span><strong>${escapeHtml(p.event.title)}</strong><small>${fmtTime(p.event.startsAt)} · ${escapeHtml(p.event.category)}</small></span></button>` : '';
  const shared = p.original ? `<div class="shared-box"><small>Shared from ${escapeHtml(p.original.authorName)}</small><p>${escapeHtml(p.original.text)}</p></div>` : '';
  const comments = (p.comments || []).slice(-3).map(c=>`<div class="comment"><strong>${escapeHtml(c.authorName)}</strong><span>${escapeHtml(c.text)}</span></div>`).join('');
  return `<article class="glass-card feed-card modern-feed-card">
    <div class="feed-author"><button class="feed-author-avatar" data-view-profile="${p.userId}" type="button"><img src="${escapeHtml(avatar(p.author))}" alt="${escapeHtml(p.authorName)} profile picture"></button><div><button class="plain-profile-link" data-view-profile="${p.userId}" type="button">${escapeHtml(p.authorName)}</button><small>${fmtTime(p.createdAt)}</small></div><span class="privacy-badge">${escapeHtml(privacyLabels[p.visibility] || p.visibility)}</span></div>
    <p class="feed-post-text">${escapeHtml(p.text)}</p>${media}${event}${shared}
    <div class="feed-actions"><button class="reaction-btn ${reacted}" data-react-post="${p.id}" type="button">${reacted?'💚':'♡'} React ${p.reactionCount || 0}</button><button data-share-post="${p.id}" type="button">↗ Share ${p.shareCount || 0}</button><button type="button" data-focus-comment="${p.id}">💬 Comment</button></div>
    <div class="comments">${comments}</div>
    <div class="comment-box"><input data-comment-input="${p.id}" placeholder="Write a comment..."><button class="secondary-btn small" data-comment-post="${p.id}" type="button">Comment</button></div>
  </article>`;
}
function bindFeedButtons() {
  $$('[data-react-post]').forEach(btn=>btn.addEventListener('click', async()=>{ try { await api(`/api/feed/${btn.dataset.reactPost}/react`, { method:'POST', body:'{}' }); await loadData(); renderSocial(); } catch(error) { toast(error.message, 'error'); } }));
  $$('[data-comment-post]').forEach(btn=>btn.addEventListener('click', async()=>{ const input=$(`[data-comment-input="${btn.dataset.commentPost}"]`); const text=input.value.trim(); if(!text) return; try { await api(`/api/feed/${btn.dataset.commentPost}/comment`, { method:'POST', body:JSON.stringify({ text }) }); input.value=''; await loadData(); renderSocial(); } catch(error) { toast(error.message, 'error'); } }));
  $$('[data-share-post]').forEach(btn=>btn.addEventListener('click', async()=>{ try { await api(`/api/feed/${btn.dataset.sharePost}/share`, { method:'POST', body:JSON.stringify({ visibility: app.user.profile?.defaultPostVisibility || 'friends_only' }) }); await loadData(); renderSocial(); toast('Shared to your feed.'); } catch(error) { toast(error.message, 'error'); } }));
  $$('[data-view-profile]').forEach(btn=>btn.addEventListener('click',()=>openProfileView(btn.dataset.viewProfile)));
  $$('.clickable-profile-identity').forEach(el=>el.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfileView(el.dataset.viewProfile); } }));
  $$('[data-feed-gallery]').forEach(btn=>btn.addEventListener('click',()=>{ const [postId, idx] = btn.dataset.feedGallery.split(':'); const post = (app.feed || []).find(p=>p.id===postId); if(post?.event) openGallery(eventImages(post.event), Number(idx || 0)); }));
  $$('[data-focus-comment]').forEach(btn=>btn.addEventListener('click',()=>{ const input = $(`[data-comment-input="${btn.dataset.focusComment}"]`); input?.focus(); }));
  $$('[data-activity-event]').forEach(btn=>btn.addEventListener('click',()=>{ route('map'); setTimeout(()=>selectEvent(btn.dataset.activityEvent),120); }));
  bindImageOpenButtons();
}


function bindProfile() {
  $$('[data-close-profile]').forEach(el=>el.addEventListener('click', closeProfileModal));
  $$('[data-profile-tab]').forEach(btn=>btn.addEventListener('click',()=>showProfileSection(btn.dataset.profileTab)));
  $('#avatarInput')?.addEventListener('change', e=>{ const file=e.target.files?.[0]; if(file) $('#avatarPreview').src = URL.createObjectURL(file); });
  $('#bannerInput')?.addEventListener('change', e=>{ const file=e.target.files?.[0]; if(file) $('#bannerPreview').style.backgroundImage = `linear-gradient(rgba(3,7,12,.12), rgba(3,7,12,.35)), url('${URL.createObjectURL(file)}')`; });
  $('#themePreferenceSelect')?.addEventListener('change', e=>applyTheme(e.target.value, true));
  $('#profileForm')?.addEventListener('submit', async(e)=>{
    e.preventDefault(); if(!requireLogin()) return;
    const fd = new FormData(e.currentTarget);
    try { const data = await api('/api/profile', { method:'PUT', body:fd }); app.user = data.user; if (app.user?.profile?.themePreference) applyTheme(app.user.profile.themePreference, true); if (app.userLocation) updateUserLocationMarker(app.userLocation); await loadData(); closeProfileModal(); renderAll(); toast('Profile settings saved.'); }
    catch(error) { toast(error.message, 'error'); }
  });
}
function openProfileModal(section='edit') {
  if (!requireLogin()) return;
  const f = $('#profileForm'); f.reset();
  const p = app.user.profile || {};
  f.name.value = app.user.name || '';
  f.role.value = app.user.role || 'both';
  f.bio.value = p.bio || '';
  f.location.value = p.location || '';
  f.website.value = p.website || '';
  f.profileVisibility.value = p.profileVisibility || 'public';
  f.activityVisibility.value = p.activityVisibility || 'friends_only';
  f.eventsVisibility.value = p.eventsVisibility || 'friends_only';
  f.defaultPostVisibility.value = p.defaultPostVisibility || 'friends_only';
  if (f.themePreference) f.themePreference.value = p.themePreference || app.themePreference || 'dark';
  if (f.locatorColor) f.locatorColor.value = p.locatorColor || '#00d8ff';
  $('#avatarPreview').src = avatar(app.user);
  const bannerUrl = profileBanner(app.user);
  if ($('#bannerPreview')) $('#bannerPreview').style.backgroundImage = bannerUrl ? `linear-gradient(rgba(3,7,12,.12), rgba(3,7,12,.35)), url('${bannerUrl}')` : '';
  renderOwnProfilePreview();
  renderAccountSettingsPanel();
  $('#profileModal').classList.remove('hidden');
  showProfileSection(section === 'account' ? 'account' : section === 'privacy' ? 'privacy' : 'edit');
}
function showProfileSection(section='edit') {
  $$('.profile-section').forEach(sec=>sec.classList.toggle('active', sec.dataset.section === section));
  $$('[data-profile-tab]').forEach(btn=>btn.classList.toggle('active', btn.dataset.profileTab === section));
  const titles = { edit:'Edit profile', privacy:'Privacy settings', account:'Account settings' };
  $('#profileTitle').textContent = titles[section] || 'Profile';
  $('#profileSaveBtn').classList.toggle('hidden', section === 'view');
}
function renderOwnProfilePreview() {
  const preview = $('#profilePreview');
  if (!preview) return;
  const p = app.user.profile || {};
  const banner = profileBanner(app.user);
  preview.innerHTML = `<div class="profile-public-card rich-profile-preview"><div class="profile-preview-cover" style="${banner ? `background-image:linear-gradient(rgba(3,7,12,.10), rgba(3,7,12,.35)),url('${escapeHtml(banner)}')` : ''}"></div><div class="profile-preview-body"><button class="profile-preview-avatar" data-open-image="${escapeHtml(avatar(app.user))}" type="button"><img src="${escapeHtml(avatar(app.user))}" alt=""></button><div><h2>${escapeHtml(app.user.name)}</h2><p>${escapeHtml(p.bio || 'No bio yet.')}</p><small>${escapeHtml(app.user.email)} · ${escapeHtml(roleLabel(app.user.role))}${p.location ? ` · ${escapeHtml(p.location)}` : ''}${p.website ? ` · ${escapeHtml(p.website)}` : ''}</small></div></div></div>
    <div class="account-summary-grid"><div><strong>${app.tickets.length}</strong><span>Plans</span></div><div><strong>${app.friends.length}</strong><span>Friends</span></div><div><strong>${app.hostEvents.length}</strong><span>Hosting</span></div></div>`;
  bindImageOpenButtons();
}
function renderAccountSettingsPanel() {
  const p = app.user.profile || {};
  $('#accountSettingsPanel').innerHTML = `<div class="account-summary-grid"><div><strong>${escapeHtml(app.user.email)}</strong><span>Email</span></div><div><strong>${escapeHtml(roleLabel(app.user.role))}</strong><span>Account type</span></div><div><strong>${escapeHtml((p.defaultPostVisibility || 'friends_only').replace('_',' '))}</strong><span>Default post privacy</span></div><div><strong>${escapeHtml((p.themePreference || app.themePreference || 'dark').replace('_',' '))}</strong><span>Appearance</span></div></div>
    <div class="account-actions"><button class="secondary-btn" type="button" data-profile-tab="edit">Update public profile</button><button class="secondary-btn" type="button" data-profile-tab="privacy">Change privacy controls</button></div>
    <p class="hint">Choose your default post privacy above. Security features active in this MVP: password hashing, secure sessions, CSRF protection, upload validation, and login rate limiting.</p>`;
  $('#accountSettingsPanel').querySelectorAll('[data-profile-tab]').forEach(btn=>btn.addEventListener('click',()=>showProfileSection(btn.dataset.profileTab)));
}
function closeProfileModal() { $('#profileModal').classList.add('hidden'); }
async function openProfileView(userId) {
  if (!requireLogin()) return;
  try {
    const data = await api(`/api/users/${userId}/profile`);
    const u = data.user;
    const host = data.hostProfile || null;
    const friendship = data.friendship || {};
    const isSelf = app.user?.id === u.id;
    route('social');
    const panel = $('#socialProfilePanel');
    if (!panel) return;
    const posts = data.posts || [];
    const hostedEvents = host?.hostedEvents || [];
    const hostedCards = hostedEvents.length ? hostedEvents.slice(0, 6).map((e)=>`<button class="social-profile-event-card" data-activity-event="${e.id}" type="button"><img src="${escapeHtml(firstImage(e))}" alt=""><span><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.category)} · ${fmtTime(e.startsAt)}</small><em>${tierSummary(e)} · ${(e.attendees || []).length} going</em></span></button>`).join('') : '<p class="empty">No hosted plans visible yet.</p>';
    const postCards = posts.length ? posts.map(feedPostCard).join('') : '<p class="empty">No visible activity yet.</p>';
    const friendLabel = friendship.status === 'accepted' ? 'Friends' : friendship.status === 'pending' ? (friendship.requestedByMe ? 'Request sent' : 'Accept request') : 'Add friend';
    const friendDisabled = friendship.status === 'accepted' || (friendship.status === 'pending' && friendship.requestedByMe);
    const banner = profileBanner(u);
    const coverStyle = banner ? `background-image: linear-gradient(rgba(3,7,12,.10), rgba(3,7,12,.38)), url('${escapeHtml(banner)}');` : `background: radial-gradient(circle at 18% 25%, rgba(157,255,0,.33), transparent 28%), radial-gradient(circle at 78% 35%, rgba(0,216,255,.42), transparent 28%), linear-gradient(135deg, #07111f, #061021 48%, #02050a);`;
    panel.innerHTML = `<button class="profile-back-btn" data-close-social-profile type="button">← Back to feed</button>
      <section class="social-profile-hero">
        <div class="social-profile-cover" style="${coverStyle}"></div>
        <div class="social-profile-main-row">
          <button class="social-profile-avatar-btn" data-open-image="${escapeHtml(avatar(u))}" type="button"><img class="social-profile-avatar" src="${escapeHtml(avatar(u))}" alt="${escapeHtml(u.name)} profile picture"></button>
          <div class="social-profile-copy"><p class="eyebrow">${host?.hostedEvents?.length ? 'Host profile' : 'User profile'}</p><h2>${escapeHtml(u.name)}</h2><p>${escapeHtml(u.profile?.bio || 'No bio yet.')}</p><div class="profile-meta-row"><span>${escapeHtml(roleLabel(u.role || 'member'))}</span>${u.profile?.location ? `<span>📍 ${escapeHtml(u.profile.location)}</span>` : ''}${u.profile?.website ? `<span>🔗 ${escapeHtml(u.profile.website)}</span>` : ''}</div></div>
          <div class="social-profile-actions">${!isSelf ? `<button class="secondary-btn ${host?.followingHost ? 'active' : ''}" data-follow-host="${u.id}" type="button">${host?.followingHost ? 'Following host' : 'Follow host'}</button><button class="secondary-btn" data-add-friend="${u.id}" ${friendDisabled?'disabled':''} type="button">${friendLabel}</button>` : `<button class="secondary-btn" data-profile-action="edit" type="button">Edit profile</button>`}</div>
        </div>
      </section>
      <div class="social-profile-stats account-summary-grid"><div><strong>${posts.length}</strong><span>Posts</span></div><div><strong>${data.mutualFriendCount || 0}</strong><span>Friends</span></div><div><strong>${hostedEvents.length}</strong><span>Hosted</span></div><div><strong>${host?.followerCount || 0}</strong><span>Followers</span></div></div>
      <div class="social-profile-tabs" role="tablist"><button class="active" data-social-profile-tab="posts" type="button">Posts</button><button data-social-profile-tab="hosted" type="button">Hosted plans</button><button data-social-profile-tab="about" type="button">About</button></div>
      <section class="social-profile-section active" data-social-profile-section="posts"><h3>Posts and activity</h3><div class="profile-post-list">${postCards}</div></section>
      <section class="social-profile-section" data-social-profile-section="hosted"><h3>Hosted plans</h3><div class="hosted-event-strip">${hostedCards}</div></section>
      <section class="social-profile-section" data-social-profile-section="about"><h3>About</h3><div class="profile-about-grid"><div><strong>Profile visibility</strong><span>${escapeHtml(u.profile?.profileVisibility || 'public')}</span></div><div><strong>Activity visibility</strong><span>${escapeHtml(u.profile?.activityVisibility || 'friends_only')}</span></div><div><strong>Rating</strong><span>★ ${host?.rating || '4.7'}</span></div><div><strong>Tickets reserved</strong><span>${host?.ticketsReserved || 0}</span></div></div></section>`;
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior:'smooth', block:'start' });
    bindSocialProfileButtons(userId);
    bindImageOpenButtons();
  } catch(error) { toast(error.message, 'error'); }
}
function bindSocialProfileButtons(currentProfileId) {
  $$('[data-close-social-profile]').forEach(btn=>btn.addEventListener('click',()=>$('#socialProfilePanel')?.classList.add('hidden')));
  $$('[data-social-profile-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    const tab = btn.dataset.socialProfileTab;
    $$('[data-social-profile-tab]').forEach(b=>b.classList.toggle('active', b === btn));
    $$('.social-profile-section').forEach(sec=>sec.classList.toggle('active', sec.dataset.socialProfileSection === tab));
  }));
  $$('[data-follow-host]').forEach(btn => btn.addEventListener('click', async () => { await toggleHostFollow(btn.dataset.followHost); await openProfileView(btn.dataset.followHost); }));
  $$('[data-add-friend]').forEach(btn=>btn.addEventListener('click', async()=>{
    try { await api('/api/friends/request', { method:'POST', body:JSON.stringify({ targetUserId: btn.dataset.addFriend }) }); await loadData(); await openProfileView(currentProfileId); toast('Friend request sent or accepted.'); }
    catch(error) { toast(error.message, 'error'); }
  }));
  $$('[data-profile-action]').forEach(btn=>btn.addEventListener('click',()=>openProfileModal(btn.dataset.profileAction)));
  $$('[data-activity-event]').forEach(btn=>btn.addEventListener('click',()=>{ route('map'); setTimeout(()=>selectEvent(btn.dataset.activityEvent),150); }));
  bindFeedButtons();
  bindImageOpenButtons();
}

function bindImageOpenButtons() {
  $$('[data-open-image]').forEach(btn=>{
    if (btn.dataset.boundImageOpen === '1') return;
    btn.dataset.boundImageOpen = '1';
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const src = btn.dataset.openImage;
      if (src) openGallery([src], 0);
    });
  });
}



function renderNearbyCarousel() {
  const rail = $('#nearbyCarousel');
  if (!rail) return;
  const events = visibleEvents().slice(0, 8);
  rail.innerHTML = `<div class="carousel-head"><p class="eyebrow">Nearby events</p><button id="carouselSearchBtn" type="button">View results</button></div><div class="nearby-track">${events.map(e => `<button class="nearby-card" data-nearby-event="${e.id}" type="button"><img src="${escapeHtml(firstImage(e))}" alt=""><span><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.category)} · ${e.distanceMiles ?? '?'} mi</small><strong>${tierSummary(e)}</strong></span></button>`).join('') || '<p class="empty">No nearby events found yet.</p>'}</div>`;
  rail.querySelectorAll('[data-nearby-event]').forEach(btn => btn.addEventListener('click', () => selectEvent(btn.dataset.nearbyEvent)));
  $('#carouselSearchBtn')?.addEventListener('click', () => renderSearchResultsPanel());
}
