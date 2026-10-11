# ==============================================================================
# Frontend Dockerfile - Automotive Project & Resource Management Core Pilot
# Runtime: Nginx on Alpine Linux
# ==============================================================================
FROM nginx:1.27-alpine AS base

# Remove default nginx static page
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx reverse proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static assets
COPY public/ /usr/share/nginx/html/

# Expose HTTP port
EXPOSE 80

# Health check probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
