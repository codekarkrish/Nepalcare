# NepalCare API

Express + MongoDB/Mongoose REST API.

## Setup
`cp .env.example .env` (Windows PowerShell: `Copy-Item .env.example .env`), fill `MONGO_URI` and `JWT_SECRET`, then `npm install` and `npm run dev`.

The API exits with a clear message if `MONGO_URI` or `JWT_SECRET` is missing. `GET /api/health` is available after startup.

## Admin bootstrap
Create a normal account first. Then run `npm run admin:create -- --email admin@example.com`. The script prompts for the existing account's password before promoting it. Do not expose this CLI or use weak credentials in production.

## Security notes
Payment success is not accepted from browser input. Provider checkout and server-side verification adapters are intentionally not enabled until provider credentials and signature/lookup logic are configured. R2 env placeholders are supplied, but no upload route is enabled in this MVP.
