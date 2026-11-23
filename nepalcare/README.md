# NepalCare

NepalCare is a modular-monolith starter for a government-supervised NGO donation and relief-management platform. The frontend and backend are separate applications.

## Requirements
- Node.js 20+ and npm
- MongoDB Atlas database (or local MongoDB)
- Optional Cloudflare R2, Khalti, and eSewa credentials for production integrations

## Run locally
1. Extract `nepalcare.zip` and open the `nepalcare` folder in VS Code.
2. Create `backend/.env` from `backend/.env.example`. Set `MONGO_URI` and a long random `JWT_SECRET`.
3. Create `frontend/.env` from `frontend/.env.example`.
4. In two VS Code terminals:
   - `cd backend && npm install && npm run dev`
   - `cd frontend && npm install && npm run dev`
5. Open http://localhost:5173. API health: http://localhost:5000/api/health.

Optional root launcher: run `npm install` at the repository root, then `npm run dev`.

## Initial administrator
For safety, public registration cannot create an administrator. After the first backend start, create a normal account, then use the one-time CLI bootstrap:
`cd backend && npm run admin:create -- --email admin@example.com`
The command prompts for a password and promotes the matching existing account to ADMIN. Keep `.env` and the administrator credentials private. Restrict access to this command and production database.

## Included core
- Citizen and NGO registration/login, JWT authentication, role middleware, current-user endpoint, profile endpoint
- NGO profile submission and admin verification/rejection
- Campaign creation/submission, admin approval, public campaign listing/detail
- Volunteer applications and NGO application review
- Donation record creation/history (records are not proof of payment)
- Activity and expense record APIs, admin overview, audit records for selected admin actions
- Responsive React interface with public campaign browse, auth forms, and role dashboards
- Environment examples, API/database/workflow docs, Vercel/Render instructions

## Important limitations
This is a runnable MVP foundation, not a production-certified or fully audited payment platform. Payment-provider checkout and server-to-server verification, email delivery, and Cloudflare R2 upload/signing require provider credentials and additional provider-specific configuration. The API deliberately does not mark donations successful merely because a client says payment succeeded. File upload UI/provider integration is not enabled in this baseline. Review `docs/api.md` and `docs/workflows.md` before extending.

## Deployment
- Frontend: deploy `frontend/` to Vercel; set `VITE_API_URL` to the deployed backend URL (for example `https://your-api.onrender.com/api`).
- Backend: deploy `backend/` to Render; build command `npm install`, start command `npm start`; set environment variables from `backend/.env.example`.
- Database: create MongoDB Atlas database and allow only the required network access. Set a database user with least privilege.
- Never commit `.env` files or put backend secrets in Vite environment variables.

## Quick test checklist
- [ ] `GET /api/health` returns the documented health response
- [ ] Register a citizen and log in
- [ ] Call `GET /api/auth/me` with `Authorization: Bearer <token>`
- [ ] Register an NGO and submit its profile
- [ ] Promote a test account with the admin bootstrap command
- [ ] Verify NGO and approve a submitted campaign as admin
- [ ] Apply to a campaign with a citizen account
- [ ] Check unauthorized requests return 401/403
- [ ] Configure real payment/storage providers and test their official sandbox flows before production
