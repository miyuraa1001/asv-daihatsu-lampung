export default async function handler(req, res) {
    const targetUrl = process.env.GAS_WEB_APP_URL;

    if (!targetUrl) {
        return res.status(500).json({ status: "error", message: "Server configuration missing: GAS_WEB_APP_URL not set." });
    }

    try {
        if (req.method === 'GET') {
            const action = req.query.action || '';
            const response = await fetch(`${targetUrl}?action=${action}`);
            const data = await response.json();
            return res.status(200).json(data);
        } 
        
        else if (req.method === 'POST') {
            const payload = req.body || {};

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            return res.status(200).json(data);
        }

        return res.status(405).json({ status: "error", message: "Method not allowed" });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.toString() });
    }
}
