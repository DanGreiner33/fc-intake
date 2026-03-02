import React, { useState, useEffect, FormEvent, useRef, useCallback } from "react";
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

// Lead Magnet Modal Component
const LeadModal: React.FC<{
  show: boolean;
  capturePoint: string;
  headline: string;
  description: string;
  onSubmit: (email: string, name: string) => void;
  onDismiss: () => void;
}> = ({ show, capturePoint, headline, description, onSubmit, onDismiss }) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  if (!show) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>{headline}</h3>
        <p>{description}</p>
        <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="modal-input" />
        <input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} className="modal-input" />
        <div className="modal-actions">
          <button onClick={() => { if (email) onSubmit(email, name); }} className="modal-btn primary">Send me the report</button>
          <button onClick={onDismiss} className="modal-btn secondary">No thanks</button>
        </div>
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
  const [leadModalConfig, setLeadModalConfig] = useState({ capturePoint: "", headline: "", description: "" });
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Inactivity timer - show lead capture after 90s of no activity
  useEffect(() => {
    if (emailCaptured || step === "done" || step === "intro") return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      if (!emailCaptured && step !== "done" && step !== "intro") {
        setLeadModalConfig({
          capturePoint: "inactivity",
          headline: "Want us to save your progress?",
          description: "We'll email you everything we've gathered so far, so you can pick up right where you left off.",
        });
        setShowLeadModal(true);
      }
    }, 90000);
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
  }, [lastActivity, emailCaptured, step]);

  // API Helpers
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

  const captureLeadAndDeliver = async (email: string, name: string, capturePoint: string) => {
    setEmailCaptured(true);
    setShowLeadModal(false);
    await callAPI("/api/lead-capture", {
      email, name, capturePoint, roleContext: roleInfo,
    });
    addBotMessage(`Got it, ${name || "friend"}. We'll send your personalized market intelligence to ${email}.`);
  };

  const fetchMarketData = async (roleTitle: string, location: string) => {
    const data = await callAPI("/api/market-data", {
      roleTitle, location: location || "United States",
      yearsExperience: roleInfo.yearsExperience,
      salaryRange: roleInfo.salaryRange,
    });
    return data;
  };

  const sendDocuSign = async () => {
    const result = await callAPI("/api/docusign", {
      companyName: roleInfo.companyName,
      contactEmail: roleInfo.contactEmail,
      contactName: roleInfo.contactName,
      feePercent: roleInfo.feeAccepted,
      roleSummary: {
        roleTitle: roleInfo.rawDescription,
        salaryRange: roleInfo.salaryRange,
      },
    });
    return result;
  };

  const addBotMessage = (text: string | string[], options?: string[]) => {
    const texts = Array.isArray(text) ? text : [text];
    setMessages((prev) => {
      const newMsgs = [...prev];
      texts.forEach((t, i) => {
        newMsgs.push({
          id: nextMessageId + newMsgs.length,
          from: "bot",
          text: t,
          options: i === texts.length - 1 ? options : undefined,
        });
      });
      return newMsgs;
    });
    setNextMessageId((id) => id + (Array.isArray(text) ? text.length : 1));
    if (options && options.length > 0) {
      setPendingOptions(options);
    } else {
      setPendingOptions(null);
    }
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => [...prev, { id: nextMessageId, from: "user", text }]);
    setNextMessageId((id) => id + 1);
    setLastActivity(Date.now());
  };

  useEffect(() => {
    if (step === "intro" && messages.length === 0) {
      addBotMessage([
        "Welcome to FullCircle Placements.",
        "Looks like you might be hiring \u2014 tell me what type of role you're thinking about.",
      ]);
      setStep("askRoleDetail");
    }
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleUserInput(input.trim());
    setInput("");
  };

  const handleOptionClick = (option: string) => {
    setPendingOptions(null);
    handleUserInput(option);
  };

  const label = (p?: string) =>
    p === "speed" ? "Speed" : p === "quality" ? "Quality" : p === "salary" ? "Staying within your salary range" : "";

  const handleUserInput = (text: string) => {
    addUserMessage(text);

    switch (step) {
      case "askRoleDetail": {
        setRoleInfo((prev) => ({ ...prev, rawDescription: text }));
        setTimeout(() => {
          addBotMessage(["Okay, great. Tell me a bit more about the profile.", "How many years of experience are you thinking?"]);
          setStep("askYears");
        }, 400);
        break;
      }

      case "askYears": {
        setRoleInfo((prev) => ({ ...prev, yearsExperience: text }));
        setTimeout(() => {
          addBotMessage("What salary range do you have in mind?");
          setStep("askSalary");
        }, 400);
        break;
      }

      case "askSalary": {
        setRoleInfo((prev) => ({ ...prev, salaryRange: text }));
        setTimeout(() => {
          addBotMessage("Anything non-negotiable? (specific background, skills, or firm type)");
          setStep("askNonNeg");
        }, 400);
        break;
      }

      case "askNonNeg": {
        setRoleInfo((prev) => ({ ...prev, nonNegotiables: text }));
        setTimeout(async () => {
          addBotMessage(["Got it. Give me a second to do a quick supply vs demand check for that role in your area."]);

          // Call market data API
          const marketData = await fetchMarketData(roleInfo.rawDescription || text, "United States");
          const jobs = marketData?.jobCount || 42;
          const candidates = marketData?.candidateCount || 18;
          let difficulty = marketData?.difficulty || "competitive";
          const avgSalary = marketData?.avgSalary;
          const demandTrend = marketData?.demandTrend;
          const timeToFill = marketData?.timeToFill;
          const topCompetitors = marketData?.topCompetitors || [];
          const topSkills = marketData?.topSkills || [];

          setRoleInfo((prev) => ({
            ...prev,
            marketJobs: jobs, marketCandidates: candidates, marketDifficulty: difficulty as any,
            avgSalary, demandTrend, timeToFill, topCompetitors, topSkills,
          }));

          const difficultyText = difficulty === "easy" ? "looks relatively easy" : difficulty === "competitive" ? "looks competitive" : "looks hard";

          const marketMsgs = [
            `In the last month, there have been about ${jobs} jobs posted in your area for this type of role.`,
            `There are only about ${candidates} candidates who really match what you described.`,
            `This ${difficultyText} to fill.`,
          ];
          if (avgSalary) marketMsgs.push(`Average market salary is around $${avgSalary.toLocaleString()}.`);
          if (demandTrend) marketMsgs.push(`Demand trend: ${demandTrend}.`);
          if (timeToFill) marketMsgs.push(`Estimated time to fill: ${timeToFill} days.`);
          if (topCompetitors.length > 0) marketMsgs.push(`Top competing employers: ${topCompetitors.slice(0, 3).join(", ")}.`);

          setTimeout(() => {
            addBotMessage(marketMsgs);

            // LEAD MAGNET TOUCHPOINT 1: Offer to email full market report
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
        }, 400);
        break;
      }

      case "askPrimaryPriority": {
        // Handle lead magnet response from market snapshot
        if (text.toLowerCase().includes("yes") && text.toLowerCase().includes("report")) {
          setLeadModalConfig({
            capturePoint: "market_snapshot",
            headline: "Where should we send the full report?",
            description: "Includes detailed salary data, competitor analysis, candidate supply breakdown, and hiring timeline estimates.",
          });
          setShowLeadModal(true);
          setTimeout(() => {
            addBotMessage("For this hire, what matters most to you?", ["Speed", "Quality", "Staying within your salary range"]);
          }, 500);
          return;
        }
        if (text.toLowerCase().includes("no") && text.toLowerCase().includes("keep")) {
          setTimeout(() => {
            addBotMessage("For this hire, what matters most to you?", ["Speed", "Quality", "Staying within your salary range"]);
          }, 400);
          return;
        }

        let primary: RoleInfo["primaryPriority"] | undefined;
        if (text.toLowerCase().startsWith("speed")) primary = "speed";
        if (text.toLowerCase().startsWith("quality")) primary = "quality";
        if (text.toLowerCase().startsWith("staying")) primary = "salary";
        if (!primary) {
          addBotMessage("Please pick one: Speed, Quality, or Staying within your salary range.", ["Speed", "Quality", "Staying within your salary range"]);
          return;
        }
        setRoleInfo((prev) => ({ ...prev, primaryPriority: primary }));
        const remaining = ["speed", "quality", "salary"].filter((p) => p !== primary);
        setTimeout(() => {
          addBotMessage([`Okay, so ${label(primary)} is most important.`, `What's second most important between ${label(remaining[0])} and ${label(remaining[1])}?`], [label(remaining[0]), label(remaining[1])]);
          setStep("askSecondaryPriority");
        }, 400);
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
          return;
        }
        setRoleInfo((prev) => ({ ...prev, secondaryPriority: secondary }));
        const pair = [primary, secondary];
        const wantsSpeed = pair.includes("speed");
        const wantsQuality = pair.includes("quality");
        if (wantsSpeed && wantsQuality) {
          setTimeout(() => {
            addBotMessage(["Got it. You want someone great and you need them yesterday.", "In markets like this, that usually means paying above market to win the right person.", "For this role, that can look like roughly up to 120% of the typical market salary to move quickly and land the absolute top of the pool.", "Are you open to that level of investment for the right person?"], ["Yes", "No"]);
            setStep("aboveMarketCheck");
          }, 400);
        } else {
          setTimeout(() => {
            addBotMessage(["Understood.", "To run this properly, we still have to cover the cost of doing it right.", "If we could deliver a strong performer for this role, would you be willing to pay a 25% fee on first-year base? We'd include a 90-day guarantee."], ["Yes", "No"]);
            setStep("competitorFee25");
          }, 400);
        }
        break;
      }

      case "aboveMarketCheck": {
        const yes = text.toLowerCase().startsWith("y");
        setRoleInfo((prev) => ({ ...prev, aboveMarketOk: yes }));
        if (yes) {
          setTimeout(() => {
            addBotMessage(["Okay, great. If money isn't the constraint, we can go straight after impact.", "That means pulling directly from your closest competitors.", "If we were able to deliver a proven performer from a direct competitor, would you be willing to pay a 25% fee on first-year base? We'd include a 90-day guarantee."], ["Yes", "No"]);
            setStep("competitorFee25");
          }, 400);
        } else {
          setTimeout(() => {
            addBotMessage(["Totally fine. We can still run a strong search, but it may take longer, and the bar may need to flex a bit.", "To run this properly, we still have to cover the cost of doing it right.", "If we could deliver a strong performer for this role, would you be willing to pay a 25% fee on first-year base? We'd include a 90-day guarantee."], ["Yes", "No"]);
            setStep("competitorFee25");
          }, 400);
        }
        break;
      }

      case "competitorFee25": {
        const yes = text.toLowerCase().startsWith("y");
        if (yes) {
          setRoleInfo((prev) => ({ ...prev, feeAccepted: 25 }));
          setTimeout(() => { proceedToSummary(25); }, 400);
        } else {
          setTimeout(() => {
            addBotMessage(["Understood. We still have to cover the cost of doing this right.", "The lowest we go is 18% on roles like this.", "Would 18% work for you?"], ["Yes", "No"]);
            setStep("competitorFee18");
          }, 400);
        }
        break;
      }

      case "competitorFee18": {
        const yes = text.toLowerCase().startsWith("y");
        if (yes) {
          setRoleInfo((prev) => ({ ...prev, feeAccepted: 18 }));
          setTimeout(() => { proceedToSummary(18); }, 400);
        } else {
          // LEAD MAGNET TOUCHPOINT 2: Fee walkaway - give them something valuable
          setTimeout(() => {
            addBotMessage(["Got it. It probably doesn't make sense for us to engage on this one if fee is the primary constraint.", "I can still share the market snapshot we just generated so you can see what you're up against."]);
            if (!emailCaptured) {
              setTimeout(() => {
                setLeadModalConfig({
                  capturePoint: "fee_walkaway",
                  headline: "Take your market data with you",
                  description: "We'll email you the full market intelligence report, competitor landscape, and salary benchmarks. No strings attached.",
                });
                setShowLeadModal(true);
              }, 600);
            }
            setStep("noFit");
          }, 400);
        }
        break;
      }

      case "confirmSend": {
        if (text.toLowerCase().includes("send") || text.toLowerCase().includes("docu")) {
          setRoleInfo((prev) => ({ ...prev, nextStep: "docusign" }));
          setTimeout(() => {
            addBotMessage("Who should the agreement be made out to? (Legal company name)");
            setStep("askCompany");
          }, 400);
        } else if (text.toLowerCase().includes("schedule") || text.toLowerCase().includes("call")) {
          setRoleInfo((prev) => ({ ...prev, nextStep: "call" }));
          setTimeout(() => {
            addBotMessage("Got it. I'll get you a link to schedule a quick call before we formalize anything.");
            setStep("done");
          }, 400);
        } else {
          addBotMessage('Please choose: "Send DocuSign" or "Schedule a call first".', ["Send DocuSign", "Schedule a call first"]);
        }
        break;
      }

      case "askCompany": {
        setRoleInfo((prev) => ({ ...prev, companyName: text }));
        setTimeout(() => {
          addBotMessage("What's the best email to send the DocuSign to?");
          setStep("askEmail");
        }, 400);
        break;
      }

      case "askEmail": {
        setRoleInfo((prev) => ({ ...prev, contactEmail: text }));
        setEmailCaptured(true);
        setTimeout(() => {
          addBotMessage("What name should appear as the main contact on the agreement?");
          setStep("askContactName");
        }, 400);
        break;
      }

      case "askContactName": {
        setRoleInfo((prev) => ({ ...prev, contactName: text }));
        setTimeout(() => {
          addBotMessage([`Perfect. I'm going to generate an agreement with these details and send it to ${text}.`, "Once it's signed, you'll hear from Taylor Hassell to kick things off. Or schedule a call first."], ["Just send it", "Schedule a call instead"]);
          setStep("finalChoice");
        }, 400);
        break;
      }

      case "finalChoice": {
        if (text.toLowerCase().startsWith("just")) {
          setTimeout(async () => {
            // Call DocuSign API
            const result = await sendDocuSign();
            if (result?.status === "sent") {
              addBotMessage(["Done. DocuSign has been sent to your inbox.", "If you don't see it in a few minutes, reply here and we'll resend."]);
            } else {
              addBotMessage(["Done. Our team will send the DocuSign agreement to your inbox shortly.", "If you don't see it in a few minutes, reply here and we'll resend."]);
            }
            setStep("done");
          }, 400);
        } else if (text.toLowerCase().startsWith("schedule")) {
          setTimeout(() => {
            addBotMessage("Got it. I'll get you a link to schedule a quick call before we formalize anything.");
            setStep("done");
          }, 400);
        } else {
          addBotMessage('Please choose: "Just send it" or "Schedule a call instead".', ["Just send it", "Schedule a call instead"]);
        }
        break;
      }

      default:
        break;
    }
  };

  const proceedToSummary = (feePercent: 25 | 18) => {
    const { rawDescription, yearsExperience, salaryRange, marketJobs, marketCandidates, marketDifficulty, primaryPriority, secondaryPriority } = roleInfo;
    const difficultyText = marketDifficulty === "easy" ? "relatively easy" : marketDifficulty === "competitive" ? "competitive" : "hard";
    addBotMessage(
      [
        "Great. I'll summarize this and we'll lock in the details.",
        "Here's what I have:",
        `• Role: ${rawDescription || ""}`,
        yearsExperience ? `• Experience: ${yearsExperience} years` : "",
        salaryRange ? `• Salary range: ${salaryRange}` : "",
        marketJobs && marketCandidates ? `• Market: ${difficultyText} (based on ~${marketJobs} jobs vs ~${marketCandidates} candidates)` : "",
        `• Priorities: ${label(primaryPriority)} first, ${label(secondaryPriority)} second`,
        `• Fee: ${feePercent}% with a 90-day guarantee`,
      ].filter(Boolean) as string[]
    );
    setTimeout(() => {
      addBotMessage(
        ["I can either:", "• Send you a DocuSign search agreement with these terms, or", "• Schedule a quick call before we formalize anything."],
        ["Send DocuSign", "Schedule a call first"]
      );
      setStep("confirmSend");
    }, 600);
  };

  return (
    <div className="App">
      <div className="brand-corner">
        FULLCIRCLE /{" "}
        <span>TALENT INTELLIGENCE</span>
      </div>
      <div className="chat-wrapper">
        <div className="chat-card">
          <div className="messages">
            {messages.map((m) => (
              <div key={m.id} className={`message ${m.from === "bot" ? "bot" : "user"}`}>
                <div className="bubble">{m.text}</div>
                {m.from === "bot" && m.options && (
                  <div className="options">
                    {m.options.map((opt) => (
                      <button key={opt} type="button" onClick={() => handleOptionClick(opt)}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form className="input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Type anything about the role you're hiring for..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="send-btn">{String.fromCharCode(0x21B5)}</button>
          </form>
          <div className="helper-text">No forms. Just describe what you need.</div>
        </div>
      </div>
      <LeadModal
        show={showLeadModal}
        capturePoint={leadModalConfig.capturePoint}
        headline={leadModalConfig.headline}
        description={leadModalConfig.description}
        onSubmit={(email, name) => captureLeadAndDeliver(email, name, leadModalConfig.capturePoint)}
        onDismiss={() => setShowLeadModal(false)}
      />
    </div>
  );
};

export default App;
