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

# Copy dependency files first for better layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies
# --frozen ensures we stick to the lockfile
RUN uv sync --frozen

# Copy the rest of the project files
COPY . .

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV HOME=/app

# Create a non-root user and switch to it for security
RUN addgroup --system app && adduser --system --ingroup app app && chown -R app:app /app
USER app

# Expose the API port
EXPOSE 8000

# Run the application
CMD ["uv", "run", "python", "main.py"]
