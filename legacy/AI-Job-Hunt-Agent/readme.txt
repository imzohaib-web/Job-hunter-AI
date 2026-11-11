========================================================================
AI Job Hunt Agent - Multi-Agent Job Search & Application Assistant
========================================================================

An autonomous multi-agent pipeline built with LangGraph, Groq/Gemini LLMs,
local sentence-transformers, SQLite, FastAPI, and Streamlit.

For the full formatted documentation, see README.md.

------------------------------------------------------------------------
WHAT HAS BEEN IMPLEMENTED SO FAR:
------------------------------------------------------------------------
1. Core Infrastructure:
   - Dual LLM support: Groq (LLaMA 3.3 70B) primary + Google Gemini fallback
   - Zero-cost local embeddings: sentence-transformers (all-MiniLM-L6-v2)
   - Dual vector store: Pinecone serverless + in-memory fallback
   - Persistent SQLite database (profiles, jobs, applications, search runs)

2. 8 Specialized Agents:
   - Profile Parser Agent (PDF/DOCX -> structured candidate JSON)
   - Job Search Agent (Serper API + realistic demo fallback)
   - Semantic Ranking Agent (Profile-job cosine similarity scoring 0-100%)
   - Company Research Agent (Web scraping + LLM summarization)
   - Resume Tailor Agent (ATS keyword optimization + DOCX export)
   - Cover Letter Agent (Personalized cover letter creation + file export)
   - Interview Prep Agent (Behavioral, technical & role questions + answers)
   - Analytics Agent (Application tracking & metrics)

3. Orchestrator:
   - LangGraph StateGraph state machine connecting all 8 agents
   - Full pipeline execution & single-job tailoring mode

4. User Interfaces & APIs:
   - Streamlit Web UI (app.py) with dark mode and interactive pipeline runs
   - Multipage Analytics Dashboard (pages/1_Analytics.py & frontend/dashboard.py)
   - Layered FastAPI REST API (backend/main.py) with Swagger docs at /docs

------------------------------------------------------------------------
HOW TO RUN:
------------------------------------------------------------------------
- Streamlit Web App: streamlit run app.py
- FastAPI REST API:  uvicorn backend.main:app --reload
- Requirements:      pip install -r requirements.txt
- Environment:       Copy .env.example to .env and insert API keys

