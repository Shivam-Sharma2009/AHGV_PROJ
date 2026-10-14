import { useEffect, useRef, useState } from "react";

import "./App.css";

const API = "http://127.0.0.1:8000";

function getYouTubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1);
    if (
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "m.youtube.com"
    ) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const parts = parsed.pathname.split("/");
      if (["embed", "shorts", "live"].includes(parts[1])) return parts[2];
    }
  } catch {
    return null;
  }
  return null;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ============================================================
   AUTH MODAL
   ============================================================ */
function AuthModal({ mode, onClose, onSwitch, onLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    // Mock auth — store user locally
    const user = {
      name: mode === "signup" ? name : email.split("@")[0],
      email,
    };
    onLogin(user);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-header">
          <div className="modal-logo">A</div>
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p>{mode === "signin" ? "Sign in to continue learning" : "Start your AI-powered learning journey"}</p>
        </div>

        <div className="modal-body">
          <button className="btn-social" type="button">
            <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          <div className="modal-divider">or</div>

          <form onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div className="form-group">
                <label htmlFor="auth-name">Full name</label>
                <input
                  id="auth-name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn-modal-submit" type="submit">
              {mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>

        <div className="modal-footer">
          {mode === "signin" ? (
            <p>Don&apos;t have an account? <button type="button" onClick={() => onSwitch("signup")}>Sign up</button></p>
          ) : (
            <p>Already have an account? <button type="button" onClick={() => onSwitch("signin")}>Sign in</button></p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN APP
   ============================================================ */
function App() {
  // ---------- Video / Source ----------
  const [source, setSource] = useState("youtube");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedVideo, setUploadedVideo] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeId, setYoutubeId] = useState("");
  const youtubePlayerRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  // ---------- Q&A ----------
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const chatEndRef = useRef(null);

  // ---------- Tabs ----------
  const [activeTab, setActiveTab] = useState("transcript");

  // ---------- Auth ----------
  const [authModal, setAuthModal] = useState(null); // null | "signin" | "signup"
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("ahgv_user");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [showUserMenu, setShowUserMenu] = useState(false);

  function handleLogin(userData) {
    setUser(userData);
    localStorage.setItem("ahgv_user", JSON.stringify(userData));
  }

  function handleLogout() {
    setUser(null);
    localStorage.removeItem("ahgv_user");
    setShowUserMenu(false);
  }

  // ---------- YouTube IFrame Player API ----------
  useEffect(() => {
    if (!youtubeId) return undefined;

    let cancelled = false;
    let syncTimer = null;

    const initializePlayer = () => {
      if (cancelled || !window.YT?.Player) return;
      const iframe = document.getElementById("youtube-player");
      if (!iframe) return;

      try { youtubePlayerRef.current?.destroy?.(); } catch { /* ignore */ }

      youtubePlayerRef.current = new window.YT.Player(iframe, {
        events: {
          onReady: (event) => {
            if (cancelled) return;
            setDuration(event.target.getDuration() || 0);
          },
          onStateChange: (event) => {
            if (cancelled) return;
            setDuration(event.target.getDuration() || duration || 0);
          },
        },
      });
    };

    if (window.YT?.Player) {
      initializePlayer();
    } else {
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousReady === "function") previousReady();
        initializePlayer();
      };
    }

    syncTimer = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player?.getCurrentTime) return;
      try {
        const time = player.getCurrentTime();
        const length = player.getDuration();
        if (Number.isFinite(time)) {
          setCurrentTime((oldTime) =>
            Math.abs(oldTime - time) >= 0.4 ? time : oldTime
          );
        }
        if (Number.isFinite(length) && length > 0) setDuration(length);
      } catch { /* iframe API can briefly be unavailable */ }
    }, 500);

    return () => {
      cancelled = true;
      if (syncTimer) window.clearInterval(syncTimer);
      try { youtubePlayerRef.current?.destroy?.(); } catch { /* ignore */ }
      youtubePlayerRef.current = null;
    };
  }, [youtubeId]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, loading]);

  // ---------- Actions ----------
  async function uploadLecture(event) {
    event.preventDefault();
    if (!selectedFile) {
      setError("Please choose a video file first.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch(`${API}/api/upload-video`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed.");
      setUploadedVideo(`${API}${data.video_url}`);
      setCurrentTime(0);
      setDuration(0);
      setNotice("Upload successful! Your lecture is ready to play.");
    } catch (err) {
      setError(err.message || "Could not upload video.");
    } finally {
      setLoading(false);
    }
  }

  async function loadYouTube(event) {
    event.preventDefault();
    const id = getYouTubeId(youtubeUrl.trim());
    if (!id) {
      setError("Enter a valid YouTube video URL.");
      return;
    }
    setError("");
    setNotice("Loading YouTube captions...");
    setTranscriptLoading(true);
    setTranscript(null);
    setYoutubeId(id);
    setUploadedVideo("");
    setCurrentTime(0);
    setDuration(0);
    setChatHistory([]);

    try {
      const response = await fetch(`${API}/api/youtube-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: youtubeUrl.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load YouTube captions.");
      setTranscript(data);
      setNotice(`Captions loaded: ${data.language}. ${data.segments.length} segments found.`);
    } catch (err) {
      setTranscript(null);
      setError(err.message || "Could not load YouTube captions.");
      setNotice("");
    } finally {
      setTranscriptLoading(false);
    }
  }

  async function askQuestion(event) {
    event.preventDefault();
    if (!question.trim()) {
      setError("Please enter a question.");
      return;
    }
    if (!transcript?.segments?.length) {
      setError("Load a YouTube lecture with available captions before asking questions.");
      return;
    }

    const userMsg = question.trim();
    setChatHistory((prev) => [...prev, { role: "user", text: userMsg }]);
    setQuestion("");
    setLoading(true);
    setError("");

    try {
      // Reduce the full caption list to a compact set of likely evidence segments.
      const stopWords = new Set([
        "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
        "does", "did", "are", "was", "were", "the", "and", "for", "with", "from",
        "this", "that", "these", "those", "have", "has", "had", "can", "could",
        "would", "should", "about", "into", "explain", "tell", "please", "lecture",
        "kya", "kaise", "kyun", "hai", "hain", "tha", "thi", "the", "aur", "mein",
        "ke", "ki", "ka", "ko", "se", "par", "batao", "samjhao"
      ]);

      const terms = (userMsg.toLowerCase().match(/[a-z0-9]+|[\u0900-\u097f]+/g) || [])
        .filter((word) => word.length > 2 && !stopWords.has(word));

      const candidates = transcript.segments.map((segment) => {
        const text = String(segment.text || "").toLowerCase();
        const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
        const distance = Math.abs(Number(segment.start || 0) - currentTime);
        return { segment, score, distance };
      });

      candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);

      const selected = candidates.slice(0, 100).map(({ segment }) => ({
        start: segment.start,
        end: segment.end,
        text: String(segment.text || "").slice(0, 1200),
      }));

      const response = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMsg,
          current_time: currentTime,
          transcript: selected,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Question request failed.");

      setChatHistory((prev) => [
        ...prev,
        {
          role: "ai",
          text: data.answer,
          citations: data.citations || [],
          note: data.note || "",
        },
      ]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        { role: "ai", text: `Error: ${err.message || "Could not get an answer."}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleQuickAction(action) {
    setQuestion(action);
  }

  function seekTo(time) {
    const localPlayer = document.querySelector(".video-frame video");
    if (localPlayer) localPlayer.currentTime = time;
    if (youtubePlayerRef.current?.seekTo) {
      youtubePlayerRef.current.seekTo(time, true);
    }
    setCurrentTime(time);
  }

  function clearVideo() {
    setUploadedVideo("");
    setYoutubeId("");
    setSelectedFile(null);
    setCurrentTime(0);
    setDuration(0);
    setTranscript(null);
    setTranscriptLoading(false);
    setChatHistory([]);
    setNotice("");
    setError("");
  }

  // Transcript segments near the current playback time
  const visibleSegments = transcript?.segments
    ? transcript.segments
        .filter(
          (seg) =>
            seg.end >= Math.max(0, currentTime - 12) &&
            seg.start <= currentTime + 38
        )
        .slice(0, 14)
    : [];

  const hasVideo = Boolean(uploadedVideo || youtubeId);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="app">
      {/* ---- AUTH MODAL ---- */}
      {authModal && (
        <AuthModal
          mode={authModal}
          onClose={() => setAuthModal(null)}
          onSwitch={(mode) => setAuthModal(mode)}
          onLogin={handleLogin}
        />
      )}

      {/* ============================================================
          NAVBAR
          ============================================================ */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">A</div>
          <div className="navbar-title">
            <span>AHGV</span> Learning
          </div>
        </div>

        <div className="navbar-actions">
          {user ? (
            <div className="user-menu-wrapper">
              <div
                className="navbar-avatar"
                onClick={() => setShowUserMenu(!showUserMenu)}
                title={user.name}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              {showUserMenu && (
                <div className="user-dropdown">
                  <div className="user-dropdown-name">{user.name}</div>
                  <div className="user-dropdown-email">{user.email}</div>
                  <div className="user-dropdown-divider" />
                  <button className="user-dropdown-item" onClick={handleLogout}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                className="btn-signin"
                onClick={() => setAuthModal("signin")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Sign in
              </button>
              <button
                className="btn-signup"
                onClick={() => setAuthModal("signup")}
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ============================================================
          HERO
          ============================================================ */}
      <section className="hero">
        <h1>Turn Any Video Into Your Personal Tutor</h1>
        <p className="hero-subtitle">
          Learn smarter with AI-powered explanations and instant answers
        </p>

        {/* Source toggle */}
        <div className="source-toggle">
          <button
            type="button"
            className={source === "youtube" ? "active" : ""}
            onClick={() => { setSource("youtube"); setError(""); setNotice(""); }}
          >
            ▶ YouTube
          </button>
          <button
            type="button"
            className={source === "upload" ? "active" : ""}
            onClick={() => { setSource("upload"); setError(""); setNotice(""); }}
          >
            ↑ Upload
          </button>
        </div>

        {/* YouTube URL Bar */}
        {source === "youtube" && (
          <form onSubmit={loadYouTube}>
            <div className="url-bar">
              <input
                id="youtube-url"
                type="url"
                placeholder="Enter YouTube Video URL..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                required
              />
              <button className="btn-start" type="submit" disabled={transcriptLoading}>
                {transcriptLoading ? "Loading..." : "Start Learning"}
              </button>
            </div>
          </form>
        )}

        {/* Upload Zone */}
        {source === "upload" && (
          <form className="upload-section" onSubmit={uploadLecture}>
            <label className="upload-dropzone" htmlFor="lecture-file">
              <span className="upload-icon">↑</span>
              <strong>
                {selectedFile ? selectedFile.name : "Choose a lecture video"}
              </strong>
              <span className="upload-hint">MP4, WebM or MOV · Maximum 500 MB</span>
              <input
                id="lecture-file"
                type="file"
                accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] ?? null);
                  setError("");
                }}
              />
            </label>
            <button className="btn-upload" type="submit" disabled={loading}>
              {loading ? "Uploading..." : "Upload Lecture"}
            </button>
          </form>
        )}

        {/* Feature pills */}
        <div className="feature-pills">
          <span className="feature-pill">
            <span className="feature-pill-icon">▶</span>
            Watch &amp; Ask Questions
          </span>
          <span className="feature-pill">
            <span className="feature-pill-icon">📄</span>
            Get Summaries &amp; Notes
          </span>
          <span className="feature-pill">
            <span className="feature-pill-icon">✨</span>
            Personalised Learning
          </span>
        </div>
      </section>

      {/* Messages */}
      {error && <p className="message error" role="alert">{error}</p>}
      {notice && <p className="message success" role="status">{notice}</p>}

      {/* ============================================================
          MAIN CONTENT — TWO-PANEL
          ============================================================ */}
      {hasVideo && (
        <section className="content-grid">
          {/* ---------- LEFT: Video Panel ---------- */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-header-left">
                <div className="card-header-icon">▶</div>
                <span className="card-header-title">
                  {youtubeId ? "Video: YouTube Lecture" : "Video: Uploaded Lecture"}
                </span>
              </div>
              <div className="card-header-actions">
                <button className="card-header-btn" title="Refresh" onClick={clearVideo}>↻</button>
                <button className="card-header-btn" title="Options">≡</button>
              </div>
            </div>

            <div className="video-card-body">
              <div className="video-frame">
                {uploadedVideo ? (
                  <video
                    key={uploadedVideo}
                    controls
                    playsInline
                    src={uploadedVideo}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onSeeked={(e) => { setCurrentTime(e.currentTarget.currentTime); }}
                    onError={() => setError("This video could not be played by your browser.")}
                  >
                    Your browser does not support video playback.
                  </video>
                ) : youtubeId ? (
                  <iframe
                    id="youtube-player"
                    title="YouTube lecture player"
                    src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                ) : (
                  <div className="empty-player">
                    <span className="play-placeholder">▶</span>
                    <strong>Your lecture will appear here</strong>
                    <p>Upload a video or paste a YouTube link to begin.</p>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {duration > 0 && (
                <div className="video-progress">
                  <span className="video-time">{formatTime(currentTime)}</span>
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={Math.min(currentTime, duration)}
                    onChange={(e) => {
                      const time = Number(e.target.value);
                      seekTo(time);
                    }}
                  />
                  <span className="video-time">{formatTime(duration)}</span>
                </div>
              )}

              {/* Content tabs */}
              <div className="content-tabs">
                <button
                  className={`content-tab ${activeTab === "keypoints" ? "active" : ""}`}
                  onClick={() => setActiveTab("keypoints")}
                >
                  📌 Key Points
                </button>
                <button
                  className={`content-tab ${activeTab === "transcript" ? "active" : ""}`}
                  onClick={() => setActiveTab("transcript")}
                >
                  📝 Transcript
                </button>
                <button
                  className={`content-tab ${activeTab === "notes" ? "active" : ""}`}
                  onClick={() => setActiveTab("notes")}
                >
                  📒 Notes
                </button>
              </div>

              <div className="tab-content">
                {activeTab === "transcript" && (
                  <>
                    {visibleSegments.length > 0 ? (
                      visibleSegments.map((seg) => (
                        <div className="transcript-segment" key={seg.start}>
                          <span
                            className="transcript-time"
                            onClick={() => seekTo(seg.start)}
                          >
                            {formatTime(seg.start)}
                          </span>
                          <span className="transcript-text">{seg.text}</span>
                        </div>
                      ))
                    ) : (
                      <p className="tab-empty">
                        {transcriptLoading
                          ? "Fetching captions..."
                          : "No transcript loaded. Load a YouTube video with captions."}
                      </p>
                    )}
                  </>
                )}

                {activeTab === "keypoints" && (
                  <p className="tab-empty">
                    Key points will be generated as you watch. Ask the AI tutor for a summary!
                  </p>
                )}

                {activeTab === "notes" && (
                  <p className="tab-empty">
                    Your notes will appear here. Use the chat to generate notes automatically.
                  </p>
                )}
              </div>
            </div>

            {/* Jump button */}
            {transcript && (
              <button
                className="jump-button"
                onClick={() => handleQuickAction("Summarise the key points from this section")}
              >
                ⚡ Quick Summary of Current Section
              </button>
            )}
          </div>

          {/* ---------- RIGHT: AI Chat Panel ---------- */}
          <div className="glass-card">
            <div className="card-header">
              <div className="card-header-left">
                <div className="card-header-icon">🤖</div>
                <span className="card-header-title">Ask Your Tutor</span>
              </div>
              <div className="card-header-actions">
                <button className="card-header-btn" title="Refresh chat" onClick={() => setChatHistory([])}>↻</button>
                <button className="card-header-btn" title="Options">≡</button>
              </div>
            </div>

            <div className="chat-body">
              <div className="chat-messages">
                {/* Welcome message */}
                {chatHistory.length === 0 && !loading && (
                  <div className="chat-bubble ai">
                    <div className="bubble-label">🤖 AI Tutor</div>
                    Hi there! I&apos;m your AI tutor. Ask me anything about this lecture — I&apos;ll explain concepts, give examples, and point you to the right timestamps.
                  </div>
                )}

                {chatHistory.map((msg, i) => (
                  <div key={i} className={`chat-bubble ${msg.role}`}>
                    {msg.role === "ai" && (
                      <div className="bubble-label">🤖 AI Tutor</div>
                    )}
                    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      {msg.text}
                    </div>
                    {msg.citations?.length > 0 && (
                      <div className="citations">
                        {msg.citations.map((cit, j) => (
                          <button
                            key={`${cit.start}-${j}`}
                            className="citation-chip"
                            onClick={() => seekTo(cit.start)}
                          >
                            📍 {cit.source} · {formatTime(cit.start)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="chat-bubble ai">
                    <div className="bubble-label">🤖 AI Tutor</div>
                    <div className="typing-indicator">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick action buttons */}
              <div className="quick-actions">
                <button className="quick-action-btn" onClick={() => handleQuickAction("Give me a quick summary of this lecture so far")}>
                  ⚡ Quick Summary
                </button>
                <button className="quick-action-btn" onClick={() => handleQuickAction("Generate study notes from the transcript")}>
                  📝 Review Notes
                </button>
              </div>

              {/* Chat input */}
              <form className="chat-input-bar" onSubmit={askQuestion}>
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <button className="btn-send" type="submit" disabled={loading}>
                  Send
                </button>
              </form>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer className="app-footer">
        AHGV Learning Assistant <span>·</span> AI-Powered Education Platform
      </footer>
    </div>
  );
}

export default App;