# WashLink Monorepo

This repository contains both the frontend and backend for the WashLink platform.

- `frontend/` - React + TypeScript application
- `backend/` - FastAPI + SQLAlchemy service scaffold
- `docs/` - architectural and engineering standards for the project

## Getting Started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Structure

- `frontend/` contains the complete UI application with Vite, React, and Supabase integration.
- `backend/` contains the API scaffold, async database layer, and future AI/worker services.
- `docs/` contains the source of truth for architecture, API standards, and engineering rules.

## Render Deployment

This repository includes a `render.yaml` manifest for deploying both the frontend and backend services on Render.

### Deploy to Render

1. Connect your GitHub repository to Render.
2. Render will detect `render.yaml` and create two services:
   - `washlink-frontend` as a static site
   - `washlink-backend` as a Python web service
3. Configure environment variables in the Render dashboard for the backend:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `SECRET_KEY`
   - `CORS_ORIGINS`
4. For the frontend, set any Supabase-only env vars in the Render static site settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Custom Domain

- Add a custom domain in Render service settings.
- Use `www.example.com` or `app.example.com` for the frontend service.
- Use `api.example.com` for the backend service.
- Create the DNS records that Render provides, usually a CNAME to Render.
- Render provisions SSL automatically.

### Static frontend only

If you only want to try the frontend as a static site, you can deploy just the `frontend/` folder.

1. In Render, create a new service and choose `Static Site`.
2. Set the root directory to `frontend`.
3. Use the build command:
   ```bash
   npm install && npm run build
   ```
4. Set the publish path to `dist`.
5. Add any frontend env vars you need, for example:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

This will deploy the frontend independently and let you validate the UI without the backend service first.

### Free plan notes

- Render static sites are free and ideal for the frontend.
- Render free web services may sleep after inactivity.
- Use an external Postgres provider such as Supabase if you need a free database.

## Notes

This repo is now structured as a monorepo, keeping frontend and backend separated while enabling shared documentation and coordinated development.
