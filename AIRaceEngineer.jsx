import { useState, useEffect, useRef } from "react";

// ── SIMULATED TELEMETRY DATA ───────────────────────────────────────────────
// In production (Streamlit), this comes from FastF1.
// Here we generate realistic corner-by-corner analysis data.

const CIRCUIT_CORNERS = [
  { id: 1,  name: "Turn 1",        type: "heavy_brake",  speed_entry: 310, speed_min: 95,  speed_exit: 155, brake_point: 105, gear: 2, delta: -0.18, throttle_pct: 12 },
  { id: 2,  name: "Turn 2",        type: "medium_brake", speed_entry: 265, speed_min: 110, speed_exit: 175, brake_point: 78,  gear: 3, delta: +0.04, throttle_pct: 28 },
  { id: 3,  name: "Turn 3",        type: "light_brake",  speed_entry: 195, speed_min: 155, speed_exit: 190, brake_point: 42,  gear: 4, delta: +0.02, throttle_pct: 65 },
  { id: 4,  name: "Turn 4",        type: "heavy_brake",  speed_entry: 285, speed_min: 85,  speed_exit: 145, brake_point: 95,  gear: 2, delta: -0.22, throttle_pct: 8  },
  { id: 5,  name: "Turn 5",        type: "medium_brake", speed_entry: 210, speed_min: 135, speed_exit: 185, brake_point: 55,  gear: 3, delta: +0.01, throttle_pct: 45 },
  { id: 6,  name: "Back Straight", type: "straight",     speed_entry: 215, speed_min: 290, speed_exit: 315, brake_point: 0,   gear: 8, delta: +0.08, throttle_pct: 100},
  { id: 7,  name: "Turn 7",        type: "heavy_brake",  speed_entry: 315, speed_min: 78,  speed_exit: 130, brake_point: 120, gear: 2, delta: -0.31, throttle_pct: 5  },
  { id: 8,  name: "Turn 8",        type: "medium_brake", speed_entry: 185, speed_min: 120, speed_exit: 168, brake_point: 48,  gear: 3, delta: -0.09, throttle_pct: 32 },
  { id: 9,  name: "Turn 9",        type: "light_brake",  speed_entry: 210, speed_min: 165, speed_exit: 200, brake_point: 35,  gear: 4, delta: +0.03, throttle_pct: 72 },
  { id: 10, name: "Turn 10",       type: "medium_brake", speed_entry: 240, speed_min: 115, speed_exit: 172, brake_point: 68,  gear: 3, delta: -0.14, throttle_pct: 18 },
  { id: 11, name: "Turn 11",       type: "light_brake",  speed_entry: 185, speed_min: 155, speed_exit: 190, brake_point: 28,  gear: 4, delta: +0.01, throttle_pct: 68 },
  { id: 12, name: "Final Corner",  type: "medium_brake", speed_entry: 220, speed_min: 125, speed_exit: 185, brake_point: 62,  gear: 3, delta: -0.07, throttle_pct: 35 },
];

const LAP_SUMMARY = {
  lapTime: "1:30.154",
  optimal: "1:28.891",
  gap: "+1.263",
  sector1: "28.441",
  sector2: "32.218",
  sector3: "29.495",
  topSpeed: 318,
  avgBrakeForce: 68,
  drsActivations: 3,
  totalLost: 1.04,
};

// ── CLAUDE API CALL ────────────────────────────────────────────────────────
async function callRaceEngineer(cornerData, lapSummary, userMessage, history) {
  const systemPrompt = `You are an elite Formula 1 race engineer with 15 years of experience working at Red Bull Racing and Ferrari. You are direct, technical, and precise — like a real pit wall engineer talking on the radio.

Your job is to analyse telemetry data and give actionable, specific engineering feedback. You speak in short, punchy sentences. No fluff. Numbers matter. Every piece of advice must be tied to specific telemetry evidence.

You have access to corner-by-corner telemetry data for this lap. Use it concretely.

TELEMETRY DATA:
${JSON.stringify(cornerData, null, 2)}

LAP SUMMARY:
${JSON.stringify(lapSummary, null, 2)}

RESPONSE STYLE:
- Lead with the most critical finding first
- Reference specific corners by name/number
- Give specific numbers (brake point in metres, speed delta in km/h, time loss in seconds)
- End with ONE clear priority action for the next lap
- Keep responses under 180 words unless asked for deep analysis
- Use engineering terminology (trail braking, oversteer, understeer, ERS deployment, brake bias, etc.)
- Occasionally use radio-style shorthand: "Copy that", "Understood", "Box, box" for pit calls
- You are Swara's race engineer — address her directly`;

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage }
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });

  const data = await response.json();
  return data.content?.[0]?.text || "No response from engineer.";
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function DeltaBar({ delta }) {
  const isLoss = delta < 0;
  const w = Math.min(Math.abs(delta) * 200, 80);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 80, height: 6, background: "#111", borderRadius: 3,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute",
          right: isLoss ? 0 : "auto",
          left: isLoss ? "auto" : 0,
          width: w, height: "100%",
          background: isLoss ? "#e8002d" : "#00cc66",
          borderRadius: 3,
          transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: isLoss ? "#e8002d" : "#00cc66",
        fontFamily: "monospace", minWidth: 44,
      }}>
        {isLoss ? "" : "+"}{delta.toFixed(2)}s
      </span>
    </div>
  );
}

function CornerRow({ corner, selected, onClick }) {
  const typeColor = {
    heavy_brake: "#e8002d",
    medium_brake: "#ff8800",
    light_brake: "#ffcc00",
    straight: "#00aaff",
  }[corner.type];

  return (
    <div onClick={onClick} style={{
      padding: "10px 14px",
      background: selected ? "#0f0f1e" : "transparent",
      borderLeft: selected ? `3px solid ${typeColor}` : "3px solid transparent",
      cursor: "pointer",
      transition: "all 0.15s",
      borderBottom: "1px solid #0d0d18",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: selected ? "#fff" : "#aaa", letterSpacing: 0.5 }}>
            {corner.name}
          </span>
          <span style={{
            marginLeft: 8, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
            color: typeColor, fontWeight: 700,
          }}>
            {corner.type.replace("_", " ")}
          </span>
        </div>
        <DeltaBar delta={corner.delta} />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 5 }}>
        <span style={{ fontSize: 10, color: "#444" }}>
          <span style={{ color: "#555" }}>MIN </span>
          <span style={{ color: "#aaa", fontFamily: "monospace" }}>{corner.speed_min}</span>
          <span style={{ color: "#444" }}> km/h</span>
        </span>
        <span style={{ fontSize: 10, color: "#444" }}>
          <span style={{ color: "#555" }}>BRAKE </span>
          <span style={{ color: "#aaa", fontFamily: "monospace" }}>{corner.brake_point || "—"}</span>
          <span style={{ color: "#444" }}>{corner.brake_point ? " m" : ""}</span>
        </span>
        <span style={{ fontSize: 10, color: "#444" }}>
          <span style={{ color: "#555" }}>G</span>
          <span style={{ color: "#aaa", fontFamily: "monospace" }}>{corner.gear}</span>
        </span>
      </div>
    </div>
  );
}

function RadioMessage({ msg }) {
  const isEngineer = msg.role === "assistant";
  return (
    <div style={{
      display: "flex",
      flexDirection: isEngineer ? "row" : "row-reverse",
      gap: 10, marginBottom: 16,
      animation: "fadeUp 0.3s ease both",
    }}>
      {/* Avatar */}
      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        background: isEngineer ? "#0a1628" : "#1a0808",
        border: `2px solid ${isEngineer ? "#3671C6" : "#e8002d"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 900,
        color: isEngineer ? "#3671C6" : "#e8002d",
        letterSpacing: 0.5,
      }}>
        {isEngineer ? "RE" : "DR"}
      </div>

      <div style={{ maxWidth: "75%" }}>
        <div style={{
          fontSize: 9, color: "#333", letterSpacing: 1.5,
          textTransform: "uppercase", marginBottom: 5,
          textAlign: isEngineer ? "left" : "right",
        }}>
          {isEngineer ? "Race Engineer" : "Driver"} · {msg.time}
        </div>
        <div style={{
          background: isEngineer ? "#080e1a" : "#120808",
          border: `1px solid ${isEngineer ? "#1a2a4a" : "#2a1010"}`,
          borderRadius: isEngineer ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
          padding: "11px 14px",
          fontSize: 13, lineHeight: 1.65, color: "#d0d0d0",
          letterSpacing: 0.3,
        }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────
export default function AIRaceEngineer() {
  const [selectedCorner, setSelectedCorner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [activeView, setActiveView] = useState("overview"); // overview | chat
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const now = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  async function startSession() {
    setSessionStarted(true);
    setActiveView("chat");
    setLoading(true);
    const opener = "Lap complete. I've loaded your telemetry. Give me a second to analyse it.";
    setMessages([{ role: "assistant", content: opener, time: now() }]);

    const briefing = await callRaceEngineer(
      CIRCUIT_CORNERS, LAP_SUMMARY,
      "You've just received my lap telemetry. Give me a full debrief — what's my biggest single time loss and where? Be specific with numbers.",
      []
    );
    setMessages(prev => [...prev, { role: "assistant", content: briefing, time: now() }]);
    setLoading(false);
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text, time: now() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    const apiHistory = newHistory.map(m => ({ role: m.role, content: m.content }));
    const reply = await callRaceEngineer(CIRCUIT_CORNERS, LAP_SUMMARY, text, apiHistory.slice(0, -1));
    setMessages(prev => [...prev, { role: "assistant", content: reply, time: now() }]);
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function askAboutCorner(corner) {
    setSelectedCorner(corner);
    setActiveView("chat");
    if (!sessionStarted) { setSessionStarted(true); setMessages([]); }
    await sendMessage(`Deep dive on ${corner.name} — my delta is ${corner.delta > 0 ? "+" : ""}${corner.delta}s. What specifically am I doing wrong and how do I fix it?`);
  }

  const quickActions = [
    { label: "🔴 Worst corner?",    msg: "Which single corner is costing me the most time and exactly why?" },
    { label: "⚙️ Setup issue?",     msg: "Based on my telemetry patterns, is there a setup problem? Check for systematic over/understeer." },
    { label: "🛞 Tyre management", msg: "How is my tyre management? Am I over-driving the tyres anywhere?" },
    { label: "📋 Full debrief",     msg: "Give me a full structured lap debrief: strengths, weaknesses, and top 3 priorities for next lap." },
    { label: "🏁 Qualifying mode", msg: "I need one more tenth. Where is it? Be ruthless." },
    { label: "🔋 ERS deployment",  msg: "Walk me through optimal ERS deployment for this circuit based on my speed data." },
  ];

  const totalLost = CIRCUIT_CORNERS.filter(c => c.delta < 0).reduce((a, c) => a + Math.abs(c.delta), 0);
  const worstCorner = [...CIRCUIT_CORNERS].sort((a, b) => a.delta - b.delta)[0];

  return (
    <div style={{
      background: "#04040c",
      minHeight: "100vh",
      fontFamily: "'Rajdhani', 'Barlow Condensed', 'Arial Narrow', sans-serif",
      color: "#ccc",
      display: "flex",
      flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1a1a2e; border-radius: 2px; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes radioStatic {
          0%{opacity:0.6} 10%{opacity:1} 20%{opacity:0.7} 30%{opacity:1} 100%{opacity:1}
        }

        .quick-btn {
          background: #080812; border: 1px solid #1a1a2a;
          color: #888; cursor: pointer;
          font-family: inherit; font-size: 11px; font-weight: 600;
          letter-spacing: 0.5px; padding: 8px 12px; border-radius: 3px;
          transition: all 0.15s; text-align: left; white-space: nowrap;
        }
        .quick-btn:hover { background: #0e0e1e; border-color: #2a2a4a; color: #ccc; }

        .send-btn {
          background: #e8002d; border: none; color: #fff; cursor: pointer;
          font-family: inherit; font-size: 12px; font-weight: 700;
          letter-spacing: 1.5px; padding: 0 18px; border-radius: 3px;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .send-btn:hover { background: #ff1a3e; }
        .send-btn:disabled { background: #2a0010; color: #440018; cursor: not-allowed; }

        .nav-tab {
          background: none; border: none; cursor: pointer;
          font-family: inherit; font-size: 12px; font-weight: 700;
          letter-spacing: 2px; padding: 14px 20px; color: #444;
          border-bottom: 2px solid transparent; text-transform: uppercase;
          transition: all 0.15s;
        }
        .nav-tab.active { color: #fff; border-bottom-color: #e8002d; }
        .nav-tab:hover { color: #888; }

        textarea {
          background: #080812 !important;
          border: 1px solid #1a1a2a !important;
          color: #ddd !important;
          font-family: 'Rajdhani', sans-serif !important;
          font-size: 14px !important;
          resize: none !important;
          outline: none !important;
          border-radius: 3px !important;
          padding: 10px 12px !important;
          width: 100% !important;
          letter-spacing: 0.3px !important;
          line-height: 1.5 !important;
        }
        textarea:focus { border-color: #2a2a4a !important; }
        textarea::placeholder { color: #2a2a3a !important; }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{
        background: "rgba(4,4,12,0.97)", borderBottom: "1px solid #0e0e1e",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 50, flexShrink: 0,
        backdropFilter: "blur(8px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: "#e8002d", color: "#fff", fontWeight: 900, fontSize: 12, letterSpacing: 2, padding: "3px 8px", borderRadius: 2 }}>F1</div>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 3, color: "#fff" }}>AI RACE ENGINEER</span>
          <span style={{ fontSize: 10, color: "#333", letterSpacing: 1 }}>TELEMETRY COACHING SYSTEM</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {sessionStarted && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#e8002d", animation: "pulse 1.5s infinite" }} />
              <span style={{ fontSize: 10, color: "#e8002d", letterSpacing: 1.5 }}>SESSION LIVE</span>
            </div>
          )}
          <span style={{ fontSize: 10, color: "#222", letterSpacing: 1 }}>LAP: 1:30.154</span>
          <span style={{ fontSize: 10, color: "#e8002d", fontFamily: "monospace" }}>Δ +1.263</span>
        </div>
      </div>

      {/* ── NAV TABS ── */}
      <div style={{ borderBottom: "1px solid #0e0e1e", display: "flex", flexShrink: 0 }}>
        <button className={`nav-tab ${activeView === "overview" ? "active" : ""}`} onClick={() => setActiveView("overview")}>
          Telemetry Overview
        </button>
        <button className={`nav-tab ${activeView === "chat" ? "active" : ""}`} onClick={() => setActiveView("chat")}>
          Engineer Radio {messages.length > 0 && <span style={{ marginLeft: 6, background: "#e8002d", color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{messages.length}</span>}
        </button>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── OVERVIEW TAB ── */}
        {activeView === "overview" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

            {/* Lap summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Lap Time",      value: LAP_SUMMARY.lapTime,   color: "#e8002d", mono: true },
                { label: "Optimal Lap",   value: LAP_SUMMARY.optimal,   color: "#00cc66", mono: true },
                { label: "Time to Optimal", value: LAP_SUMMARY.gap,     color: "#ff8800", mono: true },
                { label: "Total Time Lost", value: `-${totalLost.toFixed(2)}s`, color: "#e8002d", mono: true },
              ].map((m, i) => (
                <div key={i} style={{
                  background: "#080812", border: "1px solid #12121e",
                  borderTop: `2px solid ${m.color}`, borderRadius: 4, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: m.mono ? "monospace" : "inherit" }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Sector breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { sector: "S1", time: LAP_SUMMARY.sector1, color: "#00cc66" },
                { sector: "S2", time: LAP_SUMMARY.sector2, color: "#ff8800" },
                { sector: "S3", time: LAP_SUMMARY.sector3, color: "#e8002d" },
              ].map(s => (
                <div key={s.sector} style={{
                  background: "#080812", border: "1px solid #12121e",
                  borderRadius: 4, padding: "10px 14px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 11, color: "#444", letterSpacing: 2 }}>SECTOR {s.sector}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>{s.time}</div>
                    <div style={{ width: 40, height: 3, background: s.color, borderRadius: 2, marginTop: 4, marginLeft: "auto" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Worst corner callout */}
            <div style={{
              background: "#0c0008", border: "1px solid #2a0012",
              borderLeft: "3px solid #e8002d", borderRadius: 4,
              padding: "12px 16px", marginBottom: 20,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 9, color: "#660022", letterSpacing: 2, marginBottom: 4 }}>⚠ BIGGEST TIME LOSS</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{worstCorner.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
                  Brake point: {worstCorner.brake_point}m | Min speed: {worstCorner.speed_min} km/h | Gear: {worstCorner.gear}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#e8002d", fontFamily: "monospace" }}>
                  {worstCorner.delta.toFixed(2)}s
                </div>
                <button className="quick-btn" style={{ marginTop: 8, borderColor: "#2a0012", color: "#e8002d" }}
                  onClick={() => askAboutCorner(worstCorner)}>
                  Ask Engineer →
                </button>
              </div>
            </div>

            {/* Corner list */}
            <div style={{ fontSize: 9, color: "#333", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
              CORNER-BY-CORNER BREAKDOWN — CLICK TO ANALYSE
            </div>
            <div style={{ background: "#080812", border: "1px solid #12121e", borderRadius: 4, overflow: "hidden" }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 80px 80px 60px 60px 90px",
                padding: "8px 14px", borderBottom: "1px solid #0e0e1e",
                fontSize: 9, color: "#333", letterSpacing: 1.5, textTransform: "uppercase",
              }}>
                <span>Corner</span>
                <span>Min Speed</span>
                <span>Brake Pt</span>
                <span>Gear</span>
                <span>Throttle</span>
                <span>Delta</span>
              </div>
              {CIRCUIT_CORNERS.map(c => (
                <div key={c.id} onClick={() => askAboutCorner(c)} style={{
                  display: "grid", gridTemplateColumns: "1fr 80px 80px 60px 60px 90px",
                  padding: "9px 14px", borderBottom: "1px solid #0a0a14",
                  cursor: "pointer", transition: "background 0.15s",
                  background: selectedCorner?.id === c.id ? "#0c0c1e" : "transparent",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "#0a0a16"}
                  onMouseLeave={e => e.currentTarget.style.background = selectedCorner?.id === c.id ? "#0c0c1e" : "transparent"}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#ccc" }}>{c.name}</span>
                    <span style={{
                      marginLeft: 8, fontSize: 8, letterSpacing: 1, textTransform: "uppercase",
                      color: { heavy_brake: "#e8002d", medium_brake: "#ff8800", light_brake: "#ffcc00", straight: "#00aaff" }[c.type],
                    }}>{c.type.replace("_", " ")}</span>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "#aaa" }}>{c.speed_min} km/h</span>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "#aaa" }}>{c.brake_point ? `${c.brake_point}m` : "—"}</span>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "#aaa" }}>{c.gear}</span>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "#aaa" }}>{c.throttle_pct}%</span>
                  <DeltaBar delta={c.delta} />
                </div>
              ))}
            </div>

            {/* Start session CTA */}
            {!sessionStarted && (
              <div style={{ marginTop: 20, textAlign: "center" }}>
                <button onClick={startSession} style={{
                  background: "#e8002d", border: "none", color: "#fff", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 14, fontWeight: 700, letterSpacing: 2,
                  padding: "14px 40px", borderRadius: 3, textTransform: "uppercase",
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => e.target.style.background = "#ff1a3e"}
                  onMouseLeave={e => e.target.style.background = "#e8002d"}
                >
                  🎧  OPEN ENGINEER RADIO
                </button>
                <div style={{ fontSize: 10, color: "#333", marginTop: 8, letterSpacing: 1 }}>
                  AI-powered analysis using Claude · Real telemetry data in production
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CHAT TAB ── */}
        {activeView === "chat" && (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* Corner sidebar */}
            <div style={{
              width: 240, borderRight: "1px solid #0e0e1e",
              overflow: "auto", flexShrink: 0,
              background: "#060610",
            }}>
              <div style={{ padding: "12px 14px 8px", fontSize: 9, color: "#333", letterSpacing: 2, textTransform: "uppercase" }}>
                Select Corner
              </div>
              {CIRCUIT_CORNERS.map(c => (
                <CornerRow key={c.id} corner={c}
                  selected={selectedCorner?.id === c.id}
                  onClick={() => askAboutCorner(c)}
                />
              ))}
            </div>

            {/* Chat area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Messages */}
              <div style={{ flex: 1, overflow: "auto", padding: "20px 20px 0" }}>
                {messages.length === 0 && !loading && (
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", height: "100%", gap: 12, color: "#222",
                  }}>
                    <div style={{ fontSize: 48 }}>🎧</div>
                    <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
                      Radio Silence
                    </div>
                    <div style={{ fontSize: 11, color: "#1a1a2a" }}>Click a corner or ask a question</div>
                  </div>
                )}

                {messages.map((m, i) => <RadioMessage key={i} msg={m} />)}

                {loading && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 16, animation: "fadeUp 0.3s ease" }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      background: "#0a1628", border: "2px solid #3671C6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 900, color: "#3671C6", flexShrink: 0,
                    }}>RE</div>
                    <div style={{
                      background: "#080e1a", border: "1px solid #1a2a4a",
                      borderRadius: "4px 12px 12px 12px", padding: "14px 16px",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{
                          width: 5, height: 5, borderRadius: "50%", background: "#3671C6",
                          animation: `pulse 1.2s ${i*0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Quick actions */}
              {messages.length > 0 && (
                <div style={{
                  padding: "10px 20px 0",
                  display: "flex", gap: 6, flexWrap: "wrap",
                  borderTop: "1px solid #0a0a14",
                }}>
                  {quickActions.map((q, i) => (
                    <button key={i} className="quick-btn" onClick={() => sendMessage(q.msg)}>
                      {q.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div style={{ padding: "12px 20px 16px", display: "flex", gap: 10, alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
                  placeholder="Ask your engineer… e.g. 'Why am I slow through Turn 7?' or 'Where can I find half a second?'"
                  rows={2}
                  disabled={loading}
                />
                <button className="send-btn" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
                  style={{ height: 52 }}>
                  {loading ? "..." : "SEND"}
                </button>
              </div>

              {/* Footer */}
              <div style={{
                padding: "6px 20px 10px",
                fontSize: 9, color: "#1a1a2a", letterSpacing: 1,
                borderTop: "1px solid #0a0a14",
              }}>
                Powered by Claude · Real FastF1 telemetry in production via Streamlit · Built by Swara — Onyx Racing FS
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
