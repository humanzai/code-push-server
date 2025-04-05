FROM node:18.18.0-alpine3.18

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install


# Copy source code
COPY . .


# Build the API (with verbose output for debugging)
RUN npm run build || (echo "Build failed" && ls -la && exit 1)


# For debugging, list contents
RUN ls -la && ls -la bin


#COPY api/bin /app/bin

#keep the container alive

CMD [ "npm", "run", "start:env"]

#CMD [ "tail", "-f", "/dev/null" ]
