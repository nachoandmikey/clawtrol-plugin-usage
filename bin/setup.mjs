#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

function detectPort() {
  const candidates = [
    join(process.cwd(), '.clawtrol.json'),
    join(homedir(), '.clawtrol.json'),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const cfg = JSON.parse(readFileSync(file, 'utf-8'));
      if (typeof cfg?.port === 'number') return cfg.port;
      if (typeof cfg?.server?.port === 'number') return cfg.server.port;
    } catch {
      // ignore bad config
    }
  }

  return 4781;
}

function setupMac(port) {
  const agentsDir = join(homedir(), 'Library', 'LaunchAgents');
  mkdirSync(agentsDir, { recursive: true });
  const plistPath = join(agentsDir, 'com.clawtrol.usage-alert.plist');
  const endpoint = `http://localhost:${port}/api/plugins/usage/alert`;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.clawtrol.usage-alert</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/curl</string>
    <string>-fsS</string>
    <string>${endpoint}</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${homedir()}/Library/Logs/clawtrol-usage-alert.log</string>
  <key>StandardErrorPath</key>
  <string>${homedir()}/Library/Logs/clawtrol-usage-alert.err.log</string>
</dict>
</plist>
`;

  writeFileSync(plistPath, plist, 'utf-8');

  try { execSync(`launchctl unload ${plistPath}`, { stdio: 'ignore' }); } catch {}
  execSync(`launchctl load ${plistPath}`, { stdio: 'ignore' });

  return { plistPath, endpoint };
}

function setupLinux(port) {
  const endpoint = `http://localhost:${port}/api/plugins/usage/alert`;
  const cronLine = `*/5 * * * * /usr/bin/curl -fsS ${endpoint} >/dev/null 2>&1 # clawtrol-usage-alert`;

  let current = '';
  try { current = execSync('crontab -l', { encoding: 'utf-8' }); } catch {}

  const filtered = current
    .split('\n')
    .filter((line) => line.trim() && !line.includes('clawtrol-usage-alert'));
  filtered.push(cronLine);
  const nextCrontab = `${filtered.join('\n')}\n`;

  execSync('crontab -', { input: nextCrontab, encoding: 'utf-8' });

  const systemdUserDir = join(homedir(), '.config', 'systemd', 'user');
  mkdirSync(systemdUserDir, { recursive: true });
  const servicePath = join(systemdUserDir, 'clawtrol-usage-alert.service');
  const timerPath = join(systemdUserDir, 'clawtrol-usage-alert.timer');

  writeFileSync(servicePath, `[Unit]\nDescription=Clawtrol usage alert poll\n\n[Service]\nType=oneshot\nExecStart=/usr/bin/curl -fsS ${endpoint}\n`, 'utf-8');
  writeFileSync(timerPath, `[Unit]\nDescription=Run Clawtrol usage alert every 5 minutes\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\nUnit=clawtrol-usage-alert.service\n\n[Install]\nWantedBy=timers.target\n`, 'utf-8');

  return { endpoint, servicePath, timerPath };
}

function main() {
  const os = platform();
  const port = detectPort();

  if (os === 'darwin') {
    const info = setupMac(port);
    console.log(`✅ clawtrol-plugin-usage setup complete (macOS)\n- Endpoint: ${info.endpoint}\n- LaunchAgent: ${info.plistPath}\n- Interval: every 300s`);
    return;
  }

  if (os === 'linux') {
    const info = setupLinux(port);
    console.log(`✅ clawtrol-plugin-usage setup complete (Linux)\n- Endpoint: ${info.endpoint}\n- Cron installed: every 5 minutes\n- systemd files: ${info.servicePath}, ${info.timerPath}\nTo enable timer: systemctl --user daemon-reload && systemctl --user enable --now clawtrol-usage-alert.timer`);
    return;
  }

  console.log(`⚠️ Unsupported OS (${os}). Please set up manual polling for /api/plugins/usage/alert every 5 minutes.`);
}

main();
