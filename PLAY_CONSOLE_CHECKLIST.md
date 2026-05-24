# F-Field Play Console Checklist

이 문서는 Google Play Console에 F-Field를 등록하고 내부 테스트까지 올리기 위한 준비 체크리스트입니다.

## 1. 개발자 계정

- [ ] Google Play Console 개발자 계정 생성
- [ ] 개발자 프로필 이름 확정
- [ ] 연락처 이메일 등록
- [ ] 결제/신원 확인 등 계정 필수 절차 완료

## 2. 앱 생성

- [ ] 앱 이름: `F-Field`
- [ ] 기본 언어: 한국어
- [ ] 앱 또는 게임: 앱
- [ ] 무료 또는 유료: 무료 우선 검토
- [ ] 정책 동의 완료

## 3. 앱 설정

- [ ] 앱 카테고리 선택
- [ ] 연락처 정보 입력
- [ ] 개인정보처리방침 URL 입력
- [ ] 광고 포함 여부: 현재 광고 SDK 없음
- [ ] 앱 액세스 권한: Google 로그인 있음. 심사용 테스트 계정 또는 접근 설명 준비
- [ ] 타겟층 및 콘텐츠 설정
- [ ] 뉴스 앱 여부: 아니오
- [ ] 코로나19 관련 앱 여부: 아니오
- [ ] 정부 앱 여부: 아니오

## 4. 스토어 등록정보

- [ ] 앱 이름 입력
- [ ] 짧은 설명 입력
- [ ] 긴 설명 입력
- [ ] 앱 아이콘 512 x 512 업로드
- [ ] Feature graphic 1024 x 500 업로드
- [ ] 스마트폰 스크린샷 2장 이상 업로드
- [ ] 태블릿/폴더블 스크린샷 필요 여부 확인
- [ ] 개인정보나 민감 위치가 스크린샷에 없는지 확인

초안 파일:

- `PLAY_STORE_LISTING_DRAFT.md`

## 5. 개인정보 및 데이터 보안

- [ ] 개인정보처리방침 웹 URL 공개
- [ ] 앱 안에도 개인정보처리방침 접근 경로 추가 여부 결정
- [ ] 데이터 보안 양식 작성
- [ ] 위치 데이터 처리 항목 확인
- [ ] 사진 데이터 처리 항목 확인
- [ ] 외부 지도/API 서비스 전송 설명 확인
- [ ] Google 로그인, Supabase Auth, 권한 테이블, 인증코드 Edge Function 반영
- [ ] 광고 SDK 없음/분석 SDK 없음 반영
- [ ] 계정 삭제 URL 입력

초안 파일:

- `PRIVACY_POLICY_DRAFT.md`
- `RELEASE_DATA_SAFETY_DRAFT.md`
- `RELEASE_PERMISSIONS_GUIDE.md`
- `public/account-deletion.html`

## 6. 콘텐츠 등급

- [ ] 콘텐츠 등급 설문 시작
- [ ] 폭력/선정성/도박/사용자 생성 콘텐츠 없음 기준으로 답변
- [ ] 위치 기반 기능 설명과 앱 목적을 일관되게 입력
- [ ] 등급 결과 확인

## 7. 앱 번들 준비

Play Store 업로드는 debug APK가 아니라 release AAB가 필요합니다.

- [ ] `versionName 1.0.0` 확인
- [ ] `versionCode 100` 확인
- [ ] 앱 서명키 생성 또는 Play App Signing 설정
- [ ] Android Studio에서 signed release bundle 생성
- [ ] `.aab` 파일 생성 확인
- [ ] release 빌드에서 앱 실행 확인

관련 파일:

- `RELEASE_VERSION_GUIDE.md`

## 8. 내부 테스트 트랙

- [ ] 내부 테스트 트랙 생성
- [ ] 테스트 사용자 이메일 목록 준비
- [ ] release AAB 업로드
- [ ] 출시 노트 작성
- [ ] 내부 테스트 배포
- [ ] 테스트 링크로 설치 확인

내부 테스트 출시 노트 초안:

```txt
F-Field 1.0.0 내부 테스트

- Capacitor 기반 Android 앱 첫 테스트 버전
- 지도, 지적도, 현위치 표시
- 점/선/면 기록 및 GPS 트랙 기록
- 사진 첨부 기록
- 프로젝트 저장, 데이터 백업, 파일 불러오기
- Android 저장 시트 기반 파일 저장
```

## 9. 내부 테스트 확인 항목

- [ ] 앱 설치 가능
- [ ] 앱 첫 실행 가능
- [ ] Google 로그인 가능
- [ ] 인증코드 입력 후 권한 활성화 가능
- [ ] 로그아웃 가능
- [ ] 회원탈퇴 가능
- [ ] 위치 권한 허용/거부 모두 확인
- [ ] 현재 위치 이동 가능
- [ ] GPS 트랙 기록 가능
- [ ] 점/선/면 기록 가능
- [ ] 사진 첨부 가능
- [ ] 프로젝트 저장 가능
- [ ] 데이터 백업 가능
- [ ] 백업 파일 불러오기 가능
- [ ] 앱 삭제 후 재설치 및 백업 복원 확인
- [ ] 폴더블 화면에서 하단 UI가 가려지지 않는지 확인

## 10. 공개 출시 전 보류 조건

아래 문제가 있으면 공개 출시는 보류합니다.

- 위치 권한 거부 시 앱이 중단됨
- 기록 저장/백업/복원이 실패함
- 사진 포함 기록이 복원되지 않음
- Android 저장 시트에서 기기 저장이 불가능함
- 스토어 등록정보와 실제 권한/데이터 처리가 불일치함
- 개인정보처리방침 URL이 공개 접근 불가함
- 계정 삭제 URL이 공개 접근 불가함
- Google 로그인/회원탈퇴/Supabase 권한 확인이 실패함

참고:

- Play Console 내부 테스트 안내: https://support.google.com/googleplay/android-developer/answer/9845334
- Android App Bundle 안내: https://developer.android.com/guide/app-bundle
- Play App Signing 안내: https://support.google.com/googleplay/android-developer/answer/9842756
