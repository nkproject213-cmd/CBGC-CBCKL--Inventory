# CBGC · CBCKL 통합 물품관리 시스템

Vercel 운영을 전제로 만든 실제 Next.js 애플리케이션입니다.

## 주요 기능

- CBGC / CBCKL 독립 물품대장 및 테마 전환
- 관리자 서버 세션 로그인
- 물품 등록 / 조회 / 수정 / 삭제
- 모든 관리 필드 수정 및 물품대장 간 이동
- 공개정보와 관리자 전용정보 서버 레벨 분리
- QR 공개 페이지 (`/item/[publicId]`)
- QR PNG 생성
- Vercel Blob 물품사진 업로드
- Excel `.xlsx` 다운로드
- Neon PostgreSQL 영구 저장
- 모바일 반응형 UI

## 설치 및 배포

```bash
npm install
cp .env.example .env.local
npm run hash-password -- "원하는-비밀번호"
npm run db:init
npm run dev
```

필수 환경변수:

```env
DATABASE_URL=...
BLOB_READ_WRITE_TOKEN=...
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=...
SESSION_SECRET=32자 이상의 긴 랜덤 문자열
```

GitHub 저장소를 Vercel 프로젝트에 연결한 뒤 위 환경변수를 Production / Preview 환경에 설정합니다.

## 보안 설계

QR 공개 페이지는 DB 쿼리 단계에서 아래 필드만 조회합니다.

- 물품사진
- 보관장소
- 관리번호
- 품명
- 규격
- 취득일자
- 관리책임자(정)
- 관리책임자(부)

구매단가, 내용년수, 기타구성품, 물품분류번호, 물품식별번호는 공개 응답에 포함되지 않습니다.
