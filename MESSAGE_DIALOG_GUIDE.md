# 전역 알림창 수정 방법

이 프로젝트의 브라우저 기본 `alert()` 창은 전역 메시지 컴포넌트가 대신 표시합니다.
따라서 `localhost:3000 내용:` 같은 브라우저 기본 제목 대신 앱에서 지정한 제목과 디자인을 사용할 수 있습니다.

## 현재 표시 구조

```text
🏸 즐거운 배드민턴 하세요
────────────────────────
설정이 저장되었습니다.
```

- 제목: `즐거운 배드민턴 하세요`
- 본문: 각 기능에서 `alert()`에 전달한 안내 문구
- 제목 아래: `border-slate-300` 구분선
- 확인 버튼: `확인`

## 관련 파일

- `components/app-message-provider.tsx`: 전역 메시지창 UI와 `alert()` 연결
- `app/layout.tsx`: 모든 화면에 메시지 Provider 적용

## 본문 문구 변경

기존 코드에서 사용하는 `alert()`의 문구를 수정하면 메시지창 본문이 바뀝니다.

```tsx
alert('설정이 저장되었습니다.');
```

표시 결과:

```text
🏸 즐거운 배드민턴 하세요
────────────────────────
설정이 저장되었습니다.
```

줄바꿈이 필요한 경우 `\n`을 사용합니다.

```tsx
alert('저장이 완료되었습니다.\n잠시 후 화면을 확인해 주세요.');
```

## 제목 변경

제목은 `components/app-message-provider.tsx`의 `MESSAGE_TITLE` 값을 수정합니다.

```tsx
const MESSAGE_TITLE = '즐거운 배드민턴 하세요';
```

제목과 아이콘은 같은 행에 표시됩니다. 아이콘은 해당 파일의 `🏸` 부분을 수정하면 됩니다.

## 구분선 변경

제목 아래 구분선은 다음 요소입니다.

```tsx
<div className="border-t border-slate-300" aria-hidden="true" />
```

선을 더 진하게 하려면 `border-slate-400` 또는 `border-slate-500`으로 변경합니다.
선을 두껍게 하려면 `border-t-2`를 추가합니다.

예:

```tsx
<div className="border-t-2 border-slate-400" aria-hidden="true" />
```

## 주의 사항

- 새 안내 메시지도 기존 방식처럼 `alert('내용')`으로 호출하면 전역 메시지창에 표시됩니다.
- `window.alert()`를 직접 호출해도 동일하게 처리됩니다.
- 확인 버튼 또는 배경을 클릭하면 창이 닫힙니다.
- `Escape` 키를 눌러도 창을 닫을 수 있습니다.
- 메시지창을 수정한 뒤 `npm run type-check`로 타입 검사를 실행합니다.
