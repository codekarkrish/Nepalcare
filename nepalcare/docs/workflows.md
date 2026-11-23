# Workflows and configuration

## NGO verification
1. Register with account type NGO.
2. `POST /api/ngos` to submit organization details.
3. Admin reviews `GET /api/ngos/admin/pending`.
4. Admin uses `PATCH /api/ngos/admin/:id/review` to verify, reject, suspend, or request resubmission.
5. Only verified NGOs can create and submit campaigns.

## Campaign approval
1. Verified NGO creates a campaign (DRAFT).
2. NGO edits as needed and submits (`POST /api/campaigns/:id/submit`).
3. Admin reviews pending campaigns and approves/rejects/requests resubmission.
4. Approval publishes the campaign for public browsing.

## Donation integrity
The current API creates a donation intent and explicitly does not process payment. To enable real payments, implement provider-specific initiation and server-to-server verification; validate amount, currency, campaign, provider reference and signature; make webhook/callback processing idempotent; only then set SUCCESS and update campaign totals atomically. Test with official sandbox credentials.

## File storage
R2 environment placeholders are included, but file upload/signing endpoints are not implemented. Before adding them, restrict MIME/size, randomize keys, store metadata only, keep private objects private, authorize access, and use short-lived signed URLs.

## MongoDB Atlas
1. Create a database and least-privilege database user.
2. Add the backend host/network to Atlas IP access list (avoid broad access in production).
3. Copy the driver connection string into `backend/.env` as `MONGO_URI`.
4. Keep the password URL-encoded if it contains special characters.

## Cloudflare R2
Create a bucket and scoped API token, then fill R2 account ID, access key, secret, bucket and optional public base URL in backend `.env`. No R2 endpoint is active until the storage adapter and protected upload routes are implemented.

## Khalti/eSewa
Create merchant/sandbox credentials through each provider's official merchant portal. Store secrets in backend `.env` only. Provider checkout and verification are not enabled in this baseline; do not advertise payments as live until they are implemented and verified.

## Vercel
Import the repository and set the project root to `frontend`. Add `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`. Build command `npm run build`, output directory `dist`.

## Render
Create a Web Service with root directory `backend`, build command `npm install`, start command `npm start`. Set `NODE_ENV=production`, `PORT` if required, `CLIENT_URL` to the deployed frontend origin, `MONGO_URI`, `JWT_SECRET` (32+ random characters), and `JWT_EXPIRES_IN=7d`.

## Smoke test
- Health endpoint responds.
- Register citizen/NGO; login; inspect `/auth/me`.
- Check unauthenticated protected requests return 401 and wrong roles return 403.
- Submit NGO profile, verify it as admin, create/submit campaign, approve it.
- Apply to campaign as Citizen; verify duplicate application is rejected.
- Create a donation intent and confirm it remains INITIATED without provider verification.
