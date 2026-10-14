# ✨ AHGV Learning — Turn Any Video Into Your Personal Tutor

<p align="center">
  <strong>Learn at your own pace. Ask better questions. Understand the lecture—not just watch it.</strong>
</p>

<p align="center">
  <a href="https://ahgv-learning.vercel.app"><img src="https://img.shields.io/badge/🌐_Live_Demo-Open_App-7C3AED?style=for-the-badge" alt="Live demo"></a>
  <img src="https://img.shields.io/badge/React-Vite-646CFF?style=for-the-badge&logo=react&logoColor=white" alt="React and Vite">
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/AI-Google_Gemini-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Google Gemini">
  <img src="https://img.shields.io/badge/Auth-Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
</p>

---

## 🎓 What is AHGV Learning?

Ever watched a long lecture, reached the end, and realised you still have questions?

**AHGV Learning** is an AI-powered interactive learning assistant that helps learners explore a lecture, ask questions about the material, and revise key ideas. Instead of switching between a video, notes, and a search engine, learners can use one learning workspace.

🔗 **Try it:** [ahgv-learning.vercel.app](https://ahgv-learning.vercel.app)

## 🚀 What you can do

| Feature | How it helps |
| --- | --- |
| 🎥 **Learn from YouTube** | Load a YouTube lecture and retrieve its available English or Hindi captions. |
| 💬 **Ask the lecture** | Ask questions about the transcript and get an AI-generated explanation. |
| ⏱️ **Timestamp-aware answers** | The Q&A backend filters transcript segments to those that have ended by the current playback position and provides source timestamps. |
| 🧠 **Generate a quiz** | Create multiple-choice revision questions from transcript content. |
| 📝 **Get key points** | Generate concise lecture takeaways with timestamps. |
| 🔐 **Account access** | Sign up, verify your email, sign in, and sign out with Supabase Auth. |
| 📤 **Video upload endpoint** | The backend accepts MP4, WebM, and MOV uploads up to 500 MB. Hosted file persistence depends on the deployment storage configuration. |

> **Learning principle:** AI answers should be grounded in the lecture context. If the available transcript does not contain enough evidence, the tutor is instructed to say so rather than invent an answer.

## 🖥️ Try the live app

1. Open the [AHGV Learning website](https://ahgv-learning.vercel.app).
2. Create an account or sign in.
3. Choose the YouTube option and paste a lecture URL.
4. Load the available captions.
5. Ask a question, then explore quiz and key-point generation where available.

**Note:** Transcript retrieval depends on the video's caption availability and YouTube access. The hosted backend may take a little time to wake up after inactivity.

## 🧰 Built with

- **Frontend:** React, Vite, JavaScript, CSS
- **Backend:** Python, FastAPI, Uvicorn
- **AI:** Google Gemini API
- **Authentication:** Supabase Auth
- **Frontend hosting:** Vercel
- **Backend hosting:** Render

## 🏗️ How it works

```text
Learner
  │
  ▼
React + Vite website (Vercel)
  │
  ├── Sign-up / sign-in ──────► Supabase Auth
  │
  └── Learning requests ──────► FastAPI backend (Render)
                                  │
                                  ├── YouTube transcript retrieval
                                  ├── Timestamp-filtered transcript Q&A
                                  └── Gemini-powered quiz & key points
```

## 💻 Run it locally

### Prerequisites

- Python 3.10 or newer
- Node.js and npm
- A Google Gemini API key
- Supabase project URL and publishable key

### 1. Clone the repository

```bash
git clone https://github.com/Shivam-Sharma2009/AHGV_PROJ.git
cd AHGV_PROJ
```

### 2. Configure the backend

Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Install dependencies and start FastAPI from the project root:

**Windows PowerShell**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
cd backend
python -m uvicorn main:app --reload
```

The API will be available at:

- API health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
- Interactive API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Configure the frontend

Create `frontend/.env.local`:

```env
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Install packages and start Vite in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### 4. Configure Supabase redirects

In your Supabase dashboard, set the Site URL and allowed redirect URLs to match your local or deployed frontend. For local development, use `http://localhost:5173`; for the hosted app, use `https://ahgv-learning.vercel.app`.

## 🔌 API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check backend status and whether Gemini is configured. |
| `GET` | `/api/transcript` | Return a small sample transcript for demonstration. |
| `POST` | `/api/youtube-transcript` | Retrieve available captions for a valid YouTube URL. |
| `POST` | `/api/ask` | Answer a question using transcript context available before the current playback position. |
| `POST` | `/api/generate-quiz` | Generate multiple-choice questions from a transcript. |
| `POST` | `/api/keypoints` | Generate lecture key points from a transcript. |
| `POST` | `/api/upload-video` | Accept a supported video upload. |

For request and response schemas, start the backend and visit [`/docs`](http://127.0.0.1:8000/docs).

## 🔐 Security notes

- **Never commit secrets.** Keep `backend/.env` and `frontend/.env.local` on your machine only.
- The frontend's `VITE_*` variables are included in the browser bundle. Only use the Supabase **publishable** key there—never a service-role key or Gemini API key.
- Put `GEMINI_API_KEY` in Render's environment-variable settings for the hosted backend.
- The current API should be treated as a **prototype**, not a security-hardened production service. Review backend authorization, request limits, and upload storage before handling sensitive data or opening it to heavy public use.
- Render's local filesystem may be ephemeral; uploaded videos should not be assumed to persist across restarts or redeploys.

## 🗺️ What's next?

Ideas for future iterations:

- 🎤 AI mock-interview practice
- 📚 Better study notes and revision workflows
- 🔎 Stronger evidence matching and citation validation
- 🛡️ Server-side authorization and rate limiting
- ☁️ Durable storage for uploaded learning material

These are roadmap ideas, not promises that every item is already implemented.

## 🤝 Contributing

Found a bug or have an idea? Open an issue with steps to reproduce it, or propose a focused pull request. Small, clear improvements are welcome.

## 👨‍💻 Project

Built as a learning-focused hackathon project.

**Live app:** [ahgv-learning.vercel.app](https://ahgv-learning.vercel.app)  
**Repository:** [Shivam-Sharma2009/AHGV_PROJ](https://github.com/Shivam-Sharma2009/AHGV_PROJ)

---

<p align="center">
  <strong>Less passive watching. More active learning. ✨</strong>
</p>
