const axios = require("axios");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

async function generateReply(systemPrompt, userMessage) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await axios.post(
    url,
    {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    },
    { timeout: 30000 }
  );

  const candidate = response.data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).join("") || "";

  if (!text) {
    throw new Error("AI did not return a response.");
  }

  return text;
}

module.exports = { generateReply };