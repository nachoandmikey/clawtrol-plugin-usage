# clawtrol-plugin-usage

Claude Code usage monitoring plugin for Clawtrol dashboards.

## Features

- Dashboard module with 5-hour and weekly usage bars
- Compact usage summary widget
- API route to fetch Claude OAuth usage (`/api/plugins/usage`)
- Alert route with threshold notifications (`/api/plugins/usage/alert`)
- Setup CLI (`clawtrol-usage-setup`) to install scheduled polling:
  - macOS: LaunchAgent (`~/Library/LaunchAgents/com.clawtrol.usage-alert.plist`)
  - Linux: cron entry + systemd user timer/service files

## Install

```bash
npm i clawtrol-plugin-usage
npx clawtrol-usage-setup
```

## Plugin config (clawtrol.config.ts)

```ts
plugins: {
  usage: {
    alertChatId: '-1003420657307',
    alertTopicId: 342,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    thresholds: {
      fiveHour: [75, 90, 95, 100],
      weekly: [50, 75, 90, 95, 100],
    },
    pollIntervalSeconds: 300,
  }
}
```

## API behavior

### `GET /api/plugins/usage`
- Reads Claude OAuth token from:
  - macOS Keychain (`Claude Code-credentials` by default, configurable with `keychainServiceName`)
  - Linux config files (`~/.config/claude/credentials.json` or `~/.claude/credentials.json`)
- Calls `https://api.anthropic.com/api/oauth/usage`
- Returns normalized dashboard usage payload

### `GET /api/plugins/usage/alert`
- Applies threshold checks for 5h and weekly usage
- Persists alert state to `~/.openclaw/control-center/usage-alerts.json`
- Sends alerts via webhook or Telegram

## Setup script details

`clawtrol-usage-setup` auto-detects Clawtrol port from `.clawtrol.json` (`port` or `server.port`) and defaults to `4781`.

- macOS: writes + loads `com.clawtrol.usage-alert.plist`
- Linux: updates `crontab` and writes systemd user units as an alternative

## License

MIT
