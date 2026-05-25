# SpecKit Core Server

Node.js HTTP API server that exposes SpecKit's spec management logic for cross-IDE consumption (primarily for the IntelliJ plugin).

## Setup

```bash
cd packages/core-server
npm install
npm run build
npm start
```

Server starts at `http://127.0.0.1:4815`.

## API

| Method | Route        | Description                                        |
| ------ | ------------ | -------------------------------------------------- |
| GET    | /health      | Health check                                       |
| GET    | /status      | List all specs with status                         |
| GET    | /status-fix  | Fix-focused status flow                            |
| POST   | /new         | Create new story spec                              |
| POST   | /fix         | Create new fix spec                                |
| POST   | /draft       | Generate spec draft from free text                 |
| POST   | /validate    | Validate active spec                               |
| POST   | /verify      | Run deterministic gate verification on active spec |
| POST   | /review-auto | Gate review orchestration                          |
| POST   | /batch       | Batch validation/config generation                 |
| GET    | /agent       | List agent modes and active mode                   |
| POST   | /agent       | Propose/confirm mode switch                        |
| GET    | /gate        | Gate transition rules                              |
| GET    | /audit       | Audit trail                                        |
| GET    | /trace       | Traceability trail                                 |
| GET    | /history     | Aggregated history trail                           |
| POST   | /commit      | Git commit                                         |
| GET    | /diff        | Show git diff                                      |
| GET    | /context     | Workspace context                                  |
| GET    | /doctor      | Workspace diagnostics                              |
| POST   | /init        | Initialize SpecKit workspace                       |
| GET    | /metrics     | Summarize local validation metrics                 |
| GET    | /score       | Score active spec completeness (0-100)             |
| GET    | /help        | API documentation                                  |

All POST routes expect JSON body with at minimum `{ "workspaceRoot": "/absolute/path" }`.

## Behavioral parity notes

- `POST /validate` now follows participant-style flow:
  - invalid spec: writes `.speckit/gap-fill.prompt.md` and returns guided markdown
  - valid spec: creates backup + generates Copilot config files, returns gate/context summary
- `POST /agent` now requires explicit confirmation:
  - `/agent <mode>` proposes transition and returns `intentId`
  - `/agent --confirm <codigo>` confirms with the returned confirmation code and applies transition
- `POST /batch --generate --unified` now supports branch governance parity:
  - when stories cite branches, `--branch-strategy session|cited` is required
  - may return governance intent requiring `--confirm <codigo>` to create session branch
- `POST /review-auto` now supports participant-compatible control flow:
  - proposal + confirmation via `intentId` for gate/status transitions
  - `--batch-consent` + `--auto` workflow for automatic transitions in unified batch sessions
  - actions: orchestrate (Gate 2->3), approved (Gate 3->4), changes-requested (Gate 3->2)

## Minimal examples

### Validate active spec

```json
POST /validate
{ "workspaceRoot": "C:\\repo" }
```

### Propose + confirm agent mode

```json
POST /agent
{ "workspaceRoot": "C:\\repo", "mode": "debugger" }
```

```json
POST /agent
{ "workspaceRoot": "C:\\repo", "confirmIntentId": "<codigo>" }
```

### Batch unified with branch governance

```json
POST /batch
{ "workspaceRoot": "C:\\repo", "generate": true, "unified": true, "branchStrategy": "session" }
```

### Review-auto proposal + confirm

```json
POST /review-auto
{ "workspaceRoot": "C:\\repo", "action": "orchestrate" }
```

```json
POST /review-auto
{ "workspaceRoot": "C:\\repo", "action": "orchestrate", "confirmIntentId": "<codigo>" }
```
