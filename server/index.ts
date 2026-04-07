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
// Proxies to OpenAI for intelligent responses
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
- Contact name and email address
- Company name
- Job title and role description
- Location and work model (onsite, remote, hybrid)
- Salary range or budget
- Key skills, certifications, or experience required
- Timeline / urgency of the hire
- Phone number (optional)
- Hiring plan (INTERNAL - never show classification labels to the user): Based on the conversation, internally classify the employer as one of: URGENTLY_HIRING, OPEN_FLEXIBLE, or BEST_FIT. Ask a natural question like "Are you looking to fill this as quickly as possible, or would you prefer to wait for the perfect fit?" to determine this. IMPORTANT: Never mention the classification labels (URGENTLY_HIRING, OPEN_FLEXIBLE, BEST_FIT) to the user. Instead respond naturally, for example: "Great, we will focus on finding the best fit for this role" or "Got it, we will prioritize speed and get candidates in front of you quickly."

Rules:
- IMPORTANT: Before asking for any piece of information, carefully review what the user has ALREADY provided in their previous messages. If the user included details like job title, location, salary, experience, company name, or any other required field in an earlier message, acknowledge that information and do NOT ask for it again. Only ask about the specific pieces of information that are still missing.
- Ask only ONE question at a time. Do not ask multiple questions in one message.
- Keep responses concise (1-2 sentences max).
- Be friendly and professional, but stay focused on collecting data.
- Do NOT offer opinions, advice, or market insights.
- Do NOT suggest salary ranges or comment on whether their budget is competitive.
- If the visitor is not hiring or is a job seeker, politely redirect them to the careers page.
- Once you have collected all the required info, summarize what you heard and let them know your team will follow up. Always end your final thank you message with the exact sentence: "You will be redirected to our website."
- Never make up data or stats. If you do not know something, say so.

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

    res.json({
      reply: data.choices[0].message.content,
      usage: data.usage,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// MARKET DATA API
// LinkedIn Talent Insights / BLS fallback
// ============================================
app.post("/api/market-data", async (req, res) => {
  const { roleTitle, location, yearsExperience, salaryRange } = req.body;

  // LinkedIn Talent Insights API (requires LinkedIn Marketing Developer Platform access)
  const linkedinToken = process.env.LINKEDIN_ACCESS_TOKEN;

  if (linkedinToken) {
    try {
      // LinkedIn Talent Insights - Labor Market query
      const searchResp = await fetch(
        "https://api.linkedin.com/v2/talentInsightsReports",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${linkedinToken}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify({
            reportType: "TALENT_POOL",
            facets: {
              currentTitles: [roleTitle],
              geoRegions: [location],
            },
          }),
        }
      );

      if (searchResp.ok) {
        const linkedinData = await searchResp.json();
        return res.json({
          source: "linkedin",
          data: linkedinData,
          jobCount: linkedinData.talentPoolSize || null,
          candidateCount: linkedinData.hiringDemand || null,
        });
      }
    } catch (err) {
      console.error("LinkedIn API error, falling back:", err);
    }
  }

  // Fallback: use GPT to generate market intelligence estimate
  const gptKey = process.env.OPENAI_API_KEY;
  if (gptKey) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${gptKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a labor market analyst. Return JSON only, no markdown. Estimate realistic numbers based on current US labor market conditions.",
            },
            {
              role: "user",
              content: `Estimate the labor market for: ${roleTitle} in ${location}. Experience: ${yearsExperience || "any"} years. Salary: ${salaryRange || "market rate"}. Return JSON: { "jobCount": number, "candidateCount": number, "difficulty": "easy"|"competitive"|"hard", "avgSalary": number, "salaryRange": { "low": number, "high": number }, "demandTrend": "rising"|"stable"|"declining", "timeToFill": number, "topCompetitors": [string], "topSkills": [string] }`,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      const gptData = await resp.json();
      const content = gptData.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content.replace(/```json\n?|```/g, "").trim());

      return res.json({
        source: "gpt-estimate",
        data: parsed,
        jobCount: parsed.jobCount,
        candidateCount: parsed.candidateCount,
        difficulty: parsed.difficulty,
        avgSalary: parsed.avgSalary,
        salaryRange: parsed.salaryRange,
        demandTrend: parsed.demandTrend,
        timeToFill: parsed.timeToFill,
        topCompetitors: parsed.topCompetitors,
        topSkills: parsed.topSkills,
      });
    } catch (err) {
      console.error("GPT market data error:", err);
    }
  }

  // Hard fallback: static estimates
  res.json({
    source: "static",
    jobCount: 42,
    candidateCount: 18,
    difficulty: "competitive",
    avgSalary: 75000,
    salaryRange: { low: 60000, high: 95000 },
    demandTrend: "rising",
    timeToFill: 45,
    topCompetitors: [],
    topSkills: [],
  });
});

// ============================================
// DOCUSIGN API
// Generates and sends agreements
// ============================================
app.post("/api/docusign", async (req, res) => {
  const { companyName, contactEmail, contactName, feePercent, roleSummary } = req.body;
  const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const templateId = process.env.DOCUSIGN_TEMPLATE_ID;
  const baseUrl = process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi";

  if (!accessToken || !accountId) {
    // Store the request for manual follow-up if DocuSign isn't configured
    console.log("DocuSign not configured. Agreement request:", {
      companyName, contactEmail, contactName, feePercent, roleSummary,
    });
    return res.json({
      status: "queued",
      message: "Agreement request recorded. A team member will send the DocuSign shortly.",
    });
  }

  try {
    const envelopeBody: any = {
      status: "sent",
      emailSubject: `FullCircle Placement Partners - Search Agreement for ${companyName}`,
      emailBlurb: `Hi ${contactName}, please review and sign the attached search agreement for your ${roleSummary?.roleTitle || "open"} position.`,
      recipients: {
        signers: [
          {
            email: contactEmail,
            name: contactName,
            recipientId: "1",
            routingOrder: "1",
            tabs: {
              textTabs: [
                { tabLabel: "company_name", value: companyName },
                { tabLabel: "fee_percent", value: String(feePercent) },
                { tabLabel: "role_title", value: roleSummary?.roleTitle || "" },
                { tabLabel: "salary_range", value: roleSummary?.salaryRange || "" },
              ],
            },
          },
        ],
      },
    };

    if (templateId) {
      envelopeBody.templateId = templateId;
      envelopeBody.templateRoles = envelopeBody.recipients.signers.map((s: any) => ({
        ...s,
        roleName: "Client",
      }));
      delete envelopeBody.recipients;
    }

    const dsResp = await fetch(
      `${baseUrl}/v2.1/accounts/${accountId}/envelopes`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(envelopeBody),
      }
    );

    const dsData = await dsResp.json();
    if (!dsResp.ok) {
      return res.status(dsResp.status).json({ error: dsData.message || "DocuSign API error" });
    }

    res.json({
      status: "sent",
      envelopeId: dsData.envelopeId,
      message: `DocuSign sent to ${contactEmail}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// LEAD MAGNET / EMAIL CAPTURE API
// Captures contact info + sends value at drop-off
// ============================================
app.post("/api/lead-capture", async (req, res) => {
  const { email, name, phone, roleContext, capturePoint, sessionData } = req.body;

  // Log lead for CRM integration
  const lead = {
    email,
    name: name || "",
    phone: phone || "",
    capturePoint, // e.g. "market_snapshot", "salary_guide", "fee_walkaway", "inactivity"
    roleContext,
    sessionData,
    timestamp: new Date().toISOString(),
  };

  console.log("LEAD CAPTURED:", JSON.stringify(lead, null, 2));

  // Determine what value to deliver based on capture point
  let deliverable = "";
  let deliverableType = "";

  switch (capturePoint) {
    case "market_snapshot":
      deliverable = "Full market intelligence report for your role";
      deliverableType = "market_report";
      break;
    case "salary_guide":
      deliverable = "Salary benchmarking guide for your industry";
      deliverableType = "salary_guide";
      break;
    case "fee_walkaway":
      deliverable = "Market snapshot + competitor analysis";
      deliverableType = "competitor_report";
      break;
    case "inactivity":
      deliverable = "Everything we gathered so far about your search";
      deliverableType = "session_summary";
      break;
    default:
      deliverable = "Personalized market insights";
      deliverableType = "general";
  }

  // If SendGrid or email service is configured, send the lead magnet
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey && email) {
    try {
      await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: {
            email: process.env.FROM_EMAIL || "intel@fullcircleplacement.com",
            name: "FullCircle Talent Intelligence",
          },
          subject: `Your ${deliverable} is ready`,
          content: [
            {
              type: "text/html",
              value: `<h2>Here's what we found for your search</h2>
<p>Hi ${name || "there"},</p>
<p>Based on our conversation, here's your ${deliverable}.</p>
<h3>Market Snapshot</h3>
<ul>
  <li>Role: ${roleContext?.rawDescription || "N/A"}</li>
  <li>Experience: ${roleContext?.yearsExperience || "N/A"} years</li>
  <li>Salary Range: ${roleContext?.salaryRange || "N/A"}</li>
  <li>Active Jobs: ${roleContext?.marketJobs || "N/A"}</li>
  <li>Available Candidates: ${roleContext?.marketCandidates || "N/A"}</li>
  <li>Difficulty: ${roleContext?.marketDifficulty || "N/A"}</li>
</ul>
<p>Want to continue the conversation? <a href="https://fc-intake-production.up.railway.app">Pick up where you left off</a> or call us directly.</p>
<p>Taylor Hassell<br>FullCircle Placement Partners</p>`,
            },
          ],
        }),
      });
    } catch (err) {
      console.error("SendGrid error:", err);
    }
  }

  // Notify internal team via webhook (n8n, Zapier, etc.)
  const webhookUrl = process.env.LEAD_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
    } catch (err) {
      console.error("Webhook error:", err);
    }
  }

  res.json({
    status: "captured",
    deliverable,
    deliverableType,
    message: email
      ? `We'll send your ${deliverable} to ${email} shortly.`
      : "Got it. A team member will follow up.",
  });
});

// ============================================
// SESSION TRACKING API
// Stores session state for resume/follow-up
// ============================================
app.post("/api/session", async (req, res) => {
  const { sessionId, roleInfo, currentStep, messages } = req.body;
  // In production, store in DB. For now, log it.
  console.log("SESSION SAVE:", sessionId, currentStep);
  res.json({ status: "saved", sessionId });
});

app.get("/api/session/:id", async (req, res) => {
  // In production, fetch from DB
  res.json({ status: "not_found" });
});

// ============================================
// HEALTH CHECK
// ============================================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    integrations: {
      openai: !!process.env.OPENAI_API_KEY,
      docusign: !!process.env.DOCUSIGN_ACCESS_TOKEN,
      linkedin: !!process.env.LINKEDIN_ACCESS_TOKEN,
      sendgrid: !!process.env.SENDGRID_API_KEY,
      webhook: !!process.env.LEAD_WEBHOOK_URL,
    },
  });
});

// ============================================
// SERVE FRONTEND (Vite build)
// ============================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "..", "dist");

app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FullCircle API running on port ${PORT}`);
  console.log("Integrations:", {
    openai: !!process.env.OPENAI_API_KEY,
    docusign: !!process.env.DOCUSIGN_ACCESS_TOKEN,
    linkedin: !!process.env.LINKEDIN_ACCESS_TOKEN,
    sendgrid: !!process.env.SENDGRID_API_KEY,
  });
});
