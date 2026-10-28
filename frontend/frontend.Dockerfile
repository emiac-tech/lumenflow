FROM node:20-alpine AS builder

WORKDIR /app

# Ensure API_URL is available at build time for Next.js to bake in the correct proxy routes
ARG API_URL=http://localhost:8000
ENV API_URL=${API_URL}
# Optional sub-folder, e.g. /lighting (baked into the build)
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}

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

# next start re-reads next.config at runtime, so the sub-folder and API target
# must be set here too (otherwise pages are served at / while assets use /lighting).
ARG API_URL=http://localhost:8000
ENV API_URL=${API_URL}
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}

ENV NODE_ENV production
# Use standard Next.js environment configuration for host
ENV HOSTNAME "0.0.0.0"
ENV PORT 3000

# Copy necessary output from the build stage
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
