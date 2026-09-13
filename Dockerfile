FROM node:22-bookworm

WORKDIR /app

# Ставим зависимости отдельным слоем — кэшируется, пока package*.json не меняются
COPY package*.json ./
RUN npm ci --omit=dev

# Копируем остальной код
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
