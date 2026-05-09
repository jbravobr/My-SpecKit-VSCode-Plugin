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

| Method | Route | Description |
|---|---|---|
| GET | /health | Health check |
| GET | /status | List all specs with status |
| POST | /new | Create new story spec |
| POST | /validate | Validate active spec |
| POST | /commit | Git commit |
| GET | /diff | Show git diff |
| GET | /help | API documentation |

All POST routes expect JSON body with at minimum `{ "workspaceRoot": "/absolute/path" }`.
