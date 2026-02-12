import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type AlertConfig = {
  keychainServiceName?: string;
  alertChatId?: string;
  alertTopicId?: number;
  telegramBotToken?: string;
  webhookUrl?: string;
  thresholds?: {
    fiveHour?: number[];
    weekly?: number[];
  };
};

type AlertState = {
  fiveHourAlerted: number[];
  weeklyAlerted: number[];
  fiveHourResetAt: number | null;
  weeklyResetAt: number | null;
  lastCheck: number;
  lastAuthError: number | null;
  authErrorAlerted: boolean;
};

const DEFAULT_FIVE_HOUR_THRESHOLDS = [75, 90, 95, 100];
const DEFAULT_WEEKLY_THRESHOLDS = [50, 75, 90, 95, 100];
const DATA_DIR = join(homedir(), '.openclaw', 'control-center');
const ALERT_STATE_FILE = join(DATA_DIR, 'usage-alerts.json');

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

async function loadAlertState(): Promise<AlertState> {
  try {
    const data = await readFile(ALERT_STATE_FILE, 'utf-8');
    return JSON.parse(data) as AlertState;
  } catch {
    return {
      fiveHourAlerted: [],
      weeklyAlerted: [],
      fiveHourResetAt: null,
      weeklyResetAt: null,
      lastCheck: 0,
      lastAuthError: null,
      authErrorAlerted: false,
    };
  }
}

async function saveAlertState(state: AlertState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ALERT_STATE_FILE, JSON.stringify(state, null, 2));
}

function getAlertEmoji(percent: number): string {
  if (percent >= 100) return '🔴';
  if (percent >= 95) return '🟠';
  if (percent >= 90) return '🟡';
  if (percent >= 75) return '🟡';
  return '⚠️';
}

function formatResetTime(resetAt: string | null): { time: string; relative: string } | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  const now = new Date();

  const time = date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Madrid',
  });

  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return { time, relative: 'now' };

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return { time, relative: `in ${diffDays}d ${diffHours % 24}h` };
  if (diffHours > 0) return { time, relative: `in ${diffHours}h ${diffMins % 60}m` };
  return { time, relative: `in ${diffMins}m` };
}

function getCredentials(serviceName: string): { accessToken: string | null; expiresAt: number | null } {
  if (process.platform !== 'darwin') return { accessToken: null, expiresAt: null };

  try {
    const creds = execSync(`security find-generic-password -s "${serviceName}" -w 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const parsed = JSON.parse(creds);
    return {
      accessToken: parsed?.claudeAiOauth?.accessToken ?? null,
      expiresAt: parsed?.claudeAiOauth?.expiresAt ?? null,
    };
  } catch {
    return { accessToken: null, expiresAt: null };
  }
}

function refreshToken(): boolean {
  try {
    execSync('echo "hi" | claude --print --max-turns 1 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

async function sendAlert(message: string, cfg: AlertConfig): Promise<boolean> {
  const webhook = cfg.webhookUrl || process.env.CLAWTROL_USAGE_WEBHOOK_URL;
  if (webhook) {
    const resp = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (resp.ok) return true;
  }

  const token = cfg.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = cfg.alertChatId;
  if (!token || !chatId) return false;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: cfg.alertTopicId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  return res.ok;
}

async function processUsageResponse(usage: any, state: AlertState, cfg: AlertConfig): Promise<Response> {
  const fiveHourPercent = Math.round(usage.five_hour?.utilization ?? 0);
  const weeklyPercent = Math.round(usage.seven_day?.utilization ?? 0);
  const fiveHourResetAt = usage.five_hour?.resets_at ? new Date(usage.five_hour.resets_at).getTime() : null;
  const weeklyResetAt = usage.seven_day?.resets_at ? new Date(usage.seven_day.resets_at).getTime() : null;

  const fiveHourThresholds = cfg.thresholds?.fiveHour ?? DEFAULT_FIVE_HOUR_THRESHOLDS;
  const weeklyThresholds = cfg.thresholds?.weekly ?? DEFAULT_WEEKLY_THRESHOLDS;

  const alerts: string[] = [];

  if (fiveHourResetAt && state.fiveHourResetAt && fiveHourResetAt !== state.fiveHourResetAt) state.fiveHourAlerted = [];
  if (weeklyResetAt && state.weeklyResetAt && weeklyResetAt !== state.weeklyResetAt) state.weeklyAlerted = [];

  for (const threshold of fiveHourThresholds) {
    if (fiveHourPercent >= threshold && !state.fiveHourAlerted.includes(threshold)) {
      const reset = formatResetTime(usage.five_hour?.resets_at ?? null);
      alerts.push(`${getAlertEmoji(threshold)} <b>5-Hour Usage: ${fiveHourPercent}%</b>\nResets: ${reset ? `${reset.time} (${reset.relative})` : '?'}`);
      state.fiveHourAlerted.push(threshold);
    }
  }

  for (const threshold of weeklyThresholds) {
    if (weeklyPercent >= threshold && !state.weeklyAlerted.includes(threshold)) {
      const reset = formatResetTime(usage.seven_day?.resets_at ?? null);
      alerts.push(`${getAlertEmoji(threshold)} <b>Weekly Usage: ${weeklyPercent}%</b>\nResets: ${reset ? `${reset.time} (${reset.relative})` : '?'}`);
      state.weeklyAlerted.push(threshold);
    }
  }

  state.fiveHourResetAt = fiveHourResetAt;
  state.weeklyResetAt = weeklyResetAt;
  state.lastCheck = Date.now();
  await saveAlertState(state);

  let alertsSent = 0;
  for (const alert of alerts) {
    if (await sendAlert(alert, cfg)) alertsSent += 1;
  }

  return json({ checked: true, fiveHourPercent, weeklyPercent, alertsTriggered: alerts.length, alertsSent, timestamp: Date.now() });
}

export async function GET(_request?: Request, cfg: AlertConfig = {}): Promise<Response> {
  const state = await loadAlertState();
  const serviceName = cfg.keychainServiceName ?? process.env.CLAUDE_USAGE_KEYCHAIN_SERVICE ?? 'Claude Code-credentials';

  try {
    let { accessToken, expiresAt } = getCredentials(serviceName);
    const now = Date.now();

    if (process.platform === 'darwin' && (!accessToken || (expiresAt && now > expiresAt - 5 * 60 * 1000))) {
      const refreshed = refreshToken();
      if (refreshed) {
        const creds = getCredentials(serviceName);
        accessToken = creds.accessToken;
      }
    }

    if (!accessToken) {
      if (!state.authErrorAlerted) {
        await sendAlert('⚠️ <b>Claude Usage Monitor Auth Failed</b>\n\nToken missing/expired. Run <code>claude /login</code>.', cfg);
        state.authErrorAlerted = true;
        state.lastAuthError = now;
        await saveAlertState(state);
      }
      return json({ error: 'No OAuth token found' }, 401);
    }

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });

    if (!response.ok) return json({ error: 'API error', status: response.status }, response.status);

    if (state.authErrorAlerted) {
      state.authErrorAlerted = false;
      state.lastAuthError = null;
    }

    const usage = await response.json();
    return processUsageResponse(usage, state, cfg);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
