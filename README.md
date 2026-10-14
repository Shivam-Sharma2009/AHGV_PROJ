# AHGV_PROJ --- AI-Powered Interactive Learning Assistant

A React + Vite frontend with a FastAPI backend and Gemini-powered
lecture Q&A.

> **Current setup:** The frontend and backend run locally on your
> computer. Deployment is planned separately. The backend is
> intentionally kept out of the GitHub repository for now.

## Requirements

-   Python 3.10+ (use the Python version already working in this
    project)
-   Node.js and npm
-   A Gemini API key from Google AI Studio

## 1. Configure the Gemini API key

Create this file locally:

`backend/.env`

Add your key:

``` env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

Replace `YOUR_GEMINI_API_KEY` with your actual key. **Never commit or
share this file.**

## 2. Start the backend (FastAPI)

Open a VS Code terminal at the project root (`AHGV_PROJ`) and run:

### Windows PowerShell

``` powershell
.\.venv\Scripts\Activate.ps1
cd backend
python -m uvicorn main:app --reload
```

Keep this terminal open. The backend should be available at:

-   API: http://127.0.0.1:8000
-   Health check: http://127.0.0.1:8000/health
-   Interactive API docs: http://127.0.0.1:8000/docs

If PowerShell says the virtual environment cannot be activated, open a
new terminal and run:

``` powershell
& "$HOME\OneDrive\Desktop\AHGV_PROJ\.venv\Scripts\Activate.ps1"
```

If dependencies are missing, activate `.venv` and install the backend
dependencies used by the project. If a `backend/requirements.txt` file
exists, use:

``` powershell
pip install -r requirements.txt
```

Run that command from inside `backend`.

## 3. Start the frontend (React + Vite)

Open a **second** VS Code terminal at the project root and run:

``` powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

http://localhost:5173

Keep this terminal open while using the app.

## 4. Use the learning assistant

1.  Open the frontend at http://localhost:5173.
2.  Select the YouTube option.
3.  Paste a YouTube lecture URL and load it.
4.  Wait for captions to load.
5.  Ask a question about the lecture.

The backend must be running for Gemini-powered answers. YouTube caption
availability depends on the video and its caption settings.

## 5. Stop the app

In each terminal, press `Ctrl + C` to stop that server.

## Security and repository notes

-   Do not commit `backend/.env`, API keys, `.venv/`, or
    `node_modules/`.
-   The backend is intentionally local-only and is not included in the
    frontend-only GitHub upload.
-   The frontend currently calls the local backend. Other people will
    not be able to use the full app until the backend is deployed and
    the frontend API URL is configured for deployment.
-   Deployment steps will be added after the deployment setup is chosen.