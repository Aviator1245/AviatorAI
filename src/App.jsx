import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://obgrcjlcadpxailrbijq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZ3JjamxjYWRweGFpbHJiaWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzYxODAsImV4cCI6MjA5MzExMjE4MH0.unQCiT0yW_UOUdfzhKncwTRCoI62FnDSf-aWDf0OojI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Constants ────────────────────────────────────────────────────────────────
const SPACES = ["Health", "Career", "Learning", "Projects", "Finance", "Relationships", "Personal"];
const CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct";
const EXTRACT_MODEL = "meta-llama/llama-3.1-8b-instruct";
const MAX_HISTORY = 20;
const TODAY = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const EDGE_URL = `${SUPABASE_URL}/functions/v1/openrouter-proxy`;
const CONFIG_URL = `${SUPABASE_URL}/functions/v1/get-config`;

const SPACE_PERSONAS = {
  Health: { icon: "♡", color: "#4ade80", dim: "#0d2a1a", border: "#1a3d2a", role: "personal health advisor", focus: "physical health, mental wellness, fitness, nutrition, sleep, medical concerns, energy levels, and habits affecting wellbeing" },
  Career: { icon: "◈", color: "#60a5fa", dim: "#0d1a2a", border: "#1a2e3d", role: "career strategist and professional coach", focus: "career growth, job applications, skills development, professional relationships, salary, work performance, and long-term career goals" },
  Learning: { icon: "◉", color: "#c084fc", dim: "#1a0d2a", border: "#2e1a3d", role: "learning coach and knowledge curator", focus: "books, courses, skills being learned, study habits, areas of intellectual interest, and knowledge gaps to fill" },
  Projects: { icon: "⬡", color: "#fb923c", dim: "#2a1200", border: "#3d2000", role: "project manager and technical advisor", focus: "ongoing projects, technical challenges, timelines, blockers, tools being used, and project goals" },
  Finance: { icon: "◎", color: "#facc15", dim: "#2a2000", border: "#3d3000", role: "personal finance advisor", focus: "savings, expenses, investments, income, financial goals, budgeting, and money habits" },
  Relationships: { icon: "◌", color: "#f472b6", dim: "#2a0d1a", border: "#3d1a2e", role: "relationship and social coach", focus: "friendships, family dynamics, romantic relationships, social energy, communication patterns, and important people in life" },
  Personal: { icon: "◇", color: "#94a3b8", dim: "#141a20", border: "#1e2a35", role: "personal growth companion", focus: "identity, values, mindset, personal habits, life philosophy, self-improvement, emotional patterns, and things that matter most" },
};

// ─── Markdown Renderer ────────────────────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) { const m = lines[i].match(/^\d+\.\s+(.*)/); items.push(m[1]); i++; }
      elements.push(<ol key={i} style={{ margin: "8px 0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>{items.map((item, idx) => <li key={idx} style={{ lineHeight: "1.6", color: "inherit" }}><span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} /></li>)}</ol>);
      continue;
    }
    const bulletMatch = line.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*•]\s+/)) { const m = lines[i].match(/^[-*•]\s+(.*)/); items.push(m[1]); i++; }
      elements.push(<ul key={i} style={{ margin: "8px 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>{items.map((item, idx) => <li key={idx} style={{ lineHeight: "1.6", color: "inherit" }}><span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} /></li>)}</ul>);
      continue;
    }
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) { elements.push(<div key={i} style={{ fontWeight: "700", fontSize: "14px", color: "#e8e8e8", marginTop: "10px", marginBottom: "4px" }}><span dangerouslySetInnerHTML={{ __html: inlineFormat(headingMatch[1]) }} /></div>); i++; continue; }
    if (line.trim() === "") { elements.push(<div key={i} style={{ height: "6px" }} />); i++; continue; }
    elements.push(<div key={i} style={{ lineHeight: "1.65", color: "inherit" }}><span dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} /></div>);
    i++;
  }
  return <>{elements}</>;
}
function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong style='font-weight:600;color:#e8e8e8'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code style='background:#1e1e1e;border:1px solid #2a2a2a;border-radius:3px;padding:1px 5px;font-size:12px;font-family:monospace'>$1</code>");
}

// ─── AI via Edge Function (no API key in frontend) ────────────────────────────
async function callAI({ session, model, systemPrompt, messages, max_tokens = 1024, json = false }) {
  const jwt = session?.access_token;
  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      model,
      messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), ...messages],
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

async function streamChat({ session, model, systemPrompt, messages, max_tokens = 1024, onToken, onDone, onError }) {
  const jwt = session?.access_token;
  let res;
  try {
    res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        model, stream: true,
        messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), ...messages],
        max_tokens, temperature: 0.7,
      }),
    });
  } catch (e) { onError(e.message); return; }

  if (!res.ok) { const err = await res.json().catch(() => ({})); onError(err?.error?.message || `API error ${res.status}`); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "", tokenQueue = "", drainInterval = null;
  const CHAR_DELAY = 18;
  const startDrain = () => {
    if (drainInterval) return;
    let displayed = "";
    drainInterval = setInterval(() => {
      if (tokenQueue.length > 0) { displayed += tokenQueue[0]; tokenQueue = tokenQueue.slice(1); onToken(displayed); }
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
        if (data === "[DONE]") { const wait = () => { if (tokenQueue.length === 0) { clearInterval(drainInterval); onDone(fullText); } else setTimeout(wait, CHAR_DELAY * 2); }; wait(); return; }
        try { const parsed = JSON.parse(data); const token = parsed.choices?.[0]?.delta?.content; if (token) { fullText += token; tokenQueue += token; startDrain(); } } catch {}
      }
    }
    const wait = () => { if (tokenQueue.length === 0) { clearInterval(drainInterval); onDone(fullText); } else setTimeout(wait, CHAR_DELAY * 2); };
    wait();
  } catch (e) { clearInterval(drainInterval); onError(e.message); }
}

// ─── Supabase Data Layer ──────────────────────────────────────────────────────
async function dbLoadFacts(userId) {
  const { data } = await supabase.from("memory_facts").select("*").eq("user_id", userId).order("created_at");
  return (data || []).map(r => ({ id: r.id, fact: r.fact, space: r.space, ts: new Date(r.created_at).getTime() }));
}
async function dbInsertFacts(userId, newFacts) {
  const rows = newFacts.map(f => ({ user_id: userId, fact: f.fact, space: f.space }));
  const { data } = await supabase.from("memory_facts").insert(rows).select();
  return (data || []).map(r => ({ id: r.id, fact: r.fact, space: r.space, ts: new Date(r.created_at).getTime() }));
}
async function dbDeleteFact(factId) { await supabase.from("memory_facts").delete().eq("id", factId); }
async function dbUpdateFact(factId, newText) { await supabase.from("memory_facts").update({ fact: newText }).eq("id", factId); }

async function dbLoadTasks(userId) {
  const { data } = await supabase.from("tasks").select("*").eq("user_id", userId).order("created_at");
  return (data || []).map(r => ({ id: r.id, text: r.title, priority: r.space || "medium", dueDate: r.due_date, startTime: r.start_time, endTime: r.end_time, done: r.done, createdAt: new Date(r.created_at).getTime() }));
}
async function dbInsertTask(userId, task) {
  const { data } = await supabase.from("tasks").insert([{ user_id: userId, title: task.text, space: task.priority, due_date: task.dueDate, start_time: task.startTime, end_time: task.endTime, done: false }]).select().single();
  if (!data) return task;
  return { id: data.id, text: data.title, priority: data.space || "medium", dueDate: data.due_date, startTime: data.start_time, endTime: data.end_time, done: data.done, createdAt: new Date(data.created_at).getTime() };
}
async function dbToggleTask(taskId, done) { await supabase.from("tasks").update({ done }).eq("id", taskId); }
async function dbDeleteTask(taskId) { await supabase.from("tasks").delete().eq("id", taskId); }

async function dbLoadHabits(userId) {
  const { data } = await supabase.from("habits").select("*").eq("user_id", userId).order("sort_order");
  return (data || []).map(r => ({ id: r.id, name: r.name, icon: r.icon, color: r.color }));
}
async function dbInsertHabit(userId, habit) {
  const { data } = await supabase.from("habits").insert([{ user_id: userId, name: habit.name, icon: habit.icon, color: habit.color }]).select().single();
  return data ? { id: data.id, name: data.name, icon: data.icon, color: data.color } : habit;
}
async function dbDeleteHabit(habitId) { await supabase.from("habits").delete().eq("id", habitId); }

async function dbLoadHabitLogs(userId) {
  const { data } = await supabase.from("habit_logs").select("*").eq("user_id", userId);
  const logs = {};
  (data || []).forEach(r => { if (!logs[r.date]) logs[r.date] = {}; logs[r.date][r.habit_id] = r.done; });
  return logs;
}
async function dbUpsertHabitLog(userId, habitId, date, done) {
  await supabase.from("habit_logs").upsert([{ user_id: userId, habit_id: habitId, date, done }], { onConflict: "user_id,habit_id,date" });
}

async function dbLoadChatHistory(userId, space) {
  const { data } = await supabase.from("chat_history").select("messages").eq("user_id", userId).eq("space", space).maybeSingle();
  return data?.messages || [];
}
async function dbSaveChatHistory(userId, space, messages) {
  await supabase.from("chat_history").upsert([{ user_id: userId, space, messages, updated_at: new Date().toISOString() }], { onConflict: "user_id,space" });
}

async function dbLoadInsights(userId) {
  const { data } = await supabase.from("chat_history").select("messages").eq("user_id", userId).eq("space", "__insights__").maybeSingle();
  return data?.messages || [];
}
async function dbSaveInsights(userId, insights) {
  await supabase.from("chat_history").upsert([{ user_id: userId, space: "__insights__", messages: insights, updated_at: new Date().toISOString() }], { onConflict: "user_id,space" });
}

// ─── Fact / Task Extractors ───────────────────────────────────────────────────
async function extractFacts({ session, userMsg, assistantMsg, existingFacts }) {
  const existingSample = existingFacts.slice(-30).map(f => f.fact).join("\n");
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
    const raw = await callAI({ session, model: EXTRACT_MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 512, json: true });
    const parsed = JSON.parse(raw);
    return (parsed.facts || []).filter(f => f.fact && SPACES.includes(f.space));
  } catch { return []; }
}

async function extractTasks({ session, userMsg, assistantMsg, existingTasks }) {
  const existingSample = existingTasks.slice(-20).map(t => t.text).join("\n");
  const todayStr = new Date().toISOString().slice(0, 10);
  const prompt = `You are a task extractor for a personal AI assistant called Aviator.ai.
Today's date is ${todayStr}. Use this to resolve relative dates like "today", "tomorrow", "next Monday".
Extract actionable tasks/reminders from the conversation below.
Trigger phrases: "remind me to", "I need to", "I should", "follow up on", "don't forget to", "I have to", "I want to", "I'll", "I plan to", "make sure to", "remember to", "add a task", "schedule", "call", "meeting".
RULES:
1. Only extract clear, actionable tasks.
2. Do NOT extract general info, facts, or vague statements.
3. Infer priority: high = urgent/today, medium = soon/important, low = someday.
4. Infer due date from context using today's date (${todayStr}). "today" = ${todayStr}. "tomorrow" = next day. Always output YYYY-MM-DD or null.
5. Infer startTime and endTime from context. "6 to 7 PM" = startTime "18:00", endTime "19:00". "10-11am" = startTime "10:00", endTime "11:00". Always use 24h HH:MM format or null.
6. Keep task text clean — do not include the date/time in the text since it's stored separately.
Existing tasks (do not duplicate):
${existingSample || "(none)"}
User said: "${userMsg}"
Assistant said: "${assistantMsg}"
Respond ONLY with valid JSON:
{"tasks": [{"text": "...", "priority": "high|medium|low", "dueDate": "YYYY-MM-DD or null", "startTime": "HH:MM or null", "endTime": "HH:MM or null"}]}
If no tasks, return: {"tasks": []}`;
  try {
    const raw = await callAI({ session, model: EXTRACT_MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 512, json: true });
    const parsed = JSON.parse(raw);
    return (parsed.tasks || []).filter(t => t.text);
  } catch { return []; }
}

async function generateInsights({ session, facts }) {
  if (facts.length < 5) return [];
  const factList = facts.map(f => `[${f.space}] ${f.fact}`).join("\n");
  const prompt = `You are an insight engine for a personal second brain.
Based on these facts about the user, generate 3-5 meaningful insights, patterns, or suggestions.
Be specific and actionable. Focus on connections across different life areas.
Facts:
${factList}
Respond ONLY with valid JSON:
{"insights": [{"title": "...", "body": "...", "spaces": ["Space1", "Space2"]}]}`;
  try {
    const raw = await callAI({ session, model: EXTRACT_MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 800, json: true });
    const parsed = JSON.parse(raw);
    return parsed.insights || [];
  } catch { return []; }
}

// ─── Google Calendar ──────────────────────────────────────────────────────────
function loadGoogleAPI() {
  return new Promise((resolve) => {
    if (window.google?.accounts) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

async function getGoogleToken(clientId) {
  await loadGoogleAPI();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("OAuth timeout — popup may have been closed")), 60000);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.events",
      callback: (resp) => {
        clearTimeout(timeout);
        console.log("CAL: OAuth callback resp=", JSON.stringify(resp));
        if (resp.error) reject(new Error(resp.error + (resp.error_description ? ": " + resp.error_description : "")));
        else if (!resp.access_token) reject(new Error("No access token returned"));
        else resolve(resp.access_token);
      },
      error_callback: (err) => {
        clearTimeout(timeout);
        console.error("CAL: OAuth error_callback=", JSON.stringify(err));
        reject(new Error(err?.type || err?.message || "OAuth error"));
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

// ─── FIX: Pass datetime string directly with timeZone — don't convert via toISOString() ───
async function createCalendarEvent({ accessToken, title, date, startTime, endTime }) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: title,
      start: { dateTime: `${date}T${startTime}:00`, timeZone },
      end:   { dateTime: `${date}T${endTime}:00`,   timeZone },
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Calendar API error ${res.status}`);
  }
  return await res.json();
}

// ─── Space Chat ───────────────────────────────────────────────────────────────
function SpaceChat({ space, facts, tasks, session, userId, onExtractFacts, onExtractTasks, setExtracting }) {
  const persona = SPACE_PERSONAS[space];
  const spaceFacts = facts.filter(f => f.space === space);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setHistoryLoaded(false);
    dbLoadChatHistory(userId, space).then(msgs => { setMessages(msgs); setHistoryLoaded(true); });
  }, [space, userId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const buildSystemPrompt = () => {
    const memBlock = spaceFacts.length > 0 ? `\n\nWhat you know about Avinaash (${space} context):\n${spaceFacts.map(f => `- ${f.fact}`).join("\n")}` : "";
    const taskBlock = tasks.filter(t => !t.done).length > 0 ? `\n\nPending tasks:\n${tasks.filter(t => !t.done).map(t => `- [${t.priority}] ${t.text}${t.dueDate ? ` (due ${t.dueDate})` : ""}`).join("\n")}` : "";
    return `You are Aviator, Avinaash's personal ${persona.role}. You are sharp, focused, and genuinely helpful.\nToday's date is ${TODAY}.\nThis is the ${space} space — stay focused on ${persona.focus}.\nYou remember everything relevant to this area and use it naturally in conversation.\nKeep responses concise unless asked to elaborate. No fluff.${memBlock}${taskBlock}`;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput(""); setError("");
    const userMsg = { role: "user", content: text, ts: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true); setStreamingContent("");
    const contextMessages = updatedMessages.slice(-MAX_HISTORY).map(m => ({ role: m.role, content: m.content }));
    streamChat({
      session, model: CHAT_MODEL, systemPrompt: buildSystemPrompt(), messages: contextMessages, max_tokens: 1024,
      onToken: (partial) => setStreamingContent(partial),
      onDone: (reply) => {
        setStreamingContent(""); setLoading(false);
        const assistantMsg = { role: "assistant", content: reply, ts: Date.now() };
        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);
        dbSaveChatHistory(userId, space, finalMessages.slice(-MAX_HISTORY));
        inputRef.current?.focus();
        setExtracting(true);
        extractFacts({ session, userMsg: text, assistantMsg: reply, existingFacts: facts })
          .then(newFacts => { if (newFacts.length > 0) onExtractFacts(newFacts); })
          .finally(() => {
            extractTasks({ session, userMsg: text, assistantMsg: reply, existingTasks: tasks })
              .then(newTasks => { if (newTasks.length > 0) onExtractTasks(newTasks); })
              .finally(() => setExtracting(false));
          });
      },
      onError: (msg) => { setError(msg); setMessages(updatedMessages); setStreamingContent(""); setLoading(false); inputRef.current?.focus(); },
    });
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
      <div style={{ padding: "16px 24px 12px", borderBottom: `1px solid ${persona.border}`, background: persona.dim, display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <span style={{ fontSize: "18px", color: persona.color }}>{persona.icon}</span>
        <div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: persona.color, letterSpacing: "0.04em" }}>{space}</div>
          <div style={{ fontSize: "11px", color: "#3a3a3a", marginTop: "1px" }}>{spaceFacts.length} facts · {messages.filter(m => m.role === "user").length} messages</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "11px", color: "#2a2a2a", background: "#111", border: "1px solid #1a1a1a", borderRadius: "4px", padding: "3px 8px" }}>{persona.role}</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {!historyLoaded && <div style={{ color: "#333", textAlign: "center", marginTop: "40px" }}>loading...</div>}
        {historyLoaded && messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: "6px" }}>
            <span style={{ fontSize: "28px", color: persona.color, marginBottom: "8px" }}>{persona.icon}</span>
            <p style={{ fontSize: "16px", color: "#fff", fontWeight: "600", margin: 0 }}>Your {space} assistant.</p>
            <p style={{ color: "#3a3a3a", margin: "4px 0 16px", textAlign: "center", fontSize: "12px", lineHeight: "1.6", maxWidth: "320px" }}>Focused on {persona.focus.slice(0, 80)}...</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center", maxWidth: "400px" }}>
              {(suggestions[space] || []).map(s => <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} style={{ background: persona.dim, border: `1px solid ${persona.border}`, color: persona.color, borderRadius: "20px", padding: "5px 13px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: "12px", fontSize: "13px", wordBreak: "break-word", background: msg.role === "user" ? persona.dim : "#141414", border: `1px solid ${msg.role === "user" ? persona.border : "#1e1e1e"}`, color: msg.role === "user" ? persona.color : "#c8c8c8" }}>
              {msg.role === "user" ? <span style={{ whiteSpace: "pre-wrap", lineHeight: "1.65" }}>{msg.content}</span> : renderMarkdown(msg.content)}
            </div>
          </div>
        ))}
        {loading && streamingContent === "" && <div style={{ display: "flex" }}><div style={{ background: "#141414", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "12px 16px", display: "flex", gap: "5px", alignItems: "center" }}>{[0, 200, 400].map(d => <span key={d} style={{ width: "5px", height: "5px", borderRadius: "50%", background: persona.color, display: "inline-block", opacity: 0.5, animation: "bounce 1.2s infinite ease-in-out", animationDelay: `${d}ms` }} />)}</div></div>}
        {loading && streamingContent !== "" && <div style={{ display: "flex" }}><div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: "12px", fontSize: "13px", wordBreak: "break-word", background: "#141414", border: "1px solid #1e1e1e", color: "#c8c8c8" }}>{renderMarkdown(streamingContent)}<span style={{ display: "inline-block", animation: "blink 1s infinite", color: "#666", marginLeft: "1px" }}>▋</span></div></div>}
        <div ref={bottomRef} />
      </div>
      {error && <div style={{ margin: "0 24px 8px", background: "#140a0a", border: "1px solid #2a1010", color: "#f87171", borderRadius: "8px", padding: "8px 12px", fontSize: "12px" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px", padding: "12px 24px", borderTop: "1px solid #161616", alignItems: "flex-end", flexShrink: 0 }}>
        <textarea ref={inputRef} style={{ flex: 1, background: "#0f0f0f", border: `1px solid ${loading ? "#222" : persona.border}`, color: "#e8e8e8", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", outline: "none", fontFamily: "inherit", lineHeight: "1.5", resize: "none", maxHeight: "120px", overflowY: "auto", transition: "border-color 0.2s" }} placeholder={`Ask your ${space.toLowerCase()} assistant...`} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} rows={1} />
        <button style={{ width: "36px", height: "36px", borderRadius: "8px", background: loading || !input.trim() ? "#1a1a1a" : persona.color, color: loading || !input.trim() ? "#2a2a2a" : "#000", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onClick={sendMessage} disabled={loading || !input.trim()}>↑</button>
      </div>
    </div>
  );
}

// ─── Overall Chat ─────────────────────────────────────────────────────────────
function OverallChat({ facts, tasks, session, userId, onExtractFacts, onExtractTasks, setExtracting }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    dbLoadChatHistory(userId, "__overall__").then(msgs => { setMessages(msgs); setHistoryLoaded(true); });
  }, [userId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const buildSystemPrompt = useCallback(() => {
    const memBlock = facts.length > 0 ? `\n\nWhat you know about Avinaash:\n${facts.map(f => `- [${f.space}] ${f.fact}`).join("\n")}` : "";
    const taskBlock = tasks.filter(t => !t.done).length > 0 ? `\n\nPending tasks:\n${tasks.filter(t => !t.done).map(t => `- [${t.priority}] ${t.text}${t.dueDate ? ` (due ${t.dueDate})` : ""}`).join("\n")}` : "";
    return `You are Aviator, Avinaash's personal AI second brain. You are sharp, direct, and genuinely helpful.\nToday's date is ${TODAY}.\nYou remember everything about Avinaash and use that context naturally in conversation — like a trusted assistant who knows him well.\nYou have full context across all areas of his life: health, career, learning, projects, finance, relationships, and personal growth.\nKeep responses concise unless asked to elaborate. No fluff.${memBlock}${taskBlock}`;
  }, [facts, tasks]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput(""); setError("");
    const userMsg = { role: "user", content: text, ts: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages); setLoading(true); setStreamingContent("");
    const contextMessages = updatedMessages.slice(-MAX_HISTORY).map(m => ({ role: m.role, content: m.content }));
    streamChat({
      session, model: CHAT_MODEL, systemPrompt: buildSystemPrompt(), messages: contextMessages, max_tokens: 1024,
      onToken: partial => setStreamingContent(partial),
      onDone: (reply) => {
        setStreamingContent(""); setLoading(false);
        const assistantMsg = { role: "assistant", content: reply, ts: Date.now() };
        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);
        dbSaveChatHistory(userId, "__overall__", finalMessages.slice(-MAX_HISTORY));
        inputRef.current?.focus();
        setExtracting(true);
        extractFacts({ session, userMsg: text, assistantMsg: reply, existingFacts: facts })
          .then(newFacts => { if (newFacts.length > 0) onExtractFacts(newFacts); })
          .finally(() => {
            extractTasks({ session, userMsg: text, assistantMsg: reply, existingTasks: tasks })
              .then(newTasks => { if (newTasks.length > 0) onExtractTasks(newTasks); })
              .finally(() => setExtracting(false));
          });
      },
      onError: msg => { setError(msg); setMessages(updatedMessages); setStreamingContent(""); setLoading(false); inputRef.current?.focus(); },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "16px 24px 12px", borderBottom: "1px solid #1a1a1a", background: "#0d0d0d", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
        <span style={{ fontSize: "18px", color: "#e8e8e8" }}>✈</span>
        <div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", letterSpacing: "0.04em" }}>Overall</div>
          <div style={{ fontSize: "11px", color: "#3a3a3a", marginTop: "1px" }}>{facts.length} facts across all spaces · {messages.filter(m => m.role === "user").length} messages</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "11px", color: "#2a2a2a", background: "#111", border: "1px solid #1a1a1a", borderRadius: "4px", padding: "3px 8px" }}>full context</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {!historyLoaded && <div style={{ color: "#333", textAlign: "center", marginTop: "40px" }}>loading...</div>}
        {historyLoaded && messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: "6px" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>✈</div>
            <p style={{ fontSize: "16px", color: "#fff", fontWeight: "600", margin: 0 }}>Ready, Avinaash.</p>
            <p style={{ color: "#3a3a3a", margin: "4px 0 16px", textAlign: "center", fontSize: "12px", lineHeight: "1.6" }}>Full context. Ask me anything.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center", maxWidth: "420px" }}>
              {["What should I focus on today?", "What do you know about me?", "Connect the dots across my life", "What patterns do you notice?"].map(s => <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} style={{ background: "#111", border: "1px solid #1e1e1e", color: "#666", borderRadius: "20px", padding: "5px 13px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: "12px", fontSize: "13px", wordBreak: "break-word", background: msg.role === "user" ? "#141e2a" : "#141414", border: `1px solid ${msg.role === "user" ? "#1e2e3e" : "#1e1e1e"}`, color: msg.role === "user" ? "#b8c8d8" : "#c8c8c8" }}>
              {msg.role === "user" ? <span style={{ whiteSpace: "pre-wrap", lineHeight: "1.65" }}>{msg.content}</span> : renderMarkdown(msg.content)}
            </div>
          </div>
        ))}
        {loading && streamingContent === "" && <div style={{ display: "flex" }}><div style={{ background: "#141414", border: "1px solid #1e1e1e", borderRadius: "12px", padding: "12px 16px", display: "flex", gap: "5px", alignItems: "center" }}>{[0, 200, 400].map(d => <span key={d} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#444", display: "inline-block", animation: "bounce 1.2s infinite ease-in-out", animationDelay: `${d}ms` }} />)}</div></div>}
        {loading && streamingContent !== "" && <div style={{ display: "flex" }}><div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: "12px", fontSize: "13px", wordBreak: "break-word", background: "#141414", border: "1px solid #1e1e1e", color: "#c8c8c8" }}>{renderMarkdown(streamingContent)}<span style={{ display: "inline-block", animation: "blink 1s infinite", color: "#666", marginLeft: "1px" }}>▋</span></div></div>}
        <div ref={bottomRef} />
      </div>
      {error && <div style={{ margin: "0 24px 8px", background: "#140a0a", border: "1px solid #2a1010", color: "#f87171", borderRadius: "8px", padding: "8px 12px", fontSize: "12px" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px", padding: "12px 24px", borderTop: "1px solid #161616", alignItems: "flex-end", flexShrink: 0 }}>
        <textarea ref={inputRef} style={{ flex: 1, background: "#0f0f0f", border: "1px solid #222", color: "#e8e8e8", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", outline: "none", fontFamily: "inherit", lineHeight: "1.5", resize: "none", maxHeight: "120px", overflowY: "auto" }} placeholder="Tell me anything..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} rows={1} />
        <button style={{ width: "36px", height: "36px", borderRadius: "8px", background: loading || !input.trim() ? "#1a1a1a" : "#e8e8e8", color: loading || !input.trim() ? "#2a2a2a" : "#000", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} onClick={sendMessage} disabled={loading || !input.trim()}>↑</button>
      </div>
    </div>
  );
}

// ─── Tasks View ───────────────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  high:   { color: "#f87171", bg: "#1a0808", border: "#3a1010", label: "high" },
  medium: { color: "#fb923c", bg: "#1a0f00", border: "#3a1e00", label: "med" },
  low:    { color: "#6b7280", bg: "#111",    border: "#222",    label: "low"  },
};

function TasksView({ tasks, onAdd, onToggle, onDelete, googleClientId }) {
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("pending");
  const [calendarStatus, setCalendarStatus] = useState({});
  const [calendarError, setCalendarError] = useState("");
  const inputRef = useRef(null);

  const today = new Date().toDateString();
  const isOverdue = t => !t.done && t.dueDate && new Date(t.dueDate) < new Date(today);

  const filtered = tasks.filter(t => {
    if (filter === "pending") return !t.done;
    if (filter === "done") return t.done;
    return true;
  }).sort((a, b) => {
    if (!a.done && !b.done) {
      const aOver = isOverdue(a), bOver = isOverdue(b);
      if (aOver !== bOver) return aOver ? -1 : 1;
      const prioOrder = { high: 0, medium: 1, low: 2 };
      if (prioOrder[a.priority] !== prioOrder[b.priority]) return prioOrder[a.priority] - prioOrder[b.priority];
    }
    return b.createdAt - a.createdAt;
  });

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAdd(newText, newPriority, newDueDate || null, newStartTime || null, newEndTime || null);
    setNewText(""); setNewDueDate(""); setNewPriority("medium"); setNewStartTime(""); setNewEndTime(""); setShowForm(false);
  };

  // ─── FIX: show real error, fix timezone, make button always visible ───
  const handleAddToCalendar = async (t) => {
    if (!t.dueDate || !t.startTime || !t.endTime) return;
    if (!googleClientId) { setCalendarError("No Google Client ID configured."); return; }
    setCalendarError("");
    setCalendarStatus(s => ({ ...s, [t.id]: "loading" }));
    try {
      console.log("CAL: getting token, clientId=", googleClientId);
      const token = await getGoogleToken(googleClientId);
      console.log("CAL: got token=", token?.slice(0, 20));
      console.log("CAL: creating event", { title: t.text, date: t.dueDate, startTime: t.startTime, endTime: t.endTime });
      const result = await createCalendarEvent({ accessToken: token, title: t.text, date: t.dueDate, startTime: t.startTime, endTime: t.endTime });
      console.log("CAL: success", result);
      setCalendarStatus(s => ({ ...s, [t.id]: "done" }));
    } catch (e) {
      console.error("CAL ERROR:", e.message, e);
      setCalendarError(`Calendar failed: ${e.message}`);
      setCalendarStatus(s => ({ ...s, [t.id]: "error" }));
      setTimeout(() => setCalendarStatus(s => ({ ...s, [t.id]: null })), 4000);
    }
  };

  const pendingCount = tasks.filter(t => !t.done).length;
  const overdueCount = tasks.filter(t => isOverdue(t)).length;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#fff", margin: 0 }}>Tasks</h2>
          {overdueCount > 0 && <span style={{ fontSize: "10px", color: "#f87171", background: "#1a0808", border: "1px solid #3a1010", borderRadius: "10px", padding: "2px 8px" }}>{overdueCount} overdue</span>}
        </div>
        <button style={{ background: showForm ? "#1a1a1a" : "#e8e8e8", color: showForm ? "#555" : "#000", border: "none", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: "600", fontSize: "12px", fontFamily: "inherit" }} onClick={() => { setShowForm(!showForm); setTimeout(() => inputRef.current?.focus(), 50); }}>{showForm ? "✕ cancel" : "+ add task"}</button>
      </div>

      {showForm && (
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <input ref={inputRef} style={{ background: "#0a0a0a", border: "1px solid #222", color: "#e8e8e8", borderRadius: "7px", padding: "9px 12px", fontSize: "13px", outline: "none", fontFamily: "inherit" }} placeholder="What needs to be done?" value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              {["high", "medium", "low"].map(p => { const cfg = PRIORITY_CONFIG[p]; const active = newPriority === p; return <button key={p} onClick={() => setNewPriority(p)} style={{ background: active ? cfg.bg : "transparent", border: `1px solid ${active ? cfg.border : "#222"}`, color: active ? cfg.color : "#444", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>{cfg.label}</button>; })}
            </div>
            <input style={{ background: "#0a0a0a", border: "1px solid #222", color: "#888", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", outline: "none", fontFamily: "inherit", colorScheme: "dark" }} type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "#333", fontSize: "11px", whiteSpace: "nowrap" }}>time block</span>
            <input style={{ background: "#0a0a0a", border: "1px solid #222", color: "#888", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", outline: "none", fontFamily: "inherit", colorScheme: "dark", flex: 1 }} type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} />
            <span style={{ color: "#333", fontSize: "11px" }}>→</span>
            <input style={{ background: "#0a0a0a", border: "1px solid #222", color: "#888", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", outline: "none", fontFamily: "inherit", colorScheme: "dark", flex: 1 }} type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} />
            <button style={{ marginLeft: "auto", background: newText.trim() ? "#e8e8e8" : "#1a1a1a", color: newText.trim() ? "#000" : "#2a2a2a", border: "none", borderRadius: "7px", padding: "6px 14px", cursor: newText.trim() ? "pointer" : "not-allowed", fontWeight: "600", fontSize: "12px", fontFamily: "inherit" }} onClick={handleAdd} disabled={!newText.trim()}>add →</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "4px" }}>
        {[["pending", `pending (${pendingCount})`], ["done", "done"], ["all", "all"]].map(([val, label]) => <button key={val} onClick={() => setFilter(val)} style={{ background: filter === val ? "#1a1a1a" : "transparent", border: `1px solid ${filter === val ? "#2a2a2a" : "#111"}`, color: filter === val ? "#e8e8e8" : "#444", borderRadius: "6px", padding: "4px 11px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>{label}</button>)}
      </div>

      {/* Calendar error banner */}
      {calendarError && (
        <div style={{ background: "#140a0a", border: "1px solid #3a1010", color: "#f87171", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{calendarError}</span>
          <button onClick={() => setCalendarError("")} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {filtered.length === 0 ? <p style={{ color: "#333", margin: "4px 0", textAlign: "center", lineHeight: "1.6" }}>{filter === "pending" ? "No pending tasks. Add one above or chat — tasks get extracted automatically." : "Nothing here yet."}</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {filtered.map(t => {
            const cfg = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
            const overdue = isOverdue(t);
            const calSt = calendarStatus[t.id];
            const canCalendar = t.dueDate && t.startTime && t.endTime && !t.done;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: overdue ? "#110808" : "#0f0f0f", border: `1px solid ${overdue ? "#2a1010" : "#161616"}`, borderRadius: "8px", padding: "10px 13px", opacity: t.done ? 0.45 : 1 }}>
                <button onClick={() => onToggle(t.id)} style={{ width: "16px", height: "16px", borderRadius: "4px", border: `1px solid ${t.done ? "#2a2a2a" : cfg.border}`, background: t.done ? "#1a1a1a" : cfg.bg, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: cfg.color, padding: 0 }}>{t.done ? "✓" : ""}</button>
                <span style={{ fontSize: "9px", color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "4px", padding: "1px 5px", flexShrink: 0 }}>{cfg.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: t.done ? "#3a3a3a" : "#b8b8b8", lineHeight: "1.5", textDecoration: t.done ? "line-through" : "none", fontSize: "13px" }}>{t.text}</span>
                  {t.startTime && t.endTime && <span style={{ display: "block", fontSize: "10px", color: "#2a2a2a", marginTop: "2px" }}>{t.dueDate} · {t.startTime} → {t.endTime}</span>}
                  {t.dueDate && !t.startTime && !t.done && <span style={{ display: "block", fontSize: "10px", color: overdue ? "#f87171" : "#2a2a2a", marginTop: "2px" }}>{overdue ? "⚠ " : ""}{t.dueDate}</span>}
                </div>
                {/* ─── FIX: always visible cal button (no opacity:0 hiding) ─── */}
                {canCalendar && (
                  <button
                    onClick={() => handleAddToCalendar(t)}
                    disabled={calSt === "loading" || calSt === "done"}
                    style={{
                      background: calSt === "done" ? "#0d2a1a" : "transparent",
                      border: `1px solid ${calSt === "done" ? "#1a3d2a" : calSt === "error" ? "#3a1010" : "#1a2a1a"}`,
                      color: calSt === "done" ? "#4ade80" : calSt === "loading" ? "#444" : calSt === "error" ? "#f87171" : "#3a6a3a",
                      borderRadius: "4px", padding: "2px 8px",
                      cursor: calSt === "loading" || calSt === "done" ? "not-allowed" : "pointer",
                      fontSize: "10px", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
                      transition: "all 0.15s",
                    }}
                  >
                    {calSt === "loading" ? "..." : calSt === "done" ? "✓ added" : calSt === "error" ? "✕ failed" : "📅 cal"}
                  </button>
                )}
                <button onClick={() => onDelete(t.id)} style={{ background: "transparent", border: "1px solid #2a1010", color: "#7a3030", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit", flexShrink: 0 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Habits View ──────────────────────────────────────────────────────────────
function HabitsView({ habits, setHabits, habitLogs, setHabitLogs, userId }) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitIcon, setNewHabitIcon] = useState("⭐");
  const [newHabitColor, setNewHabitColor] = useState("#60a5fa");
  const [viewMode, setViewMode] = useState("today");
  const ICON_OPTIONS = ["🏋️","📖","🧘","😴","🥗","💻","💧","🚶","✍️","🎵","🌿","💊","🧹","📝","🎯","🛁"];
  const COLOR_OPTIONS = ["#4ade80","#60a5fa","#c084fc","#fb923c","#facc15","#f472b6","#94a3b8","#f87171"];
  const todayLogs = habitLogs[todayKey] || {};

  const toggle = async (habitId) => {
    const newVal = !todayLogs[habitId];
    const updated = { ...habitLogs, [todayKey]: { ...todayLogs, [habitId]: newVal } };
    setHabitLogs(updated);
    await dbUpsertHabitLog(userId, habitId, todayKey, newVal);
  };

  const addHabit = async () => {
    if (!newHabitName.trim()) return;
    const newH = { name: newHabitName.trim(), icon: newHabitIcon, color: newHabitColor };
    const created = await dbInsertHabit(userId, newH);
    setHabits(prev => [...prev, created]);
    setNewHabitName(""); setNewHabitIcon("⭐"); setNewHabitColor("#60a5fa"); setShowAddForm(false);
  };

  const deleteHabit = async (id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    await dbDeleteHabit(id);
  };

  const getStreak = (habitId) => {
    let streak = 0;
    const d = new Date();
    while (true) { const key = d.toISOString().slice(0, 10); if (habitLogs[key]?.[habitId]) { streak++; d.setDate(d.getDate() - 1); } else break; }
    return streak;
  };

  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });
  const dayLabels = last7.map(k => { const d = new Date(k + "T12:00:00"); return d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1); });
  const todayDone = habits.filter(h => todayLogs[h.id]).length;
  const pct = habits.length > 0 ? Math.round((todayDone / habits.length) * 100) : 0;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#fff", margin: 0 }}>Habits</h2>
          <span style={{ fontSize: "11px", color: pct === 100 ? "#4ade80" : "#555", background: pct === 100 ? "#0d2a1a" : "#111", border: `1px solid ${pct === 100 ? "#1a3d2a" : "#1e1e1e"}`, borderRadius: "10px", padding: "2px 9px", fontWeight: "600" }}>{todayDone}/{habits.length} today {pct === 100 ? "🔥" : ""}</span>
        </div>
        <button style={{ background: showAddForm ? "#1a1a1a" : "#e8e8e8", color: showAddForm ? "#555" : "#000", border: "none", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: "600", fontSize: "12px", fontFamily: "inherit" }} onClick={() => setShowAddForm(!showAddForm)}>{showAddForm ? "✕ cancel" : "+ add habit"}</button>
      </div>

      {habits.length > 0 && <div style={{ background: "#111", borderRadius: "4px", height: "3px", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#4ade80" : "#60a5fa", borderRadius: "4px", transition: "width 0.4s ease" }} /></div>}

      {showAddForm && (
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <input style={{ background: "#0a0a0a", border: "1px solid #222", color: "#e8e8e8", borderRadius: "7px", padding: "9px 12px", fontSize: "13px", outline: "none", fontFamily: "inherit" }} placeholder="Habit name..." value={newHabitName} onChange={e => setNewHabitName(e.target.value)} onKeyDown={e => e.key === "Enter" && addHabit()} autoFocus />
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{ICON_OPTIONS.map(ic => <button key={ic} onClick={() => setNewHabitIcon(ic)} style={{ background: newHabitIcon === ic ? "#1e1e1e" : "transparent", border: `1px solid ${newHabitIcon === ic ? "#333" : "#1a1a1a"}`, borderRadius: "6px", padding: "4px 7px", cursor: "pointer", fontSize: "14px" }}>{ic}</button>)}</div>
          <div style={{ display: "flex", gap: "6px" }}>{COLOR_OPTIONS.map(c => <button key={c} onClick={() => setNewHabitColor(c)} style={{ width: "20px", height: "20px", borderRadius: "50%", background: c, border: newHabitColor === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0, flexShrink: 0 }} />)}</div>
          <button style={{ background: newHabitName.trim() ? "#e8e8e8" : "#1a1a1a", color: newHabitName.trim() ? "#000" : "#2a2a2a", border: "none", borderRadius: "7px", padding: "7px 18px", cursor: newHabitName.trim() ? "pointer" : "not-allowed", fontWeight: "600", fontSize: "12px", fontFamily: "inherit", alignSelf: "flex-end" }} onClick={addHabit} disabled={!newHabitName.trim()}>add →</button>
        </div>
      )}

      <div style={{ display: "flex", gap: "4px" }}>
        {[["today", "today"], ["week", "7-day"], ["streaks", "streaks"]].map(([val, label]) => <button key={val} onClick={() => setViewMode(val)} style={{ background: viewMode === val ? "#1a1a1a" : "transparent", border: `1px solid ${viewMode === val ? "#2a2a2a" : "#111"}`, color: viewMode === val ? "#e8e8e8" : "#444", borderRadius: "6px", padding: "4px 11px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>{label}</button>)}
      </div>

      {habits.length === 0 && <p style={{ color: "#333", textAlign: "center", margin: "20px 0", lineHeight: "1.6" }}>No habits yet. Add one above.</p>}

      {viewMode === "today" && habits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {habits.map(h => {
            const done = !!todayLogs[h.id];
            const streak = getStreak(h.id);
            return (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: "12px", background: done ? "#0d1a0d" : "#0f0f0f", border: `1px solid ${done ? "#1a2e1a" : "#161616"}`, borderRadius: "10px", padding: "12px 16px", cursor: "pointer", transition: "all 0.15s", userSelect: "none" }} onClick={() => toggle(h.id)} onMouseEnter={e => e.currentTarget.querySelector(".del-btn").style.opacity = "1"} onMouseLeave={e => e.currentTarget.querySelector(".del-btn").style.opacity = "0"}>
                <div style={{ width: "22px", height: "22px", borderRadius: "6px", border: `2px solid ${done ? h.color : "#2a2a2a"}`, background: done ? h.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>{done && <span style={{ color: "#000", fontSize: "13px", fontWeight: "800", lineHeight: 1 }}>✓</span>}</div>
                <span style={{ fontSize: "16px", flexShrink: 0 }}>{h.icon}</span>
                <span style={{ flex: 1, color: done ? "#4a6a4a" : "#b8b8b8", fontSize: "13px", fontWeight: "500", textDecoration: done ? "line-through" : "none", transition: "all 0.15s" }}>{h.name}</span>
                {streak > 0 && <span style={{ fontSize: "10px", color: "#fb923c", background: "#1a0800", border: "1px solid #2a1200", borderRadius: "10px", padding: "1px 7px", flexShrink: 0, fontWeight: "600" }}>🔥 {streak}</span>}
                <button className="del-btn" onClick={e => { e.stopPropagation(); deleteHabit(h.id); }} style={{ background: "transparent", border: "1px solid #2a1010", color: "#7a3030", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "10px", fontFamily: "inherit", opacity: 0, transition: "opacity 0.15s", flexShrink: 0 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "week" && habits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px repeat(7, 1fr)", gap: "4px", marginBottom: "4px" }}>
            <div />
            {dayLabels.map((l, i) => <div key={i} style={{ textAlign: "center", fontSize: "10px", color: i === 6 ? "#e8e8e8" : "#333", fontWeight: i === 6 ? "700" : "400" }}>{l}</div>)}
          </div>
          {habits.map(h => (
            <div key={h.id} style={{ display: "grid", gridTemplateColumns: "120px repeat(7, 1fr)", gap: "4px", alignItems: "center" }}>
              <span style={{ color: "#666", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.icon} {h.name}</span>
              {last7.map((date, i) => {
                const done = !!habitLogs[date]?.[h.id];
                const isToday = i === 6;
                return <div key={date} onClick={isToday ? () => toggle(h.id) : undefined} style={{ width: "100%", aspectRatio: "1", borderRadius: "4px", background: done ? h.color : "#111", border: `1px solid ${done ? h.color : "#1e1e1e"}`, cursor: isToday ? "pointer" : "default", opacity: !isToday && !done ? 0.4 : 1, transition: "all 0.15s" }} />;
              })}
            </div>
          ))}
        </div>
      )}

      {viewMode === "streaks" && habits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {[...habits].sort((a, b) => getStreak(b.id) - getStreak(a.id)).map(h => {
            const streak = getStreak(h.id);
            return (
              <div key={h.id} style={{ background: "#0f0f0f", border: "1px solid #161616", borderRadius: "10px", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "16px" }}>{h.icon}</span>
                  <span style={{ color: "#b8b8b8", fontSize: "13px", flex: 1 }}>{h.name}</span>
                  <span style={{ fontSize: "11px", color: streak > 0 ? "#fb923c" : "#333", fontWeight: "700" }}>{streak > 0 ? `🔥 ${streak} day${streak !== 1 ? "s" : ""}` : "no streak"}</span>
                </div>
                <div style={{ background: "#1a1a1a", borderRadius: "3px", height: "3px", overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, (streak / 30) * 100)}%`, background: streak > 0 ? h.color : "#222", borderRadius: "3px", transition: "width 0.4s ease" }} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Gist Migration Tool ──────────────────────────────────────────────────────
function MigrationBanner({ userId, onMigrated }) {
  const [show, setShow] = useState(false);
  const [gistId, setGistId] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);

  const migrate = async () => {
    if (!gistId.trim() || !githubToken.trim()) { setStatus("Both fields required."); return; }
    setRunning(true); setStatus("Fetching Gist...");
    try {
      const res = await fetch(`https://api.github.com/gists/${gistId.trim()}`, { headers: { Authorization: `Bearer ${githubToken.trim()}`, Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);
      const data = await res.json();
      const raw = data.files?.["aviator-ai-memory.json"]?.content;
      if (!raw) throw new Error("No aviator-ai-memory.json file found in Gist.");
      const parsed = JSON.parse(raw);

      let factCount = 0, taskCount = 0;

      if (parsed.facts?.length) {
        setStatus(`Migrating ${parsed.facts.length} facts...`);
        const rows = parsed.facts.map(f => ({ user_id: userId, fact: f.fact, space: f.space }));
        await supabase.from("memory_facts").insert(rows);
        factCount = parsed.facts.length;
      }
      if (parsed.tasks?.length) {
        setStatus(`Migrating ${parsed.tasks.length} tasks...`);
        const rows = parsed.tasks.map(t => ({ user_id: userId, title: t.text, space: t.priority || "medium", due_date: t.dueDate, done: t.done || false }));
        await supabase.from("tasks").insert(rows);
        taskCount = parsed.tasks.length;
      }

      setStatus(`✓ Done! Migrated ${factCount} facts and ${taskCount} tasks. Reloading...`);
      setTimeout(() => onMigrated(), 1500);
    } catch (e) {
      setStatus(`✕ Error: ${e.message}`);
      setRunning(false);
    }
  };

  if (!show) return (
    <div style={{ margin: "12px 24px 0", background: "#0d1a0d", border: "1px solid #1a3d2a", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
      <span style={{ fontSize: "12px", color: "#4ade80" }}>📦 Have existing data in a Gist?</span>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={() => setShow(true)} style={{ background: "#0d2a1a", border: "1px solid #1a3d2a", color: "#4ade80", borderRadius: "6px", padding: "4px 12px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>import from gist →</button>
        <button onClick={() => onMigrated()} style={{ background: "transparent", border: "1px solid #1a1a1a", color: "#333", borderRadius: "6px", padding: "4px 12px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}>skip</button>
      </div>
    </div>
  );

  return (
    <div style={{ margin: "12px 24px 0", background: "#0d1a0d", border: "1px solid #1a3d2a", borderRadius: "10px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "13px", color: "#4ade80", fontWeight: "600" }}>Import from Gist</div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input style={{ flex: 1, background: "#0a0a0a", border: "1px solid #1a3d2a", color: "#e8e8e8", borderRadius: "6px", padding: "8px 10px", fontSize: "12px", outline: "none", fontFamily: "inherit" }} placeholder="GitHub token (ghp_...)" value={githubToken} onChange={e => setGithubToken(e.target.value)} type="password" />
        <input style={{ flex: 1, background: "#0a0a0a", border: "1px solid #1a3d2a", color: "#e8e8e8", borderRadius: "6px", padding: "8px 10px", fontSize: "12px", outline: "none", fontFamily: "inherit" }} placeholder="Gist ID" value={gistId} onChange={e => setGistId(e.target.value)} />
      </div>
      {status && <p style={{ margin: 0, fontSize: "12px", color: status.startsWith("✓") ? "#4ade80" : status.startsWith("✕") ? "#f87171" : "#888" }}>{status}</p>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={migrate} disabled={running} style={{ background: "#e8e8e8", color: "#000", border: "none", borderRadius: "7px", padding: "7px 16px", cursor: running ? "not-allowed" : "pointer", fontWeight: "600", fontSize: "12px", fontFamily: "inherit" }}>{running ? "migrating..." : "import →"}</button>
        <button onClick={() => { setShow(false); setStatus(""); }} style={{ background: "transparent", border: "1px solid #1a1a1a", color: "#444", borderRadius: "7px", padding: "7px 12px", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }}>cancel</button>
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const e = email.trim();
    const p = password.trim();
    if (!e || !p) { setError("Email and password required."); return; }
    setLoading(true); setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: e, password: p });
    if (err) { setError(err.message); setLoading(false); return; }
    onLogin(data.session, data.user);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a", fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace" }}>
      <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: "14px", padding: "36px 32px", width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", letterSpacing: "0.06em", textAlign: "center" }}>✈ Aviator.ai</div>
        <p style={{ color: "#444", margin: 0, fontSize: "12px", textAlign: "center" }}>sign in to continue</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <input style={{ background: "#0a0a0a", border: "1px solid #222", color: "#e8e8e8", borderRadius: "8px", padding: "12px 14px", fontSize: "13px", outline: "none", fontFamily: "inherit" }} type="email" placeholder="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} autoFocus />
          <input style={{ background: "#0a0a0a", border: `1px solid ${error ? "#3a1010" : "#222"}`, color: "#e8e8e8", borderRadius: "8px", padding: "12px 14px", fontSize: "13px", outline: "none", fontFamily: "inherit", letterSpacing: "0.05em" }} type="password" placeholder="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>
        {error && <p style={{ color: "#f87171", fontSize: "12px", margin: 0, textAlign: "center" }}>{error}</p>}
        <button style={{ background: loading ? "#1a1a1a" : "#e8e8e8", color: loading ? "#2a2a2a" : "#000", border: "none", borderRadius: "8px", padding: "11px", cursor: loading ? "not-allowed" : "pointer", fontWeight: "700", fontSize: "13px", fontFamily: "inherit" }} onClick={handleLogin} disabled={loading}>{loading ? "signing in..." : "sign in →"}</button>
        <p style={{ color: "#1e1e1e", margin: 0, fontSize: "11px", textAlign: "center" }}>account created by admin · no self-signup</p>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AviatorAI() {
  const [session, setSession] = useState(null);
  const [userId, setUserId] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [showMigration, setShowMigration] = useState(false);

  const [facts, setFacts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);

  const [activeView, setActiveView] = useState("overall");
  const [insightLoading, setInsightLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Memory panel
  const [activeSpace, setActiveSpace] = useState("All");
  const [editingFact, setEditingFact] = useState(null);
  const [editText, setEditText] = useState("");

  // Google Client ID — fetched from Vault via Edge Function after login
  const [googleClientId, setGoogleClientId] = useState("");

  // ── Auth restore on mount ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) { setSession(s); setUserId(s.user.id); }
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUserId(s?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load data when authenticated ──
  useEffect(() => {
    if (!userId || !session) { setDataLoaded(false); return; }
    setDataLoaded(false);

    // Fetch Google Client ID from Vault via dedicated config endpoint
    fetch(CONFIG_URL, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.json())
      .then(d => { if (d.google_client_id) setGoogleClientId(d.google_client_id); })
      .catch(() => {});

    Promise.all([
      dbLoadFacts(userId),
      dbLoadTasks(userId),
      dbLoadHabits(userId),
      dbLoadHabitLogs(userId),
      dbLoadInsights(userId),
    ]).then(async ([f, t, h, hl, ins]) => {
      setFacts(f);
      setTasks(t);
      setHabitLogs(hl);
      setInsights(ins);

      // Seed default habits if none exist
      let finalHabits = h;
      if (h.length === 0) {
        const DEFAULT_HABITS = [
          { name: "Wake up at 6AM",     icon: "⏰", color: "#facc15" },
          { name: "Drink 3L Water",      icon: "💧", color: "#60a5fa" },
          { name: "Gym Workout",         icon: "🏋️", color: "#4ade80" },
          { name: "Stretching",          icon: "🧘", color: "#a78bfa" },
          { name: "Read 10 Pages",       icon: "📖", color: "#fb923c" },
          { name: "Meditation",          icon: "🧘", color: "#c084fc" },
          { name: "Study 1 Hour",        icon: "🎓", color: "#38bdf8" },
          { name: "Skincare Routine",    icon: "✨", color: "#f472b6" },
          { name: "Limit Social Media",  icon: "🚫", color: "#f87171" },
          { name: "10K Steps",           icon: "👟", color: "#34d399" },
        ];
        const inserted = await Promise.all(DEFAULT_HABITS.map(h => dbInsertHabit(userId, h)));
        finalHabits = inserted.filter(Boolean);
      }
      setHabits(finalHabits);
      setDataLoaded(true);

      // Show migration banner only on first login (empty DB)
      if (f.length === 0 && t.length === 0 && h.length === 0) setShowMigration(true);
    });
  }, [userId, session]);

  // ── Fact handlers ──
  const handleExtractFacts = useCallback(async (newFacts) => {
    const filtered = newFacts.filter(nf => !facts.some(ex => ex.fact.toLowerCase().trim() === nf.fact.toLowerCase().trim()));
    if (filtered.length === 0) return;
    const inserted = await dbInsertFacts(userId, filtered);
    setFacts(prev => [...prev, ...inserted]);
  }, [facts, userId]);

  const deleteFact = async (filteredIdx) => {
    const globalIndex = facts.indexOf(filteredFacts[filteredIdx]);
    const fact = facts[globalIndex];
    const updated = facts.filter((_, i) => i !== globalIndex);
    setFacts(updated);
    if (fact.id) await dbDeleteFact(fact.id);
  };

  const saveEditFact = async () => {
    if (editingFact === null || !editText.trim()) return;
    const fact = facts[editingFact];
    const updated = facts.map((f, i) => i === editingFact ? { ...f, fact: editText.trim() } : f);
    setFacts(updated);
    if (fact.id) await dbUpdateFact(fact.id, editText.trim());
    setEditingFact(null); setEditText("");
  };

  // ── Task handlers ──
  const handleExtractTasks = useCallback(async (newTasks) => {
    const filtered = newTasks.filter(nt => !tasks.some(ex => ex.text.toLowerCase().trim() === nt.text.toLowerCase().trim()));
    if (filtered.length === 0) return;
    const inserted = await Promise.all(filtered.map(t => dbInsertTask(userId, t)));
    setTasks(prev => [...prev, ...inserted]);
  }, [tasks, userId]);

  const addTask = async (text, priority, dueDate, startTime, endTime) => {
    const t = { text: text.trim(), priority: priority || "medium", dueDate, startTime, endTime };
    const inserted = await dbInsertTask(userId, t);
    setTasks(prev => [...prev, inserted]);
  };

  const toggleTask = async (id) => {
    const task = tasks.find(t => t.id === id);
    const newDone = !task.done;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: newDone } : t));
    await dbToggleTask(id, newDone);
  };

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await dbDeleteTask(id);
  };

  const handleGenerateInsights = async () => {
    if (facts.length < 5 || insightLoading) return;
    setInsightLoading(true);
    try {
      const newInsights = await generateInsights({ session, facts });
      setInsights(newInsights);
      await dbSaveInsights(userId, newInsights);
    } catch (e) { console.error(e); }
    finally { setInsightLoading(false); }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null); setUserId(null); setFacts([]); setTasks([]); setHabits([]); setHabitLogs({}); setInsights([]); setDataLoaded(false);
  };

  // Derived
  const filteredFacts = activeSpace === "All" ? facts : facts.filter(f => f.space === activeSpace);
  const spaceCounts = SPACES.reduce((acc, s) => { acc[s] = facts.filter(f => f.space === s).length; return acc; }, {});
  const pendingTaskCount = tasks.filter(t => !t.done).length;
  const overdueTaskCount = tasks.filter(t => !t.done && t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString())).length;
  const isSpaceView = SPACES.includes(activeView);

  // ── Auth loading ──
  if (!authReady) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a", color: "#333", fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace" }}>✈</div>
  );

  // ── Not logged in ──
  if (!session) return <LoginScreen onLogin={(s, u) => { setSession(s); setUserId(u.id); }} />;

  // ── Data loading ──
  if (!dataLoaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0a", color: "#333", fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "22px" }}>✈</div>
      <div style={{ fontSize: "12px" }}>loading your data...</div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace", fontSize: "13px" }}>

      {/* ── Sidebar ── */}
      <div style={{ width: "200px", minWidth: "200px", background: "#0c0c0c", borderRight: "1px solid #161616", display: "flex", flexDirection: "column", padding: "16px 12px", gap: "0", overflowY: "auto" }}>
        <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", letterSpacing: "0.05em", marginBottom: "18px", paddingBottom: "14px", borderBottom: "1px solid #1a1a1a" }}>✈ Aviator.ai</div>

        <div style={{ fontSize: "9px", color: "#555", letterSpacing: "0.12em", fontWeight: "700", marginBottom: "6px", paddingLeft: "10px" }}>SPACES</div>

        <button style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: activeView === "overall" ? "#1a1a1a" : "transparent", border: "none", color: activeView === "overall" ? "#e8e8e8" : "#888", cursor: "pointer", borderRadius: "6px", fontSize: "12px", textAlign: "left", fontFamily: "inherit", width: "100%", marginBottom: "1px" }} onClick={() => setActiveView("overall")}>
          <span style={{ fontSize: "10px", color: activeView === "overall" ? "#e8e8e8" : "#666" }}>✈</span>
          Overall
          <span style={{ marginLeft: "auto", fontSize: "10px", color: "#666" }}>{facts.length}</span>
        </button>

        {SPACES.map(space => {
          const p = SPACE_PERSONAS[space];
          const active = activeView === space;
          return <button key={space} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: active ? p.dim : "transparent", border: `1px solid ${active ? p.border : "transparent"}`, color: active ? p.color : "#888", cursor: "pointer", borderRadius: "6px", fontSize: "12px", textAlign: "left", fontFamily: "inherit", width: "100%", marginBottom: "1px", transition: "all 0.12s" }} onClick={() => setActiveView(space)}>
            <span style={{ fontSize: "10px" }}>{p.icon}</span>
            {space}
            {spaceCounts[space] > 0 && <span style={{ marginLeft: "auto", fontSize: "10px", color: active ? p.color : "#666" }}>{spaceCounts[space]}</span>}
          </button>;
        })}

        <div style={{ fontSize: "9px", color: "#555", letterSpacing: "0.12em", fontWeight: "700", margin: "16px 0 6px", paddingLeft: "10px", borderTop: "1px solid #222", paddingTop: "14px" }}>TOOLS</div>

        <button style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: activeView === "tasks" ? "#1a1a1a" : "transparent", border: "none", color: activeView === "tasks" ? "#e8e8e8" : "#888", cursor: "pointer", borderRadius: "6px", fontSize: "12px", textAlign: "left", fontFamily: "inherit", width: "100%", marginBottom: "1px" }} onClick={() => setActiveView("tasks")}>
          <span style={{ fontSize: "9px", opacity: 0.7 }}>✓</span>
          Tasks
          {pendingTaskCount > 0 && <span style={{ marginLeft: "auto", fontSize: "10px", background: overdueTaskCount > 0 ? "#2a0a0a" : "#1a1a2a", color: overdueTaskCount > 0 ? "#f87171" : "#60a5fa", border: `1px solid ${overdueTaskCount > 0 ? "#3a1010" : "#1a2a3a"}`, borderRadius: "10px", padding: "1px 6px", fontWeight: "600" }}>{pendingTaskCount}</span>}
        </button>

        <button style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: activeView === "habits" ? "#1a1a1a" : "transparent", border: "none", color: activeView === "habits" ? "#e8e8e8" : "#888", cursor: "pointer", borderRadius: "6px", fontSize: "12px", textAlign: "left", fontFamily: "inherit", width: "100%", marginBottom: "1px" }} onClick={() => setActiveView("habits")}>
          <span style={{ fontSize: "9px", opacity: 0.7 }}>◎</span>
          Habits
          {Object.values(habitLogs[new Date().toISOString().slice(0, 10)] || {}).filter(Boolean).length > 0 && <span style={{ marginLeft: "auto", fontSize: "10px", color: "#4ade80", background: "#0d2a1a", border: "1px solid #1a3d2a", borderRadius: "10px", padding: "1px 6px", fontWeight: "600" }}>{Object.values(habitLogs[new Date().toISOString().slice(0, 10)] || {}).filter(Boolean).length}/{habits.length}</span>}
        </button>

        {[{ id: "memory", label: "Memory", icon: "◈" }, { id: "insights", label: "Insights", icon: "◆" }].map(item => <button key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", background: activeView === item.id ? "#1a1a1a" : "transparent", border: "none", color: activeView === item.id ? "#e8e8e8" : "#888", cursor: "pointer", borderRadius: "6px", fontSize: "12px", textAlign: "left", fontFamily: "inherit", width: "100%", marginBottom: "1px" }} onClick={() => setActiveView(item.id)}>
          <span style={{ fontSize: "9px", opacity: 0.7 }}>{item.icon}</span>
          {item.label}
        </button>)}

        <div style={{ marginTop: "auto", paddingTop: "14px", borderTop: "1px solid #222", display: "flex", flexDirection: "column", gap: "5px" }}>
          {[["facts", facts.length], ["tasks", pendingTaskCount], ["insights", insights.length]].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#666", fontSize: "10px" }}>{label}</span>
              <span style={{ color: label === "tasks" && overdueTaskCount > 0 ? "#f87171" : "#fff", fontWeight: "600", fontSize: "12px" }}>{val}</span>
            </div>
          ))}
          {extracting && <div style={{ fontSize: "10px", color: "#f59e0b", background: "#140f00", border: "1px solid #2a1e00", borderRadius: "4px", padding: "3px 7px", textAlign: "center", marginTop: "4px" }}>⚡ learning...</div>}
          <div style={{ fontSize: "10px", color: "#2a2a2a", background: "#0d0d0d", border: "1px solid #161616", borderRadius: "4px", padding: "3px 7px", textAlign: "center", marginTop: "2px" }}>● supabase synced</div>
          <button style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#555", borderRadius: "6px", padding: "5px 10px", cursor: "pointer", fontSize: "10px", marginTop: "4px", fontFamily: "inherit" }} onClick={handleSignOut}>✕ sign out</button>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Migration banner */}
        {showMigration && <MigrationBanner userId={userId} onMigrated={async () => { setShowMigration(false); const [f, t, h, hl] = await Promise.all([dbLoadFacts(userId), dbLoadTasks(userId), dbLoadHabits(userId), dbLoadHabitLogs(userId)]); setFacts(f); setTasks(t); setHabits(h); setHabitLogs(hl); }} />}

        {activeView === "overall" && <OverallChat facts={facts} tasks={tasks} session={session} userId={userId} onExtractFacts={handleExtractFacts} onExtractTasks={handleExtractTasks} setExtracting={setExtracting} />}

        {isSpaceView && <SpaceChat key={activeView} space={activeView} facts={facts} tasks={tasks} session={session} userId={userId} onExtractFacts={handleExtractFacts} onExtractTasks={handleExtractTasks} setExtracting={setExtracting} />}

        {/* MEMORY */}
        {activeView === "memory" && (
          <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "15px", fontWeight: "600", color: "#fff", margin: 0 }}>Memory Bank</h2>
              <span style={{ color: "#3a3a3a", fontSize: "12px" }}>{facts.length} facts stored</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {["All", ...SPACES].map(s => {
                const p = s !== "All" ? SPACE_PERSONAS[s] : null;
                const active = activeSpace === s;
                return <button key={s} style={{ background: active ? (p ? p.dim : "#1a1a1a") : "#0f0f0f", border: `1px solid ${active ? (p ? p.border : "#2a2a2a") : "#1a1a1a"}`, color: active ? (p ? p.color : "#ccc") : "#444", borderRadius: "20px", padding: "4px 11px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px" }} onClick={() => setActiveSpace(s)}>
                  {p && <span>{p.icon}</span>}{s}
                  {s !== "All" && spaceCounts[s] > 0 && <span style={{ background: "#1e1e1e", borderRadius: "10px", padding: "1px 5px", fontSize: "10px", color: "#555" }}>{spaceCounts[s]}</span>}
                </button>;
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
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#0f0f0f", border: "1px solid #161616", borderRadius: "7px", padding: "9px 13px" }} onMouseEnter={e => e.currentTarget.querySelector(".fact-actions").style.opacity = "1"} onMouseLeave={e => e.currentTarget.querySelector(".fact-actions").style.opacity = "0"}>
                        <span style={{ fontSize: "10px", color: p?.color || "#555", background: p?.dim || "#161616", border: `1px solid ${p?.border || "#222"}`, borderRadius: "4px", padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>{f.space}</span>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: "6px", flex: 1, alignItems: "center" }}>
                            <input style={{ flex: 1, background: "#0a0a0a", border: "1px solid #333", color: "#e8e8e8", borderRadius: "5px", padding: "4px 8px", fontSize: "12px", outline: "none", fontFamily: "inherit" }} value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveEditFact(); if (e.key === "Escape") { setEditingFact(null); setEditText(""); } }} autoFocus />
                            <button style={{ background: "#1a2a1a", border: "1px solid #1e3a1e", color: "#4a9a4a", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }} onClick={saveEditFact}>✓</button>
                            <button style={{ background: "transparent", border: "1px solid #1e1e1e", color: "#444", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", fontSize: "12px", fontFamily: "inherit" }} onClick={() => { setEditingFact(null); setEditText(""); }}>✕</button>
                          </div>
                        ) : (
                          <>
                            <span style={{ color: "#b8b8b8", flex: 1, lineHeight: "1.5" }}>{f.fact}</span>
                            <span style={{ color: "#2a2a2a", fontSize: "10px", whiteSpace: "nowrap", flexShrink: 0 }}>{new Date(f.ts).toLocaleDateString()}</span>
                            <div className="fact-actions" style={{ display: "flex", gap: "4px", flexShrink: 0, opacity: 0, transition: "opacity 0.15s" }}>
                              <button style={{ background: "transparent", border: "1px solid #1e1e1e", color: "#444", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }} onClick={() => { setEditingFact(globalIdx); setEditText(f.fact); }}>✎</button>
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
              <button style={{ background: facts.length < 5 || insightLoading ? "#1a1a1a" : "#e8e8e8", color: facts.length < 5 || insightLoading ? "#2a2a2a" : "#000", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: facts.length < 5 || insightLoading ? "not-allowed" : "pointer", fontWeight: "600", fontSize: "12px", fontFamily: "inherit" }} onClick={handleGenerateInsights} disabled={facts.length < 5 || insightLoading}>{insightLoading ? "thinking..." : "↻ generate"}</button>
            </div>
            {facts.length < 5 && <p style={{ color: "#444", margin: "4px 0", lineHeight: "1.6" }}>Need at least 5 stored facts to generate insights. Keep chatting.</p>}
            {facts.length >= 5 && insights.length === 0 && !insightLoading && <p style={{ color: "#444", margin: "4px 0" }}>Hit generate to analyze your memory.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <span style={{ color: "#e8e8e8", fontWeight: "600", fontSize: "13px" }}>{ins.title}</span>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {(ins.spaces || []).map(s => { const p = SPACE_PERSONAS[s]; return <span key={s} style={{ fontSize: "10px", color: p?.color || "#444", background: p?.dim || "#141414", border: `1px solid ${p?.border || "#1e1e1e"}`, borderRadius: "4px", padding: "2px 6px" }}>{s}</span>; })}
                    </div>
                  </div>
                  <p style={{ color: "#666", lineHeight: "1.7", margin: 0, fontSize: "12px" }}>{ins.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === "tasks" && <TasksView tasks={tasks} onAdd={addTask} onToggle={toggleTask} onDelete={deleteTask} googleClientId={googleClientId} />}

        {activeView === "habits" && <HabitsView habits={habits} setHabits={setHabits} habitLogs={habitLogs} setHabitLogs={setHabitLogs} userId={userId} />}
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