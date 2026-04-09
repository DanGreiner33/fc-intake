import React, { useState, useEffect, FormEvent, useRef } from "react";
import "./App.css";

const API_BASE = window.location.origin;

type RoleInfo = {
  rawDescription?: string;
  yearsExperience?: string;
  salaryRange?: string;
  nonNegotiables?: string;
  marketJobs?: number;
  marketCandidates?: number;
  marketDifficulty?: "easy" | "competitive" | "hard";
  avgSalary?: number;
  demandTrend?: string;
  timeToFill?: number;
  topCompetitors?: string[];
  topSkills?: string[];
  primaryPriority?: "speed" | "quality" | "salary";
  secondaryPriority?: "speed" | "quality" | "salary";
  aboveMarketOk?: boolean | null;
  feeAccepted?: 25 | 18 | null;
  companyName?: string;
  contactEmail?: string;
  contactName?: string;
  nextStep?: "docusign" | "call" | null;
};

type Message = {
  id: number;
  from: "bot" | "user";
  text: string;
  options?: string[];
};

type Step =
  | "intro"
  | "askRoleDetail"
  | "askYears"
  | "askSalary"
  | "askNonNeg"
  | "showMarket"
  | "askPrimaryPriority"
  | "askSecondaryPriority"
  | "aboveMarketCheck"
  | "competitorFee25"
  | "competitorFee18"
  | "noFit"
  | "summary"
  | "confirmSend"
  | "askCompany"
  | "askEmail"
  | "askContactName"
  | "finalChoice"
  | "done";

type GptMessage = { role: "system" | "user" | "assistant"; content: string };

// Lead Magnet Modal Component
const LeadModal: React.FC<{
  show: boolean;
  headline: string;
  description: string;
  onSubmit: (email: string, name: string) => void;
  onDismiss: () => void;
}> = ({ show, headline, description, onSubmit, onDismiss }) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  if (!show) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>{headline}</h3>
        <p>{description}</p>
        <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="modal-input" />
        <input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} className="modal-input" />
        <button onClick={() => { if (email) onSubmit(email, name); }} className="modal-btn primary">Send me the report</button>
        <button onClick={onDismiss} className="modal-btn secondary">No thanks</button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>("intro");
  const [roleInfo, setRoleInfo] = useState<RoleInfo>({});
  const [nextMessageId, setNextMessageId] = useState(1);
  const [pendingOptions, setPendingOptions] = useState<string[] | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadModalConfig, setLeadModalConfig] = useState({ headline: "", description: "", capturePoint: "" });
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [gptHistory, setGptHistory] = useState<GptMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  // Inactivity timer
  useEffect(() => {
    if (emailCaptured || step === "done" || step === "intro") return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      if (!emailCaptured && step !== "done" && step !== "intro") {
        setLeadModalConfig({ capturePoint: "inactivity", headline: "Want us to save your progress?", description: "We'll email you everything we've gathered so far, so you can pick up right where you left off." });
        setShowLeadModal(true);
      }
    }, 90000);
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
  }, [lastActivity, emailCaptured, step]);

  // API helpers
  const callAPI = async (endpoint: string, body: any) => {
    try {
      const resp = await fetch(`${API_BASE}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return await resp.json();
    } catch (err) { console.error(`API call to ${endpoint} failed:`, err); return null; }
  };

  // GPT-powered response generator
  const getGptResponse = async (userText: string, contextInstruction: string, history: GptMessage[]): Promise<string> => {
    const newHistory: GptMessage[] = [...history, { role: "user", content: userText }];
    try {
      const resp = await callAPI("/api/gpt", { messages: newHistory, roleContext: contextInstruction });
      const reply = resp?.reply || resp?.choices?.[0]?.message?.content || "Let me think about that...";
      setGptHistory([...newHistory, { role: "assistant", content: reply }]);
      return reply;
    } catch {
      return "Let me think about that...";
    }
  };

  const captureLeadAndDeliver = async (email: string, name: string, capturePoint: string) => {
    setEmailCaptured(true);
    setShowLeadModal(false);
    await callAPI("/api/lead-capture", { email, name, capturePoint, roleContext: roleInfo });
    addBotMessage(`Got it, ${name || "friend"}. We'll send your personalized market intelligence to ${email}.`);
  };

  const fetchMarketData = async (roleTitle: string, location: string) => {
    return await callAPI("/api/market-data", { roleTitle, location: location || "United States", yearsExperience: roleInfo.yearsExperience, salaryRange: roleInfo.salaryRange });
  };

  const sendDocuSign = async () => {
    return await callAPI("/api/docusign", { companyName: roleInfo.companyName, contactEmail: roleInfo.contactEmail, contactName: roleInfo.contactName, feePercent: roleInfo.feeAccepted, roleSummary: { roleTitle: roleInfo.rawDescription, salaryRange: roleInfo.salaryRange } });
  };

  const addBotMessage = (text: string | string[], options?: string[]) => {
    const texts = Array.isArray(text) ? text : [text];
    setMessages((prev) => {
      const newMsgs = [...prev];
      texts.forEach((t, i) => {
        newMsgs.push({ id: nextMessageId + newMsgs.length, from: "bot", text: t, options: i === texts.length - 1 ? options : undefined });
      });
      return newMsgs;
    });
    setNextMessageId((id) => id + (Array.isArray(text) ? text.length : 1));
    if (options && options.length > 0) setPendingOptions(options); else setPendingOptions(null);
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => [...prev, { id: nextMessageId, from: "user", text }]);
    setNextMessageId((id) => id + 1);
    setLastActivity(Date.now());
  };

  useEffect(() => {
    if (step === "intro" && messages.length === 0) {
      addBotMessage(["Looks like you might be hiring \u2014 tell me what type of role you're thinking about."]);
      setStep("askRoleDetail");
    }
  }, []);

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); if (!input.trim()) return; handleUserInput(input.trim()); setInput(""); };
  const handleOptionClick = (option: string) => { setPendingOptions(null); handleUserInput(option); };
  const label = (p?: string) => p === "speed" ? "Speed" : p === "quality" ? "Quality" : p === "salary" ? "Staying within your salary range" : "";

  const handleUserInput = async (text: string) => {
    addUserMessage(text);
    setIsLoading(true);

    switch (step) {
      case "askRoleDetail": {
        setRoleInfo((prev) => ({ ...prev, rawDescription: text }));
        const ctx = `The user just described the role they want to fill: "${text}". Acknowledge what they said with enthusiasm and specificity (reference the actual role). Then ask how many years of experience they want. Keep it to 2 short sentences max. Be conversational, not formal.`;
        const reply = await getGptResponse(text, ctx, gptHistory);
        addBotMessage(reply);
        setStep("askYears");
        break;
      }
      case "askYears": {
        setRoleInfo((prev) => ({ ...prev, yearsExperience: text }));
        const ctx = `The user said they want "${text}" years of experience for a ${roleInfo.rawDescription} role. Acknowledge briefly and ask what salary range they have in mind. 1-2 sentences, conversational.`;
        const reply = await getGptResponse(text, ctx, gptHistory);
        addBotMessage(reply);
        setStep("askSalary");
        break;
      }
      case "askSalary": {
        setRoleInfo((prev) => ({ ...prev, salaryRange: text }));
        const ctx = `The user said their salary range is "${text}" for a ${roleInfo.rawDescription} role with ${roleInfo.yearsExperience} years experience. Acknowledge and ask if there are any non-negotiables - specific background, skills, firm type, certifications, etc. 1-2 sentences.`;
        const reply = await getGptResponse(text, ctx, gptHistory);
        addBotMessage(reply);
        setStep("askNonNeg");
        break;
      }
      case "askNonNeg": {
        setRoleInfo((prev) => ({ ...prev, nonNegotiables: text }));
        const thinkingCtx = `The user listed non-negotiables: "${text}" for a ${roleInfo.rawDescription} role. Say something like "Got it, let me run a quick market check on that" - be brief, 1 sentence.`;
        const thinkingReply = await getGptResponse(text, thinkingCtx, gptHistory);
        addBotMessage(thinkingReply);
        const marketData = await fetchMarketData(roleInfo.rawDescription || text, "United States");
        const jobs = marketData?.jobCount || 42;
        const candidates = marketData?.candidateCount || 18;
        const difficulty = marketData?.difficulty || "competitive";
        const avgSalary = marketData?.avgSalary;
        const demandTrend = marketData?.demandTrend;
        const timeToFill = marketData?.timeToFill;
        const topCompetitors = marketData?.topCompetitors || [];
        const topSkills = marketData?.topSkills || [];
        setRoleInfo((prev) => ({ ...prev, marketJobs: jobs, marketCandidates: candidates, marketDifficulty: difficulty as any, avgSalary, demandTrend, timeToFill, topCompetitors, topSkills }));
        const marketCtx = `You just ran a market analysis. Here are the results - present them conversationally:\n- ${jobs} jobs posted recently for this role type\n- Only ${candidates} candidates who match\n- Difficulty: ${difficulty}\n${avgSalary ? `- Avg salary: $${avgSalary.toLocaleString()}` : ""}\n${demandTrend ? `- Demand trend: ${demandTrend}` : ""}\n${timeToFill ? `- Est time to fill: ${timeToFill} days` : ""}\n${topCompetitors.length > 0 ? `- Top competing employers: ${topCompetitors.slice(0, 3).join(", ")}` : ""}\nPresent these insights naturally, like a recruiter sharing market intel. Make it feel valuable. 3-5 short sentences.`;
        const marketReply = await getGptResponse("market data results", marketCtx, gptHistory);
        setTimeout(() => {
          addBotMessage(marketReply);
          if (!emailCaptured) {
            setTimeout(() => {
              addBotMessage("Want me to email you the full market intelligence report? It includes competitor data, salary benchmarks, and candidate profiles.", ["Yes, send the report", "No, let's keep going"]);
              setStep("askPrimaryPriority");
            }, 600);
          } else {
            setTimeout(() => {
              addBotMessage("For this hire, what matters most to you?", ["Speed", "Quality", "Staying within your salary range"]);
              setStep("askPrimaryPriority");
            }, 400);
          }
        }, 800);
        setIsLoading(false);
        return;
      }
      case "askPrimaryPriority": {
        if (text.toLowerCase().includes("yes") && text.toLowerCase().includes("report")) {
          setLeadModalConfig({ capturePoint: "market_snapshot", headline: "Where should we send the full report?", description: "Includes detailed salary data, competitor analysis, candidate supply breakdown, and hiring timeline estimates." });
          setShowLeadModal(true);
          setTimeout(() => { addBotMessage("For this hire, what matters most to you?", ["Speed", "Quality", "Staying within your salary range"]); }, 500);
          setIsLoading(false); return;
        }
        if (text.toLowerCase().includes("no") && text.toLowerCase().includes("keep")) {
          setTimeout(() => { addBotMessage("For this hire, what matters most to you?", ["Speed", "Quality", "Staying within your salary range"]); }, 400);
          setIsLoading(false); return;
        }
        let primary: RoleInfo["primaryPriority"] | undefined;
        if (text.toLowerCase().startsWith("speed")) primary = "speed";
        if (text.toLowerCase().startsWith("quality")) primary = "quality";
        if (text.toLowerCase().startsWith("staying")) primary = "salary";
        if (!primary) { addBotMessage("Please pick one: Speed, Quality, or Staying within your salary range.", ["Speed", "Quality", "Staying within your salary range"]); setIsLoading(false); return; }
        setRoleInfo((prev) => ({ ...prev, primaryPriority: primary }));
        const remaining = ["speed", "quality", "salary"].filter((p) => p !== primary);
        const ctx1 = `The user chose ${label(primary)} as most important for their ${roleInfo.rawDescription} hire. Acknowledge their choice briefly and naturally, then ask which is second most important: ${label(remaining[0])} or ${label(remaining[1])}? 1-2 sentences.`;
        const reply1 = await getGptResponse(text, ctx1, gptHistory);
        addBotMessage(reply1, [label(remaining[0]), label(remaining[1])]);
        setStep("askSecondaryPriority");
        break;
      }
      case "askSecondaryPriority": {
        const primary = roleInfo.primaryPriority;
        let secondary: RoleInfo["secondaryPriority"] | undefined;
        if (text.toLowerCase().startsWith("speed")) secondary = "speed";
        if (text.toLowerCase().startsWith("quality")) secondary = "quality";
        if (text.toLowerCase().startsWith("staying")) secondary = "salary";
        if (!secondary || secondary === primary) {
          const remaining = ["speed", "quality", "salary"].filter((p) => p !== primary);
          addBotMessage(`Please pick one: ${label(remaining[0])} or ${label(remaining[1])}.`, [label(remaining[0]), label(remaining[1])]);
          setIsLoading(false); return;
        }
        setRoleInfo((prev) => ({ ...prev, secondaryPriority: secondary }));
        const pair = [primary, secondary];
        const wantsSpeed = pair.includes("speed");
        const wantsQuality = pair.includes("quality");
        if (wantsSpeed && wantsQuality) {
          const ctx2 = `The user wants both Speed and Quality for their ${roleInfo.rawDescription} hire in the ${roleInfo.salaryRange} range. Explain that wanting both usually means paying above market - roughly up to 120% of typical salary. Ask if they're open to that investment for the right person. Be consultative, not pushy. 3-4 sentences.`;
          const reply2 = await getGptResponse(text, ctx2, gptHistory);
          addBotMessage(reply2, ["Yes", "No"]);
          setStep("aboveMarketCheck");
        } else {
          const ctx2 = `The user chose ${label(primary)} first and ${label(secondary)} second for their ${roleInfo.rawDescription} hire. Transition into discussing fees. Explain you need to cover the cost of doing this right, and ask if they'd pay 25% fee on first-year base with a 90-day guarantee for a strong performer. Be direct but consultative. 2-3 sentences.`;
          const reply2 = await getGptResponse(text, ctx2, gptHistory);
          addBotMessage(reply2, ["Yes", "No"]);
          setStep("competitorFee25");
        }
        break;
      }
      case "aboveMarketCheck": {
        const yes = text.toLowerCase().startsWith("y");
        setRoleInfo((prev) => ({ ...prev, aboveMarketOk: yes }));
        const ctx3 = yes
          ? `The user said YES they're willing to pay above market for a ${roleInfo.rawDescription}. Great - since money isn't the constraint, you can go straight after impact by pulling from competitors. Ask if they'd pay 25% fee on first-year base with a 90-day guarantee for a proven performer from a direct competitor. 2-3 sentences, confident.`
          : `The user said NO to paying above market for a ${roleInfo.rawDescription}. That's fine - you can still run a strong search but it may take longer. Transition to fees - ask if they'd pay 25% on first-year base with 90-day guarantee. 2-3 sentences.`;
        const reply3 = await getGptResponse(text, ctx3, gptHistory);
        addBotMessage(reply3, ["Yes", "No"]);
        setStep("competitorFee25");
        break;
      }
      case "competitorFee25": {
        const yes = text.toLowerCase().startsWith("y");
        if (yes) {
          setRoleInfo((prev) => ({ ...prev, feeAccepted: 25 }));
          await proceedToSummary(25);
        } else {
          const ctx4 = `The user rejected the 25% fee for the ${roleInfo.rawDescription} role. You still need to cover costs. Present 18% as your lowest rate for roles like this. Ask if 18% works. Be understanding but firm. 2 sentences.`;
          const reply4 = await getGptResponse(text, ctx4, gptHistory);
          addBotMessage(reply4, ["Yes", "No"]);
          setStep("competitorFee18");
        }
        break;
      }
      case "competitorFee18": {
        const yes = text.toLowerCase().startsWith("y");
        if (yes) {
          setRoleInfo((prev) => ({ ...prev, feeAccepted: 18 }));
          await proceedToSummary(18);
        } else {
          const ctx5 = `The user rejected both 25% and 18% fees. It doesn't make sense to engage if fee is the primary constraint. Be gracious - offer to share the market snapshot you generated so they can see what they're up against. 2 sentences, professional.`;
          const reply5 = await getGptResponse(text, ctx5, gptHistory);
          addBotMessage(reply5);
          if (!emailCaptured) {
            setTimeout(() => {
              setLeadModalConfig({ capturePoint: "fee_walkaway", headline: "Take your market data with you", description: "We'll email you the full market intelligence report, competitor landscape, and salary benchmarks. No strings attached." });
              setShowLeadModal(true);
            }, 600);
          }
          setStep("noFit");
        }
        break;
      }
      case "confirmSend": {
        if (text.toLowerCase().includes("send") || text.toLowerCase().includes("docu")) {
          setRoleInfo((prev) => ({ ...prev, nextStep: "docusign" }));
          const ctx6 = `The user wants to proceed with DocuSign. Ask for the legal company name the agreement should be made out to. 1 sentence.`;
          const reply6 = await getGptResponse(text, ctx6, gptHistory);
          addBotMessage(reply6);
          setStep("askCompany");
        } else if (text.toLowerCase().includes("schedule") || text.toLowerCase().includes("call")) {
          setRoleInfo((prev) => ({ ...prev, nextStep: "call" }));
          addBotMessage("Got it. I'll get you a link to schedule a quick call before we formalize anything.");
          setStep("done");
        } else {
          addBotMessage("Please choose: \"Send DocuSign\" or \"Schedule a call first\".", ["Send DocuSign", "Schedule a call first"]);
        }
        break;
      }
      case "askCompany": {
        setRoleInfo((prev) => ({ ...prev, companyName: text }));
        addBotMessage("What's the best email to send the DocuSign to?");
        setStep("askEmail");
        break;
      }
      case "askEmail": {
        setRoleInfo((prev) => ({ ...prev, contactEmail: text }));
        setEmailCaptured(true);
        addBotMessage("What name should appear as the main contact on the agreement?");
        setStep("askContactName");
        break;
      }
      case "askContactName": {
        setRoleInfo((prev) => ({ ...prev, contactName: text }));
        const ctx7 = `The user's name is ${text}, company is ${roleInfo.companyName}, email is ${roleInfo.contactEmail}. Confirm you'll generate the agreement with these details and send it. Mention they'll hear from Taylor Hassell to kick things off, or they can schedule a call first. 2 sentences.`;
        const reply7 = await getGptResponse(text, ctx7, gptHistory);
        addBotMessage(reply7, ["Just send it", "Schedule a call instead"]);
        setStep("finalChoice");
        break;
      }
      case "finalChoice": {
        if (text.toLowerCase().startsWith("just")) {
          const result = await sendDocuSign();
          if (result?.status === "sent") {
            addBotMessage("Done. DocuSign has been sent to your inbox. If you don't see it in a few minutes, reply here and we'll resend.");
          } else {
            addBotMessage("Done. Our team will send the DocuSign agreement to your inbox shortly. If you don't see it in a few minutes, reply here and we'll resend.");
          }
          setStep("done");
        } else if (text.toLowerCase().startsWith("schedule")) {
          addBotMessage("Got it. I'll get you a link to schedule a quick call before we formalize anything.");
          setStep("done");
        } else {
          addBotMessage("Please choose: \"Just send it\" or \"Schedule a call instead\".", ["Just send it", "Schedule a call instead"]);
        }
        break;
      }
      default: break;
    }
    setIsLoading(false);
  };

  const proceedToSummary = async (feePercent: 25 | 18) => {
    const { rawDescription, yearsExperience, salaryRange, marketJobs, marketCandidates, marketDifficulty, primaryPriority, secondaryPriority } = roleInfo;
    const difficultyText = marketDifficulty === "easy" ? "relatively easy" : marketDifficulty === "competitive" ? "competitive" : "hard";
    const summaryCtx = `Generate a clean summary of the search engagement. Here are the details:\n- Role: ${rawDescription}\n- Experience: ${yearsExperience} years\n- Salary: ${salaryRange}\n- Market: ${difficultyText} (~${marketJobs} jobs vs ~${marketCandidates} candidates)\n- Priorities: ${label(primaryPriority)} first, ${label(secondaryPriority)} second\n- Fee: ${feePercent}% with 90-day guarantee\nPresent this as a bullet-point summary, then say you can either send a DocuSign search agreement or schedule a call first. Be confident and closing.`;
    const summaryReply = await getGptResponse("summary", summaryCtx, gptHistory);
    addBotMessage(summaryReply, ["Send DocuSign", "Schedule a call first"]);
    setStep("confirmSend");
  };

  return (
    <div className="app">
      <header className="header">
        <span className="logo">FULLCIRCLE /</span>{" "}
        <span className="logo-sub">TALENT INTELLIGENCE</span>
      </header>
      <div className="chat-container">
        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`message ${m.from}`}>
              <div className="bubble">{m.text}</div>
              {m.from === "bot" && m.options && (
                <div className="options">
                  {m.options.map((opt) => (
                    <button key={opt} className="option-btn" onClick={() => handleOptionClick(opt)}>{opt}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="message bot">
              <div className="bubble typing">Thinking<span className="dots">...</span></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form className="input-bar" onSubmit={handleSubmit}>
          <input type="text" placeholder="Type anything about the role you're hiring for..." value={input} onChange={(e) => setInput(e.target.value)} />
          <button type="submit">{String.fromCharCode(0x21B5)}</button>
        </form>
        <p className="subtitle">No forms. Just describe what you need.</p>
      </div>
      <LeadModal show={showLeadModal} headline={leadModalConfig.headline} description={leadModalConfig.description} onSubmit={(email, name) => captureLeadAndDeliver(email, name, leadModalConfig.capturePoint)} onDismiss={() => setShowLeadModal(false)} />
    </div>
  );
};

export default App;
