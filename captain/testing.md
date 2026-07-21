# Testing & evidence contract

Used by workers in Phase 3 and to assemble every report's Evidence Block. This file is deliberately isolated: **testing is the part of this skill expected to evolve.** To add a check, append a `C<n>` entry to the registry and flip its Status when implemented — nothing else needs to change.

## Findings contract (adopted from no-mistakes)

- A check is satisfied only by **runnable output**, never by a claim. Paste the command and trimmed output (≤ ~20 lines per check).
- Every check either **passes** (with output) or yields a **finding**. A finding is either **safe-fix** (mechanical, behavior-preserving — apply it and note it) or **escalate** (anything intent-affecting — blocked report to the operator).
- Fabricating output, trimming it to mislead, or asserting an unrun check are worse than failing. **"Not verified because X" is a legitimate result** — it moves the ticket down the evidence tiers and makes C5 mandatory.

## Check registry

| # | Check | Status |
|---|---|---|
| C1 | Targeted proof: fails on main, passes on branch | Implemented |
| C2 | Full repo suite | Implemented |
| C3 | Static checks (typecheck / build) | Implemented |
| C4 | PR CI status included in reports | Implemented |
| C5 | Prepared manual verification steps | Implemented |
| C6 | API runtime smoke — launch the API locally, curl the endpoint, paste request/response | Planned — first candidate |
| C7 | Browser-driven UI flow verification — blocked on a Firebase/Entra auth story; operator does these manually via C5 meanwhile | Planned |
| C8 | /verify skill integration per repo | Planned |
| C9 | Independent verifier agent re-runs the evidence (anti evidence-theater; captain-era) | Planned |
| C10 | Bootstrap a test harness in Remundo.Ui.Admin (none exists today) | Planned |
| C11 | Contract-shrink sweep: every reader of a removed/stripped/renamed field enumerated (`git grep`) and classified — crashes / silently degrades / unaffected — including readers of rehydrated persisted copies | Implemented |
| C12 | Reload parity: when a change touches persistence, session boot, or store hydration, prove an authenticated hard-refresh leaves the app functionally intact (test at the rehydration seam asserting the restored shape serves its consumers, or explicit C5 steps: refresh, then click through the affected surfaces) | Implemented |

### C1 — Targeted proof (the gold standard)

A test that captures the ticket's defect: **passes on the branch, demonstrably fails without the fix.** The fail run is the load-bearing half — without it the test only proves the code does what the code does.

**Primary route — TDD's red run.** Working red → green produces this proof natively: capture the failing output the moment it happens (it cannot be regenerated later without surgery), then pair it with the final green output. Red run + green run = C1 satisfied.

**Fallback — reconstruct the fail run** (change made without TDD: a config fix tested after the fact, a review-round fix, a missed red capture). Inside your worktree:

1. Write (or find) the test; run it on the branch → pass (paste output).
2. Temporarily remove the fix, keeping the test: uncommitted fix → `git stash push -- <fix paths>` … `git stash pop`; committed fix → `git checkout origin/main -- <fix paths>` … restore with `git checkout HEAD -- <fix paths>`. Rerun in between → must fail (paste output).
3. Fix and test inseparable (same lines)? Note it and construct an equivalent proof (e.g. temporarily revert the fix hunk); if no clean proof exists, record a finding and lean on C2 + C5.

### C2 / C3 — Suite and static checks, per repo (verified 2026-07-14)

| Repo (local clone) | Commands, from the worktree | PR CI |
|---|---|---|
| Remundo.Ui.Platform (`Remundo`) | in `web/`: `npm install --legacy-peer-deps` → `cp .env.ci .env.localdev` → `TZ=UTC npm test` → `npm run check` | same suite |
| Remundo.Api (`Remundo.Api`) | `dotnet test` (.NET 10) | dotnet test |
| Remundo.Ui.Tenant (`Remundo.Ui`) | `dotnet test` (.NET 10 — this UI repo is .NET, not node) | dotnet test |
| Remundo.Ui.BackOffice (`Remundo.Ui.BackOffice`) | `npm install` → `cp .env.example .env` → `npm run check` → `npm test` | same suite |
| Remundo.Ui.Admin (`Remundo.Admin.Ui`) | in `web/`: `npm install` → `npm run check` → `npm run build` — **no test script exists** | **none** |
| Remundo.Iac (`Remundo.IAC`) | `kustomize build` on each overlay touched | kustomize build only |

**Admin UI and IAC get the strictest treatment:** with no automated tests (Admin) or build-only CI (IAC), C1 is usually infeasible — C3 and C5 are mandatory, and every report must state "no automated test coverage" explicitly rather than letting silence imply it.

### C4 — CI status

Once the PR exists, include `gh pr checks <number> -R <org/repo>` output in the gate and completion reports. Never report done while checks are red without an escalate finding explaining why.

### C5 — Prepared manual steps

For behavior that can't be verified locally (auth-walled UI flows, deployed-environment-only behavior): leave the worktree ready to run and write exact steps — the command to start it, URL/route, payloads or clicks, expected result before and after the fix. The operator executes these at a gate pause; write them so it takes minutes, not archaeology.

## Evidence Block format

```
### Evidence
Worktree: <path> @ <short sha>
C1 <pass | finding | n/a — why>: <command> → <trimmed output>
C2 <…>
C3 <…>
C4 <…>
C5 <n/a | steps below>
Findings: <none | list, each marked safe-fix / escalate>
Not verified: <none | what + why>
```
