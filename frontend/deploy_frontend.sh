#!/bin/bash

# -----------------------------
# Paths (relative to script location)
# -----------------------------
REPO_PATH="$(pwd)/../.."              # frontend/ -> Nomade-Horizon-Wassil -> repo root
FRONTEND_PATH="$REPO_PATH/frontend"
DEPLOY_PATH="$FRONTEND_PATH"          # copy dist/ into the frontend folder itself

# -----------------------------
# Step 1: Pull latest code
# -----------------------------
echo "Pulling latest code from Git..."
cd "$REPO_PATH" || { echo "Repo path not found"; exit 1; }
git pull origin main

# -----------------------------
# Step 2: Build frontend
# -----------------------------
echo "Building frontend..."
cd "$FRONTEND_PATH" || { echo "Frontend path not found"; exit 1; }
npm install
npm run build

# -----------------------------
# Step 3: Deploy dist folder
# -----------------------------
echo "Deploying frontend..."
rm -rf "$DEPLOY_PATH/dist/*"
cp -r dist/* "$DEPLOY_PATH/"

echo "✅ Frontend deployed successfully!"