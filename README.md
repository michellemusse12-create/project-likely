# Likely

> An AI-powered social discovery platform that brings clarity to romantic uncertainty, helping people see how closely they align with someone's preferences before making a move.

Likely helps a creator turn their relationship preferences into a thoughtful questionnaire. Respondents can take it anonymously and see their own weighted alignment score immediately—no account required. Creators can review anonymous results in a private dashboard.

## Features

- Creator accounts and an authenticated, private dashboard
- Editable, reorderable questionnaires with multiple-choice and 1–5 scale questions
- AI-generated questions when an API provider is configured
- Answer-specific scoring criteria kept in sync with the questionnaire
- Deterministic weighted scoring and category insights
- Unique, shareable questionnaire links
- Anonymous responses and immediate respondent-visible results
- Encrypted local data storage and deletion controls
- Input validation, request rate limiting, and protected creator APIs

## Run locally

Requirements: Node.js 20+ and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Vite proxies API requests to the local Node server at `http://127.0.0.1:4173`.

To run a production build:

```powershell
npm.cmd run build
npm.cmd start
```

Then open `http://127.0.0.1:4173`.

## Configure AI question generation (optional)

Starter questions can be edited and published without an AI provider. To enable AI generation, add your key to the server's ignored `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Restart the server after changing the file. Optionally set `OPENAI_MODEL` or `OPENAI_API_URL`. The key stays server-side and must never be added to client-prefixed environment variables or committed. See `.env.example` for the optional settings.

When a creator explicitly requests AI question generation, their preference description is sent to the configured provider. Review the provider's data policy before enabling the integration. Provider errors are shown to the creator; Likely does not substitute fake AI output.

## Data, privacy, and limitations

- Creator passwords are stored as scrypt hashes. In-memory bearer sessions expire after 24 hours.
- The complete local data file—including preferences, scoring rubrics, and submissions—is encrypted with AES-256-GCM. The server creates `data\storage.key` and `data\likely.enc`; keep both secure and back them up together. Losing the key makes the data unrecoverable.
- Set `LIKELY_DATA_DIR` to choose another local data directory.
- Respondents are not asked for identifying details. Anonymous answers are retained until the creator deletes the test or account.
- Respondent results use a separate unguessable token. Creator dashboards and scoring rubrics require server-side authorization.
- Public submissions and authentication attempts are rate-limited and validated.
- Published tests are immutable so the scoring behind previous responses remains reproducible.
- The score expresses alignment with stated preferences. It does not predict attraction, make a romantic verdict, or advise anyone to pursue or avoid someone.

This is a local MVP, not a production-hardened public service. The server binds to loopback by default and uses local encrypted JSON persistence, in-memory sessions, and in-memory rate limits. It has not had a professional security or privacy audit. Do not expose it directly to the internet or put it behind an untrusted proxy.

## Validate

```powershell
npm.cmd test
npm.cmd run build
```
