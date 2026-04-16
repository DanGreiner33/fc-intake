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
  | "askPrimary"
  | "askSecondary"
  | "askNameEmail"
  | "askPhone"
  | "askAgreement"
  | "askCompanyName"
  | "askSignor"
  | "confirmAgreement"
  | "correcting"
  | "done";

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>("askRole");
  const [roleInfo, setRoleInfo] = useState<RoleInfo>({});
  const [nextMessageId, setNextMessageId] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
    const roleInfoRef = useRef<RoleInfo>({});

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

  const redirectWhenDone = () => {
    setTimeout(() => {
      if (window.parent !== window) {
        window.parent.postMessage("fc-chat-done", "*");
      } else {
        window.location.href = "https://fullcircleplacements.com";
      }
    }, 2500);
  };

  const getTranscript = (msgArray: { from: string; text: string }[]) => {
    return msgArray.map((m) => `${m.from === "bot" ? "Bot" : "User"}: ${m.text}`).join("\n");
  };

  const handleUserInput = async (text: string) => {
    addUserMessage(text);
    setIsLoading(true);

    try {
      const allMessages = [...messages, { id: 0, from: "user" as const, text }];
      const chatHistory = allMessages.map((m) => ({ from: m.from, text: m.text }));

      const aiResponse = await callAPI("/api/chat", {
        messages: chatHistory,
        step,
        roleInfo: roleInfoRef.current,
      });

      if (!aiResponse || aiResponse.error) {
        addBotMessage(aiResponse?.message || "Something went wrong. Could you try that again?");
        setIsLoading(false);
        return;
      }

      const extracted = aiResponse.extractedData || {};
      const updatedInfo = { ...roleInfoRef.current };
      if (extracted.position) updatedInfo.position = extracted.position;
      if (extracted.priority1) updatedInfo.priority1 = extracted.priority1;
      if (extracted.priority2) updatedInfo.priority2 = extracted.priority2;
      if (extracted.contactName) updatedInfo.contactName = extracted.contactName;
      if (extracted.contactEmail) updatedInfo.contactEmail = extracted.contactEmail;
      if (extracted.contactPhone) updatedInfo.contactPhone = extracted.contactPhone;
      if (extracted.companyName) updatedInfo.companyName = extracted.companyName;
      if (extracted.signorName) updatedInfo.signorName = extracted.signorName;
      if (extracted.signorTitle) updatedInfo.signorTitle = extracted.signorTitle;
      roleInfoRef.current = updatedInfo; setRoleInfo(updatedInfo);

      const options = aiResponse.options || undefined;
      addBotMessage(aiResponse.message, options);

      const nextStep = aiResponse.nextStep || step;
      setStep(nextStep as Step);


      // Agreement confirmed - send agreement + updated lead email + redirect
      if (nextStep === "done" && step === "confirmAgreement") {
        const finalInfo = { ...updatedInfo, agreementSent: true };
        roleInfoRef.current = finalInfo; setRoleInfo(finalInfo);
        const transcript = getTranscript([...chatHistory, { from: "bot", text: aiResponse.message }]);
        await callAPI("/api/send-agreement", {
          companyName: finalInfo.companyName,
          signorName: finalInfo.signorName,
          signorTitle: finalInfo.signorTitle,
          signerEmail: finalInfo.contactEmail,
          position: finalInfo.position,
        });
        await sendLeadEmail(finalInfo, transcript);
        redirectWhenDone();
      }

      // User declined agreement - send lead email + redirect
      if (nextStep === "done" && step === "askAgreement") {
        const transcript = getTranscript([...chatHistory, { from: "bot", text: aiResponse.message }]);
        await sendLeadEmail(updatedInfo, transcript);
        redirectWhenDone();
      }

    } catch (err) {
      console.error("Chat error:", err);
      addBotMessage("Something went wrong. Could you try that again?");
    }

    setIsLoading(false);
  };

  return (
    <div className="app">
      <header className="header">
        <span className="logo">FULLCIRCLE /</span>{" "}
        <span className="logo-sub"> TALENT INTELLIGENCE</span>
      </header>

      <div className="chat-container">
        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.from}`}>
              <div className={`bubble ${m.from} ${m.isCard ? "card" : ""}`}>{m.text}</div>

              {m.from === "bot" && m.options && (
                <div className="options">
                  {m.options.map((opt) => (
                    <button key={opt} className={`option-btn ${m.optionsDisabled ? "disabled" : ""}`} disabled={m.optionsDisabled} onClick={() => !m.optionsDisabled && handleOptionClick(opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="msg bot">
              <div className="bubble bot thinking">Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="input-area">
          <input type="text" placeholder="Type your response..." value={input} onChange={(e) => setInput(e.target.value)} />
          <button type="submit">{String.fromCharCode(0x21b5)}</button>
        </form>
        <p className="subtitle">No forms. Just describe what you need.</p>
      </div>
    </div>
  );
};

export default App;
