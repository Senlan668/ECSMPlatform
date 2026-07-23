# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

AiWxChat is a WeChat chat records AI knowledge base system designed specifically for **sales training scenarios**. It extracts high-quality sales scripts, objection handling, and conversion data from WeChat sales conversations to train sales AI assistants.

**Core Purpose**: Transform WeChat chat databases into structured training data for LLM fine-tuning (ShareGPT, Alpaca, OpenAI formats).

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Backend**: FastAPI + SQLAlchemy + Pydantic
- **Database**: SQLite (default) or PostgreSQL with pgvector extension
- **AI/ML**: sentence-transformers for embeddings, DeepSeek/OpenAI for LLM
- **Deployment**: Docker Compose or local PowerShell scripts

### Data Flow
```
WeChat SQLite DBs (MSG0-5.db, MicroMsg.db)
  ↓ ETL (scripts/run_etl.py)
raw_chats table (原始消息，不可修改)
  ↓ Clean & Filter (后台管理)
staging_conversations table (暂存区，AI预标注)
  ↓ Human Review (标注界面)
labeled_conversations table (已审核，可导出)
  ↓ Export (多格式)
Training Data (ShareGPT/Alpaca/OpenAI)
```

### Key Database Models (backend/app/models/chat.py)
1. **RawChat**: Original messages from WeChat, immutable
2. **StagingConversation**: Pre-cleaned conversation blocks awaiting review
3. **LabeledConversation**: Human-reviewed conversations ready for export
4. **KnowledgeChunk**: Embedded text chunks for RAG semantic search
5. **Session**: Chat sessions metadata
6. **Contact**: WeChat contacts mapping (wxid → display name)

### API Modules (backend/app/routers/)
- `chats.py`: View chat history and sessions
- `search.py`: Full-text search in messages
- `knowledge.py`: Build knowledge base, RAG Q&A
- `labeling.py`: Data annotation workflow (clean → review → approve)
- `admin.py`: Backend management (preprocessing pipeline)
- `export.py`: Export training data in multiple formats
- `filter.py`: Content filtering (sensitive info, junk removal)

## Development Commands

### Backend Setup
```bash
cd backend

# Create conda environment (recommended)
conda env create -f environment.yml
conda activate aiwxchat

# Or use pip directly
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys and database URL

# Import WeChat data (ETL)
python scripts/run_etl.py

# Start backend server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

### Quick Start (Windows)
```bash
# Start both frontend and backend
.\start.bat

# Stop services
.\stop.bat
```

### Docker
```bash
# Start all services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f backend
```

### Database Operations
```bash
# Explore WeChat DB structure
python backend/scripts/explore_db.py

# Run database migration (if using Alembic)
cd backend
alembic upgrade head
```

## Configuration (.env)

**Critical settings** in `backend/.env`:

```bash
# Database - SQLite (simple) or PostgreSQL (production)
DATABASE_URL=sqlite:///./aiwxchat.db
# DATABASE_URL=postgresql://user:pass@localhost:5432/aiwxchat

# Embedding model (multilingual-MiniLM: free, no auth needed)
EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_DIM=384

# LLM API (required for RAG Q&A and quality scoring)
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# WeChat data location
WECHAT_DB_PATH=../Msg/Msg
```

**Database choice**:
- SQLite: Use for personal projects, < 1M messages, no complex queries
- PostgreSQL + pgvector: Use for teams, large datasets, vector similarity search optimization

**Embedding model**:
- `paraphrase-multilingual-MiniLM-L12-v2` (384-dim): Default, free, multilingual
- `m3e-base` (768-dim): Better Chinese support, requires HuggingFace access
- Ensure `EMBEDDING_DIM` matches model output dimension

## Key Architectural Patterns

### Dual Storage Strategy
The system maintains two parallel data paths:
1. **Relational (raw_chats)**: For exact chat replay, timeline views, precise queries
2. **Vector (knowledge_chunks)**: For semantic search, RAG Q&A, fuzzy matching

This "left-right" architecture enables both precise retrieval and intelligent search.

### Data Cleaning Pipeline
Messages flow through a multi-stage quality control:
1. **ETL**: Import raw WeChat messages, resolve wxid → names, parse group chats
2. **Filter**: Remove system messages, junk content, sensitive info (phone numbers, IDs)
3. **Chunking**: Merge consecutive messages by time window (5-min default) into conversations
4. **AI Pre-labeling**: Auto-categorize (sales/course/objection), quality scoring (0-10)
5. **Human Review**: Manual approval/rejection, category correction, content editing
6. **Export**: Convert to training formats with quality/category filters

### Time Filtering
By default, only processes messages **after 2025-10-01** to focus on recent sales data. Configurable in filter logic.

### Category System (DataCategory enum)
- `sales`: Sales scripts and pitches
- `course`: Course consultation dialogs
- `objection`: Objection handling conversations
- `closing`: Closing and conversion dialogs
- `followup`: Customer follow-up messages
- `qa`: Q&A knowledge sharing
- `casual`: Casual chat (usually filtered out)
- `junk`: Low-quality data (filtered out)

Each category gets a custom system prompt during export for fine-tuning.

## Frontend Components Structure

Located in `frontend/src/components/`:
- **Sidebar.tsx**: Navigation sidebar with feature toggles
- **ChatView.tsx**: WeChat-like chat timeline (仿微信UI)
- **SearchView.tsx**: Full-text and semantic search
- **AIChat.tsx**: RAG-powered Q&A interface
- **LabelingView.tsx**: Data annotation interface (review, categorize, approve)
- **AdminView.tsx**: Backend management dashboard (preprocessing, stats)
- **ExportView.tsx**: Export training data with format/quality/category filters

## Common Workflows

### 1. First-Time Setup
1. Place WeChat DB files in `Msg/Msg/` directory
2. Run ETL: `python backend/scripts/run_etl.py`
3. Start services: `.\start.bat` (Windows) or `docker-compose up`
4. Open http://localhost:3000

### 2. Building Knowledge Base for RAG
1. Navigate to "✨ AI 问答" in frontend
2. Click "构建知识库" (builds embeddings for all messages)
3. Wait for completion (progress shown)
4. Use semantic search and Q&A features

### 3. Data Annotation Workflow
1. Go to "🏷️ 数据标注" → "后台管理"
2. Click "一键清洗原始数据" to batch process sessions
3. Return to "标注" tab to review auto-labeled conversations
4. For each item:
   - Verify/change category tags
   - Edit conversation content if needed
   - Click ✅ (approve) or ❌ (reject)
5. Use batch operations for efficient processing

### 4. Exporting Training Data
1. Go to "📦 导出数据"
2. Select export format (ShareGPT, Alpaca, OpenAI, JSONL)
3. Choose quality filter (high/medium/low)
4. Select category filter (sales/course/objection/all)
5. Enable optional features:
   - LLM quality scoring (slow but accurate)
   - Smart deduplication (removes similar conversations)
6. Click "预览数据" to review stats and samples
7. Click "立即导出" to download JSON file

## Important Implementation Notes

### WeChat Data Parsing
- WeChat stores messages across 6 sharded databases (MSG0.db - MSG5.db)
- Group chat messages require parsing `BytesExtra` field to get actual sender wxid
- Contact resolution: prioritize `Remark` (备注) over `NickName` (昵称)
- Message types: 1=text, 3=image, 34=voice, 43=video, 47=emoji, 49=link/file
- Only process type=1 (text) for training data

### Vector Database Compatibility
- Code supports both SQLite (Text-based JSON storage) and PostgreSQL (pgvector extension)
- Use `HAS_PGVECTOR` flag to conditionally use Vector types
- Embedding dimension must match model (384 for multilingual-MiniLM, 768 for m3e-base)
- Vector similarity search only efficient with pgvector; SQLite uses fallback cosine similarity

### Content Filtering
Automatically filters/masks:
- Phone numbers (158****1234)
- ID cards (320***********1234)
- WeChat IDs in certain patterns
- URLs and system messages
- Emojis and special characters
- Messages shorter than 2 characters

### Quality Scoring
Two modes:
1. **Rule-based** (fast): Length, keyword presence, structure checks
2. **LLM-based** (slow, accurate): DeepSeek/GPT evaluates completeness, relevance, usefulness

### Export Formats
All formats include category-specific system prompts:
- **ShareGPT**: For LLaMA-Factory, FastChat fine-tuning
- **Alpaca**: For Alpaca-LoRA instruction tuning
- **OpenAI Chat**: For OpenAI fine-tuning API
- **JSONL**: Generic format for custom pipelines

## Service Ports
- Frontend: 3000
- Backend API: 8000
- PostgreSQL: 5432 (if using Docker)
- API Docs: http://localhost:8000/docs (FastAPI auto-generated)

## Troubleshooting Tips

**Port 8000/3000 already in use**:
- Run `.\stop.bat` or `.\scripts\stop.ps1`
- Manually: `netstat -ano | findstr :8000` → `taskkill /F /PID <pid>`

**Embedding model download fails**:
- Use default `paraphrase-multilingual-MiniLM-L12-v2` (no auth)
- Set mirror: `export HF_ENDPOINT=https://hf-mirror.com`

**ETL import errors**:
- Ensure `Msg/Msg/` contains all required .db files (MSG0-5.db, MicroMsg.db)
- Check `WECHAT_DB_PATH` in `.env`

**RAG not working**:
- Verify LLM API key is set (DEEPSEEK_API_KEY or OPENAI_API_KEY)
- Check knowledge base is built (knowledge_chunks table populated)

**Export shows 0 conversations**:
- Ensure conversations are approved in labeling interface
- Check quality/category filters aren't too restrictive
- Verify staging_conversations or labeled_conversations have data
