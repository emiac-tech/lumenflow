FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for pdf manipulation (PyMuPDF) and SQLite/PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .
# Note: we do not copy the "frontend" directory, but since Docker build context contains it 
# we could use .dockerignore, however, it's safer to just let it copy. A proper .dockerignore will be made.

# Create necessary directories for storage
RUN mkdir -p data uploads exports data/extracted_images data/pdf_images

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
