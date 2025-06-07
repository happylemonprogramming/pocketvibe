# Use Python 3.11 slim image as base
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create a script to run both Gunicorn and Celery
# RUN echo '#!/bin/bash\ncelery -A app.celery worker --loglevel=info & gunicorn --bind 0.0.0.0:8000 --workers 4 --threads 2 app:app' > /app/start.sh && \

# Create a script to run both Gunicorn and Dramatiq worker
RUN echo '#!/bin/bash\n\
# Start Dramatiq worker in the background\n\
dramatiq worker_setup tasks --processes 4 --threads 2 &\n\
\n\
# Start Gunicorn\n\
gunicorn --bind 0.0.0.0:8000 --workers 4 --threads 2 app:app\n\
' > /app/start.sh && chmod +x /app/start.sh

# Set permissions for icons directory
RUN chmod 777 /app/static/icons

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Use the start script
CMD ["/app/start.sh"] 