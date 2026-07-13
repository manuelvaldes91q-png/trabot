const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');

const newEndpoint = `
app.post('/api/ai/twitter-analysis', adminAuth, async (req, res) => {
  const { mint } = req.body;
  if (!mint) return res.status(400).json({ error: 'Missing mint address' });

  const twitterBearerToken = appConfig.twitterBearerToken;
  if (!twitterBearerToken) {
    return res.json({ available: false, error: 'Twitter Bearer Token no configurado en los ajustes.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ available: false, error: 'La API de Gemini no está configurada en el servidor (faltante GEMINI_API_KEY en variables de entorno).' });
  }

  try {
    const url = \`https://api.twitter.com/2/tweets/search/recent?query=\${encodeURIComponent(mint)}&max_results=15\`;
    const twRes = await fetch(url, {
      headers: {
        'Authorization': \`Bearer \${twitterBearerToken}\`
      }
    });
    
    if (!twRes.ok) {
      const errTxt = await twRes.text();
      throw new Error(\`Error de Twitter API: \${twRes.status} - \${errTxt}\`);
    }

    const twData = await twRes.json();
    
    if (!twData.data || twData.data.length === 0) {
      return res.json({ available: true, analysis: "No se encontraron tweets recientes para este contrato en la búsqueda.", status: "Neutral", tweetsCount: 0 });
    }

    const tweets = twData.data.map(t => t.text).join("\\n\\n---\\n\\n");

    const { GoogleGenAI } = require("@google/genai");
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = \`Analiza los siguientes tweets recientes sobre el token con contrato: \${mint}.
Indica si el sentimiento general de la comunidad en base a estos mensajes es Bullish, Scam (estafa/peligro), o Neutral.
Proporciona un breve resumen estructurado de lo que menciona la gente (máximo 80 palabras).

Tweets recopilados:
\${tweets}\`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Eres un analista experto en criptomonedas de riesgo y memecoins. Responde siempre en español con un tono profesional y objetivo.",
      },
    });

    res.json({ available: true, analysis: response.text, tweetsCount: twData.data.length });
  } catch (e) {
    console.error("[Twitter Analysis Error]", e);
    res.json({ available: false, error: e.message });
  }
});
`;

const targetStr = "app.post('/api/config/test_telegram', adminAuth, async (req, res) => {";
if (content.includes(targetStr)) {
  const updated = content.replace(targetStr, newEndpoint + '\n' + targetStr);
  fs.writeFileSync('server.js', updated);
  console.log('Success');
} else {
  console.log('Could not find target');
}
