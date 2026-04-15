import React, { useState, useEffect, FormEvent, useRef } from "react";
import "./App.css";

const API_BASE = window.location.origin;

type RoleInfo = {
  rawDescription?: string;
  primaryPriority?: "cost" | "speed" | "quality";
  secondaryPriority?: "cost" | "speed" | "quality";
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

type Message = {
  id: number;
  from: "bot" | "user";
  text: string;
  options?: string[];
  optionsDisabled?: boolean;
};

type Step =
  | "askRole"
  | "askPrimary"
  | "askSecondary"
  | "askNameEmail"
  | "askPhone"
  | "done";

const PRIORITY_OPTIONS: { key: "cost" | "speed" | "quality"; label: string; desc: string }[] = [
  { key: "cost", label: "Cost", desc: "Cost - Paying market or below" },
  { key: "speed", label: "Speed", desc: "Speed - Looking to hire someone ASAP" },
  { key: "quality", label: "Quality", desc: "Quality - Perfect candidates for the role" },
];

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
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const addBotMessage = (text: string | string[], options?: string[]) => {
    const texts = Array.isArray(text) ? text : [text];
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.options ? { ...m, optionsDisabled: true } : m
      );
      texts.forEach((t, i) => {
        updated.push({
          id: nextMessageId + updated.length,
          from: "bot",
          text: t,
          options: i === texts.length - 1 ? options : undefined,
          optionsDisabled: false,
        });
      });
      return updated;
    });
    setNextMessageId((id) => id + (Array.isArray(text) ? text.length : 1));
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.options ? { ...m, optionsDisabled: true } : m
      );
      updated.push({ id: nextMessageId, from: "user", text });
      return updated;
    });
    setNextMessageId((id) => id + 1);
  };

  useEffect(() => {
    if (step === "askRole" && messages.length === 0) {
      addBotMessage("What position are you looking to hire for?");
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
    if (lower.includes("cost") || lower.includes("market or below") || lower.includes("paying")) return "cost";
    if (lower.includes("speed") || lower.includes("asap") || lower.includes("fast")) return "speed";
    if (lower.includes("quality") || lower.includes("perfect") || lower.includes("best")) return "quality";
    return null;
  };

  const sendLeadEmail = async (info: RoleInfo, chatTranscript: string) => {
    await callAPI("/api/lead-capture", {
      email: info.contactEmail,
      name: info.contactName,
      phone: info.contactPhone,
      capturePoint: "intake_complete",
      roleContext: info,       transcript: chatTranscript,
    });
  };

  const handleUserInput = async (text: string) => {
    addUserMessage(text);
    setIsLoading(true);

    switch (step) {
      case "askRole": {
        setRoleInfo((prev) => ({ ...prev, rawDescription: text }));
        addBotMessage(
          "Great - What's the most important?",
          [
            "Cost - Paying market or below",
            "Speed - Looking to hire someone ASAP",
            "Quality - Perfect candidates for the role",
          ]
        );
        setStep("askPrimary");
        break;
      }

      case "askPrimary": {
        const primary = matchPriority(text);
        if (!primary) {
          addBotMessage(
            "No worries - just pick one of these:",
            [
              "Cost - Paying market or below",
              "Speed - Looking to hire someone ASAP",
              "Quality - Perfect candidates for the role",
            ]
          );
          setIsLoading(false);
          return;
        }
        setRoleInfo((prev) => ({ ...prev, primaryPriority: primary }));
        const remaining = getRemainingOptions(primary);
        addBotMessage(
          "Great - what's second most important?",
          remaining.map((r) => r.desc)
        );
        setStep("askSecondary");
        break;
      }

      case "askSecondary": {
        const secondary = matchPriority(text);
        const primary = roleInfo.primaryPriority;
        if (!secondary || secondary === primary) {
          const remaining = getRemainingOptions(primary!);
          addBotMessage(
            "Just pick one of these two:",
            remaining.map((r) => r.desc)
          );
          setIsLoading(false);
          return;
        }
        setRoleInfo((prev) => ({ ...prev, secondaryPriority: secondary }));
        const primaryLabel = PRIORITY_OPTIONS.find((p) => p.key === primary)?.label;
        const secondaryLabel = PRIORITY_OPTIONS.find((p) => p.key === secondary)?.label;
        addBotMessage(
          `${primaryLabel} and ${secondaryLabel} - good to know. What's your name and email so we can follow up?`
        );
        setStep("askNameEmail");
        break;
      }

      case "askNameEmail": {
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : "";
        const nameText = text.replace(email, "").replace(/[,;]/g, " ").trim();

        if (!email) {
          addBotMessage("I just need your name and email - you can type them both here.");
          setIsLoading(false);
          return;
        }

        setRoleInfo((prev) => ({ ...prev, contactName: nameText || "Friend", contactEmail: email }));
        addBotMessage(
          `Thanks${nameText ? ", " + nameText.split(" ")[0] : ""}! What's the best phone number to reach you at?`
        );
        setStep("askPhone");
        break;
      }

      case "askPhone": {
        const phoneClean = text.replace(/[^0-9+()\-\s]/g, "").trim();
        if (phoneClean.length < 7) {
          addBotMessage("That doesn't look like a phone number - mind trying again?");
          setIsLoading(false);
          return;
        }
        const updatedInfo = { ...roleInfo, contactPhone: phoneClean };
        setRoleInfo(updatedInfo);

        const transcript = [...messages, { from: "user", text }].map((m: any) => `${m.from === "bot" ? "Bot" : "User"}: ${m.text}`).join("\n"); await sendLeadEmail(updatedInfo, transcript);

        addBotMessage(
          "Perfect - thanks for that. Our team will be reaching out to you shortly. Talk soon!"
        );
        setStep("done");

        // Tell parent page to dismiss the overlay
        setTimeout(() => {
          if (window.parent !== window) {
            window.parent.postMessage("fc-chat-done", "*");
          }
        }, 2500);
        break;
      }

      default:
        break;
    }
    setIsLoading(false);
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
                <div className={`options${m.optionsDisabled ? " disabled" : ""}`}>
                  {m.options.map((opt) => (
                    <button
                      key={opt}
                      className="option-btn"
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
            <div className="message bot">
              <div className="bubble typing">
                Thinking<span className="dots">...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form className="input-bar" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Type your response..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit">{String.fromCharCode(0x21b5)}</button>
        </form>
        <p className="subtitle">No forms. Just describe what you need.</p>
      </div>
    </div>
  );
};

export default App;
