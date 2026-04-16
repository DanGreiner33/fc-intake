import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================
// SYSTEM PROMPT FOR INTAKE CHATBOT
// ============================================
const SYSTEM_PROMPT = `You are the FullCircle Placements intake assistant. You help hiring managers find the right recruiter match by gathering key info through a short, friendly conversation.

Your personality: confident, warm, concise, and knowledgeable about recruiting. You sound like a sharp recruiter who's done this a thousand times. Keep responses to 1-3 sentences max. Never be wordy.

You must follow this exact intake flow. The frontend tracks which step you're on via a "step" field. You must respond with valid JSON matching the schema below.

INTAKE FLOW:
1. askRole: User tells you what position they need. Acknowledge it naturally. If it matches a specialty (Legal, Finance, Accounting, HR, Engineering, Project Management, Financial Services), mention that. Then immediately ask what matters most to them right now and include options.
2. askPrimary: User picks their #1 priority (cost, speed, or quality). Acknowledge their choice briefly, then ask what's second most important. You MUST include the remaining 2 options in the options array (exclude the one they just picked). This is required.
3. askSecondary: User picks their #2 priority. Just say something short like "Got it!" or "Thanks!" and immediately ask for their name and email. Do NOT give any analysis, commentary, or filler about their priority combo. Keep it to one short sentence.
4. askNameEmail: User provides name and email. Confirm you got it and ask for a phone number.
5. askPhone: User provides phone. Confirm everything, mention someone will be in touch shortly. Then offer to send over the standard recruiting agreement, with options "Yes, send it over" and "I'll wait until we talk first".
6. askAgreement: If yes, ask for company name (nextStep: askCompanyName). If no, wrap up warmly and set nextStep to "done".
7. askCompanyName: User gives company name. Ask who will be signing (full legal name and title).
8. askSignor: User gives signor info. Show a confirmation card with company, signor, and email. Offer options "Looks good \u2014 send it" and "Let me correct something".
9. confirmAgreement: If confirmed, say the agreement is on its way. If correcting, ask which field.
10. correcting: Handle corrections to company name, signor, or email.

RESPONSE FORMAT - You must respond with valid JSON:
{
  "message": "your response text",
  "options": ["option1", "option2"] or null,
  "nextStep": "the next step name",
  "extractedData": { any data you extracted from the user's message }
}

extractedData fields you should extract when available:
- position: the role they want to fill
- specialty: matched specialty category or null
- priority1: "cost", "speed", or "quality"
- priority2: "cost", "speed", or "quality"
- contactName: their name
- contactEmail: their email
- contactPhone: their phone
- companyName: company name
- signorName: signor's name
- signorTitle: signor's title

PRIORITY OPTIONS (use these exact labels):
- "Cost - market rate or below"
- "Speed - need someone ASAP"
- "Quality - best fit, even if it takes time"

IMPORTANT RULES:
- NEVER list the options in your message text. The options array will be rendered as clickable buttons by the frontend. Your message should only contain your conversational response, not a numbered or bulleted list of the options.
- Always respond with valid JSON only. No markdown, no extra text.
- Keep messages short and punchy. 1-3 sentences max.
- Never skip steps or combine multiple steps.
- The options array should contain clickable button labels when applicable, or null when free text is expected.
- For the askPrimary step, always include all 3 priority options.
- For the askSecondary step, you MUST include exactly 2 remaining options in the options array (exclude the one they picked as priority1). NEVER return null options for this step. - CRITICAL: For steps askRole, askPrimary, askSecondary, askAgreement, askSignor, and confirmAgreement, the options array must NEVER be null. Always provide clickable options for these steps.
- When extracting email, look for standard email patterns.
- When extracting phone, accept various formats.
- CRITICAL: When the user DECLINES the agreement at askAgreement step, you MUST set nextStep to "done". When the user CONFIRMS at confirmAgreement step, you MUST set nextStep to "done".
- If the user says something unexpected, gently guide them back to the current step.`;

// ============================================
// OPENAI CHAT ENDPOINT
// ============================================
app.post("/api/chat", async (req, res) => {
  const { messages, step, roleInfo } = req.body;

  try {
    const chatMessages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `Current step: ${step}. Current collected data: ${JSON.stringify(roleInfo || {})}` },
    ];

    // Convert frontend messages to OpenAI format
    if (messages && Array.isArray(messages)) {
      for (const m of messages) {
        chatMessages.push({
          role: m.from === "bot" ? "assistant" : "user",
          content: m.from === "bot" ? JSON.stringify({ message: m.text }) : m.text,
        });
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { message: "Sorry, let me try that again. Could you repeat that?", options: null, nextStep: step, extractedData: {} };
    }


            // Server-side deterministic step and options overrides
    const allPriorityOpts = ["Cost - market rate or below", "Speed - need someone ASAP", "Quality - best fit, even if it takes time"];
    const agreementOpts = ["Yes, send it over", "I'll wait until we talk first"];

    if (step === "askRole") {
      parsed.nextStep = "askPrimary";
      parsed.options = allPriorityOpts;
    } else if (step === "askPrimary") {
      parsed.nextStep = "askSecondary";
      const lastUserMsg = messages && messages.length > 0 ? messages[messages.length - 1].text.toLowerCase() : "";
      const picked = lastUserMsg.includes("cost") ? "cost" : lastUserMsg.includes("speed") ? "speed" : lastUserMsg.includes("quality") ? "quality" : "";
      parsed.options = allPriorityOpts.filter(o => !o.toLowerCase().startsWith(picked));
    } else if (step === "askSecondary") {
      parsed.nextStep = "askNameEmail";
      parsed.options = null;
    } else if (step === "askNameEmail") {
      parsed.nextStep = "askPhone";
      parsed.options = null;
    } else if (step === "askPhone") {
      parsed.nextStep = "askAgreement";
      parsed.options = agreementOpts;
    } else if (step === "askAgreement") {
      if (parsed.nextStep === "askCompanyName") {
        parsed.options = null;
      } else {
        parsed.nextStep = "done";
        parsed.options = null;
      }
    } else if (step === "askCompanyName") {
      parsed.nextStep = "askSignor";
      parsed.options = null;
    } else if (step === "askSignor") {
      parsed.nextStep = "confirmAgreement";
      if (!parsed.options || parsed.options.length === 0) {
        parsed.options = ["Looks good \u2014 send it", "Let me correct something"];
      }
    } else if (step === "confirmAgreement") {
      if (parsed.nextStep !== "correcting") {
        parsed.nextStep = "done";
      }
    }
    res.json({
      message: parsed.message || "Could you tell me more?",
      options: parsed.options || null,
      nextStep: parsed.nextStep || step,
      extractedData: parsed.extractedData || {},
    });
  } catch (err: any) {
    console.error("OpenAI error:", err?.message || err);
    res.status(500).json({ error: "AI service error", message: "Hmm, something went wrong on my end. Could you try that again?" });
  }
});

// ============================================
// LEAD CAPTURE API
// Sends lead data + transcript via WordPress REST API
// ============================================
app.post("/api/lead-capture", async (req, res) => {
  const { email, name, phone, capturePoint, roleContext, transcript } = req.body;

  console.log("Lead captured:", { name, email, phone, roleContext });

  let transcriptText = "";
  if (typeof transcript === "string") {
    transcriptText = transcript;
  } else if (transcript && Array.isArray(transcript)) {
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
    position: roleContext?.position || "",
    priority1: roleContext?.priority1 || "",
    priority2: roleContext?.priority2 || "",
    companyName: roleContext?.companyName || "",
    signorName: roleContext?.signorName || "",
    signorTitle: roleContext?.signorTitle || "",
    agreementSent: roleContext?.agreementSent || false,
    transcript: transcriptText,
    timestamp: new Date().toISOString(),
  };

  try {
    const emailBody = `<h2>New Lead from FullCircle Intake Chatbot</h2><p><strong>Name:</strong> ${payload.name}</p><p><strong>Email:</strong> ${payload.email}</p><p><strong>Phone:</strong> ${payload.phone}</p><p><strong>Position:</strong> ${payload.position}</p><p><strong>Priority 1:</strong> ${payload.priority1}</p><p><strong>Priority 2:</strong> ${payload.priority2}</p><p><strong>Company:</strong> ${payload.companyName}</p><p><strong>Agreement Sent:</strong> ${payload.agreementSent ? "Yes" : "No"}</p><p><strong>Capture Point:</strong> ${payload.capturePoint}</p><p><strong>Timestamp:</strong> ${payload.timestamp}</p><hr><h3>Chat Transcript</h3><pre>${transcriptText}</pre>`;
    const wpResponse = await fetch("https://fullcircleplacements.com/wp-json/chatbot/v1/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: "fcp_chatbot_2024_secret",
        to: "lsmith@fcplacements.com",
        subject: `New Intake Lead: ${payload.position} - ${payload.name}`,
        body: emailBody,
      }),
    });
    const wpData = await wpResponse.json();
    if (wpResponse.ok) {
      console.log("Email sent successfully via WordPress");
    } else {
      console.error("WordPress email error:", wpData);
    }
  } catch (err) {
    console.error("Email send error:", err);
  }

  res.json({ status: "captured" });
});

// ============================================
// SEND AGREEMENT API (DocuSign placeholder)
// ============================================
app.post("/api/send-agreement", async (req, res) => {
  const { companyName, signorName, signorTitle, signerEmail, position } = req.body;
  console.log("Agreement request:", { companyName, signorName, signorTitle, signerEmail, position });
  console.log("DocuSign integration pending - agreement data logged");
  res.json({ status: "agreement_queued", message: "DocuSign integration pending" });
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
