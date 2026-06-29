# Security Notes

GamePlan includes portfolio-level security controls suitable for a local demo and technical review.

## Included controls

- Passwords are hashed with bcrypt.
- Sessions use signed HTTP-only cookies.
- CSRF tokens are required for authenticated write actions.
- Login and registration routes use basic rate limiting.
- Server-side validation is handled with Zod.
- File uploads are limited by MIME type and size.
- Users cannot buy tickets for events they cannot see.
- Hosts can only check in tickets for their own events.
- Profile, post, event, and activity visibility are enforced server-side.
- Friend-only event visibility uses accepted friendship records.
- Private and link-only events are filtered by access rules.

## Not production-final

Before a real launch, replace the local JSON database with a production database, move uploads to object storage, rotate secrets, add HTTPS, add email verification, add password reset, add audit logs, use production session storage, verify payment webhooks, moderate images and content, and implement backups and monitoring.
