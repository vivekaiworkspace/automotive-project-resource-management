# ==============================================================================
# Backend Dockerfile - Automotive Project & Resource Management Core Pilot
# Runtime: Node.js 20 on Alpine Linux
# ==============================================================================
FROM node:20-alpine AS base

# Install curl for container health checks if needed
RUN apk add --no-cache curl tzdata

# Set working directory
WORKDIR /usr/src/app

# Set timezone
ENV TZ=Asia/Kolkata
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install dependencies
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy migrations and source code
COPY migrations ./migrations
COPY src ./src
COPY tests ./tests

# Create unprivileged application user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /usr/src/app
USER appuser

# Expose default backend application port
EXPOSE 3000

# Container healthcheck probe (CPD-010, Architecture § 5)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

# Run migrations and start server
CMD ["npm", "start"]
