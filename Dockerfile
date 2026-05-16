# syntax=docker/dockerfile:1
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    perl \
    libimage-exiftool-perl \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first to leverage cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose ports
# 5173: Vite dev server (frontend)
# 3001: Gallery Express server (backend logic)
EXPOSE 5173 3001

# Command to run both servers in parallel
# Use --host for vite to ensure it's reachable from outside
CMD ["npm", "run", "dev:web"]
