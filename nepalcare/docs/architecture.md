# Architecture

NepalCare is a modular monolith: one Express API and one React/Vite application, with a MongoDB database. Frontend and backend dependencies/configuration remain separate.

## Request flow
Browser → React Router page → Axios API client → Express route → authentication/role middleware → controller → Mongoose model → MongoDB.

## Security boundaries
- The backend derives role from the stored user account; public registration only creates CITIZEN or NGO accounts.
- Protected APIs use `Authorization: Bearer <JWT>`.
- NGO ownership is checked before campaign, activity, and expense mutations.
- Payment intents are stored as INITIATED only; no client-side callback can mark a donation SUCCESS.
- Sensitive configuration belongs only in backend `.env`.
- Uploaded-file routes are not enabled in this baseline; add server-side MIME, size, authorization, and signed-URL controls before enabling storage.

## Deploy
Deploy `frontend/` to Vercel and `backend/` to Render independently. Configure exact frontend origin in `CLIENT_URL` and API URL via `VITE_API_URL`.
