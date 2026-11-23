# Database model overview

MongoDB collections are created by Mongoose when first written.

- `users`: identity, hashed password, role, active/verified flags.
- `ngos`: one organization profile per NGO account; verification state and review notes.
- `campaigns`: campaign metadata, NGO ownership, target/raised totals, volunteer need, review state.
- `volunteerapplications`: one application per Citizen/campaign (compound unique index); workflow status.
- `donations`: donation intent and transaction metadata; compound unique idempotency key per Citizen. `SUCCESS` must only be set by a verified provider adapter, which is not included yet.
- `reliefactivities`: activity, location, date, beneficiary count, public summary.
- `expenses`: NGO-submitted amount, invoice reference, notes, review status.
- `auditlogs`: selected administrative actions.

## Workflow states
NGO: PENDING → UNDER_REVIEW → VERIFIED; also REJECTED, RESUBMISSION_REQUIRED, SUSPENDED.
Campaign: DRAFT → SUBMITTED → PUBLISHED (after admin approval); also REJECTED / RESUBMISSION_REQUIRED.
Volunteer: PENDING → APPROVED → SCHEDULED → ACTIVE → COMPLETED; may be REJECTED/CANCELLED.
Donation: INITIATED → PENDING → SUCCESS; may be FAILED/REFUNDED. Provider verification required before SUCCESS.
Expense: SUBMITTED → UNDER_REVIEW → VERIFIED or REJECTED.

For production, consider database migrations/index review, stronger audit retention, soft deletion policies, and transaction/session strategy for payment settlement and raised totals.
