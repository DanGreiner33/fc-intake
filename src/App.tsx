import React, { useState, useEffect, FormEvent, useRef } from "react";
import "./App.css";

const API_BASE = window.location.origin;

type RoleInfo = {
  position?: string;
  priority1?: "cost" | "speed" | "quality";
  priority2?: "cost" | "speed" | "quality";
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyName?: string;
  signorName?: string;
  signorTitle?: string;
  agreementSent?: boolean;
};

type Message = {
  id: number;
  from: "bot" | "user";
  text: string;
  options?: string[];
  optionsDisabled?: boolean;
  isCard?: boolean;
};

type Step =
  | "askRole"
  | "validateRole"
  | "askPrimary"
  | "askSecondary"
  | "smartSummary"
  | "askNameEmail"
  | "askPhone"
  | "askAgreement"
  | "askCompanyName"
  | "askSignor"
  | "confirmAgreement"
  | "correcting"
  | "done";

const PRIORITY_OPTIONS: { key: "cost" | "speed" | "quality"; label: string; desc: string }[] = [
  { key: "cost", label: "Cost", desc: "Cost - market rate or below" },
  { key: "speed", label: "Speed", desc: "Speed - need someone ASAP" },
  { key: "quality", label: "Quality", desc: "Quality - best fit, even if it takes time" },
];

const SPECIALTY_MAP: Record<string, string> = {
  attorney: "Legal", lawyer: "Legal", paralegal: "Legal", counsel: "Legal",
  cfo: "Finance", controller: "Finance", accountant: "Accounting", bookkeeper: "Accounting", cpa: "Accounting",
  hr: "HR", recruiter: "HR", "human resources": "HR", "talent acquisition": "HR",
  engineer: "Engineering", developer: "Engineering", architect: "Engineering",
  "project manager": "Project Management", pm: "Project Management",
  analyst: "Financial Services", banker: "Financial Services", advisor: "Financial Services",
};

const getSpecialty = (role: string): string | null => {
  const lower = role.toLowerCase();
  for (const [keyword, specialty] of Object.entries(SPECIALTY_MAP)) {
    if (lower.includes(keyword)) return specialty;
  }
  return null;
};

const SMART_SUMMARIES: Record<string, string> = {
  "cost-speed": "You want to move fast and stay on budget. We focus on passive candidates \u2014 keeps comp in range and avoids the slow posting-and-waiting cycle. Totally doable.",
  "cost-quality": "You want the right person without overpaying \u2014 that\u2019s the sweet spot we work in. We don\u2019t send warm bodies from a job board. Might take a few extra weeks, but you\u2019ll get a strong candidate at a fair price.",
  "speed-cost": "ASAP hire at a reasonable rate \u2014 we can do that. We\u2019ll hit the ground running with candidates already in our network. You might not get every box checked, but you\u2019ll have someone solid in front of you quickly.",
  "speed-quality": "You want someone great, and you want them now. Expect strong candidates fast \u2014 be ready to move when you see a good one. Budget flexibility helps here.",
  "quality-cost": "You\u2019re prioritizing the right hire over speed and want to be smart about comp. Typically a 4\u20136 week process, but you\u2019ll see candidates you\u2019re actually excited about.",
  "quality-speed": "Best person possible, sooner rather than later \u2014 that\u2019s a full-court press. We go deep on sourcing and move fast on vetting. Budget should reflect top of market.",
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>("askRole");
  const [roleInfo, setRoleInfo] = useState<RoleInfo>({});
  const [nextMessageId, setNextMessageId] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

  const callAPI = async (endpoint: string, body: any) => {
    try {
      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await resp.json();
    } catch (err) {
      console.error(`API call to ${endpoint} failed:`, err);
      return null;
    }
  };

  const addBotMessage = (text: string | string[], options?: string[], isCard?: boolean) => {
    const texts = Array.isArray(text) ? text : [text];
    setMessages((prev) => {
      const updated = prev.map((m) => m.options ? { ...m, optionsDisabled: true } : m);
      texts.forEach((t, i) => {
        updated.push({
          id: nextMessageId + updated.length,
          from: "bot",
          text: t,
          options: i === texts.length - 1 ? options : undefined,
          optionsDisabled: false,
          isCard: i === texts.length - 1 ? isCard : false,
        });
      });
      return updated;
    });
    setNextMessageId((id) => id + (Array.isArray(text) ? text.length : 1));
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => {
      const updated = prev.map((m) => m.options ? { ...m, optionsDisabled: true } : m);
      updated.push({ id: nextMessageId, from: "user", text });
      return updated;
    });
    setNextMessageId((id) => id + 1);
  };

  useEffect(() => {
    if (step === "askRole" && messages.length === 0) {
      addBotMessage("Hey! What position are you looking to fill?");
    }
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleUserInput(input.trim());
    setInput("");
  };

  const handleOptionClick = (option: string) => {
    handleUserInput(option);
  };

  const getRemainingOptions = (selected: "cost" | "speed" | "quality") => {
    return PRIORITY_OPTIONS.filter((p) => p.key !== selected);
  };

  const matchPriority = (text: string): "cost" | "speed" | "quality" | null => {
    const lower = text.toLowerCase();
    if (lower.includes("cost") || lower.includes("market") || lower.includes("budget")) return "cost";
    if (lower.includes("speed") || lower.includes("asap") || lower.includes("fast")) return "speed";
    if (lower.includes("quality") || lower.includes("best fit") || lower.includes("even if")) return "quality";
    return null;
  };

  const sendLeadEmail = async (info: RoleInfo, chatTranscript: string) => {
    await callAPI("/api/lead-capture", {
      email: info.contactEmail,
      name: info.contactName,
      phone: info.contactPhone,
      capturePoint: info.agreementSent ? "agreement_sent" : "intake_complete",
      roleContext: info,
      transcript: chatTranscript,
    });
  };

  const buildConfirmationText = (info: RoleInfo): string => {
    return `Company: ${info.companyName || ""}
Signor: ${info.signorName || ""}, ${info.signorTitle || ""}
Sending to: ${info.contactEmail || ""}`;
  };

  const getTranscript = (extraMsg?: { from: string; text: string }) => {
    const allMsgs = extraMsg ? [...messages, extraMsg] : messages;
    return allMsgs.map((m: any) => `${m.from === "bot" ? "Bot" : "User"}: ${m.text}`).join("\n");
  };

  const handleUserInput = async (text: string) => {
    addUserMessage(text);
    setIsLoading(true);

    switch (step) {
      case "askRole": {
        const position = text;
        setRoleInfo((prev) => ({ ...prev, position }));
        const specialty = getSpecialty(position);
        let response: string;
        if (specialty) {
          response = `Nice \u2014 ${specialty.toLowerCase()} placements are one of our specialties. Before I put together a game plan for you, I have two quick questions. Ready?`;
        } else {
          response = `Got it \u2014 we\u2019ve placed ${position} roles across a lot of different industries. Before I put together a game plan for you, I have two quick questions. Ready?`;
        }
        addBotMessage(response);
        setStep("validateRole");
        break;
      }

      case "validateRole": {
        addBotMessage(
          "When it comes to hiring, what matters most to you right now?",
          [
            "Cost - market rate or below",
            "Speed - need someone ASAP",
            "Quality - best fit, even if it takes time",
          ]
        );
        setStep("askPrimary");
        break;
      }

      case "askPrimary": {
        const primary = matchPriority(text);
        if (!primary) {
          addBotMessage(
            "No worries \u2014 just pick one of these:",
            [
              "Cost - market rate or below",
              "Speed - need someone ASAP",
              "Quality - best fit, even if it takes time",
            ]
          );
          setIsLoading(false);
          return;
        }
        setRoleInfo((prev) => ({ ...prev, priority1: primary }));
        const remaining = getRemainingOptions(primary);
        addBotMessage(
          "And if you had to pick a second priority, what would it be?",
          remaining.map((r) => r.desc)
        );
        setStep("askSecondary");
        break;
      }

      case "askSecondary": {
        const secondary = matchPriority(text);
        const primary = roleInfo.priority1;
        if (!secondary || secondary === primary) {
          const remaining = getRemainingOptions(primary!);
          addBotMessage(
            "Just pick one of these two:",
            remaining.map((r) => r.desc)
          );
          setIsLoading(false);
          return;
        }
        setRoleInfo((prev) => ({ ...prev, priority2: secondary }));
        const summaryKey = `${primary}-${secondary}`;
        const summary = SMART_SUMMARIES[summaryKey] || "";
        addBotMessage([
          summary,
          "What\u2019s the best name and email to reach you at? We\u2019ll have someone from our team follow up \u2014 usually within a few hours."
        ]);
        setStep("askNameEmail");
        break;
      }

      case "askNameEmail": {
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : "";
        const nameText = text.replace(email, "").replace(/[,;]/g, " ").trim();
        if (!email) {
          addBotMessage("I just need your name and email \u2014 you can type them both here.");
          setIsLoading(false);
          return;
        }
        setRoleInfo((prev) => ({ ...prev, contactName: nameText || "Friend", contactEmail: email }));
        addBotMessage(`And a good phone number?`);
        setStep("askPhone");
        break;
      }

      case "askPhone": {
        const phoneClean = text.replace(/[^0-9+()\-\s]/g, "").trim();
        if (phoneClean.length < 7) {
          addBotMessage("That doesn\u2019t look like a phone number \u2014 mind trying again?");
          setIsLoading(false);
          return;
        }
        const updatedInfo = { ...roleInfo, contactPhone: phoneClean };
        setRoleInfo(updatedInfo);
        const transcript = getTranscript({ from: "user", text });
        await sendLeadEmail(updatedInfo, transcript);
        const firstName = (updatedInfo.contactName || "there").split(" ")[0];
        addBotMessage(
          `You\u2019re all set, ${firstName} \u2014 someone from our team will be in touch shortly. One more thing while you wait \u2014 would you like us to send over our standard recruiting agreement? It\u2019s straightforward, and having it signed upfront means we can hit the ground running the moment we connect.`,
          ["Yes, send it over", "I'll wait until we talk first"]
        );
        setStep("askAgreement");
        break;
      }

      case "askAgreement": {
        const lower = text.toLowerCase();
        if (lower.includes("yes") || lower.includes("send it")) {
          addBotMessage("Quick \u2014 just need a couple details for the agreement. What\u2019s your company name?");
          setStep("askCompanyName");
        } else {
          addBotMessage("No problem at all \u2014 your team will walk you through everything on the call. Talk soon!");
          setStep("done");
          setTimeout(() => {
            if (window.parent !== window) {
              window.parent.postMessage("fc-chat-done", "*");
            }
          }, 2500);
        }
        break;
      }

      case "askCompanyName": {
        setRoleInfo((prev) => ({ ...prev, companyName: text }));
        addBotMessage("And who will be signing? I just need their full legal name and title \u2014 for example, Jane Smith, Managing Partner.");
        setStep("askSignor");
        break;
      }

      case "askSignor": {
        const parts = text.split(",").map((s) => s.trim());
        const signorName = parts[0] || text;
        const signorTitle = parts[1] || "";
        const updated = { ...roleInfo, signorName, signorTitle };
        setRoleInfo(updated);
        addBotMessage(
          `Got it \u2014 just want to make sure everything looks right before I send it over:\n\n\u2022 Company: ${updated.companyName}\n\u2022 Signor: ${signorName}, ${signorTitle}\n\u2022 Sending to: ${updated.contactEmail}`,
          ["Looks good \u2014 send it", "Let me correct something"]
        );
        setStep("confirmAgreement");
        break;
      }

      case "confirmAgreement": {
        const lower = text.toLowerCase();
        if (lower.includes("looks good") || lower.includes("send it")) {
          const updated = { ...roleInfo, agreementSent: true };
          setRoleInfo(updated);
          const transcript = getTranscript({ from: "user", text });
          await callAPI("/api/send-agreement", {
            companyName: updated.companyName,
            signorName: updated.signorName,
            signorTitle: updated.signorTitle,
            signerEmail: updated.contactEmail,
            position: updated.position,
          });
          await sendLeadEmail(updated, transcript);
          addBotMessage(`Done \u2014 the agreement is on its way to ${updated.contactEmail}. Should be in your inbox within a minute or two. Once it\u2019s signed, our team will be ready to hit the ground running. Talk soon!`);
          setStep("done");
          setTimeout(() => {
            if (window.parent !== window) {
              window.parent.postMessage("fc-chat-done", "*");
            }
          }, 2500);
        } else if (lower.includes("correct")) {
          addBotMessage("No problem! Which field needs updating?", ["Company name", "Signor name/title", "Email"]);
          setStep("correcting");
        } else {
          addBotMessage("Just tap one of the options above.", ["Looks good \u2014 send it", "Let me correct something"]);
        }
        break;
      }

      case "correcting": {
        const lower = text.toLowerCase();
        if (lower.includes("company")) {
          addBotMessage("What\u2019s the correct company name?");
          setStep("askCompanyName");
        } else if (lower.includes("signor") || lower.includes("name") || lower.includes("title")) {
          addBotMessage("What\u2019s the correct name and title? (e.g. Jane Smith, Managing Partner)");
          setStep("askSignor");
        } else if (lower.includes("email")) {
          addBotMessage("What\u2019s the correct email address?");
          setStep("askNameEmail");
        } else {
          addBotMessage("Which field needs updating?", ["Company name", "Signor name/title", "Email"]);
        }
        break;
      }

      default:
        break;
    }
    setIsLoading(false);
  };

  return (
    <div className="app">
      <div className="header">
        <span className="logo">FULLCIRCLE /</span>{" "}
        <span className="logo-sub">TALENT INTELLIGENCE</span>
      </div>

      <div className="chat-container">
        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.from}`}>
              <div className="bubble">{m.text}</div>
              {m.from === "bot" && m.options && (
                <div className="options">
                  {m.options.map((opt) => (
                    <button
                      key={opt}
                      className={`option-btn${m.optionsDisabled ? " disabled" : ""}`}
                      disabled={m.optionsDisabled}
                      onClick={() => !m.optionsDisabled && handleOptionClick(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="msg bot">
              <div className="bubble thinking">Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="input-area" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Type your response..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit">{String.fromCharCode(0x21b5)}</button>
        </form>
        <div className="subtitle">No forms. Just describe what you need.</div>
      </div>
    </div>
  );
};

export default App;
