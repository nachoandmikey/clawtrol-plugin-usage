import React, { useEffect, useState } from 'react';

type UsageData = {
  fiveHour?: { percent: number; resetIn: string | null };
  weekly?: { percent: number; resetIn: string | null };
  opus?: { percent: number; resetIn: string | null } | null;
  sonnet?: { percent: number; resetIn: string | null } | null;
  error?: string;
};

function barColor(percent = 0): string {
  if (percent >= 100) return '#ef4444';
  if (percent >= 95) return '#f97316';
  if (percent >= 90) return '#eab308';
  if (percent >= 75) return '#84cc16';
  return '#22c55e';
}

function UsageBar({ label, percent = 0, resetIn }: { label: string; percent?: number; resetIn?: string | null }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <strong>{label}</strong>
        <span>{percent}%{resetIn ? ` · resets ${resetIn}` : ''}</span>
      </div>
      <div style={{ height: 10, width: '100%', borderRadius: 999, background: '#1f2937', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, percent))}%`,
            background: barColor(percent),
            transition: 'width 200ms ease',
          }}
        />
      </div>
    </div>
  );
}

export default function UsageModule() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/plugins/usage')
      .then((r) => r.json())
      .then((json) => {
        if (alive) setData(json);
      })
      .catch((err) => {
        if (alive) setData({ error: err instanceof Error ? err.message : 'Unknown error' });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div>Loading usage…</div>;
  if (!data || data.error) return <div>Unable to load usage: {data?.error ?? 'unknown error'}</div>;

  return (
    <div style={{ padding: 12, border: '1px solid #1f2937', borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>Claude Code Usage</h3>
      <UsageBar label="5-hour" percent={data.fiveHour?.percent} resetIn={data.fiveHour?.resetIn ?? null} />
      <UsageBar label="Weekly" percent={data.weekly?.percent} resetIn={data.weekly?.resetIn ?? null} />
      {data.opus ? <UsageBar label="Weekly Opus" percent={data.opus.percent} resetIn={data.opus.resetIn} /> : null}
      {data.sonnet ? <UsageBar label="Weekly Sonnet" percent={data.sonnet.percent} resetIn={data.sonnet.resetIn} /> : null}
    </div>
  );
}
