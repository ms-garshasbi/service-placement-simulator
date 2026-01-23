FROM node:15

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY . .

RUN npm install

EXPOSE 3000

CMD [ "node", "main-execution.js" ]
