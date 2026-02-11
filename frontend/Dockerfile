FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Set environment variable for build
ENV REACT_APP_BACKEND_URL=http://localhost:8001

# Build the app
RUN yarn build

# Install serve to run the production build
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Run the production build
CMD ["serve", "-s", "build", "-l", "3000"]
