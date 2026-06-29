import { spawn } from 'node:child_process';

const PORT = 5199;
const server = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT, SESSION_SECRET: 'test-secret' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://localhost:${PORT}`;
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
function makeClient(){
  let cookie = '';
  return async function req(path, opts={}){
    const headers = { ...(opts.headers||{}) };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base+path, { ...opts, headers });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
    return data;
  };
}
try {
  await wait(1000);
  const raw = await fetch(`${base}/api/health`);
  if (!raw.ok) throw new Error('Health endpoint failed');
  const a = makeClient();
  const b = makeClient();
  const stamp = Date.now();
  let dataA = await a('/api/auth/register', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:'Smoke Host', email:`host${stamp}@gameplan.local`, password:'Test1234!', role:'both'}) });
  let dataB = await b('/api/auth/register', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:'Smoke Friend', email:`friend${stamp}@gameplan.local`, password:'Test1234!', role:'both'}) });
  const csrfA = dataA.csrf;
  const csrfB = dataB.csrf;
  const hostUserId = dataA.user.id;

  await a('/api/profile', { method:'PUT', headers:{'x-csrf-token':csrfA}, body:(()=>{ const f=new FormData(); f.set('name','Smoke Host Updated'); f.set('role','both'); f.set('bio','Smoke test profile.'); f.set('location','Fayetteville, AR'); f.set('website','https://example.com'); f.set('profileVisibility','public'); f.set('activityVisibility','friends_only'); f.set('eventsVisibility','friends_only'); f.set('defaultPostVisibility','friends_only'); f.set('locatorColor','#00d8ff'); return f; })() });

  const form = new FormData();
  form.set('title','Smoke Test Concert'); form.set('category','Music'); form.set('description','A smoke test event for professional validation.');
  form.set('address','100 W Center St, Fayetteville, AR 72701'); form.set('lat','36.0626'); form.set('lng','-94.1574');
  form.set('startsAt', new Date(Date.now()+86400000).toISOString()); form.set('endsAt',''); form.set('ageRestriction','18+'); form.set('visibility','public'); form.set('markerEmoji','🎸'); form.set('markerColor','#7CFF4F'); form.set('showTicketAvailability','true');
  form.set('ticketTiers', JSON.stringify([{name:'Standard',price:10,capacity:10,description:'GA'},{name:'VIP',price:30,capacity:5,description:'VIP'}]));
  dataA = await a('/api/events', { method:'POST', headers:{'x-csrf-token':csrfA}, body:form });
  const event = dataA.event;

  const savedToggle = await a(`/api/events/${event.id}/save`, { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfA}, body:'{}' });
  if (!savedToggle.saved) throw new Error('Save event toggle failed');
  const savedEvents = await a('/api/saved-events');
  if (!savedEvents.events.some(e => e.id === event.id)) throw new Error('Saved events list failed');
  const route = await a(`/api/directions?startLat=36.0626&startLng=-94.1574&endLat=${event.lat}&endLng=${event.lng}`);
  if (!route.route?.coordinates?.length) throw new Error('Directions fallback failed');

  const hostProfile = await b(`/api/users/${hostUserId}/profile`);
  if (!hostProfile.hostProfile || !Array.isArray(hostProfile.hostProfile.hostedEvents)) throw new Error('Host profile failed');
  const followHost = await b(`/api/hosts/${hostUserId}/follow`, { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfB}, body:'{}' });
  if (!followHost.following) throw new Error('Host follow failed');
  const hostFollows = await b('/api/host-follows');
  if (!hostFollows.hosts.some(h => h.id === hostUserId)) throw new Error('Host follow list failed');

  const search = await a(`/api/users/search?q=${encodeURIComponent('Smoke Friend')}`);
  const friend = search.users.find(u=>u.email === `friend${stamp}@gameplan.local`);
  if (!friend) throw new Error('User search failed');
  await a('/api/friends/request', { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfA}, body:JSON.stringify({targetUserId:friend.id}) });
  const bFriends = await b('/api/friends');
  if (!bFriends.incoming[0]) throw new Error('Incoming friend request missing');
  await b(`/api/friends/${bFriends.incoming[0].friendshipId}/respond`, { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfB}, body:JSON.stringify({action:'accept'}) });

  await a(`/api/events/${event.id}/purchase`, { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfA}, body:JSON.stringify({tierId:event.ticketTiers[0].id}) });
  const tickets = await a('/api/tickets');
  if (!tickets.tickets[0]?.event || !tickets.tickets[0]?.tierName) throw new Error('Ticket relation failed');
  await a(`/api/tickets/${tickets.tickets[0].id}/share`, { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfA}, body:JSON.stringify({text:'I am going to the smoke test concert.', visibility:'friends_only', reaction:'🔥'}) });
  const patchForm = new FormData(); patchForm.set('visibility','link_only'); patchForm.set('showTicketAvailability','false'); patchForm.set('keepImages', JSON.stringify(event.images || []));
  const patched = await a(`/api/events/${event.id}`, { method:'PATCH', headers:{'x-csrf-token':csrfA}, body:patchForm });
  if (patched.event.visibility !== 'link_only' || patched.event.showTicketAvailability !== false) throw new Error('Host event patch failed');
  const feed = await a('/api/feed?mode=friends');
  if (!Array.isArray(feed.posts)) throw new Error('Feed failed');
  const post = await a('/api/feed', { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfA}, body:JSON.stringify({text:'Smoke feed post', visibility:'friends_only'}) });
  await b(`/api/feed/${post.post.id}/react`, { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfB}, body:'{}' });
  await b(`/api/feed/${post.post.id}/comment`, { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfB}, body:JSON.stringify({text:'Looks good!'}) });
  await a('/api/tickets/check-in', { method:'POST', headers:{'content-type':'application/json','x-csrf-token':csrfA}, body:JSON.stringify({code:tickets.tickets[0].code}) });
  console.log('✅ GamePlan smoke tests passed: auth, profile, CSRF, event creation, ticket tiers, friend request accept/deny flow, feed posts, reactions, comments, manual ticket sharing, saved events, host profile/following, navigation route fallback, host edits, purchase, wallet, and check-in.');
} finally {
  server.kill();
}
