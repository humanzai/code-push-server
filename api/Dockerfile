FROM node:18.18.0-alpine3.18

WORKDIR /app

COPY api/node_modules /app/node_modules
COPY api/package.json /app/package.json
COPY api/bin /app/bin

CMD [ "npm", "run", "start:env" ]
