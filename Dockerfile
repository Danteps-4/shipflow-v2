# ── Base: Node 20 on Alpine ───────────────────────────────────────
FROM node:20-alpine

# Install Python 3 + pip
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Install Python dependencies first (cached layer)
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Install Node dependencies
COPY package*.json .npmrc* ./
RUN npm ci --legacy-peer-deps

# Copy source and build Next.js
COPY . .
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production

CMD ["npm", "start"]
