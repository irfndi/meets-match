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
- Git repository connected.

### 2. Add Project in Coolify
1. Open Coolify UI.
2. Click **"Create New Resource"**.
3. Select **"Project"** -> **"Production"** (or create new environment).
4. Select **"Git Repository"** (Private or Public).
5. Connect your repository (`meetsmatch`).
6. Configuration:
   - **Build Pack:** Dockerfile
   - **Port:** `8000` (Exposed by Dockerfile)

### 3. Network Configuration (Important)
We use the **Docker Gateway IP (`10.0.0.1`)** to access the host services (Postgres & Redis) from inside the container.
**Do NOT** use "Host Networking" mode anymore. The standard Bridge mode is safer and now configured correctly.

### 4. Environment Variables
Copy the values from `coolify.env` into the Coolify "Environment Variables" section.
Key settings:
```env
DB_HOST=10.0.0.1
DB_PORT=5433
REDIS_HOST=10.0.0.1
REDIS_PORT=6379
```

### 5. Health Checks (New)
To ensure Coolify knows your bot is running healthy:
1. Go to **Settings** -> **Health Checks**.
2. Configure:
   - **Path:** `/health`
   - **Port:** `8000`
   - **Method:** `GET`
   - **Scheme:** `HTTP` (or leave default)
3. Save.

### 6. Stop Systemd Service
(Already done by your assistant).
To verify it's stopped:
```bash
ssh root@217.216.35.77 "systemctl status meetsmatch.service"
# Should say "inactive (dead)"
```

### 7. Deploy
Click **"Deploy"** in Coolify.

### 6. Configure Backups (Important)
You mentioned using an R2 bucket for backups. Here is how to configure it in Coolify:

1.  **Add S3/R2 Storage:**
    *   Go to **Settings** -> **S3 & Compatible Storage**.
    *   Click **Add**.
    *   Fill in your R2 details:
        *   **Name:** `cloudflare-r2-backup`
        *   **Endpoint:** `https://<your-account-id>.r2.cloudflarestorage.com`
        *   **Region:** `auto` (or your specific region)
        *   **Access Key:** `<your-access-key>`
        *   **Secret Key:** `<your-secret-key>`
        *   **Bucket:** `<your-bucket-name>`
    *   Save.

2.  **Enable Database Backups:**
    *   Go to your **Project** -> **PostgreSQL Resource**.
    *   Click **Scheduled Backups**.
    *   Set the **Frequency** (e.g., `0 0 * * *` for daily at midnight).
    *   Select the **S3 Storage** you just added.
    *   Click **Save**.

3.  **Persistent Storage for Media:**
    *   The bot stores media in `/app/media`. To ensure this is not lost during deployments:
    *   Go to **Bot Resource** -> **Storage**.
    *   Add a new volume:
        *   **Source Path:** `meetsmatch-media` (or a host path like `/opt/apps/meetsmatch/media`)
        *   **Destination Path:** `/app/media`
    *   Save and **Redeploy**.

### 7. Troubleshooting
- **Logs:** View logs in the Coolify UI under the specific resource.
- **Shell:** Use the "Terminal" tab in Coolify to exec into the container.
- **Connection Refused:** Ensure `pg_hba.conf` allows `0.0.0.0/0` (or docker subnet) and `redis.conf` binds to `10.0.0.1` or `0.0.0.0`.

## Legacy (Systemd)
If you prefer to run without Docker (not managed by Coolify), refer to `DEPLOYMENT.MD` for the systemd service configuration.
