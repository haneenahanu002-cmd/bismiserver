const axios = require("axios");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

async function generateReply(systemPrompt, userMessage) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
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
      const error = new Error("AI did not return a response.");
      error.status = response.status;
      error.code = candidate?.finishReason || "NO_TEXT";
      throw error;
    }

    return text;
  } catch (error) {
    const status = error.response?.status;
    const code = error.response?.data?.error?.code || error.code;
    const message = error.response?.data?.error?.message || error.message;
    console.error("Gemini AI error:", {
      status,
      code,
      message,
    });
    const wrapped = new Error(message);
    wrapped.status = status;
    wrapped.code = code;
    throw wrapped;
  }
}

module.exports = { generateReply };