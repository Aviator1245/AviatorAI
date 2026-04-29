import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const SPACES = ["Health", "Career", "Learning", "Projects", "Finance", "Relationships", "Personal"];
const CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct";
const EXTRACT_MODEL = "meta-llama/llama-3.1-8b-instruct";
const MAX_HISTORY = 20;

const SPACE_PERSONAS = {
  Health: {
    icon: "♡",
    color: "#4ade80",
    dim: "#0d2a1a",
    border: "#1a3d2a",
    role: "personal health advisor",
    focus: "physical health, mental wellness, fitness, nutrition, sleep, medical concerns, energy levels, and habits affecting wellbeing",
  },
  Career: {
    icon: "◈",
    color: "#60a5fa",
    dim: "#0d1a2a",
    border: "#1a2e3d",
    role: "career strategist and professional coach",
    focus: "career growth, job applications, skills development, professional relationships, salary, work performance, and long-term career goals",
  },
  Learning: {
    icon: "◉",
    color: "#c084fc",
    dim: "#1a0d2a",
    border: "#2e1a3d",
    role: "learning coach and knowledge curator",
    focus: "books, courses, skills being learned, study habits, areas of intellectual interest, and knowledge gaps to fill",
  },
  Projects: {
    icon: "⬡",
    color: "#fb923c",
    dim: "#2a1200",
    border: "#3d2000",
    role: "project manager and technical advisor",
    focus: "ongoing projects, technical challenges, timelines, blockers, tools being used, and project goals",
  },
  Finance: {
    icon: "◎",
    color: "#facc15",
    dim: "#2a2000",
    border: "#3d3000",
    role: "personal finance advisor",
    focus: "savings, expenses, investments, income, financial goals, budgeting, and money habits",
  },
  Relationships: {
    icon: "◌",
    color: "#f472b6",
    dim: "#2a0d1a",
    border: "#3d1a2e",
    role: "relationship and social coach",
    focus: "friendships, family dynamics, romantic relationships, social energy, communication patterns, and important people in life",
  },
  Personal: {
    icon: "◇",
    color: "#94a3b8",
    dim: "#141a20",
    border: "#1e2a35",
    role: "personal growth companion",
    focus: "identity, values, mindset, personal habits, life philosophy, self-improvement, emotional patterns, and things that matter most",
  },
};

// ─── Markdown Renderer ────────────────────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Numbered list item
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        const m = lines[i].match(/^\d+\.\s+(.*)/);
        items.push(m[1]);
        i++;
      }
      elements.push(
        <ol key={i} style={{ margin: "8px 0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ lineHeight: "1.6", color: "inherit" }}>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Bullet list item
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*•]\s+/)) {
        const m = lines[i].match(/^[-*•]\s+(.*)/);
        items.push(m[1]);
        i++;
      }
      elements.push(
        <ul key={i} style={{ margin: "8px 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ lineHeight: "1.6", color: "inherit" }}>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Heading (## or ###)
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      elements.push(
        <div key={i} style={{ fontWeight: "700", fontSize: "14px", color: "#e8e8e8", marginTop: "10px", marginBottom: "4px" }}>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(headingMatch[1]) }} />
        </div>
      );
      i++;
      continue;
    }

    // Empty line → spacer
    if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: "6px" }} />);
      i++;
      continue;
    }

    // Normal paragraph line
    elements.push(
      <div key={i} style={{ lineHeight: "1.65", color: "inherit" }}>
        <span dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
      </div>
    );
    i++;
  }

  return <>{elements}</>;
}

function inlineFormat(text) {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong style='font-weight:600;color:#e8e8e8'>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code style='background:#1e1e1e;border:1px solid #2a2a2a;border-radius:3px;padding:1px 5px;font-size:12px;font-family:monospace'>$1</code>");
}

// ─── OpenRouter API ───────────────────────────────────────────────────────────
async function callAI({ apiKey, model, systemPrompt, messages, max_tokens = 1024, json = false }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://aviator.ai",
      "X-Title": "Aviator.ai",
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
      max_tokens,
      temperature: json ? 0.1 : 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  if (!data.choices?.length) throw new Error("No choices in response");
  return data.choices[0]?.message?.content ?? "";
}

// ─── Streaming chat ───────────────────────────────────────────────────────────
async function streamChat({ apiKey, model, systemPrompt, messages, max_tokens = 1024, onToken, onDone, onError }) {
  let res;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://aviator.ai",
        "X-Title": "Aviator.ai",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          ...messages,
        ],
        max_tokens,
        temperature: 0.7,
      }),
    });
  } catch (e) {
    onError(e.message);
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    onError(err?.error?.message || `API error ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let displayedText = "";
  let tokenQueue = "";
  let drainInterval = null;
  const CHAR_DELAY = 18;

  const startDrain = () => {
    if (drainInterval) return;
    drainInterval = setInterval(() => {
      if (tokenQueue.length > 0) {
        displayedText += tokenQueue[0];
        tokenQueue = tokenQueue.slice(1);
        onToken(displayedText);
      }
    }, CHAR_DELAY);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          const waitForDrain = () => {
            if (tokenQueue.length === 0) { clearInterval(drainInterval); onDone(fullText); }
            else setTimeout(waitForDrain, CHAR_DELAY * 2);
          };
          waitForDrain();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) { fullText += token; tokenQueue += token; startDrain(); }
        } catch {}
      }
    }
    const waitForDrain = () => {
      if (tokenQueue.length === 0) { clearInterval(drainInterval); onDone(fullText); }
      else setTimeout(waitForDrain, CHAR_DELAY * 2);
    };
    waitForDrain();
  } catch (e) {
    clearInterval(drainInterval);
    onError(e.message);
  }
}

// ─── Storage ──────────────────────────────────────────────────────────────────
function storageGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── GitHub Gist Sync ────────────────────────────────────────────────────────
const GIST_FILENAME = "aviator-ai-memory.json";

async function gistRead({ gistId, githubToken }) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`Gist read failed: ${res.status}`);
  const data = await res.json();
  const raw = data.files?.[GIST_FILENAME]?.content;
  if (!raw) return null;
  return JSON.parse(raw);
}

async function gistWrite({ gistId, githubToken, facts, insights }) {
  const payload = { facts, insights, updatedAt: Date.now() };
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gist write failed: ${res.status}`);
}

async function gistCreate({ githubToken }) {
  const res = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Aviator.ai memory store",
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ facts: [], insights: [], updatedAt: Date.now() }, null, 2),
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gist create failed: ${res.status}`);
  const data = await res.json();
  return data.id;
}

// ─── Fact Extractor ───────────────────────────────────────────────────────────
async function extractFacts({ apiKey, userMsg, assistantMsg, existingFacts }) {
  const existingSample = existingFacts.slice(-30).map((f) => f.fact).join("\n");
  const prompt = `You are a fact extractor for a personal second brain app called Aviator.ai.

Your job is to extract ONLY meaningful, persistent personal facts about the USER (Avinaash) from a conversation.

STRICT RULES — a fact must pass ALL of these:
1. It is about Avinaash personally — his life, identity, goals, habits, relationships, skills, or work.
2. It is persistent — still true days or weeks from now.
3. It is personal — something you'd write in a bio, journal, or profile.
4. It reveals something real about him — not a fleeting question.

DO NOT extract general knowledge, CS concepts, steps from a task, meta-facts about the app, or vague statements.

Existing facts (do not duplicate):
${existingSample || "(none yet)"}

User said: "${userMsg}"
Assistant said: "${assistantMsg}"

Respond ONLY with valid JSON:
{"facts": [{"fact": "...", "space": "..."}]}
If no qualifying facts exist, return: {"facts": []}
Space must be one of: ${SPACES.join(", ")}`;

  try {
    const raw = await callAI({ apiKey, model: EXTRACT_MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 512, json: true });
    const parsed = JSON.parse(raw);
    return (parsed.facts || []).filter((f) => f.fact && SPACES.includes(f.space));
  } catch { return []; }
}

// ─── Insight Generator ────────────────────────────────────────────────────────
async function generateInsights({ apiKey, facts }) {
  if (facts.length < 5) return [];
  const factList = facts.map((f) => `[${f.space}] ${f.fact}`).join("\n");
  const prompt = `You are an insight engine for a personal second brain.

Based on these facts about the user, generate 3-5 meaningful insights, patterns, or suggestions.
Be specific and actionable. Focus on connections across different life areas.

Facts:
${factList}

Respond ONLY with valid JSON:
{"insights": [{"title": "...", "body": "...", "spaces": ["Space1", "Space2"]}]}`;

  try {
    const raw = await callAI({ apiKey, model: EXTRACT_MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 800, json: true });
    const parsed = JSON.parse(raw);
    return parsed.insights || [];
  } catch { return []; }
}

// ─── Space Chat Component ─────────────────────────────────────────────────────
function SpaceChat({ space, facts, apiKey, onExtractFacts, setExtracting }) {
  const persona = SPACE_PERSONAS[space];
  const spaceFacts = facts.filter((f) => f.space === space);
  const historyKey = `aviator_history_${space}`;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState("");

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const saved = storageGet(historyKey);
    if (saved) setMessages(saved);
  }, [space]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const buildSystemPrompt = () => {
    const memBlock = spaceFacts.length > 0
      ? `\n\nWhat you know about Avinaash (${space} context):\n${spaceFacts.map((f) => `- ${f.fact}`).join("\n")}`
      : "";
    return `You are Aviator, Avinaash's personal ${persona.role}. You are sharp, focused, and genuinely helpful.
This is the ${space} space — stay focused on ${persona.focus}.
You remember everything relevant to this area and use it naturally in conversation.
Keep responses concise unless asked to elaborate. No fluff.${memBlock}`;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !apiKey) return;
    setInput("");
    setError("");

    const userMsg = { role: "user", content: text, ts: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);
    setStreamingContent("");

    const contextMessages = updatedMessages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }));
    const factsSnapshot = spaceFacts;

    streamChat({
      apiKey,
      model: CHAT_MODEL,
      systemPrompt: buildSystemPrompt(),
      messages: contextMessages,
      max_tokens: 1024,
      onToken: (partial) => setStreamingContent(partial),
      onDone: (reply) => {
        setStreamingContent("");
        setLoading(false);
        const assistantMsg = { role: "assistant", content: reply, ts: Date.now() };
        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);
        storageSet(historyKey, finalMessages.slice(-MAX_HISTORY));
        inputRef.current?.focus();

        setExtracting(true);
        extractFacts({ apiKey, userMsg: text, assistantMsg: reply, existingFacts: facts })
          .then((newFacts) => { if (newFacts.length > 0) onExtractFacts(newFacts); })
          .finally(() => setExtracting(false));
      },
      onError: (msg) => {
        setError(msg);
        setMessages(updatedMessages);
        setStreamingContent("");
        setLoading(false);
        inputRef.current?.focus();
      },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const suggestions = {
    Health: ["How am I doing with sleep?", "What should I improve health-wise?", "Log a workout", "I've been feeling tired lately"],
    Career: ["What should I focus on career-wise?", "Review my career goals", "I got feedback at work", "Help me prep for an interview"],
    Learning: ["What am I currently learning?", "Recommend what to read next", "I finished a book", "Help me understand a concept"],
    Projects: ["What projects am I working on?", "I'm blocked on something", "Project update", "Help me plan a project"],
    Finance: ["How are my finances?", "I want to start saving more", "Log an expense", "Review my financial goals"],
    Relationships: ["How are my relationships?", "I had a conversation I want to log", "Help me with a social situation", "Who should I reconnect with?"],
    Personal: ["What do I value most?", "Reflect on my habits", "I want to work on myself", "What patterns do you notice?"],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Space header */}
      <div style={{ padding: "16px 24px 12px", borderBottom: `1px solid ${persona.border}`, background: persona.dim, display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <span style={{ fontSize: "18px", color: persona.color }}>{persona.icon}</span>
        <div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: persona.color, letterSpacing: "0.04em" }}>{space}</div>
          <div style={{ fontSize: "11px", color: "#3a3a3a", marginTop: "1px" }}>
            {spaceFacts.length} facts · {messages.filter(m => m.role === "user").length} messages
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "11px", color: "#2a2a2a", background: "#111", border: "1px solid #1a1a1a", borderRadius: "4px", padding: "3px 8px" }}>
          {persona.role}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: "6px" }}>
            <span style={{ fontSize: "28px", color: persona.color, marginBottom: "8px" }}>{persona.icon}</span>
            <p style={{ fontSize: "16px", color: "#fff", fontWeight: "600", margin: 0 }}>Your {space} assistant.</p>
            <p style={{ color: "#3a3a3a", margin: "4px 0 16px", textAlign: "center", fontSize: "12px", lineHeight: "1.6", maxWidth: "320px" }}>
              Focused on {persona.focus.slice(0, 80)}...
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center", maxWidth: "400px" }}>
              {(suggestions[space] || []).map((s) => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  style={{ background: persona.dim, border: `1px solid ${persona.border}`, color: persona.color, borderRadius: "20px", padding: "5px 13px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "75%", padding: "10px 14px", borderRadius: "12px",
              fontSize: "13px", wordBreak: "break-word",
              background: msg.role === "user" ? persona.dim : "#141414",
              border: `1px solid ${msg.role === "user" ? persona.border : "#1e1e1e"}`,
              color: msg.role === "user" ? persona.color : "#c8c8c8",
            }}>
              {msg.role === "user"
                ? <span style={{ whiteSpace: "pre-wrap", lineHeight: "1.65" }}>{msg.content}</span>
                : renderMarkdown(msg.content)
              }
            </div>
          </div>
        ))}
        {loading && streamingContent === "" && (
          <div style={{ display: "flex" }}>
            <div style={{ background: "#141414", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "12px 16px", display: "flex", gap: "5px", alignItems: "center" }}>
              {[0, 200, 400].map((d) => (
                <span key={d} style={{ width: "5px", height: "5px", borderRadius: "50%", background: persona.color, display: "inline-block", opacity: 0.5, animation: "bounce 1.2s infinite ease-in-out", animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        {loading && streamingContent !== "" && (
          <div style={{ display: "flex" }}>
            <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: "12px", fontSize: "13px", wordBreak: "break-word", background: "#141414", border: "1px solid #1e1e1e", color: "#c8c8c8" }}>
              {renderMarkdown(streamingContent)}<span style={{ display: "inline-block", animation: "blink 1s infinite", color: "#666", marginLeft: "1px" }}>▋</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div style={{ margin: "0 24px 8px", background: "#140a0a", border: "1px solid #2a1010", color: "#f87171", borderRadius: "8px", padding: "8px 12px", fontSize: "12px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "8px", padding: "12px 24px", borderTop: "1px solid #161616", alignItems: "flex-end", flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          style={{ flex: 1, background: "#0f0f0f", border: `1px solid ${loading ? "#222" : persona.border}`, color: "#e8e8e8", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", outline: "none", fontFamily: "inherit", lineHeight: "1.5", resize: "none", maxHeight: "120px", overflowY: "auto", transition: "border-color 0.2s" }}
          placeholder={`Ask your ${space.toLowerCase()} assistant...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          style={{ width: "36px", height: "36px", borderRadius: "8px", background: loading || !input.trim() ? "#1a1a1a" : persona.color, color: loading || !input.trim() ? "#2a2a2a" : "#000", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >↑</button>
      </div>
    </div>
  );
}

// ─── Overall Chat Component ───────────────────────────────────────────────────
function OverallChat({ facts, apiKey, onExtractFacts, setExtracting }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState("");

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const saved = storageGet("aviator_history");
    if (saved) setMessages(saved);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const buildSystemPrompt = useCallback(() => {
    const memBlock = facts.length > 0
      ? `\n\nWhat you know about Avinaash:\n${facts.map((f) => `- [${f.space}] ${f.fact}`).join("\n")}`
      : "";
    return `You are Aviator, Avinaash's personal AI second brain. You are sharp, direct, and genuinely helpful.
You remember everything about Avinaash and use that context naturally in conversation — like a trusted assistant who knows him well.
You have full context across all areas of his life: health, career, learning, projects, finance, relationships, and personal growth.
Keep responses concise unless asked to elaborate. No fluff.${memBlock}`;
  }, [facts]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !apiKey) return;
    setInput("");
    setError("");

    const userMsg = { role: "user", content: text, ts: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);
    setStreamingContent("");

    const contextMessages = updatedMessages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }));

    streamChat({
      apiKey,
      model: CHAT_MODEL,
      systemPrompt: buildSystemPrompt(),
      messages: contextMessages,
      max_tokens: 1024,
      onToken: (partial) => setStreamingContent(partial),
      onDone: (reply) => {
        setStreamingContent("");
        setLoading(false);
        const assistantMsg = { role: "assistant", content: reply, ts: Date.now() };
        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);
        storageSet("aviator_history", finalMessages.slice(-MAX_HISTORY));
        inputRef.current?.focus();

        setExtracting(true);
        extractFacts({ apiKey, userMsg: text, assistantMsg: reply, existingFacts: facts })
          .then((newFacts) => { if (newFacts.length > 0) onExtractFacts(newFacts); })
          .finally(() => setExtracting(false));
      },
      onError: (msg) => {
        setError(msg);
        setMessages(updatedMessages);
        setStreamingContent("");
        setLoading(false);
        inputRef.current?.focus();
      },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "16px 24px 12px", borderBottom: "1px solid #1a1a1a", background: "#0d0d0d", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <span style={{ fontSize: "18px", color: "#e8e8e8" }}>✈</span>
        <div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", letterSpacing: "0.04em" }}>Overall</div>
          <div style={{ fontSize: "11px", color: "#3a3a3a", marginTop: "1px" }}>
            {facts.length} facts across all spaces · {messages.filter(m => m.role === "user").length} messages
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "11px", color: "#2a2a2a", background: "#111", border: "1px solid #1a1a1a", borderRadius: "4px", padding: "3px 8px" }}>
          full context
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: "6px" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>✈</div>
            <p style={{ fontSize: "16px", color: "#fff", fontWeight: "600", margin: 0 }}>Ready, Avinaash.</p>
            <p style={{ color: "#3a3a3a", margin: "4px 0 16px", textAlign: "center", fontSize: "12px", lineHeight: "1.6" }}>Full context. Ask me anything.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center", maxWidth: "420px" }}>
              {["What should I focus on today?", "What do you know about me?", "Connect the dots across my life", "What patterns do you notice?"].map((s) => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  style={{ background: "#111", border: "1px solid #1e1e1e", color: "#666", borderRadius: "20px", padding: "5px 13px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "75%", padding: "10px 14px", borderRadius: "12px",
              fontSize: "13px", wordBreak: "break-word",
              background: msg.role === "user" ? "#141e2a" : "#141414",
              border: `1px solid ${msg.role === "user" ? "#1e2e3e" : "#1e1e1e"}`,
              color: msg.role === "user" ? "#b8c8d8" : "#c8c8c8",
            }}>
              {msg.role === "user"
                ? <span style={{ whiteSpace: "pre-wrap", lineHeight: "1.65" }}>{msg.content}</span>
                : renderMarkdown(msg.content)
              }
            </div>
          </div>
        ))}
        {loading && streamingContent === "" && (
          <div style={{ display: "flex" }}>
            <div style={{ background: "#141414", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "12px 16px", display: "flex", gap: "5px", alignItems: "center" }}>
              {[0, 200, 400].map((d) => (
                <span key={d} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#444", display: "inline-block", animation: "bounce 1.2s infinite ease-in-out", animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        {loading && streamingContent !== "" && (
          <div style={{ display: "flex" }}>
            <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: "12px", fontSize: "13px", wordBreak: "break-word", background: "#141414", border: "1px solid #1e1e1e", color: "#c8c8c8" }}>
              {renderMarkdown(streamingContent)}<span style={{ display: "inline-block", animation: "blink 1s infinite", color: "#666", marginLeft: "1px" }}>▋</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div style={{ margin: "0 24px 8px", background: "#140a0a", border: "1px solid #2a1010", color: "#f87171", borderRadius: "8px", padding: "8px 12px", fontSize: "12px" }}>{error}</div>}

      <div style={{ display: "flex", gap: "8px", padding: "12px 24px", borderTop: "1px solid #161616", alignItems: "flex-end", flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          style={{ flex: 1, background: "#0f0f0f", border: "1px solid #222", color: "#e8e8e8", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", outline: "none", fontFamily: "inherit", lineHeight: "1.5", resize: "none", maxHeight: "120px", overflowY: "auto" }}
          placeholder="Tell me anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          style={{ width: "36px", height: "36px", borderRadius: "8px", background: loading || !input.trim() ? "#1a1a1a" : "#e8e8e8", color: loading || !input.trim() ? "#2a2a2a" : "#000", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >↑</button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AviatorAI() {
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);

  // Gist sync state
  const [githubToken, setGithubToken] = useState("");
  const [gistId, setGistId] = useState("");
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [gistIdInput, setGistIdInput] = useState("");
  const [gistConnected, setGistConnected] = useState(false);
  const [gistSyncing, setGistSyncing] = useState(false);
  const [gistError, setGistError] = useState("");
  const [setupStep, setSetupStep] = useState(1); // 1 = OpenRouter key, 2 = GitHub Gist
  const gistWriteTimer = useRef(null);
  const gistLoaded = useRef(false); // blocks writes until initial Gist fetch is done

  const [facts, setFacts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [activeView, setActiveView] = useState("overall"); // "overall" | space name | "memory" | "insights"
  const [insightLoading, setInsightLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");

  // Memory panel state
  const [activeSpace, setActiveSpace] = useState("All");
  const [editingFact, setEditingFact] = useState(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    const savedKey = storageGet("aviator_apikey");
    if (savedKey) { setApiKey(savedKey); setApiKeySet(true); }

    const savedGithubToken = storageGet("aviator_github_token");
    const savedGistId = storageGet("aviator_gist_id");
    if (savedGithubToken && savedGistId) {
      setGithubToken(savedGithubToken);
      setGistId(savedGistId);
      setGistConnected(true);
      // Hydrate from Gist on load
      setGistSyncing(true);
      gistRead({ gistId: savedGistId, githubToken: savedGithubToken })
        .then((remote) => {
          if (remote) {
            if (remote.facts?.length) { setFacts(remote.facts); storageSet("aviator_facts", remote.facts); }
            if (remote.insights?.length) { setInsights(remote.insights); storageSet("aviator_insights", remote.insights); }
          } else {
            const savedFacts = storageGet("aviator_facts");
            if (savedFacts) setFacts(savedFacts);
            const savedInsights = storageGet("aviator_insights");
            if (savedInsights) setInsights(savedInsights);
          }
        })
        .catch(() => {
          const savedFacts = storageGet("aviator_facts");
          if (savedFacts) setFacts(savedFacts);
          const savedInsights = storageGet("aviator_insights");
          if (savedInsights) setInsights(savedInsights);
        })
        .finally(() => { gistLoaded.current = true; setGistSyncing(false); });
    } else {
      const savedFacts = storageGet("aviator_facts");
      if (savedFacts) setFacts(savedFacts);
      const savedInsights = storageGet("aviator_insights");
      if (savedInsights) setInsights(savedInsights);
      gistLoaded.current = true;
    }
  }, []);

  const handleSetKey = () => {
    const key = apiKeyInput.trim();
    if (!key.startsWith("sk-or-")) { setError("Invalid OpenRouter key — should start with sk-or-"); return; }
    setApiKey(key);
    setApiKeySet(true);
    setError("");
    storageSet("aviator_apikey", key);
    setSetupStep(2); // advance to Gist setup
  };

  // Debounced Gist write — fires 2s after last fact/insight change
  const scheduledGistWrite = useCallback((newFacts, newInsights) => {
    if (!gistConnected || !gistLoaded.current) return;
    if (gistWriteTimer.current) clearTimeout(gistWriteTimer.current);
    gistWriteTimer.current = setTimeout(() => {
      setGistSyncing(true);
      gistWrite({ gistId, githubToken, facts: newFacts, insights: newInsights })
        .catch(() => {}) // silent fail — localStorage already saved
        .finally(() => setGistSyncing(false));
    }, 2000);
  }, [gistConnected, gistId, githubToken]);

  const handleConnectGist = async () => {
    const token = githubTokenInput.trim();
    const id = gistIdInput.trim();
    if (!token || !id) { setGistError("Both token and Gist ID are required"); return; }
    setGistError("");
    setGistSyncing(true);
    try {
      // Read existing Gist data first
      const remote = await gistRead({ gistId: id, githubToken: token });
      setGithubToken(token);
      setGistId(id);
      setGistConnected(true);
      storageSet("aviator_github_token", token);
      storageSet("aviator_gist_id", id);

      if (remote && remote.facts?.length) {
        // Gist has data — hydrate local state from it, do NOT write
        setFacts(remote.facts);
        storageSet("aviator_facts", remote.facts);
        if (remote.insights?.length) {
          setInsights(remote.insights);
          storageSet("aviator_insights", remote.insights);
        }
      } else {
        // Gist is empty — safe to push local data up (if any)
        await gistWrite({ gistId: id, githubToken: token, facts, insights });
      }
      gistLoaded.current = true;
    } catch (e) {
      setGistError(e.message || "Could not connect to Gist");
    } finally {
      setGistSyncing(false);
    }
  };

  const handleCreateGist = async () => {
    const token = githubTokenInput.trim();
    if (!token) { setGistError("GitHub token is required to create a Gist"); return; }
    setGistError("");
    setGistSyncing(true);
    try {
      const newId = await gistCreate({ githubToken: token });
      setGistIdInput(newId);
      setGistError("✓ Gist created! ID filled in above — click Connect.");
    } catch (e) {
      setGistError(e.message || "Could not create Gist");
    } finally {
      setGistSyncing(false);
    }
  };

  const handleExtractFacts = useCallback((newFacts) => {
    const enriched = newFacts.map((f) => ({ ...f, ts: Date.now() }));
    setFacts((prev) => {
      const filtered = enriched.filter((newF) =>
        !prev.some((ex) => ex.fact.toLowerCase().trim() === newF.fact.toLowerCase().trim())
      );
      if (filtered.length === 0) return prev;
      const updated = [...prev, ...filtered];
      storageSet("aviator_facts", updated);
      scheduledGistWrite(updated, insights);
      return updated;
    });
  }, [insights, scheduledGistWrite]);

  const handleGenerateInsights = async () => {
    if (facts.length < 5 || insightLoading) return;
    setInsightLoading(true);
    try {
      const newInsights = await generateInsights({ apiKey, facts });
      setInsights(newInsights);
      storageSet("aviator_insights", newInsights);
      scheduledGistWrite(facts, newInsights);
    } catch (e) { setError(e.message); }
    finally { setInsightLoading(false); }
  };

  // Fact CRUD
  const filteredFacts = activeSpace === "All" ? facts : facts.filter((f) => f.space === activeSpace);
  const spaceCounts = SPACES.reduce((acc, s) => { acc[s] = facts.filter((f) => f.space === s).length; return acc; }, {});

  const deleteFact = (filteredIdx) => {
    const globalIndex = facts.indexOf(filteredFacts[filteredIdx]);
    const updated = facts.filter((_, i) => i !== globalIndex);
    setFacts(updated);
    storageSet("aviator_facts", updated);
    scheduledGistWrite(updated, insights);
  };

  const startEditFact = (filteredIdx) => {
    const globalIndex = facts.indexOf(filteredFacts[filteredIdx]);
    setEditingFact(globalIndex);
    setEditText(facts[globalIndex].fact);
  };

  const saveEditFact = () => {
    if (editingFact === null || !editText.trim()) return;
    const updated = facts.map((f, i) => i === editingFact ? { ...f, fact: editText.trim() } : f);
    setFacts(updated);
    storageSet("aviator_facts", updated);
    scheduledGistWrite(updated, insights);
    setEditingFact(null);
    setEditText("");
  };

  // ── Setup Screen ──
  if (!apiKeySet || (setupStep === 2 && !gistConnected)) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a", fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace" }}>
        <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: "14px", padding: "36px 32px", width: "100%", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* Step indicator */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "4px" }}>
            {[1, 2].map((s) => (
              <div key={s} style={{ height: "3px", flex: 1, borderRadius: "2px", background: setupStep >= s ? "#e8e8e8" : "#1e1e1e", transition: "background 0.3s" }} />
            ))}
          </div>

          <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff", letterSpacing: "0.05em" }}>✈ Aviator.ai</div>

          {setupStep === 1 && (
            <>
              <p style={{ color: "#555", margin: 0, lineHeight: "1.65", fontSize: "13px" }}>Your personal second brain. Paste your free OpenRouter API key to get started.</p>
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontSize: "12px" }}>→ Get free key at openrouter.ai/keys</a>
              <p style={{ color: "#333", fontSize: "11px", margin: 0 }}>Sign up → Keys → Create Key. Free tier works fine.</p>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <input style={{ flex: 1, background: "#0a0a0a", border: "1px solid #222", color: "#e8e8e8", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", outline: "none", fontFamily: "inherit" }}
                  placeholder="sk-or-..." value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetKey()} type="password" autoFocus />
                <button style={{ background: "#e8e8e8", color: "#000", border: "none", borderRadius: "8px", padding: "10px 16px", cursor: "pointer", fontWeight: "600", fontSize: "13px", fontFamily: "inherit" }} onClick={handleSetKey}>Next →</button>
              </div>
              {error && <p style={{ color: "#f87171", fontSize: "12px", margin: 0 }}>{error}</p>}
              <p style={{ color: "#2a2a2a", fontSize: "11px", margin: 0 }}>🔒 Key stored locally. Never sent anywhere except OpenRouter.</p>
            </>
          )}

          {setupStep === 2 && (
            <>
              <p style={{ color: "#555", margin: 0, lineHeight: "1.65", fontSize: "13px" }}>Connect a private GitHub Gist to sync your memory across devices — forever, no pausing.</p>
              <div style={{ background: "#0a0a0a", border: "1px solid #161616", borderRadius: "8px", padding: "12px", fontSize: "11px", color: "#444", lineHeight: "1.7" }}>
                <div style={{ color: "#888", marginBottom: "6px", fontSize: "12px" }}>Setup (2 min):</div>
                <div>1. <a href="https://github.com/settings/tokens/new?scopes=gist&description=aviator-ai" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>Create GitHub token</a> with <code style={{ background: "#111", padding: "1px 4px", borderRadius: "3px", color: "#c084fc" }}>gist</code> scope</div>
                <div>2. Paste token below, click <strong style={{ color: "#ccc" }}>Create Gist</strong> to auto-create one</div>
                <div>3. Hit <strong style={{ color: "#ccc" }}>Connect</strong></div>
              </div>
              <input style={{ background: "#0a0a0a", border: "1px solid #222", color: "#e8e8e8", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", outline: "none", fontFamily: "inherit" }}
                placeholder="GitHub token (ghp_...)" value={githubTokenInput} onChange={(e) => setGithubTokenInput(e.target.value)} type="password" />
              <div style={{ display: "flex", gap: "8px" }}>
                <input style={{ flex: 1, background: "#0a0a0a", border: "1px solid #222", color: "#e8e8e8", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", outline: "none", fontFamily: "inherit" }}
                  placeholder="Gist ID (or create one →)" value={gistIdInput} onChange={(e) => setGistIdInput(e.target.value)} />
                <button
                  style={{ background: "transparent", color: "#60a5fa", border: "1px solid #1a2a3a", borderRadius: "8px", padding: "10px 12px", cursor: gistSyncing ? "not-allowed" : "pointer", fontSize: "11px", fontFamily: "inherit", whiteSpace: "nowrap" }}
                  onClick={handleCreateGist} disabled={gistSyncing}
                >+ create</button>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  style={{ flex: 1, background: gistSyncing ? "#1a1a1a" : "#e8e8e8", color: gistSyncing ? "#2a2a2a" : "#000", border: "none", borderRadius: "8px", padding: "10px 16px", cursor: gistSyncing ? "not-allowed" : "pointer", fontWeight: "600", fontSize: "13px", fontFamily: "inherit" }}
                  onClick={handleConnectGist} disabled={gistSyncing}
                >{gistSyncing ? "connecting..." : "Connect Gist"}</button>
                <button
                  style={{ background: "transparent", color: "#3a3a3a", border: "1px solid #1a1a1a", borderRadius: "8px", padding: "10px 14px", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }}
                  onClick={() => { setSetupStep(3); }}
                >skip →</button>
              </div>
              {gistError && <p style={{ color: gistError.startsWith("✓") ? "#4ade80" : "#f87171", fontSize: "12px", margin: 0 }}>{gistError}</p>}
              <p style={{ color: "#2a2a2a", fontSize: "11px", margin: 0 }}>Memory syncs silently after every conversation. Works on any browser.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isSpaceView = SPACES.includes(activeView);
  const currentPersona = isSpaceView ? SPACE_PERSONAS[activeView] : null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace", fontSize: "13px" }}>

      {/* ── Sidebar ── */}
      <div style={{ width: "200px", minWidth: "200px", background: "#0c0c0c", borderRight: "1px solid #161616", display: "flex", flexDirection: "column", padding: "16px 12px", gap: "0", overflowY: "auto" }}>
        <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", letterSpacing: "0.05em", marginBottom: "18px", paddingBottom: "14px", borderBottom: "1px solid #1a1a1a" }}>✈ Aviator.ai</div>

        {/* SPACES section */}
        <div style={{ fontSize: "9px", color: "#555", letterSpacing: "0.12em", fontWeight: "700", marginBottom: "6px", paddingLeft: "10px" }}>SPACES</div>

        {/* Overall */}
        <button
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: activeView === "overall" ? "#1a1a1a" : "transparent", border: "none", color: activeView === "overall" ? "#e8e8e8" : "#888", cursor: "pointer", borderRadius: "6px", fontSize: "12px", textAlign: "left", fontFamily: "inherit", width: "100%", marginBottom: "1px" }}
          onClick={() => setActiveView("overall")}
        >
          <span style={{ fontSize: "10px", color: activeView === "overall" ? "#e8e8e8" : "#666" }}>✈</span>
          Overall
          <span style={{ marginLeft: "auto", fontSize: "10px", color: "#666" }}>{facts.length}</span>
        </button>

        {SPACES.map((space) => {
          const p = SPACE_PERSONAS[space];
          const active = activeView === space;
          return (
            <button key={space}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: active ? p.dim : "transparent", border: `1px solid ${active ? p.border : "transparent"}`, color: active ? p.color : "#888", cursor: "pointer", borderRadius: "6px", fontSize: "12px", textAlign: "left", fontFamily: "inherit", width: "100%", marginBottom: "1px", transition: "all 0.12s" }}
              onClick={() => setActiveView(space)}
            >
              <span style={{ fontSize: "10px" }}>{p.icon}</span>
              {space}
              {spaceCounts[space] > 0 && <span style={{ marginLeft: "auto", fontSize: "10px", color: active ? p.color : "#666" }}>{spaceCounts[space]}</span>}
            </button>
          );
        })}

        {/* TOOLS section */}
        <div style={{ fontSize: "9px", color: "#555", letterSpacing: "0.12em", fontWeight: "700", margin: "16px 0 6px", paddingLeft: "10px", borderTop: "1px solid #222", paddingTop: "14px" }}>TOOLS</div>

        {[
          { id: "memory", label: "Memory", icon: "◈" },
          { id: "insights", label: "Insights", icon: "◆" },
        ].map((item) => (
          <button key={item.id}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: activeView === item.id ? "#1a1a1a" : "transparent", border: "none", color: activeView === item.id ? "#e8e8e8" : "#888", cursor: "pointer", borderRadius: "6px", fontSize: "12px", textAlign: "left", fontFamily: "inherit", width: "100%", marginBottom: "1px" }}
            onClick={() => setActiveView(item.id)}
          >
            <span style={{ fontSize: "9px", opacity: 0.7 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        {/* Stats + bottom */}
        <div style={{ marginTop: "auto", paddingTop: "14px", borderTop: "1px solid #222", display: "flex", flexDirection: "column", gap: "5px" }}>
          {[["facts", facts.length], ["insights", insights.length]].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#666", fontSize: "10px" }}>{label}</span>
              <span style={{ color: "#fff", fontWeight: "600", fontSize: "12px" }}>{val}</span>
            </div>
          ))}
          {extracting && <div style={{ fontSize: "10px", color: "#f59e0b", background: "#140f00", border: "1px solid #2a1e00", borderRadius: "4px", padding: "3px 7px", textAlign: "center", marginTop: "4px" }}>⚡ learning...</div>}
          {gistConnected && (
            <div style={{ fontSize: "10px", color: gistSyncing ? "#60a5fa" : "#4a7a4a", background: gistSyncing ? "#0d1a2a" : "#0d140d", border: `1px solid ${gistSyncing ? "#1a2e3d" : "#1a2e1a"}`, borderRadius: "4px", padding: "3px 7px", textAlign: "center", marginTop: "2px", transition: "all 0.3s" }}>
              {gistSyncing ? "↻ syncing..." : "● gist synced"}
            </div>
          )}
          {!gistConnected && (
            <button style={{ fontSize: "10px", color: "#888", background: "transparent", border: "1px solid #333", borderRadius: "4px", padding: "3px 7px", cursor: "pointer", fontFamily: "inherit", marginTop: "2px" }}
              onClick={() => setSetupStep(2)}>
              + connect gist
            </button>
          )}
        </div>

        <button
          style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#555", borderRadius: "6px", padding: "5px 10px", cursor: "pointer", fontSize: "10px", marginTop: "8px", fontFamily: "inherit" }}
          onClick={() => { setApiKey(""); setApiKeySet(false); setApiKeyInput(""); setGithubToken(""); setGistId(""); setGistConnected(false); setSetupStep(1); storageSet("aviator_apikey", null); storageSet("aviator_github_token", null); storageSet("aviator_gist_id", null); }}
        >✕ disconnect</button>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {activeView === "overall" && (
          <OverallChat facts={facts} apiKey={apiKey} onExtractFacts={handleExtractFacts} setExtracting={setExtracting} />
        )}

        {isSpaceView && (
          <SpaceChat key={activeView} space={activeView} facts={facts} apiKey={apiKey} onExtractFacts={handleExtractFacts} setExtracting={setExtracting} />
        )}

        {/* MEMORY */}
        {activeView === "memory" && (
          <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#fff", margin: 0 }}>Memory Bank</h2>
              <span style={{ color: "#3a3a3a", fontSize: "12px" }}>{facts.length} facts stored</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {["All", ...SPACES].map((s) => {
                const p = s !== "All" ? SPACE_PERSONAS[s] : null;
                const active = activeSpace === s;
                return (
                  <button key={s}
                    style={{ background: active ? (p ? p.dim : "#1a1a1a") : "#0f0f0f", border: `1px solid ${active ? (p ? p.border : "#2a2a2a") : "#1a1a1a"}`, color: active ? (p ? p.color : "#ccc") : "#444", borderRadius: "20px", padding: "4px 11px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px" }}
                    onClick={() => setActiveSpace(s)}
                  >
                    {p && <span>{p.icon}</span>}
                    {s}
                    {s !== "All" && spaceCounts[s] > 0 && <span style={{ background: "#1e1e1e", borderRadius: "10px", padding: "1px 5px", fontSize: "10px", color: "#555" }}>{spaceCounts[s]}</span>}
                  </button>
                );
              })}
            </div>
            {filteredFacts.length === 0
              ? <p style={{ color: "#444", margin: "4px 0", textAlign: "center", lineHeight: "1.6" }}>No facts in {activeSpace} yet. Start chatting.</p>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {[...filteredFacts].reverse().map((f, i) => {
                    const reversedIdx = filteredFacts.length - 1 - i;
                    const globalIdx = facts.indexOf(filteredFacts[reversedIdx]);
                    const isEditing = editingFact === globalIdx;
                    const p = SPACE_PERSONAS[f.space];
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#0f0f0f", border: "1px solid #161616", borderRadius: "7px", padding: "9px 13px" }}
                        onMouseEnter={(e) => { e.currentTarget.querySelector(".fact-actions").style.opacity = "1"; }}
                        onMouseLeave={(e) => { e.currentTarget.querySelector(".fact-actions").style.opacity = "0"; }}
                      >
                        <span style={{ fontSize: "10px", color: p?.color || "#555", background: p?.dim || "#161616", border: `1px solid ${p?.border || "#222"}`, borderRadius: "4px", padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>{f.space}</span>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: "6px", flex: 1, alignItems: "center" }}>
                            <input style={{ flex: 1, background: "#0a0a0a", border: "1px solid #333", color: "#e8e8e8", borderRadius: "5px", padding: "4px 8px", fontSize: "12px", outline: "none", fontFamily: "inherit" }}
                              value={editText} onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEditFact(); if (e.key === "Escape") { setEditingFact(null); setEditText(""); } }}
                              autoFocus />
                            <button style={{ background: "#1a2a1a", border: "1px solid #1e3a1e", color: "#4a9a4a", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }} onClick={saveEditFact}>✓</button>
                            <button style={{ background: "transparent", border: "1px solid #1e1e1e", color: "#444", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }} onClick={() => { setEditingFact(null); setEditText(""); }}>✕</button>
                          </div>
                        ) : (
                          <>
                            <span style={{ color: "#b8b8b8", flex: 1, lineHeight: "1.5" }}>{f.fact}</span>
                            <span style={{ color: "#2a2a2a", fontSize: "10px", whiteSpace: "nowrap", flexShrink: 0 }}>{new Date(f.ts).toLocaleDateString()}</span>
                            <div className="fact-actions" style={{ display: "flex", gap: "4px", flexShrink: 0, opacity: 0, transition: "opacity 0.15s" }}>
                              <button style={{ background: "transparent", border: "1px solid #1e1e1e", color: "#444", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }} onClick={() => startEditFact(reversedIdx)}>✎</button>
                              <button style={{ background: "transparent", border: "1px solid #2a1010", color: "#7a3030", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }} onClick={() => deleteFact(reversedIdx)}>✕</button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        )}

        {/* INSIGHTS */}
        {activeView === "insights" && (
          <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#fff", margin: 0 }}>Insights</h2>
              <button
                style={{ background: facts.length < 5 || insightLoading ? "#1a1a1a" : "#e8e8e8", color: facts.length < 5 || insightLoading ? "#2a2a2a" : "#000", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: facts.length < 5 || insightLoading ? "not-allowed" : "pointer", fontWeight: "600", fontSize: "12px", fontFamily: "inherit" }}
                onClick={handleGenerateInsights} disabled={facts.length < 5 || insightLoading}
              >{insightLoading ? "thinking..." : "↻ generate"}</button>
            </div>
            {facts.length < 5 && <p style={{ color: "#444", margin: "4px 0", lineHeight: "1.6" }}>Need at least 5 stored facts to generate insights. Keep chatting.</p>}
            {facts.length >= 5 && insights.length === 0 && !insightLoading && <p style={{ color: "#444", margin: "4px 0" }}>Hit generate to analyze your memory.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <span style={{ color: "#e8e8e8", fontWeight: "600", fontSize: "13px" }}>{ins.title}</span>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {(ins.spaces || []).map((s) => {
                        const p = SPACE_PERSONAS[s];
                        return <span key={s} style={{ fontSize: "10px", color: p?.color || "#444", background: p?.dim || "#141414", border: `1px solid ${p?.border || "#1e1e1e"}`, borderRadius: "4px", padding: "2px 6px" }}>{s}</span>;
                      })}
                    </div>
                  </div>
                  <p style={{ color: "#666", lineHeight: "1.7", margin: 0, fontSize: "12px" }}>{ins.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-6px);opacity:1} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        textarea{resize:none;max-height:160px;overflow-y:auto;}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0a0a0a}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:2px}
      `}</style>
    </div>
  );
}