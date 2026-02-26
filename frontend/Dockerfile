FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN yarn install

COPY . .

ENV REACT_APP_BACKEND_URL=http://localhost:8001

RUN yarn build
RUN npm install -g serve

EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"]
