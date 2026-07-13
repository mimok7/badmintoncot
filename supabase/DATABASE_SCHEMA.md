# BadmintonCot 데이터베이스 구조

현재 스키마의 실행 기준은 `supabase/migrations/`입니다. 루트의 개별 SQL 파일은 과거 단일 구장 스키마의 참고 자료이며 새 환경에 순서대로 실행하지 않습니다.

## 다중 구장 원칙

- `stadiums`가 구장 이름·주소·위도·경도·허용 반경의 유일한 원본입니다.
- `stadium_settings`는 운영시간·연락처·규칙·코트 수·이용시간만 저장합니다.
- 모든 구장 종속 테이블은 `stadium_id NOT NULL`을 사용하며 기본 구장 값은 두지 않습니다.
- 위치 기반 입장과 신청은 클라이언트 직접 INSERT가 아니라 보안 RPC에서 처리합니다.
- QR은 사이트 최초 접속 및 PWA 설치 링크에만 사용하며 DB 입장 세션과 연결하지 않습니다.

## 핵심 테이블

### stadiums

| 컬럼 | 용도 |
| --- | --- |
| `id` | 구장 PK |
| `name` | 구장 표시 이름 |
| `address` | 주소 |
| `latitude`, `longitude` | 위치 판정 원본 좌표 |
| `radius_meter` | 구장 허용 반경(10~5000m) |
| `is_active` | 운영 여부 |
| `created_at`, `updated_at` | 생성·수정 시각 |

### stadium_settings

`stadium_id`가 PK이자 `stadiums.id` FK인 1:1 테이블입니다.

| 컬럼 | 용도 |
| --- | --- |
| `stadium_id` | 구장 PK/FK |
| `operating_hours` | 운영시간 안내 |
| `contact_info` | 연락처 |
| `rules` | 이용 규칙 일반 텍스트 |
| `court_count` | 표시·운영 코트 수 |
| `duration_minutes` | 위치 입장 세션 시간 |
| `updated_at` | 수정 시각 |

`venue_name`, `location_lat`, `location_lng`, `location_radius`, `use_geofence` 및 `rules` 내부 메타데이터는 사용하지 않습니다.

### members

- `id`: 회원 UUID
- `member_number`: 표시용 회원 번호
- `nickname`, `club_name`: 회원 정보
- `access_token`: 기기별 비밀 토큰. Data API SELECT 권한에서 제외됩니다.

회원 등록·조회·클럽 변경은 전용 RPC만 사용합니다.

### entry_sessions

위치 검증을 통과한 회원의 구장별 이용 세션입니다. `user_id`, `stadium_id`, `expires_at`, `is_active`로 유효 여부를 판정합니다. QR 세션 컬럼은 없습니다.

### reservations

구장·코트·팀별 신청 정보입니다. 구장 안에서 측정한 최신 좌표와 회원 비밀 토큰을 `reserve_court_at_stadium`에 전달해야 생성됩니다. 코트 행을 잠근 뒤 정원·중복·클럽 일치를 확인하므로 동시 신청에도 안전합니다.

### courts / clubs / court_usage / daily_statistics

모두 `stadium_id`로 구장을 분리합니다. 일별 통계의 유일성 기준은 `(stadium_id, stat_date)`입니다.

## 공개 RPC

일반 회원:

- `register_member_at_stadium`
- `get_member_profile`
- `enter_stadium_by_location`
- `update_member_club`
- `reserve_court_at_stadium`
- `cancel_court_reservation`
- `end_game_secure`

관리자:

- `get_current_admin`
- `bootstrap_first_superadmin`
- `upsert_admin_user`
- `create_stadium_with_defaults`
- `save_stadium_configuration`

모든 `SECURITY DEFINER` RPC는 `search_path`를 비우고 호출자 또는 비밀 토큰을 함수 내부에서 검증하며, `PUBLIC` 실행 권한을 제거합니다.

## 위치 판정 기준

- GPS 정확도 오차가 100m 이상이면 거부합니다.
- 허용 거리는 `stadiums.radius_meter + min(accuracy, 50m)`입니다.
- 브라우저에서 먼저 동일 기준으로 안내하고, 최종 신청 가능 여부는 DB RPC가 다시 계산합니다.
- 웹 위치 값은 기기에서 위조될 가능성이 있으므로 물리적 출입을 완전히 보증하는 수단은 아닙니다.

## 적용

최신 마이그레이션:

`supabase/migrations/20260713072605_normalize_stadium_geofence_security.sql`

이 마이그레이션은 서비스 전환을 전제로 회원·입장·예약·사용 통계를 초기화합니다. 구장 좌표와 관리자 계정은 보존합니다.
