# Use an official Python runtime as a parent image
FROM python:3.13-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
# libmagic1 is required for python-magic
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy the project files
COPY . .

# Install dependencies
# --frozen ensures we stick to the lockfile
RUN uv sync --frozen

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Expose the API port
EXPOSE 8000

# Run the application
CMD ["uv", "run", "python", "main.py"]
