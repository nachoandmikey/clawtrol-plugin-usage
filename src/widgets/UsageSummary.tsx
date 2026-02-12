import React, { useEffect, useState } from 'react';

type UsageData = {
  fiveHour?: { percent: number };
  weekly?: { percent: number };
};

export default function UsageSummary() {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch('/api/plugins/usage')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const five = data?.fiveHour?.percent ?? 0;
  const week = data?.weekly?.percent ?? 0;

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ marginBottom: 6 }}>⚡ 5h: <strong>{five}%</strong></div>
      <div>📅 7d: <strong>{week}%</strong></div>
    </div>
  );
}
