#!/bin/bash

# Configuration
APP_NAME="meetsmatch"
BACKUP_DIR="/opt/apps/meetsmatch/backups"
DB_NAME="meetsmatch"
DB_USER="meetsmatch"
# Ensure PGPASSWORD is set in the environment or via .pgpass
# export PGPASSWORD="your_password_here"
RETENTION_DAYS=7
DATE=$(date +"%Y%m%d_%H%M%S")

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Database Backup
echo "[$(date)] Starting database backup..."
pg_dump -U "$DB_USER" -h localhost -p 5433 "$DB_NAME" | gzip > "$BACKUP_DIR/${APP_NAME}_db_$DATE.sql.gz"

if [ $? -eq 0 ]; then
    echo "[$(date)] Database backup successful: ${APP_NAME}_db_$DATE.sql.gz"
else
    echo "[$(date)] Database backup FAILED!"
    exit 1
fi

# Cleanup old backups
echo "[$(date)] Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "${APP_NAME}_db_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup process completed."
