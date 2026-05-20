# WashLink Frontend

This directory contains the WashLink frontend application built with React, TypeScript, Vite, and Tailwind CSS.

## Project Structure

- `src/` - application source code
- `public/` - static files
- `package.json` - frontend dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite configuration
- `eslint.config.js` - linting configuration

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Add your Supabase values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Run Locally

```bash
cd frontend
npm install
npm run dev
```

## Architecture Layers

- `src/domain` - business entities and repository contracts
- `src/application` - use-case orchestration services
- `src/infrastructure` - Supabase implementations
- `src/presentation` - UI components, hooks, and pages

## Notes

This frontend now lives inside the `frontend/` folder alongside the backend repository in `backend/`.
