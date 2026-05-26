module.exports = async function handler(req, res) {
  try {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const webhookUrl = process.env.MAKE_WEBHOOK_URL;

    if (!kvUrl || !kvToken || !webhookUrl) {
      return res.status(500).json({ error: 'Missing environment variables' });
    }

    // Read stored email data from KV
    const getRes = await fetch(kvUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['GET', 'taskvoz-email'])
    });

    const result = await getRes.json();
    if (!result.result) {
      return res.status(200).json({ skipped: true, reason: 'No data in store' });
    }

    const data = JSON.parse(result.result);

    // Check freshness — skip if data is older than 48 hours
    if (data.lastSync) {
      const lastSync = new Date(data.lastSync);
      const now = new Date();
      const hoursOld = (now - lastSync) / (1000 * 60 * 60);
      if (hoursOld > 48) {
        return res.status(200).json({ skipped: true, reason: `Data is ${Math.round(hoursOld)}h old` });
      }
    }

    // Send email via Make.com webhook
    const emailRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailSubject: data.emailSubject,
        emailBody: data.emailBody,
        lastSync: data.lastSync
      })
    });

    if (!emailRes.ok) {
      return res.status(500).json({ error: 'Webhook failed', status: emailRes.status });
    }

    return res.status(200).json({ sent: true, subject: data.emailSubject });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
