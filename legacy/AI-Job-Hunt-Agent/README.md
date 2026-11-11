# 🎯 AI Job Hunt Agent

An autonomous multi-agent system built to streamline and supercharge your job hunt. Powered by **LangGraph**, **Groq (LLaMA 3.3)** / **Google Gemini**, local embeddings, and **Streamlit**, this tool automates everything from resume parsing and intelligent job discovery to personalized application materials and interview preparation.

Built with a **zero-cost architecture** using open-source packages and free-tier APIs.

---

## 🚀 Key Features & Multi-Agent Architecture

The system connects **8 specialized AI agents** orchestrated via a unified **LangGraph state machine**:

```
[Resume Upload]
       │
       ▼
1. Profile Parser ──► 2. Job Search ──► 3. Semantic Ranking
                                                │
       ┌────────────────────────────────────────┘
       ▼
4. Company Research ──► 5. Resume Tailor ──► 6. Cover Letter ──► 7. Interview Prep
                                                                        │
                                                                        ▼
                                                                8. Analytics & DB
```

1. **Profile Parser Agent (`Agents/profile_parser.py`)**  
   Extracts candidate info, skills, work history, education, projects, and certifications from PDF/DOCX resumes into clean, structured JSON.
2. **Job Search Agent (`Agents/job_search.py`)**  
   Discovers live job postings using Serper API with an automatic realistic demo job generator fallback.
3. **Semantic Ranking Agent (`Agents/ranking_agent.py`)**  
   Embeds job postings and candidate profiles using local sentence transformers (`all-MiniLM-L6-v2`) to compute semantic cosine similarity scores (0–100%) and filter top matches.
4. **Company Research Agent (`Agents/comapany_research.py`)**  
   Scrapes company domains and uses LLMs to extract insights on tech stack, culture, business size, and mission.
5. **Resume Tailor Agent (`Agents/resume_tailor.py`)**  
   Re-aligns candidate achievements with target job keywords to optimize for ATS systems and exports a ready-to-use `.docx` resume.
6. **Cover Letter Agent (`Agents/cover_letter.py`)**  
   Crafts persuasive, personalized 3–4 paragraph cover letters highlighting candidate fit and company alignment.
7. **Interview Prep Agent (`Agents/interview_prep.py`)**  
   Generates targeted interview packs containing behavioral questions (STAR format), technical deep-dives, role-specific questions, model answers, and smart questions to ask interviewers.
8. **Analytics Agent (`Agents/analytics.py`)**  
   Tracks application statuses, search runs, KPIs, and funnel metrics in a persistent SQLite database.

---

## 🛠️ Tech Stack & Zero-Cost Architecture

- **Orchestration**: LangGraph (`StateGraph`) with state management & conditional routing
- **LLM Engine**: Groq primary (`llama-3.3-70b-versatile`) with Google Gemini (`gemini-1.5-flash`) fallback
- **Embeddings**: Local `sentence-transformers` (`all-MiniLM-L6-v2`, 384 dimensions, offline CPU execution)
- **Vector Database**: Pinecone Serverless (with automatic in-memory fallback for offline/development mode)
- **Database**: SQLite3 (`data/job_agent.db` for profiles, jobs, search history, and applications)
- **Backend API**: FastAPI, Pydantic v2, Uvicorn (modular routers, services, schemas, and async execution)
- **Frontend UI**: Streamlit with custom dark mode theme, interactive job boards, and dedicated Analytics Dashboard

---

## 📁 Project Structure

```
AI-Job-Hunt-Agent/
├── Agents/                    # Autonomous AI agents
│   ├── profile_parser.py      # Resume parsing agent
│   ├── job_search.py          # Search & scraping agent
│   ├── ranking_agent.py       # Semantic vector matching agent
│   ├── comapany_research.py   # Company intel agent
│   ├── resume_tailor.py       # ATS CV customizer & docx generator
│   ├── cover_letter.py        # Cover letter generator
│   ├── interview_prep.py      # Q&A interview prep generator
│   └── analytics.py           # Metrics and application lifecycle tracker
├── backend/                   # Production FastAPI REST API
│   ├── routers/               # Endpoints (resume, jobs, documents, analytics, health)
│   ├── services/              # Async service layer wrapping agents
│   ├── schemas/               # Pydantic request & response models
│   ├── config.py              # API config & CORS settings
│   ├── exceptions.py          # Domain exception handlers
│   └── main.py                # FastAPI entry point
├── core/                      # Foundational utilities
│   ├── config.py              # Central settings, paths, DB initialization
│   ├── llm_client.py          # Groq + Gemini client with robust error/retry handling
│   ├── embeddings.py          # Local SentenceTransformer embedding functions
│   └── vector_store.py        # Pinecone + In-Memory vector store
├── frontend/                  # UI components
│   └── dashboard.py           # Standalone / embeddable analytics dashboard
├── pages/                     # Streamlit multipage views
│   └── 1_Analytics.py         # Application metrics & funnel analytics
├── data/                      # Local SQLite DB & uploaded resumes
├── outputs/                   # Generated tailored resumes & cover letters
├── app.py                     # Main Streamlit web application
├── orchestrator.py            # LangGraph pipeline definition
├── requirements.txt           # Python package dependencies
└── .env.example               # Template for environment variables
```

---

## ⚡ Quick Start

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/AI-Job-Hunt-Agent.git
cd AI-Job-Hunt-Agent

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate # Linux/Mac

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

Copy the example configuration:

```bash
cp .env.example .env
```

Add your free API keys to `.env`:
- **Groq API Key**: [console.groq.com](https://console.groq.com) (`gsk_...`)
- *(Optional)* **Gemini API Key**: [aistudio.google.com](https://aistudio.google.com)
- *(Optional)* **Serper API Key**: [serper.dev](https://serper.dev) (for live Google Jobs search; demo jobs used if omitted)
- *(Optional)* **Pinecone API Key**: [pinecone.io](https://www.pinecone.io) (in-memory store used if omitted)

### 3. Run Applications

#### Launch Streamlit Web UI (Recommended)
```bash
streamlit run app.py
```
Visit `http://localhost:8501` to upload resumes, run searches, view matched jobs, and download tailored documents.

#### Launch FastAPI Backend
```bash
uvicorn backend.main:app --reload
```
Interactive Swagger API documentation available at `http://127.0.0.1:8000/docs`.

---

## 📊 What Has Been Implemented So Far

| Component | Status | Details |
|---|---|---|
| **Resume Parser** | ✅ Complete | Multi-format PDF/DOCX parsing into structured JSON profiles via LLM |
| **Job Discovery** | ✅ Complete | Serper integration + realistic demo generator for offline testing |
| **Semantic Matcher** | ✅ Complete | Local 384-dim `all-MiniLM-L6-v2` embeddings, cosine ranking, match scores |
| **Vector Store** | ✅ Complete | Dual-mode: Pinecone vector database with zero-config in-memory fallback |
| **Company Research** | ✅ Complete | Web scraping + LLM synthesis of company stack, culture, and business data |
| **Resume Tailor** | ✅ Complete | Job-specific ATS optimization + export to formatted `.docx` files |
| **Cover Letter Gen** | ✅ Complete | Customized 3-4 paragraph cover letter generation & file export |
| **Interview Prep** | ✅ Complete | Structured STAR behavioral, technical, and role questions + answers |
| **LangGraph Pipeline** | ✅ Complete | StateGraph workflow with full-pipeline and single-job execution flows |
| **SQLite Database** | ✅ Complete | Auto-initializing schema for profiles, jobs, applications, and search history |
| **FastAPI Backend** | ✅ Complete | Fully layered async REST API with validation, schemas, and error handling |
| **Streamlit Dashboard** | ✅ Complete | Dark-themed UI, upload manager, match viewer, and analytics page |

