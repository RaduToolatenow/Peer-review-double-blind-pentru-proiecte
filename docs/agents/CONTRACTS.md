# Contracts — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> Promises across a boundary. **Provided:** this repo owns the contract; the text
> lives here only. **Consumed:** a link to the provider's entry plus the fields this
> repo relies on. **External:** what we rely on from a third-party service.
> Changing a provided contract is a PROPOSAL (AGENTS.md → The gate) and the plan
> lists the consumers' files too. Status: `approved` · `proposed` · `superseded-by`.
<!-- graffino-agentic:end -->

## Index
- C-001 · HTTP API under /api · provided

---

## Provided

### C-001 · HTTP API under /api
- **Status:** approved
- **Interface:** HTTP JSON routes under `/api`, documented in [API.md](../API.md).
- **Consumers:** `web/src/api.ts`
- **Shape:** Routes, bodies and status codes as listed in API.md. The session is the httpOnly cookie `sid`.
- **Rules:** Authentication and roles are checked on the server. A user response never contains the password hash.
- **Evidence:** api/src/auth/auth.controller.ts, api/src/users/users.controller.ts, api/test/auth.spec.ts
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## Consumed

## External
