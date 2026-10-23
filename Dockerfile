FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json requirements.txt ./
RUN npm ci --ignore-scripts --omit=optional --omit=dev && python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY *.js *.cjs *.py ./
COPY budget-data.json.gz verified-budget-data.json project-document-links.json reviewed-catalog-links.json catalog-institutions.json ./
RUN node build-budget-index.cjs && node --use-system-ca prepare-ocr-models.cjs
ENV POLICY_PDF_ENGINE=poppler POLICY_PYTHON=/opt/venv/bin/python HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["node", "--use-system-ca", "http-server.js"]
