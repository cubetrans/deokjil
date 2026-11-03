/* ==========================================================
   덕질역 설정 파일 — 사이트를 바꾸고 싶으면 여기부터 고치세요.
   ========================================================== */
window.SITE_CONFIG = {
  name: '덕질역',
  subtitle: '버스·철도 덕질 커뮤니티',
  since: 2019,

  /* ▼ Supabase 연결 (README 참고)
     - 둘 다 비워 두면 "로컬 데모 모드": 이 브라우저에만 저장돼요. (혼자 써 보기용)
     - 채우면 "진짜 서버 모드": 다른 사람도 가입·댓글을 쓸 수 있어요. */
  supabaseUrl: 'https://hwkcgmressjfwlxbrkpk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3a2NnbXJlc3NqZndseGJya3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMjQwMjksImV4cCI6MjEwNjYwMDAyOX0.7x_NSweQISPI_tqVLufPSbdLO7Jy5FdK3Myew2jC-U0',

  /* 게시판 목록
     - staffOnly: 운영진(총관리자·부관리자)만 쓸 수 있는 게시판
     - ktxOnly:   KTX 등업 조건을 채운 회원만 쓸 수 있는 게시판 (등업신청용) */
  boards: [
    { id: 'notice',  name: '공지사항',   icon: '📢', desc: '덕질역 운영 소식', staffOnly: true },
    { id: 'daily',   name: '일상글',     icon: '📓', desc: '오늘 있었던 일, 잡담' },
    { id: 'bus',     name: '버스 탑사기', icon: '🚌', desc: '노선버스를 타 본 이야기' },
    { id: 'rail',    name: '철도 탑승기', icon: '🚆', desc: '열차·지하철 탑승 후기' },
    { id: 'photo',   name: '출사기',     icon: '📷', desc: '사진 찍으러 다닌 기록' },
    { id: 'talk',    name: '교통 잡담',  icon: '💬', desc: '소식, 떡밥, 생각' },
    { id: 'upgrade', name: '등업신청',   icon: '🎫', desc: 'KTX 등급 신청 (조건을 채운 분만)', ktxOnly: true }
  ],

  /* ▼ 등급 (낮은 순). 서버 모드에서는 DB의 grade_rules 표가 우선이에요.
     minWeeks 가입 후 지난 주 수 / minPosts 글 / minComments 댓글 / minLikes 누른 공감
     needApproval: true 이면 조건을 채워도 자동 승급이 아니라 "등업신청 → 운영진 승인"이 필요해요. */
  grades: [
    { level: 1, key: 'metro',     name: '광역철도', icon: '🚇', color: '#0052a4', minWeeks: 0, minPosts: 0,  minComments: 0,  minLikes: 0,   needApproval: false },
    { level: 2, key: 'mugunghwa', name: '무궁화호', icon: '🚃', color: '#d9381e', minWeeks: 1, minPosts: 5,  minComments: 10, minLikes: 10,  needApproval: false },
    { level: 3, key: 'saemaeul',  name: '새마을호', icon: '🚆', color: '#2e8b57', minWeeks: 3, minPosts: 20, minComments: 50, minLikes: 60,  needApproval: false },
    { level: 4, key: 'ktx',       name: 'KTX',      icon: '🚄', color: '#0b2a6b', minWeeks: 8, minPosts: 50, minComments: 70, minLikes: 100, needApproval: true }
  ],
  /* ▼ 브라우저 알림(푸시). vapidPublicKey 를 채우면 사이트를 닫아도 알림이 와요 (README의 "푸시 알림" 설정 참고).
     비워 두면 덕질역이 열려 있는 동안에만 알림이 떠요. */
  push: { vapidPublicKey: '' },

  /* ▼ 법령 안내 (개인정보처리방침·운영정책에 그대로 나와요)
     - version: 동의 문구를 바꾸면 날짜를 바꿔 주세요. 회원 동의 기록에 이 값이 같이 저장돼요.
     - officer*: 개인정보 보호책임자(운영자) 이름과 연락 메일. 개인정보 보호법상 반드시 공개해야 해요.
     - region: 서버가 있는 나라. Supabase 프로젝트 설정(Region)에서 확인해 정확히 적어 주세요. */
  legal: {
    version: '2026-10-31',
    effective: '2026-10-31',
    officerName: '서울교덕 (덕질역 운영자)',
    officerEmail: 'ansh110@naver.com',
    region: '대한민국(서울)'
  },

  /* ▼ 내 지도(실제 지도): 노선 id → 그 노선이 지나는 선로의 OpenStreetMap 이름. 경로를 찾을 때 이 이름의 선로를 먼저 따라가요. */
  routeOsm: {
    m1: ['서울 지하철 1호선', '경부선', '경원선', '경인선', '장항선', '경부본선', '경원본선'], m2: ['2호선', '신정지선', '성수지선'], m3: ['3호선', '서울 지하철 3호선', '일산선'],
    m4: ['4호선', '과천선', '안산선', '진접선'], m5: ['5호선', '마천지선', '하남선'], m6: ['6호선'], m7: ['7호선'], m8: ['8호선', '별내선'], m9: ['9호선'],
    ic1: ['인천 도시철도 1호선'], ic2: ['인천 도시철도 2호선'], gg: ['경강선'], gj: ['경의선', '중앙선', '용산선', '망우선', '경의본선'], gc: ['경춘선'],
    arex: ['인천국제공항선'], seohae: ['서해선'], suin: ['수인선', '분당선'], sbd: ['신분당선'], sl: ['신림선'], ui: ['우이신설선'], gimpo: ['김포 골드라인'],
    ever: ['용인경전철'], ujb: ['의정부경전철'], gtxa: ['수도권광역급행철도에이선'],
    bs1: ['부산 도시철도 1호선'], bs2: ['부산 도시철도 2호선'], bs3: ['부산 도시철도 3호선'], bs4: ['부산 도시철도 4호선'], bsgh: ['부산김해경전철'], donghae: ['동해선', '동해남부선'],
    dg1: ['대구 도시철도 1호선'], dg2: ['대구 2호선', '대구 도시철도 2호선'], dg3: [], dgk: ['안심~하양 복선전철', '대구선', '경부선'],
    dj1: ['대전 도시철도 1호선'], gw1: ['광주 도시철도 1호선', '광주 1호선', '광주도시철도 1호선']
  },

  /* ▼ 내 노선도: 노선을 바꾸거나 더하려면 여기만 고치세요. (id 는 저장된 기록과 이어지니 바꾸지 마세요)
     [id, 화면에 보이는 이름, 노선 색, 이동 기록에 쓰는 이름] */
  routeGroups: [
    { id: 'metro', name: '수도권 전철 노선', lines: [
      ['m1', '1호선', '#0052A4'], ['m2', '2호선', '#00A84D'], ['m3', '3호선', '#EF7C1C'], ['m4', '4호선', '#00A5DE'], ['m5', '5호선', '#996CAC'],
      ['m6', '6호선', '#CD7C2F'], ['m7', '7호선', '#747F00'], ['m8', '8호선', '#E6186C'], ['m9', '9호선', '#BDB092'],
      ['ic1', '인천 1호선', '#7CA8D5'], ['ic2', '인천 2호선', '#ED8B00'], ['gg', '경강선', '#003DA5'], ['gj', '경의·중앙선', '#77C4A3'],
      ['gc', '경춘선', '#0C8E72'], ['arex', '공항철도', '#0090D2'], ['seohae', '서해선', '#81A914'], ['suin', '수인·분당선', '#F5A200'],
      ['sbd', '신분당선', '#D4003B'], ['sl', '신림선', '#6789CA'], ['ui', '우이신설선', '#B0CE18'], ['gimpo', '김포 골드라인', '#A17800'],
      ['ever', '용인 에버라인', '#56AD2D'], ['ujb', '의정부 경전철', '#FDA600'], ['gtxa', 'GTX-A', '#9A6292']] },
    { id: 'se', name: '동남권 전철 노선', lines: [
      ['bs1', '1호선', '#F06A00', '부산 1호선'], ['bs2', '2호선', '#81BF48', '부산 2호선'], ['bs3', '3호선', '#BB8C00', '부산 3호선'], ['bs4', '4호선', '#217DCB', '부산 4호선'],
      ['bsgh', '부산김해경전철', '#8E5BA6'], ['donghae', '동해선', '#0F4C9C']] },
    { id: 'dg', name: '대구권 전철 노선', lines: [
      ['dg1', '1호선', '#D93F5C', '대구 1호선'], ['dg2', '2호선', '#00AA80', '대구 2호선'], ['dg3', '3호선', '#FFB100', '대구 3호선'], ['dgk', '대경선', '#C0504D']] },
    { id: 'dj', name: '대전권 전철 노선', lines: [['dj1', '1호선', '#007448', '대전 1호선']] },
    { id: 'gw', name: '광주권 전철 노선', lines: [['gw1', '1호선', '#009088', '광주 1호선']] }
  ],
  /* ▼ 철도 열차: 열차 종류를 누르면 그 열차가 다니는 노선(선로)이 나와요. (코레일 '운행계통 안내' 기준)
     노선은 [이름, 구간, 색] 이고, 마음대로 더하거나 빼도 돼요. */
  trainTypes: [
    { id: 'ktx', name: 'KTX', color: '#0A3C8F', sections: 'KTX' },
    { id: 'ktxs', name: 'KTX-산천', color: '#1F6FB5', sections: 'KTX' },
    { id: 'ktxe', name: 'KTX-이음', color: '#2E8F6B', note: '준고속열차', sections: [
      { name: '준고속철도', tag: '준고속', routes: [['강릉선', '서울~강릉', '#2E8BD9'], ['강릉선(동해행)', '서울~동해', '#4A9BDB'], ['중앙선', '서울~부전', '#4F9A5A'], ['중부내륙선', '판교~문경', '#7A9A2F'], ['동해선(부전)', '부전~강릉', '#1B8E8E']] }] },
    { id: 'ktxc', name: 'KTX-청룡', color: '#C8102E', sections: 'KTX' },
    { id: 'itxs', name: 'ITX-새마을', color: '#D4691E', routes: ['경부선', '호남선', '전라선', '장항선', '경전선', '중앙선'] },
    { id: 'itxm', name: 'ITX-마음', color: '#4B8B3B', routes: ['경부선', '호남선', '전라선', '장항선', '경전선', '동해선', '중앙선'] },
    { id: 'itxc', name: 'ITX-청춘', color: '#7B4BA8', routes: ['경춘선'] },
    { id: 'mugung', name: '무궁화호', color: '#B8860B', routes: ['경부선', '호남선', '전라선', '경전선', '동해선', '장항선', '중앙선', '충북선', '태백선', '영동선', '경북선', '경의선', '경원선'] },
    { id: 'nuri', name: '누리로', color: '#2F6F9F', routes: ['경부선', '장항선', '경의선'] }
  ],
  /* KTX 계통(서울 행신 · 수서 출발) — trainTypes 의 sections: 'KTX' 가 이걸 가리켜요 */
  ktxSections: [
    { name: '경부선(서울) 계통', tag: '경부·서울', routes: [['경부고속선', '행신·서울~부산', '#1B4F9E'], ['경부선(구포 경유)', '행신·서울~구포~부산', '#2A3F95'], ['경부선(수원 경유)', '행신·서울~수원~부산', '#4A7FCB'], ['경전선', '행신·서울~동대구~진주', '#8E4FB5'], ['동해선(포항)', '행신·서울~동대구~포항', '#1E8FA6']] },
    { name: '경부선(수서) 계통', tag: '경부·수서', routes: [['경부고속선', '수서~부산', '#1B4F9E'], ['경부선(구포 경유)', '수서~동대구~구포~부산', '#2A3F95'], ['경전선', '수서~동대구~진주', '#8E4FB5'], ['동해선(포항)', '수서~동대구~포항', '#1E8FA6']] },
    { name: '호남선(용산) 계통', tag: '호남·용산', routes: [['호남고속선', '행신~용산~목포', '#C8102E'], ['호남선(서대전 경유)', '행신~용산~서대전~목포', '#A12A4A'], ['호남선(김제·장성 경유)', '행신~용산~익산~김제~목포', '#B8456B'], ['전라선', '행신~용산~익산~여수엑스포', '#C9824A'], ['전라선(서대전 경유)', '행신~용산~서대전~익산~여수엑스포', '#A9553F']] },
    { name: '호남선(수서) 계통', tag: '호남·수서', routes: [['호남고속선', '수서~목포', '#C8102E'], ['호남선(서대전 경유)', '수서~서대전~목포', '#A12A4A'], ['전라선', '수서~익산~여수엑스포', '#C9824A']] }
  ],
  /* ▼ 게시물 신고: 권리침해·불법 신고(instant)는 1건만 들어와도 임시로 숨기고, 나머지는 hideAt 명이 신고하면 숨겨요 */
  report: {
    hideAt: 3,
    reasons: {
      defame: '명예훼손·모욕 (나에 대한 글)', privacy: '개인정보·사생활 침해', illegal: '불법·음란·불법촬영물 등',
      copyright: '저작권 침해', abuse: '욕설·혐오·괴롭힘', spam: '광고·도배', etc: '기타'
    },
    instant: ['defame', 'privacy', 'illegal', 'copyright']
  },


  /* ▼ 중고거래: 철도·버스 덕질 용품 게시판. 돈은 사이트를 거치지 않고, 연락은 쪽지로만 해요.
     (숫자를 바꾸면 화면 안내만 바뀌어요. 실제 제한은 supabase/v2_community.sql 의 16번 구역에 있어요.) */
  market: {
    limitBasic: 3, limitGrade2: 10, perDay: 5, reportHide: 3, banDays: 7, maxImages: 4,
    categories: [
      { id: 'goods',   name: '굿즈·기념품',   icon: '🎁' },
      { id: 'model',   name: '모형·완구',     icon: '🚂' },
      { id: 'book',    name: '책·시간표·지도', icon: '📚' },
      { id: 'ticket',  name: '수집용 승차권',  icon: '🎫' },
      { id: 'card',    name: '기념 교통카드',  icon: '💳' },
      { id: 'photo',   name: '사진·인쇄물',   icon: '🖼️' },
      { id: 'clothes', name: '의류·잡화',     icon: '👕' },
      { id: 'device',  name: '전자·촬영 장비', icon: '📷' },
      { id: 'etc',     name: '기타',          icon: '📦' }
    ],
    conds: { new: '새 상품', like: '거의 새것', used: '사용감 있음', worn: '많이 사용함' },
    methods: { direct: '직거래', post: '택배', both: '직거래·택배' },
    status: { selling: '판매중', reserved: '예약중', sold: '판매완료', hidden: '숨김(신고)', removed: '삭제됨' },
    reasons: { scam: '사기 의심 (선입금 요구 등)', banned: '금지 품목 (유효 승차권·증빙용 악용 포함)', fake: '모조품·위조품', info: '개인정보 노출', etc: '기타' }
  },
  /* 서비스 상태 페이지(status.html)에 보이는 항목. id 는 DB 에 저장되는 값이라 바꾸지 마세요. */
  statusComponents: [
    { id: 'site',   name: '덕질역 사이트' },
    { id: 'db',     name: '글·회원 데이터' },
    { id: 'auth',   name: '로그인·가입' },
    { id: 'server', name: '탈퇴·메일 서버' },
    { id: 'rail',   name: 'RAIL 열차 편성' }
  ],
  railUrl: 'https://rail.deokjil.xyz/',   // 열차 편성 제보 사이트
  staffGrades: {
    subadmin: { name: '부관리자', icon: '🛠', color: '#7a3db8' },
    manager:  { name: '관리자',   icon: '🛡', color: '#d9731a' },
    admin:    { name: '총관리자', icon: '👑', color: '#c8102e' }
  },

  /* ▼ 글 라이선스 (글 쓸 때 고르면 글 맨 위에 표시돼요)
     id 는 DB 에 저장되는 값이라 바꾸지 마세요. */
  defaultLicense: 'cc-by',
  licenses: [
    { id: 'cc-by',       name: 'CC BY',       icon: '🅭', short: '출처 표시',               desc: '출처만 밝히면 상업적 이용·변경까지 자유롭게 쓸 수 있어요.', url: 'https://creativecommons.org/licenses/by/4.0/deed.ko' },
    { id: 'cc-by-sa',    name: 'CC BY-SA',    icon: '🅭', short: '출처 표시 + 동일 조건',   desc: '출처를 밝히고, 변경한 결과물도 같은 라이선스로 공개해야 해요.', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.ko' },
    { id: 'cc-by-nc',    name: 'CC BY-NC',    icon: '🅭', short: '출처 표시 + 비영리',      desc: '출처를 밝히면 비영리 목적으로 변경·이용할 수 있어요.', url: 'https://creativecommons.org/licenses/by-nc/4.0/deed.ko' },
    { id: 'cc-by-nd',    name: 'CC BY-ND',    icon: '🅭', short: '출처 표시 + 변경 금지',   desc: '출처를 밝히면 그대로는 퍼 갈 수 있지만 바꿀 수 없어요.', url: 'https://creativecommons.org/licenses/by-nd/4.0/deed.ko' },
    { id: 'cc-by-nc-sa', name: 'CC BY-NC-SA', icon: '🅭', short: '출처 + 비영리 + 동일 조건', desc: '출처를 밝히고, 비영리로만, 변경물은 같은 라이선스로 공개해야 해요.', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ko' },
    { id: 'cc-by-nc-nd', name: 'CC BY-NC-ND', icon: '🅭', short: '출처 + 비영리 + 변경 금지', desc: '출처를 밝히고, 비영리로만, 그대로만 퍼 갈 수 있어요.', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/deed.ko' },
    { id: 'cc0',         name: 'CC0',         icon: '🅭', short: '퍼블릭 도메인',           desc: '권리를 포기했어요. 출처 없이도 자유롭게 쓸 수 있어요.', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.ko' },
    { id: 'arr',         name: '모든 권리 보유', icon: '©', short: '무단 전재·복제 금지',  desc: '글쓴이의 허락 없이 퍼 가거나 복제할 수 없어요.', url: '' }
  ],

  /* ▼ 포인트 적립 (서버 모드에서는 DB의 point_rules 표가 우선)
     dailyCap: 하루에 포인트를 받을 수 있는 횟수 / minLen: 이 글자 수 이상일 때만 적립 */
  pointRules: {
    post:    { amount: 20, dailyCap: 3,  minLen: 30, label: '글 작성' },
    comment: { amount: 5,  dailyCap: 10, minLen: 5,  label: '댓글 작성' },
    like:    { amount: 1,  dailyCap: 20, minLen: 0,  label: '공감 누르기' }
  },

  /* ▼ 상점 상품 (id 는 DB의 shop_items 와 같아야 해요. 서버 모드에서는 가격·판매 여부를 DB 값으로 덮어써요) */
  shopItems: [
    { id: 'station',      kind: 'theme', name: '기차역 (기본)', desc: '밝은 역사 안내판 느낌의 기본 테마',     price: 0 },
    { id: 'mono',         kind: 'theme', name: '모노 화이트',  desc: '군더더기 없는 흑백 미니멀',            price: 0 },
    { id: 'ios-dark',     kind: 'theme', name: '야간 승강장',  desc: '눈이 편한 어두운 테마',                price: 0 },
    { id: 'midnight',     kind: 'theme', name: '미드나잇',     desc: '깊은 남색 밤하늘 테마',                price: 600 },
    { id: 'line1',        kind: 'theme', name: '1호선 블루',   desc: '시원한 감청색 테마',                   price: 400 },
    { id: 'line2',        kind: 'theme', name: '2호선 그린',   desc: '순환선의 초록빛 테마',                 price: 400 },
    { id: 'line3',        kind: 'theme', name: '3호선 오렌지', desc: '따뜻한 주황빛 테마',                   price: 400 },
    { id: 'line4',        kind: 'theme', name: '4호선 스카이', desc: '맑은 하늘색 테마',                     price: 400 },
    { id: 'line5',        kind: 'theme', name: '5호선 퍼플',   desc: '차분한 보랏빛 테마',                   price: 400 },
    { id: 'line6',        kind: 'theme', name: '6호선 브라운', desc: '차분한 황갈색 테마',                   price: 400 },
    { id: 'line7',        kind: 'theme', name: '7호선 올리브', desc: '산뜻한 올리브 테마',                   price: 400 },
    { id: 'line8',        kind: 'theme', name: '8호선 핑크',   desc: '화사한 분홍빛 테마',                   price: 400 },
    { id: 'line9',        kind: 'theme', name: '9호선 골드',   desc: '은은한 금빛 테마',                     price: 500 },
    { id: 'ktx',          kind: 'theme', name: 'KTX 블루',     desc: '고속열차의 선명한 파랑',               price: 500 },
    { id: 'airport',      kind: 'theme', name: '공항철도',     desc: '청량한 하늘·파랑 테마',                price: 450 },
    { id: 'sand',         kind: 'theme', name: '샌드 라운지',  desc: '따뜻한 베이지 대합실 테마',            price: 400 },
    { id: 'night-bus',    kind: 'theme', name: '심야버스',     desc: '한밤의 네온빛이 도는 어두운 테마',     price: 700 },
    { id: 'basic',        kind: 'skin',  name: '기본 스킨',    desc: '깔끔한 기본 프로필',                        price: 0 },
    { id: 'sunrise',      kind: 'skin',  name: '첫차의 새벽',  desc: '새벽 하늘색 그라데이션',                    price: 200 },
    { id: 'blueprint',    kind: 'skin',  name: '노선 도면',    desc: '청사진 격자무늬',                           price: 300 },
    { id: 'rail-night',   kind: 'skin',  name: '야간열차',     desc: '어두운 하늘과 철길',                        price: 300 },
    { id: 'led-board',    kind: 'skin',  name: 'LED 전광판',   desc: '역 전광판처럼 반짝이는 주황 글씨',          price: 500 },
    { id: 'gold-ticket',  kind: 'skin',  name: '황금 승차권',  desc: '반짝이는 금빛 승차권',                      price: 800 },
    { id: 'first-train',  kind: 'title', name: '첫차 탑승객',  desc: '닉네임 옆에 붙는 칭호',                     price: 100 },
    { id: 'last-train',   kind: 'title', name: '막차 승객',    desc: '닉네임 옆에 붙는 칭호',                     price: 100 },
    { id: 'terminus',     kind: 'title', name: '종점 순례자',  desc: '닉네임 옆에 붙는 칭호',                     price: 150 },
    { id: 'photographer', kind: 'title', name: '출사 장인',    desc: '닉네임 옆에 붙는 칭호',                     price: 200 },
    { id: 'route-master', kind: 'title', name: '노선 박사',    desc: '닉네임 옆에 붙는 칭호',                     price: 300 }
  ],

  /* 금칙어 기본값 (관리자 센터 > 설정에서 언제든 수정 가능)
     댓글·글에 포함되면 "보류" 처리되어 운영진이 승인/삭제할 때까지 다른 사람에게 보이지 않아요. */
  badWords: [
    '시발', '씨발', '씨빨', '시팔', '씨팔', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ',
    '좆', '좇같', '지랄', 'ㅈㄹ', '개새끼', '씹새끼', '썅', '쌍놈', '쌍년',
    '미친놈', '미친년', '느금', '니애미', '애미뒤', '엿먹어', '한남충', '김치녀',
    '맘충', '틀딱', 'fuck', 'shit', 'bitch'
  ],

  /* ▼ 서울교덕체 (폰트 파일은 fonts/ 폴더에 넣어 주세요. 파일 이름은 아래 file 과 같게)
     있는 파일만 배포 페이지(#/font)에 다운로드 버튼으로 나와요. */
  font: {
    name: '서울교덕체',
    family: 'SeoulGyodeok',
    maker: '서울교덕',
    files: [
      { file: 'fonts/SeoulGyodeok.woff2', label: 'WOFF2', note: '웹사이트·블로그용 (가장 가벼워요)' },
      { file: 'fonts/SeoulGyodeok.ttf',   label: 'TTF',   note: '윈도우·맥 설치용, 영상 편집(프리미어·캡컷 등)' },
      { file: 'fonts/SeoulGyodeok.otf',   label: 'OTF',   note: '일러스트·포토샵 등 디자인 프로그램용' }
    ],
    sample: ['덕질역에 오신 것을 환영합니다', '이번 열차는 신나는 덕질 방면 급행입니다', '가나다라마바사 아자차카타파하', '서울교덕 · 버스와 철도를 좋아해요 🚌🚆'],
    license: [
      ['✅ 개인·비영리 사용', '블로그, SNS, 유튜브 영상·썸네일, 인쇄물 등에 자유롭게 쓸 수 있어요.'],
      ['✅ 상업적 사용', '영상·썸네일·상품 이미지 같은 결과물에 쓰는 건 가능해요. 쓰실 땐 "서울교덕체"라고 출처를 적어 주시면 고마워요.'],
      ['🚫 금지', '폰트 파일 자체를 판매하거나 재배포(다른 곳에 올리기)하는 것, 수정해서 다시 배포하는 것은 안 돼요. 이 페이지 링크를 공유해 주세요.']
    ]
  },

  commentMax: 500,
  pageSize: 10
};
