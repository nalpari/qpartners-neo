# PM2 운영 가이드

## 개요

PM2를 사용하여 Next.js 앱을 프로세스 매니저로 기동하는 방법을 정리한다.

## PM2 설치

```bash
npm install -g pm2
```

## ecosystem 설정

프로젝트 루트의 `ecosystem.config.js` 파일에서 dev/prod 환경을 분리하여 관리한다.

```js
module.exports = {
  apps: [
    {
      name: "qpartners-neo-dev",
      script: "node_modules/.bin/next",
      args: "dev -p 5010",
      cwd: "/path/to/qpartners-neo", // 실제 배포 경로로 변경
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "qpartners-neo-prod",
      script: "node_modules/.bin/next",
      args: "start -p 5010",
      cwd: "/path/to/qpartners-neo", // 실제 배포 경로로 변경
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
```

## 기동 방법

### Development

```bash
pm2 start ecosystem.config.js --only qpartners-neo-dev
```

### Production

```bash
# 빌드 먼저 수행
pnpm build

# PM2로 시작
pm2 start ecosystem.config.js --only qpartners-neo-prod
```

## 주요 명령어

| 명령어 | 용도 |
|--------|------|
| `pm2 start ecosystem.config.js --only <name>` | 특정 앱 시작 |
| `pm2 stop <name>` | 중지 |
| `pm2 restart <name>` | 재시작 |
| `pm2 delete <name>` | 프로세스 제거 |
| `pm2 status` | 전체 상태 확인 |
| `pm2 logs <name>` | 로그 확인 |
| `pm2 save && pm2 startup` | 서버 재부팅 시 자동 시작 등록 |

## 참고 사항

- PM2 prod 모드는 `next start`로 실행되므로 반드시 `pnpm build`를 먼저 수행해야 한다.
- dev 모드는 `next dev`로 실행되며 HMR(Hot Module Replacement)이 동작한다.
- `next.config.ts`에 `output: "standalone"` 설정이 있으면 `.next/standalone/server.js`를 직접 실행하는 방식도 가능하다.
- ecosystem 설정 파일을 `ecosystem.dev.config.js`, `ecosystem.prod.config.js`로 분리하는 것도 가능하나, 한 파일에서 `--only` 옵션으로 선택 기동하는 방식이 관리에 편리하다.
