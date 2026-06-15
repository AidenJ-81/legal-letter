# 건설 법무 뉴스레터 (회사 공용 배포판)

AI로 건설 법무 판례·법령·기사를 수집·요약해 뉴스레터를 만드는 도구입니다.
이 버전은 **회사 공용 Anthropic 키를 서버에 두고**, 접속자는 키 입력 없이 바로 쓰도록 만든
GitHub + Coolify 배포용 구조입니다.

---

## 핵심: 키는 브라우저가 아니라 서버에 있습니다

기존 버전은 사용자가 각자 본인 키를 입력해 **브라우저가 Anthropic에 직접 호출**했습니다.
그 방식 그대로 회사 키를 HTML에 박으면, 페이지를 연 누구나 개발자도구(F12) →
네트워크 탭에서 키를 그대로 볼 수 있고, 깃허브 커밋 기록에도 영구히 남아 자동 폐기됩니다.

그래서 구조를 이렇게 바꿨습니다:

```
[브라우저]  ──(키 없음)──>  [이 서버 /api/messages]  ──(키 주입)──>  [Anthropic API]
                                       ▲
                          ANTHROPIC_API_KEY 는 여기에만 존재
                          (Coolify 환경변수 / 브라우저엔 절대 안 감)
```

- 접속자 경험: 키 입력 화면 없음, 열면 바로 사용 → 원하시던 "누구나 사용" 그대로.
- 키 안전: 브라우저·깃허브 어디에도 키가 노출되지 않음.

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `public/index.html` | 프론트엔드(앱). 키 입력 화면 제거, `/api/...` 만 호출하도록 수정됨 |
| `server.js` | 백엔드 프록시. 키를 환경변수에서 읽어 Anthropic으로 대신 호출. 의존성 없음 |
| `package.json` | `npm start` → `node server.js` |
| `Dockerfile` | Coolify Docker 빌드용 |
| `.env.example` | 환경변수 템플릿 (실제 키 없음, 커밋 OK) |
| `.gitignore` | `.env` 등 시크릿 커밋 차단 |

---

## 바뀐 점 요약

1. **은퇴 모델 제거** — 오늘(2026-06-15) 은퇴한 `claude-sonnet-4-20250514` 옵션 삭제.
2. **모델 목록 자동화** — 앱 로딩 시 서버 `/api/models`(Anthropic Models API)에서 현재
   사용 가능한 모델만 받아 드롭다운을 채웁니다. **은퇴한 모델은 애초에 목록에 안 뜹니다.**
   (호출 실패 시 폴백으로 Sonnet 4.6 / Opus 4.8 / Haiku 4.5 표시)
3. **키 입력 화면 제거** + 호출 대상을 `https://api.anthropic.com` → `/api/messages` 로 변경.
4. **백엔드 프록시 추가** — 키 주입 + 정적 파일 서빙 + (선택) 접근 제한.

---

## 로컬에서 먼저 테스트

```bash
# 1) 이 폴더에서
export ANTHROPIC_API_KEY=sk-ant-...   # 본인 테스트 키로 먼저 확인 가능
node server.js
# 2) 브라우저에서 http://localhost:3000 접속
```
> npm install 불필요(외부 의존성 없음). Node 18 이상이면 됩니다.

---

## GitHub + Coolify 배포

### 1) 깃허브에 올리기
```bash
git init
git add .
git commit -m "법무 뉴스레터 배포판 (서버 키 프록시)"
git branch -M main
git remote add origin https://github.com/<회사계정>/<리포지토리>.git
git push -u origin main
```
> `.gitignore` 가 `.env` 를 막아주지만, **실제 키를 코드/커밋에 절대 넣지 마세요.**

### 2) Coolify에서 배포
1. Coolify → **New Resource → Application → 방금 만든 GitHub 리포** 연결.
2. Build Pack: **Dockerfile** 선택(이미 포함됨). Port: **3000**.
3. **Environment Variables** 에 등록:
   - `ANTHROPIC_API_KEY` = 회사 키 *(구매 후 입력)*
   - (선택) `ACCESS_PASSWORD` = 원하는 비번, `ACCESS_USER` = 아이디
4. **Deploy**. 도메인 붙이면 끝.

### 3) 회사 키 구매 전이라면
- 키 없이도 배포·접속은 됩니다. 단 "수집" 실행 시 *"ANTHROPIC_API_KEY가 설정되지 않았습니다"*
  에러가 납니다. 구매 후 Coolify 환경변수에 키만 넣고 재배포하면 즉시 동작합니다.

---

## 접근 제한 (중요)

`ACCESS_PASSWORD` 를 **비워두면 URL을 아는 누구나** 사용합니다.
인터넷에 공개 배포하면 외부인이 회사 Anthropic 예산으로 무제한 호출할 수 있으니, 아래 중 하나를 권장합니다.

- **사내망/VPN 전용**으로 배포 (가장 깔끔)
- Coolify 환경변수 `ACCESS_PASSWORD` 설정 → 접속 시 아이디/비번 요구(Basic Auth)
- Coolify 프록시/방화벽에서 사내 IP만 허용

---

## 비용 참고
- 키는 회사 계정 한도/청구를 그대로 사용합니다(개인 키 아님).
- 모델별 단가(2026-06 기준): Sonnet 4.6 입력$3/출력$15, Opus 4.8 $5/$25, Haiku 4.5 $1/$5 (MTok).
- 웹검색 사용 시 검색 요금이 별도로 부과될 수 있습니다.
- 사용량은 Anthropic 콘솔 → Usage 에서 API 키별로 확인하세요.
