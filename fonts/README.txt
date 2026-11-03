여기에 서울교덕체 폰트 파일을 넣어 주세요. (파일 이름을 정확히 맞춰야 해요)

  SeoulGyodeok.woff2   웹사이트에 적용되는 파일 (가장 중요! 사이트 글꼴로 쓰여요)
  SeoulGyodeok.ttf     내려받기용 (윈도우·맥 설치, 영상 편집)
  SeoulGyodeok.otf     내려받기용 (디자인 프로그램)

- 있는 파일만 쓰여요. 셋 다 없으면 사이트는 기본 글꼴로 보이고, 폰트 페이지(#/font)에는 "아직 파일이 없어요"가 떠요.
- .ttf 만 있어도 사이트에 적용돼요 (woff2 가 더 가벼울 뿐이에요).
- ttf → woff2 변환: https://cloudconvert.com/ttf-to-woff2 같은 사이트나 `pip install fonttools brotli` 후
  `fonttools ttLib.woff2 compress SeoulGyodeok.ttf`
