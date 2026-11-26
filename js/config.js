/* ==========================================================
   덕질역 설정 파일 — 사이트를 바꾸고 싶으면 여기부터 고치세요.
   ========================================================== */
window.SITE_CONFIG = {
  name: '덕질역',
  subtitle: '버스·철도 덕질 기록소',
  since: '2026.10',

  /* ▼ Supabase 연결 (README 참고)
     - 둘 다 비워 두면 "로컬 데모 모드": 이 브라우저에만 저장돼요. (혼자 써 보기용)
     - 채우면 "진짜 서버 모드": 다른 사람도 가입·댓글을 쓸 수 있어요. */
  supabaseUrl: 'https://hwkcgmressjfwlxbrkpk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3a2NnbXJlc3NqZndseGJya3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMjQwMjksImV4cCI6MjEwNjYwMDAyOX0.7x_NSweQISPI_tqVLufPSbdLO7Jy5FdK3Myew2jC-U0',

  /* 게시판 목록 (글은 관리자만 쓸 수 있어요) */
  boards: [
    { id: 'notice', name: '공지사항',   icon: '📢', desc: '덕질역 운영 소식' },
    { id: 'daily',  name: '일상글',     icon: '📓', desc: '오늘 있었던 일, 잡담' },
    { id: 'bus',    name: '버스 탑사기', icon: '🚌', desc: '노선버스를 타 본 이야기' },
    { id: 'rail',   name: '철도 탑승기', icon: '🚆', desc: '열차·지하철 탑승 후기' },
    { id: 'photo',  name: '출사기',     icon: '📷', desc: '사진 찍으러 다닌 기록' },
    { id: 'talk',   name: '교통 잡담',  icon: '💬', desc: '소식, 떡밥, 생각' }
  ],

  /* 금칙어 기본값 (관리자 센터 > 설정에서 언제든 수정 가능)
     댓글에 포함되면 "보류" 처리되어 관리자가 승인/삭제할 때까지 다른 사람에게 보이지 않아요. */
  badWords: [
    '시발', '씨발', '씨빨', '시팔', '씨팔', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ',
    '좆', '좇같', '지랄', 'ㅈㄹ', '개새끼', '씹새끼', '썅', '쌍놈', '쌍년',
    '미친놈', '미친년', '느금', '니애미', '애미뒤', '엿먹어', '한남충', '김치녀',
    '맘충', '틀딱', 'fuck', 'shit', 'bitch'
  ],

  commentMax: 500,
  pageSize: 10
};