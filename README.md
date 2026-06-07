# mini-discord project layout

A modern web app with React (Vite) frontend, Django backend, PostgreSQL, Redis, and MinIO S3 storage – all containerised with Docker.

---

## Project Structure

```
.
├── backend/
│   ├── Dockerfile
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env                (not committed)
│   └── .env.example
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env                (optional, local only)
│   └── .env.example
├── docker-compose.yml
└── README.md
```

---

## Quick Start with Docker (recommended)

### Prerequisites
- Docker Engine + Compose v2
- Git

### Steps
1. Clone the repo and enter the folder.
2. Copy example env files:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env   # optional
   ```
   Edit `backend/.env` with your secrets (keep defaults for testing).
3. Build and run everything:
   ```bash
   docker compose up --build
   ```
4. Access:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - MinIO console: http://localhost:9001 (login: `minioadmin` / `minioadmin`)
   - PostgreSQL: `localhost:5432`
   - Redis: `localhost:6379`

To stop:
```bash
docker compose down
```

> **Note**: Frontend builds with `REACT_APP_API_URL=http://backend:8000`. Backend reads `backend/.env` at runtime.

---

## Local Development (without Docker)

### Backend (Django)
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # fill in values
python manage.py migrate
python manage.py runserver
```
Runs on http://localhost:8000

### Frontend (React + Vite)
```bash
cd frontend
npm install
cp .env.example .env            # set VITE_API_URL=http://localhost:8000
npm run dev
```
Runs on http://localhost:5173

---

## Services in Docker Compose

| Service   | Container name   | Port (host) | Image tag          |
|-----------|------------------|-------------|--------------------|
| backend   | django-backend    | 8000        | build from ./backend |
| frontend  | react-frontend    | 3000        | build from ./frontend |
| postgres  | postgres-db       | 5432        | `postgres:alpine`    |
| redis     | redis-cache       | 6379        | `redis:alpine`       |
| minio     | minio-storage     | 9000 (API), 9001 (console) | `minio/minio:latest` |

Volumes: `postgres_data`, `redis_data`, `minio_data` (persist data).

---

## Environment Variables

- **Backend** – use `backend/.env` (never commit). Example:
  ```env
  SECRET_KEY=your-secret-key
  DEBUG=True
  ALLOWED_HOSTS=localhost,127.0.0.1,backend
  ```
- **Frontend** – build argument `REACT_APP_API_URL` passed in `docker-compose.yml`. For local dev, use `.env` with `VITE_API_URL` (or `REACT_APP_API_URL`).

---

## Testing Inter‑Container Communication

Inside Docker network:
- Backend reaches PostgreSQL at `postgres:5432`, Redis at `redis:6379`, MinIO at `minio:9000`.
- Frontend (browser) calls backend API via `http://backend:8000` – works because both are on the same network.

---

## Adding Python / Node Dependencies

- Backend: add to `requirements.txt` and rebuild `backend` service.
- Frontend: `npm install --save <pkg>` and rebuild `frontend` service.

---