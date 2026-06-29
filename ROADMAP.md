# GamePlan Roadmap

## Current status

GamePlan is a portfolio/demo MVP with a complete map-first discovery flow, host event tools, ticket tiers, social activity, user profiles, Dark Mode, Light Mode, and mobile-responsive layouts.

## Completed

- Full-stack Express backend
- Account registration and login
- Session cookies, password hashing, CSRF protection, and basic rate limiting
- MapLibre event discovery map
- Radius, city/ZIP, price, time, category, and sort filters
- Custom holographic map markers
- Floating event previews
- Event profile panels
- Host event creation and editing
- Optional location names for venues and places
- Multi-image upload and ordering
- Ticket tiers and reservations
- Ticket wallet and countdowns
- Host check-in tools
- Friend search and friend requests
- Social feed with posts, reactions, comments, and shares
- Public profile and host follow flows
- Dark and Light appearance modes
- Mobile map-first shell
- Smoke test coverage for core workflows

## Recommended production upgrades

- Replace local JSON storage with PostgreSQL and PostGIS
- Add Prisma or another migration system
- Move uploads to object storage
- Add Stripe Checkout and webhook verification
- Add QR code tickets
- Add email verification and password reset
- Add report/moderation tools for events, images, and posts
- Add production logging, monitoring, and backups
- Add Playwright end-to-end tests
- Add admin dashboard and operational tools
- Deploy behind HTTPS with a production session store
