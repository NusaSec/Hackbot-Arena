FROM python:3.14-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY app.py .
ARG FLAG
ENV FLAG=${FLAG}
ENV HOST=0.0.0.0
ENV PORT=5000
EXPOSE 5000
CMD ["python", "app.py"]
