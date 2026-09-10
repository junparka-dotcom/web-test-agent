// check-env.js
require('dotenv').config();

if (process.env.ANTHROPIC_API_KEY) {
  console.log('API 키 로딩 성공, 길이:', process.env.ANTHROPIC_API_KEY.length);
} else {
  console.log('API 키를 못 찾았어요. .env 파일 이름이나 위치를 확인하세요.');
}