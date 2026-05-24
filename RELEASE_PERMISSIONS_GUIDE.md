# F-Field Release Permissions Guide

이 문서는 Play Store 출시 전 Android 권한 설명, 사용자 안내 문구, 데이터 안전성 양식 준비를 위한 초안입니다.

## 현재 AndroidManifest 권한

파일: `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

현재 직접 선언한 권한은 위 3개뿐입니다.

## 권한별 사용 목적

### 인터넷

권한:

- `android.permission.INTERNET`

사용 목적:

- VWorld 지도 타일 불러오기
- VWorld 지적도/규제지도 WMS 레이어 불러오기
- VWorld 주소 검색, 좌표 변환, 지번/도로명 주소 조회
- Esri/OpenStreetMap 등 외부 지도 타일 불러오기
- 외부 지도 앱/웹 링크 열기

사용자 설명 초안:

> 지도, 지적도, 주소 검색, 위치 정보 조회를 위해 인터넷 연결을 사용합니다.

### 위치

권한:

- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`

사용 목적:

- 현재 위치 표시
- 현재 위치로 지도 이동
- 위치 추적 버튼 사용
- GPS 트랙 기록
- 점/선/면 기록 중 현재 위치 좌표 추가
- 트랙 기록 중 현재 위치에 사진 포인트 추가
- 내 위치 공유 텍스트 생성

사용 범위:

- 앱이 켜져 있고 사용 중일 때만 위치를 사용한다.
- 백그라운드 위치 권한은 요청하지 않는다.
- 앱이 백그라운드로 가거나 화면이 꺼지면 트랙 기록이 중단될 수 있다.

사용자 설명 초안:

> 현재 위치 표시, GPS 트랙 기록, 현위치 기록, 내 위치 공유 기능을 위해 위치 권한을 사용합니다. 백그라운드 위치는 사용하지 않습니다.

## 권한을 선언하지 않는 기능

### 카메라/사진

현재 선언하지 않는 권한:

- `android.permission.CAMERA`
- `android.permission.READ_MEDIA_IMAGES`
- `android.permission.READ_EXTERNAL_STORAGE`
- `android.permission.WRITE_EXTERNAL_STORAGE`

동작 방식:

- 사진 촬영/선택은 앱이 직접 카메라나 갤러리를 읽는 방식이 아니다.
- HTML 파일 입력과 Android 시스템 선택기를 통해 사용자가 직접 고른 사진만 앱으로 전달된다.
- 선택한 사진은 기록에 첨부되어 앱 내부 데이터에 저장된다.

사용자 설명 초안:

> 사진 첨부 기능은 사용자가 직접 선택하거나 촬영한 사진만 기록에 저장합니다. 앱이 기기의 전체 사진 보관함을 임의로 읽지 않습니다.

### 파일 저장/불러오기

현재 선언하지 않는 권한:

- `android.permission.READ_EXTERNAL_STORAGE`
- `android.permission.WRITE_EXTERNAL_STORAGE`
- `android.permission.MANAGE_EXTERNAL_STORAGE`

동작 방식:

- GeoJSON/GPX/SHP 파일 불러오기는 Android 파일 선택기를 통해 사용자가 직접 선택한 파일만 읽는다.
- 기록/프로젝트/사진 저장은 Android 저장 시트 또는 공유 시트를 통해 사용자가 직접 저장 위치를 선택한다.
- 앱은 전체 파일 시스템 접근 권한을 요청하지 않는다.

사용자 설명 초안:

> 파일 불러오기와 저장은 Android 파일 선택기/저장 시트를 통해 사용자가 선택한 파일과 위치에 대해서만 수행됩니다.

## Play Console 권한 설명 초안

### 위치 권한 설명

짧은 설명:

> 현재 위치 표시와 GPS 기반 현장 기록을 위해 위치 권한을 사용합니다.

상세 설명:

> F-Field는 사용자의 현재 위치를 지도에 표시하고, GPS 트랙 기록, 현위치 기록, 내 위치 공유 기능을 제공하기 위해 위치 정보를 사용합니다. 위치 정보는 사용자가 앱을 실행해 기능을 사용하는 동안에만 처리되며, 백그라운드 위치 권한은 요청하지 않습니다.

### 데이터 수집/공유 설명 초안

현재 앱 구조 기준:

- 사용자가 생성한 기록, 메모, 사진은 기본적으로 기기 내부에 저장된다.
- 앱 자체 서버로 기록 데이터를 전송하지 않는다.
- 지도, 주소 검색, 지적 조회를 위해 VWorld 등 외부 지도/API 서비스에 요청을 보낸다.
- 외부 지도/API 요청에는 조회 좌표, 검색어, 지도 타일 요청 정보가 포함될 수 있다.

문구 초안:

> 사용자가 작성한 기록, 메모, 첨부 사진은 기본적으로 사용자의 기기 내부에 저장됩니다. F-Field는 자체 서버로 기록 데이터를 업로드하지 않습니다. 다만 지도 표시, 주소 검색, 지적 조회를 위해 VWorld 등 외부 지도/API 서비스에 지도 요청, 검색어, 좌표 정보가 전송될 수 있습니다.

## 출시 전 점검 체크리스트

- [ ] AndroidManifest에 백그라운드 위치 권한이 없는지 확인
- [ ] AndroidManifest에 카메라 권한이 없는지 확인
- [ ] AndroidManifest에 외부 저장소 전체 접근 권한이 없는지 확인
- [ ] 위치 권한 요청 시 앱 사용 중 권한으로 동작하는지 확인
- [ ] 위치 권한 거부 시 앱이 비정상 종료되지 않는지 확인
- [ ] 위치 권한 거부 시 지도 보기/파일 불러오기/기록 관리가 계속 가능한지 확인
- [ ] 사진 첨부 시 Android 시스템 선택기 또는 카메라 선택 흐름이 정상인지 확인
- [ ] 파일 저장 시 Android 저장 시트가 뜨는지 확인
- [ ] 파일 불러오기 시 사용자가 선택한 파일만 읽는지 확인
- [ ] 개인정보처리방침에 위치, 사진, 외부 지도/API 사용 설명이 들어갔는지 확인

## 현재 판단

- 현재 권한 구조는 1차 출시 기준으로 적절하다.
- 백그라운드 위치 권한을 쓰지 않으므로 Play Store 위치 심사 부담이 낮다.
- 카메라/사진/저장소 권한을 직접 요청하지 않으므로 권한 설명이 단순하다.
- 개인정보처리방침에서는 위치정보, 사진 첨부, 외부 지도/API 요청을 명확히 설명해야 한다.
