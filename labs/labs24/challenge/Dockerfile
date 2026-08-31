FROM python:3.14-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir flask
WORKDIR /app
COPY app.py .
ARG FLAG
RUN echo "${FLAG}" > /app/flag.txt
RUN printf 'supplier,total_usd\nAcme Corp,1024.50\nGlobex Inc,2048.75\n' > /app/report_template.csv
RUN mkdir -p /app/exports
EXPOSE 5000
CMD ["python", "app.py"]
