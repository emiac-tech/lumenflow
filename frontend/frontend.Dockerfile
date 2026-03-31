FROM node:20-alpine AS builder

WORKDIR /app

# Copy package dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the frontend source
COPY . .

# Build the Next.js app
# The API_URL shouldn't be too strongly bound if the rewrite is evaluated at runtime during SSR or proxy
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production
# Use standard Next.js environment configuration for host
ENV HOSTNAME "0.0.0.0"
ENV PORT 3000

# Copy necessary output from the build stage
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
