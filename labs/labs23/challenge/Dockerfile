FROM python:3.14-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir flask python-liquid
WORKDIR /app
COPY app.py .
ARG FLAG
RUN echo "${FLAG}" > /app/flag.txt

EXPOSE 5000
CMD ["python", "app.py"]
