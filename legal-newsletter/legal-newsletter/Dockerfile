# 건설 법무 뉴스레터 — Coolify 배포용 Dockerfile
# 외부 npm 의존성이 없으므로 install 단계가 필요 없어 빌드가 빠릅니다.
FROM node:20-alpine

WORKDIR /app

# 소스 복사 (server.js + public/)
COPY package.json ./
COPY server.js ./
COPY public ./public

# Coolify가 이 포트로 트래픽을 라우팅합니다.
ENV PORT=3000
EXPOSE 3000

# ANTHROPIC_API_KEY 등은 Coolify 환경변수로 주입됩니다 (이미지에 넣지 마세요).
CMD ["node", "server.js"]
