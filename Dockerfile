FROM ollama/ollama:0.7.0

# Build arguments for environment variables
ARG GOOGLE_API_KEY
ARG MODEL_NAME_AT_ENDPOINT=qwen2.5:1.5b
ARG API_BASE_URL=http://127.0.0.1:11434/api
ARG RAPIDAPI_KEY

# Set environment variables from build arguments
ENV GOOGLE_API_KEY=${GOOGLE_API_KEY}
ENV MODEL_NAME_AT_ENDPOINT=${MODEL_NAME_AT_ENDPOINT}
ENV API_BASE_URL=${API_BASE_URL}
ENV RAPIDAPI_KEY=${RAPIDAPI_KEY}

# Qwen2.5:32b = Docker
# ENV API_BASE_URL=http://127.0.0.1:11434/api
# ENV MODEL_NAME_AT_ENDPOINT=qwen2.5:32b

# Install system dependencies and Node.js
RUN apt-get update && apt-get install -y \
  curl \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy the rest of the application
COPY . .

# Build the project
RUN pnpm run build

# Override the default entrypoint
ENTRYPOINT ["/bin/sh", "-c"]

# Start the application directly
CMD ["node .mastra/output/index.mjs"]
