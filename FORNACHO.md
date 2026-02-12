# FORNACHO — clawtrol-plugin-usage

## Architecture
This plugin has 3 layers:
1. **UI layer** (`UsageModule`, `UsageSummary`) to render usage bars/widgets.
2. **API layer** (`src/api/usage.ts`, `src/api/alert.ts`) to fetch Claude usage + trigger alerts.
3. **Ops layer** (`bin/setup.mjs`) to schedule periodic polling every 5 minutes.

Think of it like: dashboard eyes (UI), brain (API logic), heartbeat (scheduler).

## Key decisions
- Kept API handlers framework-agnostic using native `Response` for portability.
- Preserved alert logic from existing clawtrol-work routes and made thresholds/config injectable.
- Added Linux fallback for credentials from claude config files when Keychain is unavailable.
- Setup script supports launchd (mac) and cron/systemd user units (Linux).

## Pitfalls
- On Linux, systemd timer files are generated but **not auto-enabled** (safe default).
- On macOS, `launchctl load` requires a valid user context.
- If Claude token is missing/expired, alert route can only recover automatically where `claude` CLI refresh works.

## What to remember
- `clawtrol-usage-setup` detects port from `.clawtrol.json`; defaults to 4781.
- Alert state file lives at `~/.openclaw/control-center/usage-alerts.json`.
- Telegram token can come from config or `TELEGRAM_BOT_TOKEN` env.
