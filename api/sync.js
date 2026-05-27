module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return res.status(500).json({ error: 'KV store not configured' });
  }

  // GET — return stored tasks backup for restore
  if (req.method === 'GET') {
    try {
      const kvRes = await fetch(`${kvUrl}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', 'taskvoz-tasks-backup'])
      });
      const kvData = await kvRes.json();
      if (kvData.result) {
        const tasks = JSON.parse(kvData.result);
        return res.status(200).json({ ok: true, tasks, count: tasks.length });
      }
      return res.status(200).json({ ok: true, tasks: [], count: 0 });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { emailSubject, emailBody, lastSync, tasks } = req.body;
    if (!emailSubject || !emailBody) {
      return res.status(400).json({ error: 'Missing emailSubject or emailBody' });
    }

    // Store email data for cron
    const emailRes = await fetch(kvUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['SET', 'taskvoz-email', JSON.stringify({ emailSubject, emailBody, lastSync })])
    });

    if (!emailRes.ok) {
      return res.status(500).json({ error: 'Failed to store email data' });
    }

    // Store raw tasks backup (if provided)
    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      const backupRes = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SET', 'taskvoz-tasks-backup', JSON.stringify(tasks)])
      });
      if (!backupRes.ok) {
        console.error('Failed to store tasks backup');
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
