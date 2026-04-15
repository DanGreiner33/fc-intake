import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
app.use(express.json());

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
    const emailBody = `<h2>New Lead from FullCircle Intake Chatbot</h2>
<p><strong>Name:</strong> ${payload.name}</p>
<p><strong>Email:</strong> ${payload.email}</p>
<p><strong>Phone:</strong> ${payload.phone}</p>
<p><strong>Position:</strong> ${payload.position}</p>
<p><strong>Priority 1:</strong> ${payload.priority1}</p>
<p><strong>Priority 2:</strong> ${payload.priority2}</p>
<p><strong>Company:</strong> ${payload.companyName}</p>
<p><strong>Agreement Sent:</strong> ${payload.agreementSent ? "Yes" : "No"}</p>
<p><strong>Capture Point:</strong> ${payload.capturePoint}</p>
<p><strong>Timestamp:</strong> ${payload.timestamp}</p>
<hr>
<h3>Chat Transcript</h3>
<pre>${transcriptText}</pre>`;

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

  // TODO: Integrate DocuSign API here
  // - Use DocuSign Envelopes:create endpoint
  // - Populate template merge fields: Signer Name, Signer Title, Company Name, Signer Email, Role, Date
  // - Set up webhook for signed notification

  // For now, log and acknowledge
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
