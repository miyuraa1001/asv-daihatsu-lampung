export default async function handler(req, res) {
    // Hanya izinkan method GET atau POST dari frontend aplikasi kita sendiri
    const targetUrl = process.env.GAS_WEB_APP_URL;
    const secretToken = process.env.GAS_SECRET_TOKEN;

    if (!targetUrl || !secretToken) {
        return res.status(500).json({ status: "error", message: "Server configuration missing." });
    }

    try {
        if (req.method === 'GET') {
            // Meneruskan request GET dari frontend ke Apps Script dengan menyertakan token secara aman di server
            const action = req.query.action || '';
            const response = await fetch(`${targetUrl}?action=${action}&token=${secretToken}`);
            const data = await response.json();
            return res.status(200).json(data);
        } 
        
        else if (req.method === 'POST') {
            // Meneruskan request POST dari frontend ke Apps Script
            const payload = req.body || {};
            payload.token = secretToken; // Sisipkan token rahasia di server Vercel

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
