# API reference

Base URL: `http://localhost:5000/api`. JSON responses use `{ success, message?, data? }`. Protected endpoints require `Authorization: Bearer <token>`.

## Health and auth
- `GET /health` — health response.
- `POST /auth/register` — `{ name, email, password, phone?, role? }`; role accepts only NGO or defaults to CITIZEN; ADMIN is never publicly assignable.
- `POST /auth/login` — `{ email, password }`.
- `GET /auth/me` — current account.
- `PATCH /auth/me` — update `name` and/or `phone`.

## NGOs
- `POST /ngos` (NGO) — `{ organizationName, registrationNumber, address, description?, documentReferences? }`.
- `GET /ngos/me` (NGO) — own organization.
- `GET /ngos/me/summary` (NGO) — summary.
- `GET /ngos/admin/pending` (ADMIN) — verification queue.
- `PATCH /ngos/admin/:id/review` (ADMIN) — `{ status, reviewNote? }`, status: VERIFIED, REJECTED, RESUBMISSION_REQUIRED, UNDER_REVIEW, SUSPENDED.

## Campaigns
- `GET /campaigns?page=1&limit=12&q=...` — public published/active/completed campaigns.
- `GET /campaigns/:id` — public campaign detail.
- `POST /campaigns` (verified NGO) — title, description, category, location, targetAmount, optional startDate/endDate/requiredVolunteers.
- `GET /campaigns/ngo/mine` (NGO) — own campaigns.
- `PATCH /campaigns/:id` (NGO owner) — edit draft/returned campaign.
- `POST /campaigns/:id/submit` (verified NGO) — submit for review.
- `GET /campaigns/admin/pending` (ADMIN) — review queue.
- `PATCH /campaigns/admin/:id/review` (ADMIN) — `{ status: APPROVED|REJECTED|RESUBMISSION_REQUIRED, reviewNote? }`; APPROVED is published.
- `GET /campaigns/admin/overview` (ADMIN) — overview counts.
- `GET /campaigns/citizens/me/summary` (CITIZEN) — own activity counts.

## Volunteers
- `POST /volunteers` (CITIZEN) — `{ campaignId, message? }`.
- `GET /volunteers/mine` (CITIZEN) — own applications.
- `GET /volunteers/ngo` (NGO) — applications for owned campaigns.
- `PATCH /volunteers/:id/review` (NGO owner) — `{ status }`.

## Donations
- `POST /donations` (CITIZEN) — `{ campaignId, amount, provider? }` plus `Idempotency-Key` header. Creates an INITIATED intent only; no checkout or payment verification.
- `GET /donations/mine` (CITIZEN) — own records.
- `GET /donations/admin` (ADMIN) — donation records.

## Relief and transparency
- `GET /relief/activities?campaignId=...` — activities; public route.
- `POST /relief/activities` (NGO) — `{ campaignId, title, description, location, activityDate?, beneficiaryCount?, publicSummary? }`.
- `GET /relief/expenses` (NGO/ADMIN) — expenses (NGO sees own).
- `POST /relief/expenses` (NGO) — `{ campaignId, title, amount, invoiceReference?, notes? }`.
- `PATCH /relief/expenses/:id/review` (ADMIN) — `{ status: UNDER_REVIEW|VERIFIED|REJECTED }`.
- `GET /relief/audit-logs` (ADMIN) — recent audit events.

Pagination is implemented for public campaigns. Further list endpoints currently use capped result limits and should be upgraded to consistent pagination before production.
