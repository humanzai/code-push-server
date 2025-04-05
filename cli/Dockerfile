# Use Node.js LTS Alpine as base image for smaller size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and install CLI globally
RUN npm install && \
    npm install -g

# Copy source code
COPY . .

# Build the CLI
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Make the CLI available globally
RUN npm link

# Set the entrypoint to the CLI command
#ENTRYPOINT ["code-push-standalone"]

# Default command (can be overridden)
#CMD ["--help"]

CMD [ "tail", "-f", "/dev/null" ]
