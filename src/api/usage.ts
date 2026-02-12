import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type UsagePluginConfig = {
  keychainServiceName?: string;
};

type ClaudeCreds = {
  claudeAiOauth?: {
    accessToken?: string;
  };
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function formatResetTime(resetAt: string | null): string | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return 'now';

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
  return `${diffMins}m`;
}

async function tokenFromLinuxConfig(): Promise<string | null> {
  const candidates = [
    join(homedir(), '.config', 'claude', 'credentials.json'),
    join(homedir(), '.claude', 'credentials.json'),
  ];

  for (const file of candidates) {
    try {
      const raw = await readFile(file, 'utf-8');
      const parsed = JSON.parse(raw) as ClaudeCreds;
      const token = parsed?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch {
      // keep trying
    }
  }

  return null;
}

async function resolveToken(config: UsagePluginConfig = {}): Promise<string | null> {
  const serviceName = config.keychainServiceName ?? process.env.CLAUDE_USAGE_KEYCHAIN_SERVICE ?? 'Claude Code-credentials';

  if (process.platform === 'darwin') {
    try {
      const creds = execSync(`security find-generic-password -s "${serviceName}" -w 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      const parsed = JSON.parse(creds) as ClaudeCreds;
      return parsed?.claudeAiOauth?.accessToken ?? null;
    } catch {
      return null;
    }
  }

  return tokenFromLinuxConfig();
}

export async function GET(_request?: Request, config: UsagePluginConfig = {}): Promise<Response> {
  try {
    const token = await resolveToken(config);

    if (!token) return json({ error: 'No OAuth token found' }, 401);

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });

    if (!response.ok) {
      return json({ error: `API error: ${response.status}` }, response.status);
    }

    const usage = await response.json();

    return json({
      fiveHour: {
        percent: Math.round(usage.five_hour?.utilization ?? 0),
        resetIn: formatResetTime(usage.five_hour?.resets_at ?? null),
        resetAt: usage.five_hour?.resets_at ? new Date(usage.five_hour.resets_at).getTime() : null,
      },
      weekly: {
        percent: Math.round(usage.seven_day?.utilization ?? 0),
        resetIn: formatResetTime(usage.seven_day?.resets_at ?? null),
        resetAt: usage.seven_day?.resets_at ? new Date(usage.seven_day.resets_at).getTime() : null,
      },
      opus: usage.seven_day_opus
        ? {
            percent: Math.round(usage.seven_day_opus.utilization ?? 0),
            resetIn: formatResetTime(usage.seven_day_opus.resets_at ?? null),
          }
        : null,
      sonnet: usage.seven_day_sonnet
        ? {
            percent: Math.round(usage.seven_day_sonnet.utilization ?? 0),
            resetIn: formatResetTime(usage.seven_day_sonnet.resets_at ?? null),
          }
        : null,
      extraUsage: usage.extra_usage?.is_enabled
        ? {
            used: usage.extra_usage.used_credits,
            limit: usage.extra_usage.monthly_limit,
            percent: Math.round(usage.extra_usage.utilization ?? 0),
          }
        : null,
      timestamp: Date.now(),
      source: 'live',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}
