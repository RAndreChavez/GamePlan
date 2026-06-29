import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function loadLocalEnv() {
  try {
    const envText = await fs.readFile(path.join(__dirname, '.env'), 'utf8');
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {}
}
await loadLocalEnv();
const PORT = process.env.PORT || 5173;
const ORS_API_KEY = process.env.OPENROUTE_SERVICE_API_KEY || process.env.ORS_API_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-me';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'gameplan.db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const IS_PROD = process.env.NODE_ENV === 'production';

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(SESSION_SECRET));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));
app.use(express.static(PUBLIC_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${Date.now()}-${nanoid(10)}${ext || '.jpg'}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
      return;
    }
    cb(null, true);
  },
});
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `avatar-${Date.now()}-${nanoid(10)}${ext || '.jpg'}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
      return;
    }
    cb(null, true);
  },
});
const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const prefix = file.fieldname === 'banner' ? 'banner' : 'avatar';
      cb(null, `${prefix}-${Date.now()}-${nanoid(10)}${ext || '.jpg'}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

function nowIso() { return new Date().toISOString(); }
const normalizeTicketCode = (value = '') => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function cents(n) { return Math.max(0, Math.round(Number(n || 0) * 100)); }
function defaultProfile() {
  return {
    bio: '', location: '', website: '', avatarUrl: '', bannerUrl: '',
    profileVisibility: 'public', activityVisibility: 'friends_only', eventsVisibility: 'friends_only', defaultPostVisibility: 'friends_only', locatorColor: '#00d8ff', themePreference: 'dark',
  };
}
function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl || user.profile?.avatarUrl || '', profile: { ...defaultProfile(), ...(user.profile || {}), avatarUrl: user.avatarUrl || user.profile?.avatarUrl || '' } };
}
function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function seedDb() {
  const start = (h) => new Date(Date.now() + h * 3600000).toISOString();
  const users = [];
  const mkUser = (email, name, password, role = 'both', profile = {}) => {
    users.push({ id: nanoid(), email, name, role, passwordHash: bcrypt.hashSync(password, 10), profile: { ...defaultProfile(), ...profile }, avatarUrl: profile.avatarUrl || '', createdAt: nowIso() });
    return users[users.length - 1];
  };
  const demo = mkUser('demo@gameplan.local', 'Demo User', 'Demo1234!', 'both', { bio: 'Exploring plans around town.', location: 'Fayetteville, AR' });
  const host = mkUser('host@gameplan.local', 'Luma Social Club', 'Host1234!', 'host', { bio: 'Hosting nightlife and community events.', location: 'Fayetteville, AR' });
  const eventId1 = nanoid();
  const eventId2 = nanoid();
  const events = [
    {
      id: eventId1, hostId: host.id, hostName: host.name, title: 'Rooftop Latin Night', category: 'Nightlife',
      description: 'Reggaeton, Latin pop, mocktails, food trucks, and city-view photo spots.',
      locationName: 'Luma Rooftop',
      address: 'Dickson Street, Fayetteville, AR', lat: 36.0664, lng: -94.1621, startsAt: start(5), endsAt: start(9), ageRestriction: '18+', visibility: 'public',
      capacity: 120, imageUrl: '/assets/gameplan-default.png', images: ['/assets/gameplan-default.png'], createdAt: nowIso(), attendees: [], photos: [], inviteCode: 'GP-ROOF', markerEmoji:'🪩', markerColor:'#ff4d6d', showTicketAvailability:true,
      ticketTiers: [
        { id: nanoid(), name: 'Standard', priceCents: 1200, capacity: 80, sold: 0, description: 'General admission' },
        { id: nanoid(), name: 'VIP', priceCents: 2500, capacity: 30, sold: 0, description: 'Priority entry + lounge' },
        { id: nanoid(), name: 'SuperVIP', priceCents: 4500, capacity: 10, sold: 0, description: 'Priority entry + lounge + reserved table' },
      ],
    },
    {
      id: eventId2, hostId: demo.id, hostName: demo.name, title: 'Indie Game Night', category: 'Gaming',
      description: 'Bring your laptop or controller. Indie games, casual bracket, and snacks.',
      locationName: 'Student Union Game Lounge',
      address: 'University of Arkansas, Fayetteville, AR', lat: 36.0687, lng: -94.1740, startsAt: start(27), endsAt: start(31), ageRestriction: 'All ages', visibility: 'friends_only',
      capacity: 24, imageUrl: '/assets/gameplan-default.png', images: ['/assets/gameplan-default.png'], createdAt: nowIso(), attendees: [], photos: [], inviteCode: 'GP-GAME', markerEmoji:'🎮', markerColor:'#7CFF4F', showTicketAvailability:true,
      ticketTiers: [{ id: nanoid(), name: 'Free RSVP', priceCents: 0, capacity: 24, sold: 0, description: 'Free reservation' }],
    }
  ];
  const posts = [
    { id: nanoid(), userId: host.id, authorName: host.name, text: 'Rooftop Latin Night is live on the map. VIP tiers are open.', visibility: 'public', eventId: eventId1, createdAt: nowIso(), reactions: [], comments: [], shares: [], type: 'event' },
    { id: nanoid(), userId: demo.id, authorName: demo.name, text: 'Looking for people to join Indie Game Night.', visibility: 'public', eventId: eventId2, createdAt: nowIso(), reactions: [], comments: [], shares: [], type: 'event' },
  ];
  return { users, sessions: [], events, tickets: [], savedEvents: [], activity: [], friendships: [], hostFollows: [], posts };
}

function normalizeDb(db) {
  db.friendships ||= [];
  db.activity ||= [];
  db.events ||= [];
  db.tickets ||= [];
  db.posts ||= [];
  db.savedEvents ||= [];
  db.hostFollows ||= [];
  db.users = (db.users || []).map((u) => ({ ...u, profile: { ...defaultProfile(), ...(u.profile || {}), avatarUrl: u.avatarUrl || u.profile?.avatarUrl || '', bannerUrl: u.profile?.bannerUrl || '' }, avatarUrl: u.avatarUrl || u.profile?.avatarUrl || '' }));
  db.events = db.events.map((e) => {
    const migrated = { ...e };
    return { ...migrated, locationName: migrated.locationName || '', images: Array.isArray(migrated.images) && migrated.images.length ? migrated.images : [migrated.imageUrl || '/assets/gameplan-default.png'], ticketTiers: migrated.ticketTiers || [], markerEmoji: migrated.markerEmoji || '', markerColor: migrated.markerColor || '#7CFF4F', showTicketAvailability: migrated.showTicketAvailability !== false };
  });
  db.posts = db.posts.map((p) => ({ ...p, reactions: p.reactions || [], comments: p.comments || [], shares: p.shares || [] }));
  return db;
}
async function readDb() {
  try { return normalizeDb(JSON.parse(await fs.readFile(DB_PATH, 'utf8'))); }
  catch { const db = seedDb(); await writeDb(db); return db; }
}
async function writeDb(db) { await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2)); }

const loginBuckets = new Map();
function rateLimit(key, max = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const bucket = loginBuckets.get(key) || [];
  const fresh = bucket.filter((t) => now - t < windowMs);
  fresh.push(now);
  loginBuckets.set(key, fresh);
  return fresh.length <= max;
}

async function getSession(req) {
  const token = req.signedCookies?.gp_session;
  if (!token) return null;
  const db = await readDb();
  const session = db.sessions.find((s) => s.token === token && new Date(s.expiresAt) > new Date());
  if (!session) return null;
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return { db, session, user };
}
function setSessionCookie(res, token) { res.cookie('gp_session', token, { httpOnly: true, signed: true, sameSite: 'lax', secure: IS_PROD, maxAge: 1000 * 60 * 60 * 24 * 7 }); }
function clearSessionCookie(res) { res.clearCookie('gp_session'); }
async function requireAuth(req, res, next) {
  const ctx = await getSession(req);
  if (!ctx) return res.status(401).json({ error: 'You need to log in first.' });
  req.ctx = ctx; next();
}
function requireCsrf(req, res, next) {
  const sent = req.get('x-csrf-token');
  if (!req.ctx?.session?.csrf || sent !== req.ctx.session.csrf) return res.status(403).json({ error: 'Security token expired. Refresh the page and try again.' });
  next();
}

const visibilityEnum = z.enum(['public', 'friends_only', 'private']);
const registerSchema = z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().email().max(120), password: z.string().min(8).max(120), role: z.enum(['guest', 'host', 'both']).default('both') });
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
const tierSchema = z.object({ name: z.string().trim().min(1).max(40), price: z.coerce.number().min(0).max(9999), capacity: z.coerce.number().int().min(1).max(100000), description: z.string().trim().max(120).optional().default('') });
const eventSchema = z.object({
  title: z.string().trim().min(3).max(80), category: z.string().trim().min(2).max(30), description: z.string().trim().min(10).max(1400),
  locationName: z.string().trim().max(80).optional().default(''), address: z.string().trim().min(3).max(160), lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180),
  startsAt: z.string().datetime(), endsAt: z.string().datetime().optional().or(z.literal('')), ageRestriction: z.enum(['All ages', '18+', '21+']).default('All ages'),
  visibility: z.enum(['public', 'friends_only', 'link_only', 'private']), markerEmoji: z.string().trim().max(4).optional().default(''), markerColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#7CFF4F'), showTicketAvailability: z.union([z.boolean(), z.string()]).optional().default(true), ticketTiers: z.array(tierSchema).min(1).max(8),
});
const profileSchema = z.object({
  name: z.string().trim().min(2).max(60), role: z.enum(['guest', 'host', 'both']), bio: z.string().trim().max(280).optional().default(''),
  location: z.string().trim().max(80).optional().default(''), website: z.string().trim().max(160).optional().default(''),
  profileVisibility: visibilityEnum.default('public'), activityVisibility: visibilityEnum.default('friends_only'), eventsVisibility: visibilityEnum.default('friends_only'), defaultPostVisibility: visibilityEnum.default('friends_only'), locatorColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).default('#00d8ff'), themePreference: z.enum(['dark', 'light']).default('dark'),
});
const postSchema = z.object({ text: z.string().trim().min(1).max(600), visibility: visibilityEnum.default('friends_only') });
const shareTicketSchema = z.object({ text: z.string().trim().min(1).max(600), visibility: visibilityEnum.default('friends_only'), reaction: z.string().trim().max(40).optional().default('') });
const eventUpdateSchema = z.object({ visibility: z.enum(['public', 'friends_only', 'link_only', 'private']).optional(), showTicketAvailability: z.union([z.boolean(), z.string()]).optional(), keepImages: z.array(z.string()).max(8).optional() });
function toBool(v, fallback = true) { if (typeof v === 'boolean') return v; if (typeof v === 'string') return ['true','on','1','yes'].includes(v.toLowerCase()); return fallback; }

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'GamePlan', version: '1.2.0' }));
app.get('/api/me', async (req, res) => { const ctx = await getSession(req); if (!ctx) return res.json({ user: null, csrf: null }); res.json({ user: publicUser(ctx.user), csrf: ctx.session.csrf }); });

app.post('/api/auth/register', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!rateLimit(`register:${ip}`, 5)) return res.status(429).json({ error: 'Too many registration attempts. Try again later.' });
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = await readDb();
  const email = parsed.data.email.toLowerCase();
  if (db.users.some((u) => u.email.toLowerCase() === email)) return res.status(409).json({ error: 'That email already has an account.' });
  const user = { id: nanoid(), ...parsed.data, email, passwordHash: await bcrypt.hash(parsed.data.password, 12), profile: defaultProfile(), avatarUrl: '', createdAt: nowIso() };
  delete user.password;
  const token = nanoid(48);
  const session = { token, userId: user.id, csrf: nanoid(32), createdAt: nowIso(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  db.users.push(user); db.sessions.push(session); db.posts.push({ id:nanoid(), userId:user.id, authorName:user.name, text:'Joined GamePlan.', visibility:'public', createdAt:nowIso(), reactions:[], comments:[], shares:[], type:'profile' }); await writeDb(db); setSessionCookie(res, token);
  res.status(201).json({ user: publicUser(user), csrf: session.csrf });
});
app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (!rateLimit(`login:${ip}`, 12)) return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const db = await readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = nanoid(48);
  const session = { token, userId: user.id, csrf: nanoid(32), createdAt: nowIso(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  db.sessions.push(session); await writeDb(db); setSessionCookie(res, token);
  res.json({ user: publicUser(user), csrf: session.csrf });
});
app.post('/api/auth/logout', requireAuth, requireCsrf, async (req, res) => { const { db, session } = req.ctx; db.sessions = db.sessions.filter((s) => s.token !== session.token); await writeDb(db); clearSessionCookie(res); res.json({ ok: true }); });

function areFriends(db, a, b) { return !!(a && b && a !== b && db.friendships?.some((f) => f.status === 'accepted' && ((f.requesterId === a && f.receiverId === b) || (f.requesterId === b && f.receiverId === a)))); }
function visibilityAllowed(ownerId, visibility, viewer, db) { if (viewer?.id === ownerId) return true; if (visibility === 'public') return true; if (!viewer) return false; if (visibility === 'friends_only') return areFriends(db, viewer.id, ownerId); return false; }
function visibleToUser(event, user, db = { friendships: [] }) { if (event.visibility === 'public') return true; if (!user) return false; if (event.hostId === user.id) return true; if (event.visibility === 'friends_only') return areFriends(db, user.id, event.hostId); return false; }
function canSeePost(post, viewer, db) { return visibilityAllowed(post.userId, post.visibility || 'friends_only', viewer, db); }
function serializePost(db, post, viewer) {
  const author = db.users.find((u) => u.id === post.userId);
  const event = post.eventId ? db.events.find((e) => e.id === post.eventId) : null;
  const original = post.originalPostId ? db.posts.find((p) => p.id === post.originalPostId) : null;
  return {
    ...post,
    authorName: author?.name || post.authorName || 'GamePlan User',
    author: author ? publicUser(author) : null,
    reactedByMe: !!viewer && (post.reactions || []).includes(viewer.id),
    reactionCount: (post.reactions || []).length,
    shareCount: (post.shares || []).length,
    comments: (post.comments || []).map((c) => ({ ...c, authorName: db.users.find((u) => u.id === c.userId)?.name || c.authorName || 'User' })),
    event: event ? { id:event.id, title:event.title, category:event.category, startsAt:event.startsAt, imageUrl:event.imageUrl, images:event.images } : null,
    original: original ? { id:original.id, authorName: db.users.find((u) => u.id === original.userId)?.name || original.authorName || 'User', text: original.text } : null,
  };
}

app.get('/api/events', async (req, res) => {
  const ctx = await getSession(req);
  const db = ctx?.db || await readDb();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusMiles = Math.min(Math.max(Number(req.query.radius || 25), 1), 250);
  let events = db.events.filter((e) => visibleToUser(e, ctx?.user, db));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    events = events.map((e) => ({ ...e, distanceMiles: Number(distanceMiles(lat, lng, e.lat, e.lng).toFixed(1)) })).filter((e) => e.distanceMiles <= radiusMiles);
  }
  events.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  res.json({ events, radiusMiles });
});
app.get('/api/events/:id', async (req, res) => {
  const ctx = await getSession(req);
  const db = ctx?.db || await readDb();
  const event = db.events.find((e) => e.id === req.params.id || e.inviteCode === req.params.id);
  const viaInvite = event?.inviteCode === req.params.id;
  if (!event || (!viaInvite && !visibleToUser(event, ctx?.user, db))) return res.status(404).json({ error: 'Event not found or not visible.' });
  res.json({ event });
});
app.post('/api/events', requireAuth, requireCsrf, upload.array('images', 8), async (req, res) => {
  let ticketTiers;
  try { ticketTiers = JSON.parse(req.body.ticketTiers || '[]'); }
  catch { return res.status(400).json({ error: 'Ticket tiers are invalid.' }); }
  const parsed = eventSchema.safeParse({ ...req.body, ticketTiers });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (new Date(parsed.data.startsAt) < new Date(Date.now() - 60000)) return res.status(400).json({ error: 'Event start time must be in the future.' });
  const { db, user } = req.ctx;
  const tiers = parsed.data.ticketTiers.map((tier) => ({ id: nanoid(), name: tier.name, priceCents: cents(tier.price), capacity: tier.capacity, sold: 0, description: tier.description || '' }));
  const capacity = tiers.reduce((sum, t) => sum + t.capacity, 0);
  const imageUrls = Array.isArray(req.files) && req.files.length ? req.files.map((file) => `/uploads/${file.filename}`) : ['/assets/gameplan-default.png'];
  const showTicketAvailability = toBool(parsed.data.showTicketAvailability, true);
  const event = { id: nanoid(), hostId: user.id, hostName: user.name, ...parsed.data, showTicketAvailability, markerEmoji: parsed.data.markerEmoji || '', markerColor: parsed.data.markerColor || '#7CFF4F', endsAt: parsed.data.endsAt || null, ticketTiers: tiers, capacity, imageUrl: imageUrls[0], images: imageUrls, attendees: [], photos: [], inviteCode: `GP-${nanoid(6).toUpperCase()}`, createdAt: nowIso() };
  db.events.push(event);
  db.posts.push({ id:nanoid(), userId:user.id, authorName:user.name, text:`Created a new event: ${event.title}.`, visibility: user.profile?.activityVisibility || 'friends_only', eventId:event.id, createdAt:nowIso(), reactions:[], comments:[], shares:[], type:'event_create' });
  await writeDb(db); res.status(201).json({ event });
});
function ticketForHostView(db, ticket) {
  const attendee = db.users.find((u) => u.id === ticket.userId);
  return { ...ticket, user: attendee ? publicUser(attendee) : null };
}
app.get('/api/host/events', requireAuth, async (req, res) => {
  const { db, user } = req.ctx;
  const events = db.events
    .filter((e) => e.hostId === user.id)
    .map((e) => ({ ...e, tickets: db.tickets.filter((t) => t.eventId === e.id).map((t) => ticketForHostView(db, t)) }));
  res.json({ events });
});
app.get('/api/events/:id/checkins', requireAuth, async (req, res) => {
  const { db, user } = req.ctx;
  const event = db.events.find((e) => e.id === req.params.id && e.hostId === user.id);
  if (!event) return res.status(404).json({ error: 'Hosted event not found.' });
  const tickets = db.tickets
    .filter((t) => t.eventId === event.id && t.status !== 'cancelled')
    .sort((a, b) => new Date(a.purchasedAt || 0) - new Date(b.purchasedAt || 0))
    .map((t) => ticketForHostView(db, t));
  res.json({ event, tickets, summary: { total: tickets.length, checkedIn: tickets.filter((t) => t.status === 'used').length, pending: tickets.filter((t) => t.status !== 'used').length } });
});
app.patch('/api/events/:id', requireAuth, requireCsrf, upload.array('images', 8), async (req, res) => {
  const { db, user } = req.ctx;
  const event = db.events.find((e) => e.id === req.params.id && e.hostId === user.id);
  if (!event) return res.status(404).json({ error: 'Hosted event not found.' });
  let keepImages = event.images || [event.imageUrl || '/assets/gameplan-default.png'];
  if (req.body.keepImages) { try { keepImages = JSON.parse(req.body.keepImages); } catch { return res.status(400).json({ error: 'Image order is invalid.' }); } }
  const parsed = eventUpdateSchema.safeParse({ ...req.body, keepImages });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const currentImages = event.images || [event.imageUrl || '/assets/gameplan-default.png'];
  keepImages = (parsed.data.keepImages || currentImages).filter((img) => currentImages.includes(img)).slice(0, 8);
  const uploaded = Array.isArray(req.files) ? req.files.map((file) => `/uploads/${file.filename}`) : [];
  const finalImages = [...keepImages, ...uploaded].slice(0, 8);
  event.images = finalImages.length ? finalImages : ['/assets/gameplan-default.png'];
  event.imageUrl = event.images[0];
  if (parsed.data.visibility) event.visibility = parsed.data.visibility;
  if (parsed.data.showTicketAvailability !== undefined) event.showTicketAvailability = toBool(parsed.data.showTicketAvailability, true);
  await writeDb(db);
  res.json({ event });
});
app.post('/api/events/:id/purchase', requireAuth, requireCsrf, async (req, res) => {
  const { db, user } = req.ctx;
  const event = db.events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (!visibleToUser(event, user, db) && !['link_only','private'].includes(event.visibility)) return res.status(404).json({ error: 'Event not found.' });
  const tier = event.ticketTiers.find((t) => t.id === req.body.tierId);
  if (!tier) return res.status(400).json({ error: 'Select a valid ticket tier.' });
  if (tier.sold >= tier.capacity) return res.status(409).json({ error: `${tier.name} is sold out.` });
  const already = db.tickets.find((t) => t.eventId === event.id && t.userId === user.id && t.status !== 'cancelled');
  if (already) return res.status(409).json({ error: 'You already have a ticket for this event.' });
  tier.sold += 1; event.attendees = Array.from(new Set([...(event.attendees || []), user.id]));
  const ticket = { id: nanoid(), eventId: event.id, userId: user.id, tierId: tier.id, tierName: tier.name, priceCents: tier.priceCents, code: `${event.inviteCode}-${nanoid(6).toUpperCase()}`, status: 'active', purchasedAt: nowIso(), checkedInAt: null };
  db.tickets.push(ticket);
  await writeDb(db); res.status(201).json({ ticket, event });
});
app.get('/api/tickets', requireAuth, async (req, res) => { const { db, user } = req.ctx; const tickets = db.tickets.filter((t) => t.userId === user.id).map((t) => ({ ...t, event: db.events.find((e) => e.id === t.eventId) })).filter((t) => t.event); tickets.sort((a, b) => new Date(a.event.startsAt) - new Date(b.event.startsAt)); res.json({ tickets }); });
app.get('/api/saved-events', requireAuth, async (req, res) => {
  const { db, user } = req.ctx;
  const rows = (db.savedEvents || []).filter((s) => s.userId === user.id);
  const events = rows.map((s) => {
    const event = db.events.find((e) => e.id === s.eventId);
    return event && visibleToUser(event, user, db) ? { ...event, savedAt: s.createdAt } : null;
  }).filter(Boolean).sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  res.json({ events });
});
app.post('/api/events/:id/save', requireAuth, requireCsrf, async (req, res) => {
  const { db, user } = req.ctx;
  const event = db.events.find((e) => e.id === req.params.id);
  if (!event || !visibleToUser(event, user, db)) return res.status(404).json({ error: 'Event not found or not visible.' });
  db.savedEvents ||= [];
  db.hostFollows ||= [];
  const idx = db.savedEvents.findIndex((s) => s.userId === user.id && s.eventId === event.id);
  let saved = false;
  if (idx >= 0) db.savedEvents.splice(idx, 1);
  else { db.savedEvents.push({ id:nanoid(), userId:user.id, eventId:event.id, createdAt:nowIso() }); saved = true; }
  await writeDb(db);
  res.json({ saved, event });
});
app.post('/api/tickets/:id/share', requireAuth, requireCsrf, async (req, res) => {
  const parsed = shareTicketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { db, user } = req.ctx;
  const ticket = db.tickets.find((t) => t.id === req.params.id && t.userId === user.id && t.status !== 'cancelled');
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const event = db.events.find((e) => e.id === ticket.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const reaction = parsed.data.reaction ? `${parsed.data.reaction} ` : '';
  const post = { id:nanoid(), userId:user.id, authorName:user.name, text:`${reaction}${parsed.data.text}`, visibility:parsed.data.visibility, eventId:event.id, ticketId:ticket.id, createdAt:nowIso(), reactions:[], comments:[], shares:[], type:'ticket_share' };
  db.posts.push(post); await writeDb(db); res.status(201).json({ post: serializePost(db, post, user) });
});
function checkInTicketForHost(db, user, ticket) {
  if (!ticket) return { status: 404, error: 'Ticket not found.' };
  const event = db.events.find((e) => e.id === ticket.eventId);
  if (!event || event.hostId !== user.id) return { status: 403, error: 'Only the host can check in this ticket.' };
  if (ticket.status === 'used') return { status: 409, error: 'Ticket was already checked in.' };
  ticket.status = 'used';
  ticket.checkedInAt = nowIso();
  event.attendees = Array.from(new Set([...(event.attendees || []), ticket.userId]));
  return { ticket, event };
}
app.post('/api/tickets/:id/check-in', requireAuth, requireCsrf, async (req, res) => {
  const { db, user } = req.ctx;
  const ticket = db.tickets.find((t) => t.id === req.params.id);
  const result = checkInTicketForHost(db, user, ticket);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  await writeDb(db);
  res.json({ ticket: ticketForHostView(db, result.ticket), event: result.event });
});
app.post('/api/tickets/check-in', requireAuth, requireCsrf, async (req, res) => {
  const code = normalizeTicketCode(req.body.code);
  if (!code) return res.status(400).json({ error: 'Ticket code is required.' });
  const { db, user } = req.ctx;
  const ticket = db.tickets.find((t) => normalizeTicketCode(t.code) === code);
  const result = checkInTicketForHost(db, user, ticket);
  if (result.error) return res.status(result.status || 400).json({ error: result.error === 'Ticket not found.' ? 'Ticket not found. Check the code and try again.' : result.error });
  await writeDb(db);
  res.json({ ticket: ticketForHostView(db, result.ticket), event: result.event });
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase(); if (q.length < 2) return res.json({ users: [] });
  const { db, user } = req.ctx;
  const users = db.users.filter((u) => u.id !== user.id).filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).slice(0, 12).map((u) => {
    const friendship = db.friendships.find((f) => (f.requesterId === user.id && f.receiverId === u.id) || (f.requesterId === u.id && f.receiverId === user.id));
    return { ...publicUser(u), friendshipStatus: friendship?.status || null, requestedByMe: friendship?.requesterId === user.id };
  });
  res.json({ users });
});
app.get('/api/friends', requireAuth, async (req, res) => {
  const { db, user } = req.ctx;
  const friendships = db.friendships.filter((f) => f.requesterId === user.id || f.receiverId === user.id);
  const accepted = friendships.filter((f) => f.status === 'accepted').map((f) => {
    const otherId = f.requesterId === user.id ? f.receiverId : f.requesterId; const other = db.users.find((u) => u.id === otherId);
    return other ? { ...publicUser(other), friendshipId: f.id } : null;
  }).filter(Boolean);
  const incoming = friendships.filter((f) => f.status === 'pending' && f.receiverId === user.id).map((f) => { const other = db.users.find((u) => u.id === f.requesterId); return other ? { ...publicUser(other), friendshipId: f.id } : null; }).filter(Boolean);
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.requesterId === user.id).map((f) => { const other = db.users.find((u) => u.id === f.receiverId); return other ? { ...publicUser(other), friendshipId: f.id } : null; }).filter(Boolean);
  const friendIds = accepted.map((u) => u.id);
  const friendActivity = db.events.filter((e) => e.attendees?.some((id) => friendIds.includes(id)) || friendIds.includes(e.hostId)).map((e) => ({ eventId: e.id, title: e.title, startsAt: e.startsAt, imageUrl: e.imageUrl, images: e.images || [e.imageUrl], category: e.category })).slice(0, 12);
  res.json({ users: accepted, incoming, outgoing, friendActivity });
});
app.post('/api/friends/request', requireAuth, requireCsrf, async (req, res) => {
  const { db, user } = req.ctx; const targetUserId = String(req.body.targetUserId || '');
  if (!targetUserId || targetUserId === user.id) return res.status(400).json({ error: 'Select a valid user.' });
  const target = db.users.find((u) => u.id === targetUserId); if (!target) return res.status(404).json({ error: 'User not found.' });
  let friendship = db.friendships.find((f) => (f.requesterId === user.id && f.receiverId === targetUserId) || (f.requesterId === targetUserId && f.receiverId === user.id));
  if (friendship) { if (friendship.status === 'pending' && friendship.receiverId === user.id) friendship.status = 'accepted'; await writeDb(db); return res.json({ friendship }); }
  friendship = { id: nanoid(), requesterId: user.id, receiverId: targetUserId, status: 'pending', createdAt: nowIso() }; db.friendships.push(friendship); await writeDb(db); res.status(201).json({ friendship });
});
app.post('/api/friends/:id/respond', requireAuth, requireCsrf, async (req, res) => {
  const { db, user } = req.ctx; const friendship = db.friendships.find((f) => f.id === req.params.id && f.receiverId === user.id); if (!friendship) return res.status(404).json({ error: 'Friend request not found.' });
  const action = String(req.body.action || 'accept'); if (action === 'reject') db.friendships = db.friendships.filter((f) => f.id !== friendship.id); else friendship.status = 'accepted'; await writeDb(db); res.json({ ok: true });
});

app.get('/api/profile', requireAuth, async (req, res) => res.json({ user: publicUser(req.ctx.user) }));
app.put('/api/profile', requireAuth, requireCsrf, profileUpload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
  const parsed = profileSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { db, user } = req.ctx; user.name = parsed.data.name; user.role = parsed.data.role;
  user.profile = { ...defaultProfile(), ...(user.profile || {}), bio: parsed.data.bio, location: parsed.data.location, website: parsed.data.website, profileVisibility: parsed.data.profileVisibility, activityVisibility: parsed.data.activityVisibility, eventsVisibility: parsed.data.eventsVisibility, defaultPostVisibility: parsed.data.defaultPostVisibility, locatorColor: parsed.data.locatorColor || '#00d8ff', themePreference: parsed.data.themePreference || 'dark' };
  const avatarFile = req.files?.avatar?.[0];
  const bannerFile = req.files?.banner?.[0];
  if (avatarFile) { user.avatarUrl = `/uploads/${avatarFile.filename}`; user.profile.avatarUrl = user.avatarUrl; }
  if (bannerFile) { user.profile.bannerUrl = `/uploads/${bannerFile.filename}`; }
  db.events.forEach((e) => { if (e.hostId === user.id) e.hostName = user.name; });
  db.posts.forEach((p) => { if (p.userId === user.id) p.authorName = user.name; });
  await writeDb(db); res.json({ user: publicUser(user) });
});
app.get('/api/users/:id/profile', requireAuth, async (req, res) => {
  const { db, user } = req.ctx; const target = db.users.find((u) => u.id === req.params.id); if (!target) return res.status(404).json({ error: 'User not found.' });
  if (!visibilityAllowed(target.id, target.profile?.profileVisibility || 'public', user, db)) return res.status(403).json({ error: 'This profile is private.' });
  const posts = db.posts.filter((p) => p.userId === target.id).filter((p) => canSeePost(p, user, db)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,20).map((p) => serializePost(db,p,user));
  const hostedEvents = db.events.filter((e) => e.hostId === target.id).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt)).map((e) => ({ id:e.id, title:e.title, category:e.category, startsAt:e.startsAt, imageUrl:e.imageUrl, images:e.images, markerColor:e.markerColor, attendees:e.attendees || [], ticketTiers:e.ticketTiers || [], locationName:e.locationName || '', address:e.address }));
  const followerCount = (db.hostFollows || []).filter((f) => f.hostId === target.id).length;
  const followingHost = (db.hostFollows || []).some((f) => f.userId === user.id && f.hostId === target.id);
  const ticketsReserved = db.tickets.filter((t) => hostedEvents.some((e) => e.id === t.eventId)).length;
  const friendship = db.friendships.find((f) => (f.requesterId === user.id && f.receiverId === target.id) || (f.requesterId === target.id && f.receiverId === user.id));
  const friendshipStatus = friendship?.status || null;
  const requestedByMe = friendship?.requesterId === user.id;
  const mutualFriendCount = db.friendships.filter((f) => f.status === 'accepted' && (f.requesterId === target.id || f.receiverId === target.id)).length;
  res.json({ user: publicUser(target), posts, friendship: { status: friendshipStatus, requestedByMe, friendshipId: friendship?.id || null }, mutualFriendCount, hostProfile: { hostedEvents, followerCount, followingHost, ticketsReserved, rating: hostedEvents.length ? 4.8 : 4.7 } });
});

app.get('/api/host-follows', requireAuth, async (req, res) => {
  const { db, user } = req.ctx;
  const follows = (db.hostFollows || []).filter((f) => f.userId === user.id).map((f) => {
    const host = db.users.find((u) => u.id === f.hostId);
    if (!host) return null;
    return { ...publicUser(host), followedAt: f.createdAt };
  }).filter(Boolean);
  res.json({ hosts: follows });
});

app.post('/api/hosts/:id/follow', requireAuth, requireCsrf, async (req, res) => {
  const { db, user } = req.ctx;
  const hostId = req.params.id;
  if (hostId === user.id) return res.status(400).json({ error: 'You cannot follow yourself as a host.' });
  const host = db.users.find((u) => u.id === hostId);
  if (!host) return res.status(404).json({ error: 'Host not found.' });
  db.hostFollows ||= [];
  const idx = db.hostFollows.findIndex((f) => f.userId === user.id && f.hostId === hostId);
  let following = false;
  if (idx >= 0) db.hostFollows.splice(idx, 1);
  else { db.hostFollows.push({ id:nanoid(), userId:user.id, hostId, createdAt:nowIso() }); following = true; }
  await writeDb(db);
  res.json({ following, followerCount: db.hostFollows.filter((f) => f.hostId === hostId).length, host: publicUser(host) });
});

app.get('/api/feed', requireAuth, async (req, res) => {
  const { db, user } = req.ctx;
  const mode = String(req.query.mode || 'friends');
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusMiles = Math.min(Math.max(Number(req.query.radius || 25), 1), 250);
  const friendIds = db.friendships.filter((f) => f.status === 'accepted' && (f.requesterId === user.id || f.receiverId === user.id)).map((f) => f.requesterId === user.id ? f.receiverId : f.requesterId);
  const myCategories = new Set();
  db.tickets.filter((t) => t.userId === user.id).forEach((t) => { const e = db.events.find((ev) => ev.id === t.eventId); if (e?.category) myCategories.add(e.category); });
  db.events.filter((e) => e.hostId === user.id).forEach((e) => myCategories.add(e.category));
  let posts = db.posts.filter((p) => canSeePost(p, user, db));
  if (mode === 'friends') posts = posts.filter((p) => friendIds.includes(p.userId));
  if (mode === 'forYou' && myCategories.size) posts = posts.filter((p) => { const e = p.eventId ? db.events.find((ev) => ev.id === p.eventId) : null; return e && myCategories.has(e.category); });
  if (mode === 'nearMe' && Number.isFinite(lat) && Number.isFinite(lng)) posts = posts.filter((p) => { const e = p.eventId ? db.events.find((ev) => ev.id === p.eventId) : null; return e && distanceMiles(lat, lng, e.lat, e.lng) <= radiusMiles; });
  posts = posts.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,60).map((p) => serializePost(db,p,user));
  res.json({ posts, mode });
});
app.post('/api/feed', requireAuth, requireCsrf, async (req, res) => {
  const parsed = postSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { db, user } = req.ctx; const post = { id:nanoid(), userId:user.id, authorName:user.name, text:parsed.data.text, visibility:parsed.data.visibility, createdAt:nowIso(), reactions:[], comments:[], shares:[], type:'status' };
  db.posts.push(post); await writeDb(db); res.status(201).json({ post: serializePost(db,post,user) });
});
app.post('/api/feed/:id/react', requireAuth, requireCsrf, async (req, res) => {
  const { db, user } = req.ctx; const post = db.posts.find((p) => p.id === req.params.id); if (!post || !canSeePost(post, user, db)) return res.status(404).json({ error: 'Post not found.' });
  post.reactions ||= []; post.reactions = post.reactions.includes(user.id) ? post.reactions.filter((id) => id !== user.id) : [...post.reactions, user.id]; await writeDb(db); res.json({ post: serializePost(db,post,user) });
});
app.post('/api/feed/:id/comment', requireAuth, requireCsrf, async (req, res) => {
  const text = String(req.body.text || '').trim(); if (!text || text.length > 280) return res.status(400).json({ error: 'Comment must be between 1 and 280 characters.' });
  const { db, user } = req.ctx; const post = db.posts.find((p) => p.id === req.params.id); if (!post || !canSeePost(post, user, db)) return res.status(404).json({ error: 'Post not found.' });
  post.comments ||= []; post.comments.push({ id:nanoid(), userId:user.id, authorName:user.name, text, createdAt:nowIso() }); await writeDb(db); res.status(201).json({ post: serializePost(db,post,user) });
});
app.post('/api/feed/:id/share', requireAuth, requireCsrf, async (req, res) => {
  const { db, user } = req.ctx; const original = db.posts.find((p) => p.id === req.params.id); if (!original || !canSeePost(original, user, db)) return res.status(404).json({ error: 'Post not found.' });
  const visibility = visibilityEnum.safeParse(req.body.visibility).success ? req.body.visibility : (user.profile?.defaultPostVisibility || 'friends_only');
  const post = { id:nanoid(), userId:user.id, authorName:user.name, text:`Shared a post from ${db.users.find((u)=>u.id===original.userId)?.name || original.authorName || 'a friend'}.`, visibility, originalPostId:original.id, eventId:original.eventId || null, createdAt:nowIso(), reactions:[], comments:[], shares:[], type:'share' };
  original.shares ||= []; original.shares.push({ id:post.id, userId:user.id, createdAt:nowIso() }); db.posts.push(post); await writeDb(db); res.status(201).json({ post: serializePost(db,post,user) });
});


app.get('/api/directions', requireAuth, async (req, res) => {
  const startLat = Number(req.query.startLat);
  const startLng = Number(req.query.startLng);
  const endLat = Number(req.query.endLat);
  const endLng = Number(req.query.endLng);
  const profile = String(req.query.profile || 'driving-car').replace(/[^a-z-]/gi, '') || 'driving-car';
  if (![startLat, startLng, endLat, endLng].every(Number.isFinite)) return res.status(400).json({ error: 'Valid start and end coordinates are required.' });
  const fallbackMiles = Number(distanceMiles(startLat, startLng, endLat, endLng).toFixed(2));
  const fallback = { coordinates:[[startLng, startLat], [endLng, endLat]], distanceMiles:fallbackMiles, durationSeconds:(fallbackMiles / 25) * 3600, provider:'straight-line fallback' };
  if (!ORS_API_KEY) return res.json({ route:fallback, fallback:true });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const orsRes = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
      method:'POST', signal:controller.signal,
      headers:{ 'Authorization': ORS_API_KEY, 'Content-Type':'application/json', 'Accept':'application/json, application/geo+json' },
      body:JSON.stringify({ coordinates:[[startLng, startLat], [endLng, endLat]] }),
    });
    clearTimeout(timer);
    if (!orsRes.ok) return res.json({ route:fallback, fallback:true, providerError:'Routing provider unavailable.' });
    const geo = await orsRes.json();
    const coords = geo?.features?.[0]?.geometry?.coordinates;
    const props = geo?.features?.[0]?.properties || {};
    const summary = props.summary || {};
    if (!Array.isArray(coords) || coords.length < 2) return res.json({ route:fallback, fallback:true });
    res.json({ route:{ coordinates:coords, distanceMiles:Number((Number(summary.distance || 0) / 1609.344).toFixed(2)) || fallbackMiles, durationSeconds:Number(summary.duration || 0) || fallback.durationSeconds, provider:'OpenRouteService' } });
  } catch (_) {
    res.json({ route:fallback, fallback:true, providerError:'Routing provider failed.' });
  }
});

app.use((_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.use((err, _req, res, _next) => res.status(400).json({ error: err.message || 'Request failed.' }));
app.listen(PORT, () => console.log(`GamePlan running at http://localhost:${PORT}`));
