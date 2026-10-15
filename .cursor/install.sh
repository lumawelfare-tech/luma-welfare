#!/usr/bin/env bash
# Idempotent bootstrap for the Luma Welfare monorepo (frontend + backend workspaces).
set -euo pipefail

cd "$(dirname "$0")/.."

# Install all workspace dependencies from the lockfile.
npm ci

# Seed local dev env files if absent. These contain only public values
# (Supabase URL + publishable/anon key); real secrets are provided separately.
if [ ! -f frontend/.env ]; then
  cp frontend/.env.example frontend/.env
fi

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
fi
