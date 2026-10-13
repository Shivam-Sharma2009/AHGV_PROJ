import { useEffect, useRef, useState } from "react";

import "./App.css";

const API = "http://127.0.0.1:8000";

function getYouTubeId(url) {

  try {

    const parsed = new URL(url);

    if (parsed.hostname === "youtu.be") {

      return parsed.pathname.slice(1);

    }

    if (

      parsed.hostname === "youtube.com" ||

      parsed.hostname === "www.youtube.com" ||

      parsed.hostname === "m.youtube.com"

    ) {

      if (parsed.pathname === "/watch") {

        return parsed.searchParams.get("v");

      }

      const parts = parsed.pathname.split("/");

      if (["embed", "shorts", "live"].includes(parts[1])) {

        return parts[2];

      }

    }

  } catch {

    return null;

  }

  return null;

}

function formatTime(seconds) {

  const minutes = Math.floor(seconds / 60);

  const secs = Math.floor(seconds % 60);

  return `${minutes}:${String(secs).padStart(2, "0")}`;

}

function App() {

  const [source, setSource] = useState("upload");

  const [selectedFile, setSelectedFile] = useState(null);

  const [uploadedVideo, setUploadedVideo] = useState("");

  const [youtubeUrl, setYoutubeUrl] = useState("");

  const [youtubeId, setYoutubeId] = useState("");
  const youtubePlayerRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);

  const [duration, setDuration] = useState(0);

  const [transcript, setTranscript] = useState(null);

  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const [backendStatus, setBackendStatus] = useState("Checking...");

  const [question, setQuestion] = useState("");

  const [answerData, setAnswerData] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  useEffect(() => {

    fetch(`${API}/health`)

      .then((response) => {

        if (!response.ok) throw new Error("Backend unavailable");

        return response.json();

      })

      .then(() => setBackendStatus("Connected"))

      .catch(() => setBackendStatus("Disconnected"));

  }, []);

  // Connect the YouTube IFrame Player API so transcript timestamps follow playback.
  useEffect(() => {
    if (!youtubeId) return undefined;

    let cancelled = false;
    let syncTimer = null;

    const initializePlayer = () => {
      if (cancelled || !window.YT?.Player) return;

      const iframe = document.getElementById("youtube-player");
      if (!iframe) return;

      try {
        youtubePlayerRef.current?.destroy?.();
      } catch {
        // Ignore cleanup errors from a previous player instance.
      }

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
      } catch {
        // The iframe API can briefly be unavailable while a video changes.
      }
    }, 500);

    return () => {
      cancelled = true;
      if (syncTimer) window.clearInterval(syncTimer);
      try {
        youtubePlayerRef.current?.destroy?.();
      } catch {
        // Ignore cleanup errors.
      }
      youtubePlayerRef.current = null;
    };
  }, [youtubeId]);

  async function uploadLecture(event) {

    event.preventDefault();

    if (!selectedFile) {

      setError("Please choose a video file first.");

      return;

    }

    setLoading(true);

    setError("");

    setNotice("");

    setAnswerData(null);

    try {

      const formData = new FormData();

      formData.append("file", selectedFile);

      const response = await fetch(`${API}/api/upload-video`, {

        method: "POST",

        body: formData,

      });

      const data = await response.json();

      if (!response.ok) {

        throw new Error(data.detail || "Upload failed.");

      }

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
    setAnswerData(null);

    try {
      const response = await fetch(`${API}/api/youtube-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: youtubeUrl.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load YouTube captions.");
      }

      setTranscript(data);
      setNotice(
        `Captions loaded: ${data.language}. ${data.segments.length} segments found.`
      );
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
      setError("Load a YouTube lecture with available captions before asking questions. Uploaded-video transcription is not connected yet.");
      return;
    }

    setLoading(true);
    setError("");
    setAnswerData(null);

    try {
      // Reduce the full caption list to a compact set of likely evidence segments.
      // The backend/Gemini then selects the strongest evidence and generates the explanation.
      const stopWords = new Set([
        "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
        "does", "did", "are", "was", "were", "the", "and", "for", "with", "from",
        "this", "that", "these", "those", "have", "has", "had", "can", "could",
        "would", "should", "about", "into", "explain", "tell", "please", "lecture",
        "kya", "kaise", "kyun", "hai", "hain", "tha", "thi", "the", "aur", "mein",
        "ke", "ki", "ka", "ko", "se", "par", "batao", "samjhao"
      ]);

      const terms = (question.toLowerCase().match(/[a-z0-9]+|[\u0900-\u097f]+/g) || [])
        .filter((word) => word.length > 2 && !stopWords.has(word));

      const candidates = transcript.segments.map((segment) => {
        const text = String(segment.text || "").toLowerCase();
        const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
        const distance = Math.abs(Number(segment.start || 0) - currentTime);
        return { segment, score, distance };
      });

      candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);

      // Include topical matches plus nearby captions so the backend can ground its answer.
      const selected = candidates.slice(0, 100).map(({ segment }) => ({
        start: segment.start,
        end: segment.end,
        text: String(segment.text || "").slice(0, 1200),
      }));

      const response = await fetch(`${API}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          current_time: currentTime,
          transcript: selected,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Question request failed.");
      }

      setAnswerData(data);
    } catch (err) {
      setError(err.message || "Could not get an AI answer.");
    } finally {
      setLoading(false);
    }
  }

  function clearVideo() {

    setUploadedVideo("");

    setYoutubeId("");

    setSelectedFile(null);

    setCurrentTime(0);

    setDuration(0);

    setAnswerData(null);
    setTranscript(null);
    setTranscriptLoading(false);

    setNotice("");

    setError("");

  }

  const visibleSegments = transcript?.segments
    ? transcript.segments
        .filter((segment) =>
          segment.end >= Math.max(0, currentTime - 12) &&
          segment.start <= currentTime + 38
        )
        .slice(0, 14)
    : [];

  return (

    <main className="app">

      <header className="topbar">

        <div className="brand-mark">A</div>

        <div>

          <p className="brand-name">AHGV</p>

          <p className="brand-caption">INTERACTIVE LEARNING</p>

        </div>

        <span className="connection-badge">

          <span className={backendStatus === "Connected" ? "dot online" : "dot"} />

          {backendStatus}

        </span>

      </header>

      <section className="hero">

        <p className="eyebrow">YOUR PERSONAL LEARNING SPACE</p>

        <h1>Learn at your own pace.</h1>

        <p className="hero-description">

          Bring your lecture. Ask questions. Understand more.

        </p>

      </section>

      <section className="workspace">

        <div className="source-panel">

          <div className="section-heading">

            <span className="step-number">01</span>

            <div>

              <h2>Choose your lecture</h2>

              <p>Upload a video or learn from YouTube.</p>

            </div>

          </div>

          <div className="source-tabs">

            <button

              type="button"

              className={source === "upload" ? "tab active" : "tab"}

              onClick={() => {

                setSource("upload");

                setError("");

                setNotice("");

              }}

            >

              ↑ Upload lecture

            </button>

            <button

              type="button"

              className={source === "youtube" ? "tab active" : "tab"}

              onClick={() => {

                setSource("youtube");

                setError("");

                setNotice("");

              }}

            >

              ▶ YouTube

            </button>

          </div>

          {source === "upload" ? (

            <form className="source-form" onSubmit={uploadLecture}>

              <label className="upload-zone" htmlFor="lecture-file">

                <span className="upload-icon">↑</span>

                <strong>

                  {selectedFile ? selectedFile.name : "Choose a lecture video"}

                </strong>

                <span>MP4, WebM or MOV · Maximum 500 MB</span>

                <input

                  id="lecture-file"

                  type="file"

                  accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"

                  onChange={(event) => {

                    setSelectedFile(event.target.files?.[0] ?? null);

                    setError("");

                  }}

                />

              </label>

              <button className="primary-button" type="submit" disabled={loading}>

                {loading ? "Uploading..." : "Upload lecture"}

              </button>

            </form>

          ) : (

            <form className="source-form" onSubmit={loadYouTube}>

              <label htmlFor="youtube-url">YouTube video URL</label>

              <input

                id="youtube-url"

                className="text-input"

                type="url"

                placeholder="https://www.youtube.com/watch?v=..."

                value={youtubeUrl}

                onChange={(event) => setYoutubeUrl(event.target.value)}

                required

              />

              <p className="helper-text">

                Use a regular video URL. Some videos restrict embedding.

              </p>

              <button className="primary-button" type="submit" disabled={transcriptLoading}>

                {transcriptLoading ? "Loading captions..." : "Load YouTube lecture"}

              </button>

            </form>

          )}

          {error && <p className="message error" role="alert">{error}</p>}

          {notice && <p className="message success" role="status">{notice}</p>}

        </div>

        <div className="player-panel">

          <div className="section-heading">

            <span className="step-number">02</span>

            <div>

              <h2>Lecture player</h2>

              <p>Your selected video appears here.</p>

            </div>

          </div>

          <div className="video-frame">

            {uploadedVideo ? (

              <video

                key={uploadedVideo}

                controls

                playsInline

                src={uploadedVideo}

                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}

                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}

                onSeeked={(event) => {

                  setCurrentTime(event.currentTarget.currentTime);

                  setAnswerData(null);

                }}

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

                <span className="play-icon">▶</span>

                <strong>Your lecture will appear here</strong>

                <p>Upload a video or paste a YouTube link to begin.</p>

              </div>

            )}

          </div>

          {duration > 0 && (

            <div className="player-timeline">

              <label htmlFor="video-time">

                Playback position: {formatTime(currentTime)} / {formatTime(duration)}

              </label>

              <input

                id="video-time"

                type="range"

                min="0"

                max={duration}

                step="0.1"

                value={Math.min(currentTime, duration)}

                onChange={(event) => {

                  const time = Number(event.target.value);

                  const localPlayer = document.querySelector(".video-frame video");
                  if (localPlayer) localPlayer.currentTime = time;
                  if (youtubePlayerRef.current?.seekTo) {
                    youtubePlayerRef.current.seekTo(time, true);
                  }
                  setCurrentTime(time);

                  setAnswerData(null);

                }}

              />

            </div>

          )}

          <div className="player-actions">

            <span>Current timestamp: {formatTime(currentTime)}</span>

            <button className="secondary-button" type="button" onClick={clearVideo}>

              Change lecture

            </button>

          </div>

        </div>

      </section>

      <section className="study-grid">

        <div className="transcript-panel">

          <div className="section-heading">

            <span className="step-number">03</span>

            <div>

              <h2>Transcript preview</h2>

              <p>{transcript ? `Captions: ${transcript.language}` : "Timestamped captions from your selected YouTube lecture."}</p>

            </div>

          </div>

          {visibleSegments.length > 0 ? (

            visibleSegments.map((segment) => (

              <article className="transcript-segment" key={segment.start}>

                <span>{formatTime(segment.start)}–{formatTime(segment.end)}</span>

                <p>{segment.text}</p>

              </article>

            ))

          ) : (

            <p className="helper-text">

              {transcriptLoading
                ? "Fetching captions..."
                : "No transcript loaded. Choose a YouTube video with available captions."}

            </p>

          )}

          {transcript && (
            <p className="notice-text">
              Captions are filtered around the current playback time. Select a timestamp citation to seek to that moment.
            </p>
          )}
          {!transcript && (
            <p className="notice-text">
              Local video transcription is not implemented yet. YouTube captions load when available.
            </p>
          )}

        </div>

        <div className="assistant-panel">

          <div className="section-heading">

            <span className="step-number">04</span>

            <div>

              <h2>Ask your assistant</h2>

              <p>{transcript ? "Answers are retrieved from your actual YouTube captions." : "Ask questions about your selected lecture."}</p>

            </div>

          </div>

          <form className="question-form" onSubmit={askQuestion}>

            <label htmlFor="question">What would you like to understand?</label>

            <textarea

              id="question"

              rows="4"

              value={question}

              onChange={(event) => setQuestion(event.target.value)}

              placeholder="e.g. What is supervised learning?"

            />

            <button className="primary-button" type="submit" disabled={loading}>

              {loading ? "Finding answer..." : "Ask question →"}

            </button>

          </form>

          {answerData && (

            <div className="answer-card" aria-live="polite">

              <p className="answer-label">ANSWER</p>

              <p>{answerData.answer}</p>

              {answerData.citations?.length > 0 && (

                <div className="citations">

                  <p className="answer-label">SOURCES</p>

                  {answerData.citations.map((citation, index) => (

                    <button

                      type="button"

                      className="citation-button"

                      key={`${citation.start}-${index}`}

                      onClick={() => {

                        const player = document.querySelector(".video-frame video");

                        if (player) player.currentTime = citation.start;

                        setCurrentTime(citation.start);

                      }}

                    >

                      {citation.source} · {formatTime(citation.start)}–{formatTime(citation.end)}

                    </button>

                  ))}

                </div>

              )}

              {answerData.note && <p className="notice-text">{answerData.note}</p>}

            </div>

          )}

        </div>

      </section>

      <footer>

        AHGV Learning Assistant <span>·</span> Prototype v0.1

      </footer>

    </main>

  );

}

export default App;