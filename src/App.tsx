import React, { useState, useEffect, FormEvent, useRef } from "react";
import "./App.css";

type RoleInfo = {
  rawDescription?: string;
  yearsExperience?: string;
  salaryRange?: string;
  nonNegotiables?: string;
  marketJobs?: number;
  marketCandidates?: number;
  marketDifficulty?: "easy" | "competitive" | "hard";
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
const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>("intro");
  const [roleInfo, setRoleInfo] = useState<RoleInfo>({});
  const [nextMessageId, setNextMessageId] = useState(1);
  const [pendingOptions, setPendingOptions] = useState<string[] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    setMessages((prev) => [
      ...prev,
      { id: nextMessageId, from: "user", text },
    ]);
    setNextMessageId((id) => id + 1);
  };

  useEffect(() => {
    if (step === "intro" && messages.length === 0) {
      addBotMessage([
        "Welcome to FullCircle Placements.",
        "Looks like you might be hiring — tell me what type of role you're thinking about.",
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
          addBotMessage([
            "Okay, great. Tell me a bit more about the profile.",
            "How many years of experience are you thinking?",
          ]);
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
        setTimeout(() => {
          const jobs = 42;
          const candidates = 18;
          let difficulty: RoleInfo["marketDifficulty"] = "competitive";
          if (candidates > jobs * 2) difficulty = "easy";
          if (candidates < jobs * 0.5) difficulty = "hard";
          setRoleInfo((prev) => ({ ...prev, marketJobs: jobs, marketCandidates: candidates, marketDifficulty: difficulty }));
          const difficultyText = difficulty === "easy" ? "looks relatively easy" : difficulty === "competitive" ? "looks competitive" : "looks hard";
          addBotMessage(["Got it. Give me a second to do a quick supply vs demand check for that role in your area."]);
          setTimeout(() => {
            addBotMessage([
              `In the last month, there have been about ${jobs} jobs posted in your area for this type of role.`,
              `There are only about ${candidates} candidates who really match what you described.`,
              `This ${difficultyText} to fill.`,
            ]);
            setTimeout(() => {
              addBotMessage("For this hire, what matters most to you?", ["Speed", "Quality", "Staying within your salary range"]);
              setStep("askPrimaryPriority");
            }, 400);
          }, 800);
        }, 400);
        break;
      }

      case "askPrimaryPriority": {
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
            addBotMessage(["Totally fine. We can still run a strong search — but it may take longer, and the bar may need to flex a bit.", "To run this properly, we still have to cover the cost of doing it right.", "If we could deliver a strong performer for this role, would you be willing to pay a 25% fee on first-year base? We'd include a 90-day guarantee."], ["Yes", "No"]);
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
          setTimeout(() => {
            addBotMessage(["Got it. It probably doesn't make sense for us to engage on this one if fee is the primary constraint.", "I can still share the market snapshot we just generated so you can see what you're up against."]);
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
        setTimeout(() => {
          addBotMessage("What name should appear as the main contact on the agreement?");
          setStep("askContactName");
        }, 400);
        break;
      }

      case "askContactName": {
        setRoleInfo((prev) => ({ ...prev, contactName: text }));
        setTimeout(() => {
          addBotMessage([`Perfect. I'm going to generate an agreement with these details and send it to ${text}.`, "Once it's signed, you'll hear from Taylor Hassell to kick things off — unless you'd prefer to schedule a call first."], ["Just send it", "Schedule a call instead"]);
          setStep("finalChoice");
        }, 400);
        break;
      }

      case "finalChoice": {
        if (text.toLowerCase().startsWith("just")) {
          setTimeout(() => {
            addBotMessage(["Done. Check your inbox for the DocuSign.", "If you don't see it in a few minutes, reply here and we'll resend."]);
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
    </div>
  );
};

export default App;
