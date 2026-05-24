# F-Field Release Version Guide

이 문서는 Play Store 출시 전 버전 표기와 증가 규칙을 정리합니다.

## 현재 버전 위치

### 앱 내부 표시 버전

- 파일: `src/config.js`
- 값: `APP_VERSION = "1.0.0"`
- 용도: 앱 설정 화면의 현재 버전 표시, 웹앱 캐시 갱신 판단

### npm/Vite 프로젝트 버전

- 파일: `package.json`
- 값: `"version": "1.0.0"`
- 용도: 소스 패키지 기준 버전

### Android 앱 버전

- 파일: `android/app/build.gradle`
- 값:
  - `versionCode 100`
  - `versionName "1.0.0"`
- 용도:
  - `versionName`: 사용자에게 보이는 앱 버전
  - `versionCode`: Play Store가 업데이트 순서를 판단하는 내부 숫자

## 버전 규칙

F-Field는 `major.minor.patch` 형식을 사용합니다.

- `major`: 데이터 구조나 사용 방식이 크게 바뀌는 출시
- `minor`: 기능 추가, 화면 구조 변경, Android 권한/저장 방식 변경
- `patch`: 버그 수정, UI 세부 조정, 문구 수정

예시:

- `1.0.0` -> Play Store 첫 공개 출시 후보
- `1.0.1` -> 출시 후 버그 수정
- `1.1.0` -> 사용자 지도 같은 기능 추가
- `4.0.0` -> 데이터 저장 구조 대규모 변경

## Android versionCode 규칙

`versionCode`는 항상 이전 출시보다 커야 합니다. 한 번 Play Store에 올린 숫자는 다시 사용할 수 없습니다.

현재 규칙:

```txt
versionName 1.0.0 -> versionCode 100
versionName 1.0.1 -> versionCode 101
versionName 1.1.0 -> versionCode 110
versionName 4.0.0 -> versionCode 400
```

주의:

- Play Store에 `versionCode 100`을 올린 뒤에는 다음 버전은 반드시 `101` 이상이어야 한다.
- 같은 `versionName`이라도 내부 테스트를 다시 올릴 때 `versionCode`를 올려야 할 수 있다.
- 출시 직전에는 `src/config.js`, `package.json`, `android/app/build.gradle` 세 파일의 버전을 함께 확인한다.

## 출시 전 버전 체크리스트

- [ ] `src/config.js`의 `APP_VERSION` 확인
- [ ] `package.json`의 `version` 확인
- [ ] `android/app/build.gradle`의 `versionName` 확인
- [ ] `android/app/build.gradle`의 `versionCode`가 이전 Play Console 업로드보다 큰지 확인
- [ ] `README.md`의 최종 업데이트 버전 확인
- [ ] `CHANGELOG.md`에 변경 내역 추가
- [ ] `npm run build` 실행
- [ ] `npx cap sync android` 실행
- [ ] Android Studio 또는 Gradle로 release 빌드 생성

## 현재 결정

현재 APK 테스트 버전은 앱 내부 표시와 Android 표시를 모두 `1.0.0`으로 맞춘다.

첫 Play Store 내부 테스트 업로드도 특별한 이유가 없으면 `versionName 1.0.0`, `versionCode 100`으로 시작한다.
