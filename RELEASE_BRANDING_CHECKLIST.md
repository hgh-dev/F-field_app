# F-Field Release Branding Checklist

이 문서는 Play Store 출시 전 앱 이름, 아이콘, 스플래시 화면, 스토어 그래픽 준비 상태를 점검하기 위한 체크리스트입니다.

## 현재 앱 식별 정보

### Android 앱 이름

- 파일: `android/app/src/main/res/values/strings.xml`
- 현재값: `F-Field`
- 표시 위치: Android 홈 화면, 앱 정보, 최근 앱 화면

### Android 패키지 ID

- 파일: `capacitor.config.json`, `android/app/build.gradle`
- 현재값: `com.hghdev.ffield`
- 주의: Play Store에 올린 뒤에는 패키지 ID를 바꾸기 어렵다.

### 웹/PWA 앱 이름

- 파일: `public/manifest.json`, `public/manifest.webmanifest`
- 현재값:
  - `name`: `F-Field`
  - `short_name`: `F-Field`

## 현재 아이콘 상태

### 웹/PWA 아이콘

- `public/icon-192.png`: 192 x 192
- `public/icon-512.png`: 512 x 512

### Android 런처 아이콘

현재 Android 기본 밀도별 런처 아이콘이 생성되어 있다.

- `mipmap-mdpi`: 48 x 48
- `mipmap-hdpi`: 72 x 72
- `mipmap-xhdpi`: 96 x 96
- `mipmap-xxhdpi`: 144 x 144
- `mipmap-xxxhdpi`: 192 x 192

Android 8 이상 adaptive icon 파일도 존재한다.

- `mipmap-anydpi-v26/ic_launcher.xml`
- `mipmap-anydpi-v26/ic_launcher_round.xml`
- `drawable/ic_launcher_background.xml`
- `drawable-v24/ic_launcher_foreground.xml`

## 현재 스플래시 상태

현재 Android 스플래시 이미지는 Capacitor 기본 로고이다.

출시 전에는 F-Field 아이콘 또는 별도 스플래시 이미지로 교체하는 것을 권장한다.

점검 대상:

- [ ] 세로 화면 스플래시에서 로고가 중앙에 보이는지 확인
- [ ] 가로 화면 스플래시에서 로고가 중앙에 보이는지 확인
- [ ] 폴더블 펼친 화면에서 로고가 과하게 작거나 치우치지 않는지 확인
- [ ] 흰 배경/검정 배경 중 앱 분위기와 맞는 방향 결정
- [ ] Android 12 이상 스플래시 정책에서도 어색하지 않은지 확인

## Play Store 그래픽 준비 항목

Play Console에 필요한 대표 이미지:

- [ ] 앱 아이콘: 512 x 512 PNG
- [ ] Feature graphic: 1024 x 500 PNG 또는 JPG
- [ ] 스마트폰 스크린샷 2장 이상
- [ ] 7인치 태블릿 스크린샷 또는 폴더블 대체 이미지 검토
- [ ] 10인치 태블릿 스크린샷 필요 여부 검토

권장 스크린샷 장면:

- [ ] 위성지도 + 지적도 + 현재 위치
- [ ] 점/선/면 기록이 표시된 화면
- [ ] 기록 상세 바텀시트
- [ ] 프로젝트/기록 관리 화면
- [ ] 사진 첨부 기록 화면

## 출시 전 결정 사항

- [ ] 앱 이름을 `F-Field`로 확정
- [ ] Play Store 표시 이름을 `F-Field`로 확정
- [ ] 앱 아이콘을 현재 지도/핀 아이콘으로 확정할지 결정
- [ ] 스플래시 화면을 현재 기본 로고에서 F-Field용 이미지로 교체할지 결정
- [ ] 스토어 스크린샷에 실제 위치/개인정보가 노출되지 않도록 테스트 데이터 사용

## 현재 판단

- 앱 이름과 패키지 ID는 출시 후보로 사용할 수 있다.
- 런처 아이콘 리소스는 기본 밀도별 파일이 갖춰져 있다.
- 웹/PWA 아이콘 치수는 manifest 표기와 맞게 정리했다.
- 스플래시는 아직 Capacitor 기본 로고라 출시 전 교체 후보로 남긴다.
