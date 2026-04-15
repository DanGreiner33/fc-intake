import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
app.use(express.json());

// ============================================
// GPT CONVERSATION API
// ============================================
app.post("/api/gpt", async (req, res) => {
  const { messages, roleContext } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  try {
    const systemPrompt = `You are the FullCircle Placements intake assistant. Your only job is to collect information from employers about their hiring needs. Do NOT give hiring advice, salary recommendations, or recruiting tips.
You must collect the following information during the conversation:
- Company name
- Job title
- Contact name and email address
- Phone number (optional)
- Hiring plan (INTERNAL - never show classification labels to the user)
CONVERSATION FLOW:
1. First, greet the employer and ask what role they are looking to fill.
2. As soon as the user mentions a job title or role, immediately pivot to asking about their hiring urgency.
3. After the hiring plan, collect their contact info: name, email, and optionally phone number.
4. Once you have all the required info, summarize what you heard and let them know your team will follow up.
Rules:
- Ask only ONE question at a time.
- Keep responses concise (1-2 sentences max).
- Be friendly and professional, but stay focused on collecting data.
- Do NOT offer opinions, advice, or market insights.
- If the visitor is not hiring or is a job seeker, politely redirect them to the careers page.
Current context about the role being discussed:
${JSON.stringify(roleContext, null, 2)}
Remember: You are collecting data, not giving advice. Stay on task.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "OpenAI API error" });
    }
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error("GPT API error:", err);
    res.status(500).json({ error: "Failed to get response from GPT" });
  }
});

// ============================================
// LEAD CAPTURE API
// Sends lead data + transcript to webhook
// ============================================
app.post("/api/lead-capture", async (req, res) => {
  const { email, name, phone, capturePoint, roleContext, transcript } = req.body;
  const webhookUrl = process.env.LEAD_WEBHOOK_URL;

  console.log("Lead captured:", { name, email, phone, roleContext });

  // Build transcript text from messages array
  let transcriptText = "";
  if (transcript && Array.isArray(transcript)) {
    transcriptText = transcript
      .map((m: { from: string; text: string }) => `${m.from === "bot" ? "Bot" : "User"}: ${m.text}`)
      .join("\n");
  }

  const payload = {
    name: name || "Unknown",
    email: email || "",
    phone: phone || "",
    notifyEmail: "lsmith@fcplacements.com",
    capturePoint: capturePoint || "intake_complete",
    role: roleContext?.rawDescription || "",
    primaryPriority: roleContext?.primaryPriority || "",
    secondaryPriority: roleContext?.secondaryPriority || "",
    transcript: transcriptText,
    timestamp: new Date().toISOString(),
  };

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("Webhook sent successfully");
    } catch (err) {
      console.error("Webhook error:", err);
    }
  } else {
    console.warn("No LEAD_WEBHOOK_URL configured - lead data logged only");
  }

  res.json({ status: "captured" });
});

// ============================================
// SERVE FRONTEND (Vite build output)
// ============================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../dist")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
