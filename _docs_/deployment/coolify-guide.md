# Coolify Deployment Guide

## Overview
We use **Coolify** (a self-hosted PaaS) to manage our applications, including the `meetsmatch` bot. Coolify simplifies deployment, logs, and management by using Docker containers.

## Access
- **URL:** `http://217.216.35.77:8000` (default port, may vary if configured differently)
- **Server:** `217.216.35.77`

## Why Docker?
To be managed by Coolify, the bot must be containerized (Docker). This provides:
- **Isolation:** Dependencies are bundled; no conflicts with system packages.
- **Management:** Restart, logs, and rebuilds directly from the Coolify UI.
- **Consistency:** The environment is identical to development (if using Docker locally).

## Migrating Bot to Coolify

### 1. Prerequisites
- Coolify installed on the server.
- `Dockerfile` in the project root (already created).

### 2. Add Project in Coolify
1. Open Coolify UI.
2. Click **"Create New Resource"**.
3. Select **"Project"** -> **"Production"** (or create new environment).
4. Select **"Git Repository"** (Private or Public).
5. Connect your repository (`meetsmatch`).
6. Configuration:
   - **Build Pack:** Dockerfile
   - **Port:** `8000` (optional)
   - **Network:** Select **"Host"** (Crucial! This allows the bot to access your existing database on localhost).

### 3. Environment Variables
Copy these values into the Coolify "Environment Variables" section.
**Note:** We use `localhost` because we selected "Host" network mode above.

### 4. Stop Systemd Service
(Already done by your assistant).
To verify it's stopped:
```bash
ssh root@217.216.35.77 "systemctl status meetsmatch.service"
# Should say "inactive (dead)"
```

### 5. Deploy
Click **"Deploy"** in Coolify.

## Troubleshooting
- **Logs:** View logs in the Coolify UI under the specific resource.
- **Shell:** Use the "Terminal" tab in Coolify to exec into the container.

## Legacy (Systemd)
If you prefer to run without Docker (not managed by Coolify), refer to `DEPLOYMENT.MD` for the systemd service configuration.
