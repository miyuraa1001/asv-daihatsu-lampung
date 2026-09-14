export default async function handler(req, res) {
  // Izinkan CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const gasUrl = process.env.GAS_WEB_APP_URL;
  const gasToken = process.env.GAS_SECRET_TOKEN || "astra_daihatsu_2026";

  if (!gasUrl) {
    return res.status(500).json({ status: "error", message: "GAS_WEB_APP_URL belum diatur di Environment Variables Vercel" });
  }

  try {
    if (req.method === "GET") {
      const action = req.query.action || "";
      const fetchUrl = `${gasUrl}?action=${action}`;

      // PENTING: redirect follow agar menangani 302 Google Apps Script
      const response = await fetch(fetchUrl, {
        method: "GET",
        redirect: "follow"
      });

      const data = await response.json();
      return res.status(200).json(data);
    } 
    
    else if (req.method === "POST") {
      const bodyData = req.body || {};
      // Sisipkan token otentikasi secara otomatis
      bodyData.token = gasToken;

      const response = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // Hindari preflight OPTIONS di Apps Script
        body: JSON.stringify(bodyData),
        redirect: "follow"
      });

      const data = await response.json();
      return res.status(200).json(data);
    } 
    
    else {
      return res.status(405).json({ status: "error", message: "Method not allowed" });
    }
  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({ status: "error", message: error.toString() });
  }
}
