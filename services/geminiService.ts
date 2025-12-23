import { GoogleGenAI, Type } from "@google/genai";

export const analyzeTextMood = async (text: string) => {
  try {
    // Initialize GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date API key.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the mood of this text and suggest a color theme (hex), font style (serif/sans/mono), and a brief visual prompt for a background image/video. Return JSON.
      
      Text: "${text.substring(0, 1000)}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mood: { type: Type.STRING },
            colorTheme: { type: Type.STRING },
            fontStyle: { type: Type.STRING, enum: ["serif", "sans", "mono"] },
            visualPrompt: { type: Type.STRING },
            suggestedAnimation: { type: Type.STRING, enum: ["fade-in", "type-in", "gradient-in", "slide-up", "blur-in", "zoom-in"] }
          },
          required: ["mood", "colorTheme", "fontStyle", "visualPrompt", "suggestedAnimation"]
        }
      }
    });

    // The text property of the response directly returns the generated content as a string.
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return null;
  }
};