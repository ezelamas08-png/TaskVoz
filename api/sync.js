module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { emailSubject, emailBody, lastSync } = req.body;
    if (!emailSubject || !emailBody) {
      return res.status(400).json({ error: 'Missing emailSubject or emailBody' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      return res.status(500).json({ error: 'KV store not configured' });
    }

    const kvRes = await fetch(kvUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['SET', 'taskvoz-email', JSON.stringify({ emailSubject, emailBody, lastSync })])
    });

    if (!kvRes.ok) {
      return res.status(500).json({ error: 'Failed to store data' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
