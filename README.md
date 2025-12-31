# 배드민턴 코트 예약 시스템

QR 코드 기반 로그인 시스템을 갖춘 실시간 배드민턴 코트 예약 애플리케이션입니다.

## 🚀 주요 기능

### 1. 관리자 대시보드
- **사이드바 네비게이션**: 4개 주요 메뉴 간 쉬운 전환
- **QR 생성**: 사용자 입장용 QR 코드 생성 및 관리
- **코트 현황**: 8개 코트의 실시간 상태 및 대기 인원 모니터링
- **사용 현황**: 시간대별 입장 통계 및 활성 세션 관리
- **환경설정**: 배드민턴장 정보, 운영시간, 이용규칙 설정

### 2. QR 코드 기반 인증
- 관리자가 생성한 QR 코드를 스캔하여 시스템 접근
- 안전하고 편리한 로그인 프로세스
- 세션 기반 인증 시스템

### 3. 실시간 코트 관리
- 8개 코트의 실시간 상태 확인
- 대기 인원 자동 업데이트
- 2시간 이용 시간 자동 관리

### 4. 자동 매칭 시스템
- 4명이 모이면 자동으로 예약 확정
- 실시간 대기 현황 표시

### 5. 사용 통계 및 분석
- 시간대별 사용자 입장 현황
- 현재 활성 사용자 수 실시간 표시
- 세션별 남은 시간 추적

## 📱 사용 플로우

### 관리자
1. `/admin` 페이지 접속
2. QR 코드 생성 및 표시
3. 사용자가 스캔할 수 있도록 화면 표시 또는 인쇄

### 사용자
1. 입구의 QR 코드를 스마트폰으로 스캔
2. 자동으로 로그인 페이지로 이동
3. 닉네임 설정
4. QR 입장하기 (2시간 이용권 발급)
5. 원하는 코트에 대기 신청

## 🛠️ 기술 스택

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime
- **Icons**: Lucide React
- **QR Code**: qrcode.react

## 📦 설치 방법

### 1. 저장소 클론
```bash
git clone https://github.com/mimok7/badmintoncot.git
cd badmintoncot
```

### 2. 패키지 설치
```bash
npm install
```

### 3. 환경 변수 설정
`.env.local` 파일을 생성하고 다음 내용을 추가하세요:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_QR_SESSION_ID=qr_entrance_fixed_2024
```

### 4. Supabase 데이터베이스 설정

#### 4-1. Supabase 프로젝트 생성
1. [Supabase](https://supabase.com) 에서 프로젝트 생성
2. Project Settings → API에서 `URL`과 `anon public` 키 복사
3. `.env.local`에 추가

#### 4-2. 데이터베이스 스키마 생성
Supabase Dashboard → SQL Editor에서 다음 파일들을 순서대로 실행:

1. **기본 스키마 생성**: `supabase/schema.sql`
2. **추가 기능**: `supabase/schema_additions.sql`
3. **RLS 정책 설정**: `supabase/rls_policies.sql` ⭐ **중요!**

> ⚠️ **중요**: `rls_policies.sql`을 반드시 실행해야 합니다. 
> 이 파일이 없으면 익명 사용자가 데이터베이스에 접근할 수 없어 오류가 발생합니다.

### 5. 개발 서버 실행
```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

## 🚀 배포 (Vercel)

### 1. Vercel에 배포
```bash
vercel
```

### 2. 환경 변수 설정
Vercel Dashboard → Settings → Environment Variables에 추가:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_QR_SESSION_ID`

### 3. 재배포
환경 변수 추가 후 자동으로 재배포됩니다.
- **Database**: Supabase
- **QR Code**: qrcode.react
- **Icons**: Lucide React

## 📂 페이지 구조

```
/                 - 메인 페이지 (코트 현황 및 예약)
/admin            - 관리자 페이지 (QR 코드 생성)
/scan?session=... - QR 스캔 처리 페이지
```

## 🔐 보안 기능

- QR 세션 검증
- localStorage 기반 회원 정보 저장
- 세션 만료 시 자동 로그아웃
- 유효하지 않은 QR 코드 차단

## 🎨 디자인 특징

- 모던하고 세련된 그라데이션 UI
- 반응형 디자인 (모바일/태블릿/데스크톱)
- 부드러운 애니메이션 효과
- 직관적인 사용자 경험

## 🚦 시작하기

### 개발 서버 실행
```bash
npm run dev
```

### 관리자 페이지 접속
```
http://localhost:3000/admin
```

### 사용자 페이지 접속
```
http://localhost:3000
```

## 📋 환경 변수

`.env.local` 파일에 다음 변수를 설정하세요:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 🗄️ 데이터베이스 구조

### members
- 회원 정보 저장
- 자동 증가 회원 번호

### entry_sessions
- 입장 세션 관리
- 2시간 자동 만료

### courts
- 코트 정보 및 상태

### reservations
- 코트 대기 목록 관리

## 📝 라이선스

MIT License
