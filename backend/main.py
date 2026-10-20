from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse, parse_qs, urljoin
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from xml.etree import ElementTree
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google import genai
from pydantic import BaseModel, Field, HttpUrl
from youtube_transcript_api import YouTubeTranscriptApi


# ---------- GEMINI CONFIGURATION ----------

load_dotenv(Path(__file__).resolve().parent / ".env")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# Ordered list of models to try – if one is overloaded the next is attempted.
GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]


def _generate(prompt: str) -> str:
    """Try each model in GEMINI_MODELS until one succeeds."""
    last_exc = None
    for model in GEMINI_MODELS:
        try:
            response = gemini_client.models.generate_content(
                model=model,
                contents=prompt,
            )
            text = (response.text or "").strip()
            if text:
                return text
        except Exception as exc:
            print(f"Model {model} failed: {type(exc).__name__}: {exc}")
            last_exc = exc
    raise last_exc or RuntimeError("All Gemini models failed.")


# ---------- APP CONFIGURATION ----------

app = FastAPI(
    title="AHGV Learning Assistant API",
    description="AI-powered interactive learning assistant",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://ahgv-learning.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- VIDEO STORAGE ----------

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_VIDEO_SIZE = 500 * 1024 * 1024
ALLOWED_EXTENSIONS = {".mp4", ".webm", ".mov"}

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


# ---------- BASIC ENDPOINTS ----------

@app.get("/")
def home():
    return {
        "message": "AHGV Learning Assistant API is running!",
        "status": "success",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "gemini_configured": bool(GEMINI_API_KEY),
    }


# ---------- SAMPLE TRANSCRIPT (FALLBACK FOR DEMO) ----------

class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


sample_transcript = [
    TranscriptSegment(
        start=0,
        end=15,
        text="Machine learning is a branch of artificial intelligence.",
    ),
    TranscriptSegment(
        start=15,
        end=30,
        text="Supervised learning uses labelled training data.",
    ),
    TranscriptSegment(
        start=30,
        end=45,
        text="Unsupervised learning finds patterns in unlabelled data.",
    ),
]


@app.get("/api/transcript")
def get_transcript():
    return {
        "title": "Introduction to Machine Learning",
        "duration": 45,
        "segments": [segment.model_dump() for segment in sample_transcript],
    }


# ---------- GEMINI-POWERED QUESTION ANSWERING ----------

class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    current_time: float = Field(ge=0)
    transcript: list[TranscriptSegment] = Field(default_factory=list)


@app.post("/api/ask")
def ask_question(request: QuestionRequest):
    question = request.question.strip()

    if not question:
        raise HTTPException(status_code=400, detail="Please enter a question.")

    if not gemini_client:
        raise HTTPException(
            status_code=503,
            detail="Gemini API key is not configured. Add GEMINI_API_KEY to backend/.env and restart the backend.",
        )

    if not request.transcript:
        raise HTTPException(
            status_code=400,
            detail="No lecture transcript provided. Load a YouTube lecture with captions first.",
        )

    # Prefer transcript already played. Near the start of a video, use the
    # nearest available transcript context so the tutor can answer immediately.
    current_time = max(0.0, request.current_time)
    valid_segments = [
        segment for segment in request.transcript
        if segment.text.strip()
        and segment.start >= 0
        and segment.end >= segment.start
    ]
    available = [
        segment for segment in valid_segments
        if segment.end <= current_time + 0.05
    ]
    if not available and valid_segments:
        available = sorted(
            valid_segments,
            key=lambda segment: abs(segment.start - current_time),
        )[:12]
        available.sort(key=lambda segment: segment.start)

    if not available:
        raise HTTPException(
            status_code=400,
            detail="No usable transcript segments were provided. Load a video with captions and try again.",
        )

    def tokenize(value: str) -> set[str]:
        return {
            token.lower()
            for token in re.findall(r"[a-zA-Z0-9]+|[\\u0900-\\u097f]+", value)
            if len(token) > 1
        }

    stop_words = {
        "what", "when", "where", "which", "who", "why", "how", "does",
        "did", "are", "was", "were", "the", "and", "for", "with", "from",
        "this", "that", "these", "those", "have", "has", "had", "can",
        "could", "would", "should", "about", "into", "explain", "tell",
        "please", "lecture", "video", "here", "it", "its", "mean", "means",
        "kya", "kaise", "kyun", "hai", "hain", "tha", "thi", "the", "aur",
        "mein", "ke", "ki", "ka", "ko", "se", "batao", "samjhao",
        "isko", "ise", "iska", "iske", "ye", "yeh", "vo", "woh",
    }
    query_terms = tokenize(question) - stop_words
    generic_question = (
        not query_terms
        or bool(re.search(
            r"\\b(explain|describe|elaborate)\\s+(this|it|that)\\b",
            question,
            flags=re.IGNORECASE,
        ))
        or question.lower().strip() in {
            "explain this", "explain it", "explain that",
            "isko samjhao", "ise samjhao", "ye samjhao", "yeh samjhao",
        }
    )

    # Generic/deictic questions ("explain this") refer to the nearby lecture
    # context. Specific questions use lexical relevance, with recency as a
    # tie-breaker. If no words match, fall back to the nearby past context.
    if generic_question:
        local = [
            segment for segment in available
            if current_time - segment.end <= 120
        ]
        candidates = local or available[-12:]
        selected = candidates[-12:]
    else:
        ranked = []
        for segment in available:
            segment_terms = tokenize(segment.text)
            overlap = query_terms & segment_terms
            if overlap:
                # Normalize overlap so short captions are not unfairly favored.
                score = len(overlap) / max(1, len(query_terms))
                distance = max(0.0, current_time - segment.end)
                ranked.append((score, distance, segment))

        if ranked:
            ranked.sort(key=lambda item: (-item[0], item[1]))
            selected = [item[2] for item in ranked[:12]]
            selected.sort(key=lambda segment: segment.start)
        else:
            local = [
                segment for segment in available
                if current_time - segment.end <= 120
            ]
            selected = (local or available[-12:])[-12:]

    # Keep the context compact and preserve exact timestamps for citations.
    context = "\\n".join(
        f"[{segment.start:.2f}s - {segment.end:.2f}s] {segment.text.strip()}"
        for segment in selected
    )

    prompt = f"""You are AHGV, a patient, clear, interactive lecture tutor.

Answer the student's question using ONLY the transcript evidence below.
IMPORTANT RULES:
- Prefer material already played. If the question is asked near the start and no earlier material exists, use only the nearest transcript segments provided as initial context. Do not claim that context has already been played.
- First answer the actual question directly. For "explain this/it", explain the idea in the nearby transcript in simple language.
- Prefer clear, natural Hindi/Hinglish when the student asks in Hindi/Hinglish; otherwise use the question's language.
- Teach, do not merely paraphrase the transcript: explain the meaning in simple words and give a small example only when the transcript supports it. Clearly label any simple illustrative analogy as an analogy.
- Do not repeat the transcript line-by-line, output raw timestamp ranges as the answer, or invent code details, definitions, or claims not supported by the evidence.
- If the evidence is insufficient, say what cannot be determined from this lecture context instead of guessing.
- Cite only timestamps that appear in the evidence below. Use [MM:SS] or [HH:MM:SS] format. Do not invent timestamps.
- Keep the answer focused: usually 1 short explanation plus 1 example if useful.

Current playback position: {current_time:.2f} seconds.

Transcript evidence:
{context}

Student question:
{question}

Tutor answer:"""

    try:
        answer = _generate(prompt)

        if not answer:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty answer. Please try again.",
            )

        return {
            "answer": answer,
            "citations": [
                {
                    "source": segment.text,
                    "start": segment.start,
                    "end": segment.end,
                }
                for segment in selected
            ],
            "method": "timestamp_filtered_retrieval_qa",
            "model": "Gemini (configured fallback list)",
        }

    except HTTPException:
        raise
    except Exception as exc:
        print(f"Gemini request failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Gemini could not answer. Check the API key, model availability, network, and API quota.",
        )


# ---------- QUIZ & SUMMARY GENERATION ----------

class QuizRequest(BaseModel):
    transcript: list[TranscriptSegment] = Field(default_factory=list)


@app.post("/api/generate-quiz")
def generate_quiz(request: QuizRequest):
    if not gemini_client:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured.",
        )
    if not request.transcript:
        raise HTTPException(
            status_code=400,
            detail="No transcript provided for quiz generation.",
        )

    # Sample evenly up to 25 segments for broad coverage
    step = max(1, len(request.transcript) // 25)
    sampled = request.transcript[::step][:25]
    context = "\n".join(f"[{s.start:.1f}s] {s.text}" for s in sampled)

    prompt = f"""You are an educational quiz generator.
Based on the following lecture transcript, generate 3 multiple-choice questions to test the student's understanding.
Return STRICT JSON format with no markdown fences, matching this structure:
{{
  "questions": [
    {{
      "id": 1,
      "question": "What is ...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answerIndex": 0,
      "explanation": "Brief explanation...",
      "timestamp": 12.5
    }}
  ]
}}

Transcript:
{context}
"""

    try:
        raw = _generate(prompt)
        # Clean potential markdown backticks
        clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.DOTALL).strip()
        import json
        data = json.loads(clean)
        return data
    except Exception as exc:
        print(f"Quiz generation failed: {exc}")
        # Provide graceful fallback questions if Gemini parse fails
        return {
            "questions": [
                {
                    "id": 1,
                    "question": "What is the primary topic covered in this lecture segment?",
                    "options": [
                        sampled[0].text[:60] if sampled else "Core Principles",
                        "Historical background and unrelated context",
                        "Technical setup prerequisites",
                        "Alternative methods and conclusion"
                    ],
                    "answerIndex": 0,
                    "explanation": "This is introduced as the focal point of the lecture discussion.",
                    "timestamp": sampled[0].start if sampled else 0
                },
                {
                    "id": 2,
                    "question": "Which principle was emphasized during the middle section?",
                    "options": [
                        "Foundational application and analysis",
                        sampled[len(sampled)//2].text[:60] if len(sampled) > 1 else "Key technique",
                        "Disregarding standard guidelines",
                        "None of the above"
                    ],
                    "answerIndex": 1,
                    "explanation": "The speaker specifically highlighted this concept in the lecture progression.",
                    "timestamp": sampled[len(sampled)//2].start if len(sampled) > 1 else 10
                },
                {
                    "id": 3,
                    "question": "What main takeaway should students apply moving forward?",
                    "options": [
                        "Memorization without practical practice",
                        "Skipping foundational verification",
                        "Practical synthesis and conceptual mastery",
                        "Ignoring edge cases completely"
                    ],
                    "answerIndex": 2,
                    "explanation": "The lecture concludes with practical synthesis of the discussed knowledge.",
                    "timestamp": sampled[-1].start if sampled else 20
                }
            ]
        }


class KeyPointsRequest(BaseModel):
    transcript: list[TranscriptSegment] = Field(default_factory=list)


@app.post("/api/keypoints")
def generate_keypoints(request: KeyPointsRequest):
    if not gemini_client:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured.",
        )
    if not request.transcript:
        raise HTTPException(
            status_code=400,
            detail="No transcript provided.",
        )

    step = max(1, len(request.transcript) // 20)
    sampled = request.transcript[::step][:20]
    context = "\n".join(f"[{s.start:.1f}s] {s.text}" for s in sampled)

    prompt = f"""You are an educational assistant.
Extract 4 to 6 concise key points from this lecture transcript.
Return STRICT JSON format with no markdown fences, matching:
{{
  "keypoints": [
    {{
      "title": "Short title",
      "summary": "1-2 sentence description",
      "timestamp": 15.0
    }}
  ]
}}

Transcript:
{context}
"""

    try:
        raw = _generate(prompt)
        clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.DOTALL).strip()
        import json
        data = json.loads(clean)
        return data
    except Exception as exc:
        print(f"Key points generation failed: {exc}")
        return {
            "keypoints": [
                {
                    "title": "Lecture Introduction & Overview",
                    "summary": sampled[0].text[:120] if sampled else "Foundational introduction to topic.",
                    "timestamp": sampled[0].start if sampled else 0
                },
                {
                    "title": "Core Conceptual Principles",
                    "summary": sampled[len(sampled)//3].text[:120] if len(sampled) > 2 else "In-depth discussion of key rules.",
                    "timestamp": sampled[len(sampled)//3].start if len(sampled) > 2 else 10
                },
                {
                    "title": "Practical Demonstration & Examples",
                    "summary": sampled[2*len(sampled)//3].text[:120] if len(sampled) > 3 else "Practical application walk-through.",
                    "timestamp": sampled[2*len(sampled)//3].start if len(sampled) > 3 else 20
                },
                {
                    "title": "Summary & Key Takeaways",
                    "summary": sampled[-1].text[:120] if sampled else "Final wrap-up and conclusions.",
                    "timestamp": sampled[-1].start if sampled else 30
                }
            ]
        }


# ---------- VIDEO UPLOAD ----------

@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    original_name = file.filename or ""
    extension = Path(original_name).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Supported video formats: MP4, WebM and MOV.",
        )

    saved_name = f"{uuid4().hex}{extension}"
    destination = UPLOAD_DIR / saved_name
    total_size = 0

    try:
        with destination.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break

                total_size += len(chunk)
                if total_size > MAX_VIDEO_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Video exceeds the 500 MB limit.",
                    )
                output.write(chunk)

    except Exception:
        destination.unlink(missing_ok=True)
        raise

    finally:
        await file.close()

    return {
        "message": "Video uploaded successfully.",
        "filename": saved_name,
        "size_bytes": total_size,
        "video_url": f"/uploads/{saved_name}",
    }


# ---------- YOUTUBE TRANSCRIPT ----------

class YouTubeTranscriptRequest(BaseModel):
    video_url: HttpUrl


def _fetch_via_public_invidious(video_id: str, languages: list[str]) -> dict | None:
    """Best-effort free fallback via public Invidious instances; returns existing captions only."""
    headers = {"User-Agent": "AHGV-Learning/1.0"}
    try:
        request = Request("https://api.invidious.io/instances.json?sort_by=health", headers=headers)
        with urlopen(request, timeout=5) as response:
            instances = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"Invidious instance directory unavailable: {type(exc).__name__}: {exc}")
        return None

    tried = 0
    skipped = 0
    print(f"Invidious directory returned {len(instances)} entries; selecting up to 4 HTTPS instances")
    for item in instances:
        if not isinstance(item, list) or len(item) < 2 or not isinstance(item[1], dict):
            skipped += 1
            continue
        base_url, metadata = item[0], item[1]
        parsed_base = urlparse(base_url if isinstance(base_url, str) else "")
        # The instance directory's metadata shape can vary; the public directory
        # itself is the source of candidate instances, so do not require an
        # optional 'api' flag to be present.
        if parsed_base.scheme != "https" or not parsed_base.netloc:
            skipped += 1
            continue
        tried += 1
        if tried > 4:
            break
        print(f"Trying Invidious caption fallback instance {tried}: {parsed_base.netloc}")
        try:
            captions_url = urljoin(base_url.rstrip("/") + "/", f"api/v1/captions/{video_id}")
            with urlopen(Request(captions_url, headers=headers), timeout=5) as response:
                caption_data = json.loads(response.read().decode("utf-8"))
            tracks = caption_data.get("captions", []) if isinstance(caption_data, dict) else []
            track = next(
                (t for lang in languages for t in tracks
                 if isinstance(t, dict)
                 and str(t.get("languageCode", "")).lower().startswith(lang)),
                None,
            )
            if not track or not track.get("url"):
                print(f"No English/Hindi caption track at {parsed_base.netloc}")
                continue
            caption_url = urljoin(base_url.rstrip("/") + "/", track["url"].lstrip("/"))
            with urlopen(Request(caption_url, headers=headers), timeout=8) as response:
                caption_text = response.read().decode("utf-8", errors="replace")
            # Invidious caption endpoints return WebVTT, not XML.
            blocks = re.split(r"\r?\n\s*\r?\n", caption_text.strip())
            segments = []
            for block in blocks:
                lines = [line.strip() for line in block.splitlines() if line.strip()]
                timing_index = next((i for i, line in enumerate(lines) if "-->" in line), None)
                if timing_index is None:
                    continue
                timing = lines[timing_index].split("-->", 1)
                try:
                    start_text = timing[0].strip().split()[0]
                    end_text = timing[1].strip().split()[0]
                    def to_seconds(value):
                        parts = value.replace(",", ".").split(":")
                        return sum(float(part) * (60 ** (len(parts) - i - 1)) for i, part in enumerate(parts))
                    start_seconds = to_seconds(start_text)
                    end_seconds = to_seconds(end_text)
                except (ValueError, IndexError):
                    continue
                text_value = re.sub(r"<[^>]+>", "", " ".join(lines[timing_index + 1:])).strip()
                text_value = text_value.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                if text_value:
                    segments.append({"start": start_seconds, "end": end_seconds, "text": text_value})
            if segments:
                print(f"Invidious caption fallback succeeded at {parsed_base.netloc} with {len(segments)} segments")
                return {
                    "video_id": video_id,
                    "language": track.get("languageCode", "unknown"),
                    "segments": segments,
                    "transcript_source": "public_invidious_fallback",
                }
        except Exception as exc:
            print(f"Invidious fallback instance failed: {type(exc).__name__}: {exc}")
    print(f"Invidious fallback finished: tried={min(tried, 4)}, skipped={skipped}, no captions retrieved")
    return None


@app.post("/api/youtube-transcript")
def get_youtube_transcript(request: YouTubeTranscriptRequest):
    url = str(request.video_url)
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    video_id = None

    if host in ("youtu.be", "www.youtu.be"):
        video_id = parsed.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"):
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [None])[0]
        else:
            match = re.match(r"^/(?:embed|shorts|live)/([^/]+)", parsed.path)
            if match:
                video_id = match.group(1)

    if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise HTTPException(
            status_code=400,
            detail="Valid YouTube video URL required.",
        )

    try:
        transcript = YouTubeTranscriptApi().fetch(
            video_id,
            languages=["en", "hi"],
        )
        segments = [
            {
                "start": item.start,
                "end": item.start + item.duration,
                "text": item.text,
            }
            for item in transcript
        ]
        return {
            "video_id": video_id,
            "language": transcript.language,
            "segments": segments,
        }
    except Exception as exc:
        print(f"Primary YouTube transcript fetch failed: {type(exc).__name__}: {exc}")

    # Best-effort free fallback: public Invidious instances can expose the
    # video's existing caption tracks when direct YouTube requests are blocked.
    fallback = _fetch_via_public_invidious(video_id, ["en", "hi"])
    if fallback:
        return fallback

    raise HTTPException(
        status_code=502,
        detail=(
            "Could not retrieve captions automatically. YouTube or the available "
            "free transcript sources may be blocking this request, or this video "
            "may not have English/Hindi captions. Try another video with captions."
        ),
    )
