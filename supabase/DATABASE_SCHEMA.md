# 데이터베이스 스키마 참조 문서

> ⚠️ **주의**: 이 문서는 실제 Supabase 데이터베이스 구조를 반영합니다.  
> 코드 작성 시 반드시 이 문서의 컬럼명을 사용하세요.

---

## 📋 테이블 목록

| 테이블명 | 설명 |
|----------|------|
| `members` | 회원 정보 |
| `entry_sessions` | 입장 세션 (2시간 제한) |
| `courts` | 코트 정보 (8개) |
| `reservations` | 예약 대기 (4인 매칭) |
| `court_usage` | 코트 사용 내역 |
| `settings` | 시스템 설정 |
| `qr_sessions` | QR 세션 로그 |
| `daily_statistics` | 일별 통계 |

---

## 1. members (회원 정보)

| 컬럼명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `id` | UUID | `gen_random_uuid()` | PK, 회원 고유 ID |
| `member_number` | SERIAL | 자동 증가 | 회원번호 (UNIQUE) |
| `nickname` | VARCHAR(50) | - | 닉네임 (필수) |
| `created_at` | TIMESTAMPTZ | `NOW()` | 가입일시 |
| `last_login_at` | TIMESTAMPTZ | `NOW()` | 마지막 로그인 |

**사용 예시:**
```typescript
// 회원 생성
const { data } = await supabase
  .from('members')
  .insert({ nickname: 'Guest_12345' })
  .select('*')
  .single();
```

---

## 2. entry_sessions (입장 세션)

> ⚠️ **중요**: 
> - 실제 DB에서는 `user_id` 컬럼을 사용합니다 (schema.sql의 `member_id`와 다름)
> - `id` 컬럼에 기본값이 없으므로 **반드시 직접 UUID를 생성**해야 합니다
> - `user_id`는 `members` 테이블의 `id`를 참조합니다 (외래 키)

| 컬럼명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `id` | UUID | ⚠️ **없음** | PK, 직접 생성 필요 |
| `user_id` | UUID | - | FK → **members.id** |
| `entry_at` | TIMESTAMPTZ | `NOW()` | 입장 시간 |
| `expires_at` | TIMESTAMPTZ | `NOW() + 2시간` | 만료 시간 |
| `is_active` | BOOLEAN | `true` | 활성 상태 |
| `qr_session_id` | VARCHAR | - | 사용된 QR 세션 ID |

**외래 키 설정 (Supabase에서 실행 필요):**
```sql
-- 기존 외래 키가 users 테이블을 참조하는 경우 수정
ALTER TABLE entry_sessions DROP CONSTRAINT IF EXISTS entry_sessions_user_id_fkey;
ALTER TABLE entry_sessions ADD CONSTRAINT entry_sessions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES members(id) ON DELETE CASCADE;
```

**사용 예시:**
```typescript
// 입장 세션 생성 - id를 직접 생성해야 함!
const entryId = crypto.randomUUID();
const { data } = await supabase
  .from('entry_sessions')
  .insert({ 
    id: entryId,           // ⚠️ 필수!
    user_id: memberId      // ⚠️ member_id가 아닌 user_id 사용!
  })
  .select('*')
  .single();

// 활성 세션 조회
const { data } = await supabase
  .from('entry_sessions')
  .select('*')
  .eq('user_id', memberId)
  .eq('is_active', true)
  .single();
```

---

## 3. courts (코트 정보)

| 컬럼명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `id` | SERIAL | 자동 증가 | PK |
| `name` | VARCHAR(50) | - | 코트 이름 (UNIQUE) |
| `status` | VARCHAR(20) | `'available'` | 상태: available/occupied/maintenance |
| `current_users_count` | INTEGER | `0` | 현재 대기 인원 |

**초기 데이터:**
- 코트 1 ~ 코트 8 (총 8개)

**사용 예시:**
```typescript
// 모든 코트 조회
const { data } = await supabase
  .from('courts')
  .select('*')
  .order('id');

// 코트 상태 업데이트
await supabase
  .from('courts')
  .update({ status: 'occupied' })
  .eq('id', courtId);
```

---

## 4. reservations (예약 대기)

| 컬럼명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `id` | SERIAL | 자동 증가 | PK |
| `court_id` | INTEGER | - | FK → courts.id |
| `member_id` | UUID | - | FK → members.id |
| `created_at` | TIMESTAMPTZ | `NOW()` | 예약 시간 |

**제약조건:**
- `UNIQUE(court_id, member_id)` - 동일 코트 중복 예약 방지

**사용 예시:**
```typescript
// 예약 등록
const { data } = await supabase
  .from('reservations')
  .insert({ court_id: 1, member_id: memberId })
  .select('*')
  .single();

// 코트별 예약 조회
const { data } = await supabase
  .from('reservations')
  .select('*, members(nickname)')
  .eq('court_id', courtId);
```

---

## 5. court_usage (코트 사용 내역)

| 컬럼명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `id` | SERIAL | 자동 증가 | PK |
| `court_id` | INTEGER | - | FK → courts.id |
| `member_ids` | UUID[] | - | 4명의 회원 ID 배열 |
| `started_at` | TIMESTAMPTZ | `NOW()` | 시작 시간 |
| `ended_at` | TIMESTAMPTZ | - | 종료 시간 |

**사용 예시:**
```typescript
// 사용 내역 생성 (4인 매칭 시 트리거에서 자동 생성)
const { data } = await supabase
  .from('court_usage')
  .insert({
    court_id: 1,
    member_ids: [uuid1, uuid2, uuid3, uuid4]
  });
```

---

## 6. settings (시스템 설정)

| 컬럼명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `id` | SERIAL | 자동 증가 | PK |
| `venue_name` | VARCHAR(100) | '스마트 배드민턴 코트' | 장소명 |
| `operating_hours` | TEXT | - | 운영 시간 |
| `contact_info` | TEXT | - | 연락처 |
| `rules` | TEXT | - | 이용 규칙 |
| `updated_at` | TIMESTAMPTZ | `NOW()` | 수정 시간 |

---

## 7. qr_sessions (QR 세션 로그)

| 컬럼명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `id` | SERIAL | 자동 증가 | PK |
| `session_id` | VARCHAR(100) | - | 세션 ID (UNIQUE) |
| `qr_url` | TEXT | - | QR 코드 URL |
| `created_at` | TIMESTAMPTZ | `NOW()` | 생성 시간 |
| `expires_at` | TIMESTAMPTZ | `NOW() + 24시간` | 만료 시간 |
| `is_active` | BOOLEAN | `true` | 활성 상태 |
| `used_count` | INTEGER | `0` | 스캔 횟수 |
| `last_used_at` | TIMESTAMPTZ | - | 마지막 사용 시간 |

---

## 8. daily_statistics (일별 통계)

| 컬럼명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `id` | SERIAL | 자동 증가 | PK |
| `stat_date` | DATE | `CURRENT_DATE` | 통계 날짜 (UNIQUE) |
| `total_entries` | INTEGER | `0` | 총 입장 수 |
| `total_reservations` | INTEGER | `0` | 총 예약 수 |
| `total_matches` | INTEGER | `0` | 총 매칭 성공 수 |
| `peak_hour` | INTEGER | - | 가장 바쁜 시간대 |
| `created_at` | TIMESTAMPTZ | `NOW()` | 생성 시간 |
| `updated_at` | TIMESTAMPTZ | `NOW()` | 수정 시간 |

---

## 🔄 트리거 목록

| 트리거명 | 테이블 | 이벤트 | 설명 |
|----------|--------|--------|------|
| `trigger_check_reservation_count` | reservations | INSERT | 4인 모이면 자동 매칭 |
| `trigger_update_entry_statistics` | entry_sessions | INSERT | 입장 통계 업데이트 |
| `trigger_update_reservation_statistics` | reservations | INSERT | 예약 통계 업데이트 |
| `trigger_update_match_statistics` | court_usage | INSERT | 매칭 통계 업데이트 |
| `trigger_log_qr_usage` | entry_sessions | INSERT | QR 사용 로그 기록 |

---

## 🔐 RLS 정책

모든 테이블에 Row Level Security가 활성화되어 있습니다.

| 테이블 | INSERT | SELECT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| members | ✅ anon, auth | ✅ anon, auth | ❌ | ❌ |
| entry_sessions | ✅ anon, auth | ✅ anon, auth | ✅ anon, auth | ❌ |
| courts | ❌ | ✅ anon, auth | ✅ anon, auth | ❌ |
| reservations | ✅ anon, auth | ✅ anon, auth | ❌ | ✅ anon, auth |
| court_usage | ✅ anon, auth | ✅ anon, auth | ✅ anon, auth | ❌ |
| settings | ❌ | ✅ anon, auth | ✅ auth only | ❌ |
| qr_sessions | ✅ anon, auth | ✅ anon, auth | ✅ anon, auth | ❌ |
| daily_statistics | ✅ anon, auth | ✅ anon, auth | ✅ anon, auth | ❌ |

---

## 📝 주의사항

1. **entry_sessions 테이블**: 
   - SQL 파일에는 `member_id`로 정의되어 있지만
   - **실제 Supabase DB에서는 `user_id`** 컬럼 사용

2. **UUID 형식**:
   - members.id, entry_sessions.user_id 등은 UUID 타입
   - 예: `18688667-1b29-41a5-bd49-0cbfc93bdd88`

3. **Supabase Insert 문법**:
   ```typescript
   // ✅ 올바른 방법 - 단일 객체 사용
   .insert({ column: value }).select('*').single()
   
   // ❌ 잘못된 방법 (배열 사용)
   .insert([{ column: value }])
   ```

5. **entry_sessions 테이블 주의사항**:
   - 컬럼명: `user_id` (members.id 참조)
   - `id` 컬럼은 직접 `crypto.randomUUID()`로 생성 필요

6. **스키마 캐시 새로고침**:
   테이블 구조 변경 후 반드시 실행:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
