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

## 8. Migrating to Coolify Managed Resources (Recommended)
Using Coolify-managed Postgres and Redis provides better isolation, automated backups, and easier management.

### Step 1: Identify New Resources
- **Postgres:** Find the container name or resource name in Coolify (e.g., `postgresql-database-ow484s4kw8kg0wwk8kkgcogw`).
- **Redis:** Find the container name (e.g., `redis-database-wc4g00ook8ck08css8c40ksk`).

### Step 2: Dump Old Data (Postgres)
Run this on the server (via SSH) to backup the existing data from the host database:
```bash
# Dump data from host port 5433 (Host Postgres)
pg_dump -h 127.0.0.1 -p 5433 -U meetsmatch meetsmatch > meetsmatch_backup.sql
# Password is usually 'password' (check your old env)
```

### Step 3: Restore to New Container
Run this on the server to import data into the new Coolify Postgres container:
```bash
# Replace 'postgresql-database-ow484s4kw8kg0wwk8kkgcogw' with your ACTUAL container name
cat meetsmatch_backup.sql | docker exec -i postgresql-database-ow484s4kw8kg0wwk8kkgcogw psql -U postgres -d postgres
```
*Note: You might want to create a specific database/user inside the container first using `docker exec -it <container> psql -U postgres`, but using the default `postgres` DB is fine for simple setups.*

### Step 4: Update Bot Environment Variables
Update the bot's environment variables in Coolify to point to the new resources:

**Postgres:**
- `DB_HOST`: `postgresql-database-ow484s4kw8kg0wwk8kkgcogw` (Use the container name)
- `DB_PORT`: `5432` (Default internal port)
- `DB_USER`: `postgres`
- `DB_PASSWORD`: (Get this from Coolify UI -> Project -> Postgres Resource)
- `DB_NAME`: `postgres` (or whatever you restored into)

**Redis:**
- `REDIS_HOST`: `redis-database-wc4g00ook8ck08css8c40ksk` (Use the container name)
- `REDIS_PORT`: `6379`
- `REDIS_PASSWORD`: (Get this from Coolify UI -> Project -> Redis Resource)

### Step 5: Redeploy
Click **"Redeploy"** on the bot resource.

## Legacy (Systemd)
If you prefer to run without Docker (not managed by Coolify), refer to `DEPLOYMENT.MD` for the systemd service configuration.
