import type { OpenAPIV3 } from "openapi-types";
import { userTpValues } from "@/lib/schemas/common";

const errorResponse = (description: string): OpenAPIV3.ResponseObject => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
});

const validationErrorResponse: OpenAPIV3.ResponseObject = {
  description: "Validation failed",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
    },
  },
};

export const openApiSpec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Q.PARTNERS API",
    version: "1.0.0",
    description: "Q.PARTNERS REST API — 인증, 공통코드, 카테고리, 메뉴, 권한, 홈화면공지, 콘텐츠, 마이페이지 관리",
  },
  servers: [{ url: "/api", description: "Local API" }],

  tags: [
    { name: "Auth", description: "인증 (로그인/로그아웃/사용자 정보)" },
    { name: "TwoFactor", description: "2차 인증 (이메일 인증번호)" },
    { name: "CodeHeader", description: "공통코드 헤더 관리" },
    { name: "CodeDetail", description: "공통코드 상세 관리" },
    { name: "Category", description: "카테고리 관리 (2Depth 트리)" },
    { name: "Menu", description: "메뉴 관리 (2레벨 트리)" },
    { name: "Role", description: "역할(권한) 관리" },
    { name: "Permission", description: "메뉴별 CRUD 권한 관리" },
    { name: "HomeNotice", description: "홈화면 공지 관리" },
    { name: "Content", description: "콘텐츠 관리 (CRUD + 첨부파일)" },
    { name: "DownloadLog", description: "다운로드 이력 조회" },
    { name: "MyPage", description: "마이페이지 (프로필/비밀번호/탈퇴/시공점)" },
    { name: "Member", description: "회원관리 (관리자 전용)" },
    { name: "MassMail", description: "대량메일 발송 (관리자 전용)" },
    { name: "Master", description: "QSP 마스터 데이터 (부서 등)" },
  ],

  paths: {
    // ─── Auth ───
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "로그인 (QSP 프록시)",
        description: `QSP 외부 로그인 API를 프록시하여 인증 처리. 성공 시 JWT httpOnly 쿠키 설정.

**테스트 계정:**
| 유형 | ID | PW | userTp |
|------|-----|------|--------|
| 관리자 | 1301011 | 1234 | ADMIN |
| 1차 판매점 | T01 | 1234 | STORE |
| 2차 판매점 | 201T01 | 1234 | STORE |
| 일반 | test1 | 1234 | GENERAL |`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "로그인 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/LoginUser" },
                        {
                          type: "object",
                          properties: {
                            _twoFactorReason: {
                              type: "string",
                              enum: [
                                "DISABLED_BY_ADMIN",
                                "PWD_INIT_PRIORITY",
                                "FIRST_TIME_REQUIRED",
                                "EXPIRED_REQUIRED",
                                "WITHIN_VALIDITY",
                                "FAIL_CLOSED",
                              ],
                              description:
                                "2FA 판정 사유 — NODE_ENV === 'development' 일 때만 노출되는 진단 메타. production 미노출.",
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthValidationErrorResponse" },
              },
            },
          },
          "401": errorResponse("아이디 또는 비밀번호가 올바르지 않습니다"),
          "403": errorResponse("2FA 대상이나 이메일 미등록 — 로그인 차단"),
          "502": errorResponse("외부 인증 서버 오류"),
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "로그아웃",
        description: "인증 쿠키를 삭제하여 세션 종료.",
        responses: {
          "200": {
            description: "로그아웃 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string", example: "로그아웃 되었습니다" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/auth/auto-login/inbound": {
      get: {
        tags: ["Auth"],
        summary: "외부 3사 → Q.Partners-neo 자동로그인 진입 (SSO inbound)",
        description: `HANASYS DESIGN / Q.Order / Q.Musubi 에서 Q.Partners-neo 로 유입 시 자동로그인 진입 라우트.

외부 3사가 자체 AES-128-CBC 암호화로 cipher 를 만든 뒤 브라우저를 이 URL 로 리다이렉트하면,
서버가 cipher 를 복호화해 userId 를 얻고 QSP userDetail 로 사용자 정보를 조회한 뒤
**Q.Partners-neo 자체 JWT 를 서명·발급**하여 세션 쿠키를 설정한다.
(QSP 로그인 API 는 호출하지 않음 — QSP v1.0 은 자동로그인 모드 미지원이므로 cipher 소유 자체를 인증 증명으로 간주.)

**cipher 규격 (2026-04-30 outbound 사양과 통일):**
- 알고리즘: AES-128-CBC, PKCS5/PKCS7 Padding
- 키: \`AUTO_LOGIN_INBOUND_AES_KEY\` 환경변수 — UTF-8 raw 16 byte (해싱·날짜 결합 없음). outbound 키와 분리 운영하여 침해 시 영향 격리.
- IV: \`UTF-8(\\\`\${YYYYMMDD_KST}_autoL!!\\\`)\` — 16 byte 결정적 IV (8+8). outbound 와 동일 상수.
- 출력: \`Base64(ciphertext)\` → \`encodeURIComponent\` (IV prepend 없음 — 수신측이 재구성)
- 자정 경계: 서버는 당일 IV 실패 시 전일 IV 로 재시도

**응답:**
- 성공: \`302\` → \`/\` (Set-Cookie 로 JWT 전파, 자동로그인은 2FA 스킵. SUPER_ADMIN 은 거부, ADMIN 은 2FA 강제)
- 실패: \`302\` → \`/login?error=auto_login_failed\` (쿼리 검증·Rate Limit·복호화·QSP userDetail·계정상태·authRole·JWT 중 실패)
- 설정 오류: \`500\` (AUTO_LOGIN_INBOUND_AES_KEY 미설정 또는 16 byte 길이 불일치)

**보안 방어:**
- Rate Limit: IP 기반 20/분, IP 미식별 시 즉시 거부 (fail-closed).
- Open Redirect 방어: \`request.url\` 기반 리다이렉트 금지 — \`SITE_URL\` env / \`SITE_DEFAULTS.url\` 을 base 로 고정
- 계정 상태: \`statCd === "A"\` 만 허용 (삭제/탈퇴 차단)
- 고권한 계정: SUPER_ADMIN 자동로그인 거부, ADMIN 은 감사 로그 후 허용 (twoFactorVerified=false 로 2FA 강제)
- userTp 교차 검증: cipher 평문은 userId 단독 → 쿼리 \`userTp\` 와 QSP 응답 \`userTp\` 일치 검증 (변조 방어)

**받아들인 위험 (2026-04-30 결정):**
- 결정적 IV 사양상 같은 사용자·같은 날 cipher 가 동일 → 24h 내 cipher 재사용 가능. inbound 1회용 소진 차단을 두지 않음 (외부 3사 inbound 정책과 통일).`,
        parameters: [
          {
            name: "autoLoginParam1",
            in: "query",
            required: true,
            description: "URL 인코딩된 Base64(AES-128-CBC ciphertext). IV prepend 없음 — 수신측이 키와 KST 일자 규칙으로 동일 IV(`YYYYMMDD_autoL!!`) 재구성. 복호화 시 userId 문자열이 나와야 함.",
            schema: { type: "string" },
          },
          {
            name: "userTp",
            in: "query",
            required: true,
            description: "QSP 사용자 유형 — cipher 가 userId 단독이므로 userTp 는 별도 쿼리로 전달. 변조 시 QSP 인증 단계에서 차단됨.",
            schema: { type: "string", enum: [...userTpValues] },
          },
        ],
        responses: {
          "302": {
            description: "자동로그인 성공 시 홈(/) 또는 실패 시 /login?error=auto_login_failed 로 리다이렉트 (302 Found, SSO 폴백 의도)",
            headers: {
              Location: {
                schema: { type: "string" },
                description: "리다이렉트 대상 URL (SITE_URL/SITE_DEFAULTS.url base — Host 헤더 조작 방어)",
              },
              "Set-Cookie": {
                schema: { type: "string" },
                description: "성공 시에만 JWT httpOnly 쿠키 전파",
              },
            },
          },
          "500": errorResponse("서버 설정 오류 (AUTO_LOGIN_INBOUND_AES_KEY 미설정 또는 16 byte 길이 불일치, JWT_SECRET 미설정 등)"),
        },
      },
    },
    "/auth/auto-login/encrypt": {
      post: {
        tags: ["Auth"],
        summary: "자동로그인 암호화 URL 생성 (outbound)",
        description:
          "로그인 사용자의 userId를 암호화하여 대상 시스템(HANASYS DESIGN / Q.Order / Q.Musubi)의 자동로그인 이동 URL을 반환. 인증 필수. Q.Partners 가 직접 KST 일자 기반 시간 제한 cipher 를 발급. 3사 동일 사양 — 동일 사용자라면 3사 cipher 일치. Q.Partners 가 target 별 고유 도메인의 `?autoLoginParam1=` 에 부착하여 반환. 반환 URL 예시: hanasys=`https://dev.hanasys.jp/login?autoLoginParam1=...`, qOrder=`https://q-order-dev.q-cells.jp/eos/login/autoLogin?autoLoginParam1=...`, qMusubi=`https://q-musubi-dev.q-cells.jp/qm/login/autoLogin?autoLoginParam1=...`.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["target"],
                properties: {
                  target: {
                    type: "string",
                    enum: ["hanasys", "qOrder", "qMusubi"],
                    description: "이동 대상 시스템",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "암호화 URL 생성 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        url: {
                          type: "string",
                          description:
                            "자동로그인 파라미터가 포함된 이동 URL. target 별 host: hanasys=www.hanasys.jp(prod)/dev.hanasys.jp(dev), qOrder=q-order(-dev).q-cells.jp, qMusubi=q-musubi(-dev).q-cells.jp",
                        },
                      },
                    },
                  },
                },
                examples: {
                  hanasys: {
                    summary: "HANASYS DESIGN",
                    value: {
                      data: {
                        url: "https://www.hanasys.jp/login?autoLoginParam1=...",
                      },
                    },
                  },
                  qOrder: {
                    summary: "Q.Order",
                    value: {
                      data: {
                        url: "https://q-order-dev.q-cells.jp/eos/login/autoLogin?autoLoginParam1=...",
                      },
                    },
                  },
                  qMusubi: {
                    summary: "Q.Musubi",
                    value: {
                      data: {
                        url: "https://q-musubi-dev.q-cells.jp/qm/login/autoLogin?autoLoginParam1=...",
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description:
              "リクエスト形式または target パラメータが不適格. route handler 는 케이스별로 메시지를 분리해 반환 (examples 참조).",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  bodyParseFail: {
                    summary: "Request body JSON 파싱 실패",
                    value: { error: "リクエスト形式が正しくありません" },
                  },
                  targetInvalid: {
                    summary: "target enum 검증 실패",
                    value: { error: "targetパラメータが正しくありません" },
                  },
                },
              },
            },
          },
          "401": errorResponse("認証が必要です"),
          "500": {
            description:
              "サーバーエラー — 暗号化設定不備 / リダイレクトURL組立失敗 / 予期しない例外を含む統合分類.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  configError: {
                    summary: "暗号化設定エラー",
                    value: { error: "サーバー設定エラーが発生しました" },
                  },
                  assemblyFail: {
                    summary: "redirect URL 조립 실패",
                    value: { error: "リダイレクトURLの生成に失敗しました" },
                  },
                  unexpected: {
                    summary: "예상치 못한 에러",
                    value: { error: "サーバーエラーが発生しました" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/auth/login-user-info": {
      get: {
        tags: ["Auth"],
        summary: "현재 로그인 사용자 정보",
        description: "JWT 쿠키에서 현재 로그인한 사용자 정보를 반환.",
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/LoginUser" },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증되지 않은 사용자입니다"),
        },
      },
    },
    "/auth/me/permissions": {
      get: {
        tags: ["Auth"],
        summary: "현재 로그인 사용자의 메뉴별 권한 목록",
        description: `현재 로그인 사용자의 menuCode 별 CRUD 권한을 반환. FE의 \`useMenuPermission(menuCode)\` 훅 소비용.

- 인증 필요 (미인증 시 401)
- \`authRole\` ↔ \`roleCode\` 1:1 매핑이므로 JWT authRole 값을 그대로 roleCode 로 사용
- \`SUPER_ADMIN\`: 활성 메뉴 전체에 모든 CRUD \`true\` 합성 반환 (QpRoleMenuPermission 조회 스킵, fail-open)
- 그 외: 활성 메뉴에 한해 \`QpRoleMenuPermission\` 조회. 시드 미등록 메뉴는 응답에서 제외 (fail-closed)
- 응답 body 는 \`{ data: { menus } }\` 만 포함 — \`roleCode\` 등 RBAC 내부 식별자는 노출하지 않음 (정찰 차단)
- 응답 헤더: \`Cache-Control: private, no-store\` (권한 회수 즉시성 보장)`,
        responses: {
          "200": {
            description: "조회 성공",
            headers: {
              "Cache-Control": {
                description: "개인별 권한 + 즉시성 확보를 위한 no-store",
                schema: { type: "string", example: "private, no-store" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      required: ["menus"],
                      properties: {
                        menus: {
                          type: "array",
                          items: {
                            type: "object",
                            required: ["menuCode", "canRead", "canCreate", "canUpdate", "canDelete"],
                            properties: {
                              menuCode: { type: "string", example: "ADM_MEMBER" },
                              canRead: { type: "boolean" },
                              canCreate: { type: "boolean" },
                              canUpdate: { type: "boolean" },
                              canDelete: { type: "boolean" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("認証が必要です"),
          "403": errorResponse("2段階認証が必要です"),
          "500": errorResponse("権限の取得に失敗しました"),
        },
      },
    },

    "/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "일반 회원가입 (QSP 프록시)",
        description: "QSP newUserReq I/F를 프록시하여 일반회원 가입 처리. 성공 시 승인완료 메일 발송.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SignupRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "가입 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        userName: { type: "string", example: "山田太郎" },
                        email: { type: "string", example: "user@example.com" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthValidationErrorResponse" },
              },
            },
          },
          "409": errorResponse("이미 사용중인 이메일입니다"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },
    "/auth/password-reset/request": {
      post: {
        tags: ["Auth"],
        summary: "비밀번호 초기화 요청 (메일 발송)",
        description: "이메일로 비밀번호 변경 링크를 발송. 시간당 3건 초과 시 429 반환. 회원 미존재 시 404 반환 (Issue #2156).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PasswordResetRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "요청 접수 (이메일 발송)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string", example: "パスワード変更リンクをメールで送信しました。" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("입력값 검증 실패 — 회원 미존재와 동일한 일본어 메시지로 통일 (Issue #2156)"),
          "404": errorResponse("일치하는 회원 정보 없음 (一致する会員情報がありません。入力情報を再度ご確認ください。)"),
          "429": errorResponse("요청 횟수 초과 (시간당 3건)"),
          "500": errorResponse("서버 오류 (메일 발송 실패 포함)"),
          "502": errorResponse("외부 서버 연결 실패"),
        },
      },
    },
    "/auth/password-reset/verify": {
      post: {
        tags: ["Auth"],
        summary: "비밀번호 초기화 토큰 검증",
        description: "메일 링크의 토큰이 유효한지 확인. 만료(1시간) 또는 사용 완료된 토큰은 거부.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PasswordResetVerify" },
            },
          },
        },
        responses: {
          "200": {
            description: "토큰 유효",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        valid: { type: "boolean", example: true },
                        email: {
                          type: "string",
                          example: "c***@interplug.co.kr",
                          description: "마스킹된 이메일 — popup read-only 표시용. 토큰 탈취 시 평문 enumerate 차단을 위해 maskEmail 적용.",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("유효하지 않거나 만료된 링크입니다."),
          "429": errorResponse("リクエストが多すぎます。しばらく経ってから再度お試しください。"),
          "500": errorResponse("サーバーエラーが発生しました。"),
        },
      },
    },
    "/auth/password-reset/confirm": {
      post: {
        tags: ["Auth"],
        summary: "비밀번호 변경 확정 + 자동 로그인",
        description: "토큰 검증 후 QSP 비밀번호 변경 API 호출. 성공 시 JWT 쿠키 설정하여 자동 로그인.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PasswordResetConfirm" },
            },
          },
        },
        responses: {
          "200": {
            description: "비밀번호 변경 성공 + 자동 로그인",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string", example: "저장되었습니다." },
                        user: { $ref: "#/components/schemas/LoginUser" },
                        requireTwoFactor: { type: "boolean", example: false, description: "비밀번호 초기화 후 로그인은 2차 인증 불필요" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation failed 또는 토큰 만료/사용완료",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthValidationErrorResponse" },
              },
            },
          },
          "500": errorResponse("비밀번호 변경 실패"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },

    "/auth/password-init": {
      post: {
        tags: ["Auth"],
        summary: "세션 기반 비밀번호 변경 (판매점 최초 로그인용)",
        description: "JWT 인증 상태에서 비밀번호 변경. 최초 로그인(twoFactorVerified=false) 상태에서만 호출 가능. 회원정보 설정 팝업(p.12)에서 호출. 성공 시 JWT 재발급 (twoFactorVerified=true).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["newPassword", "confirmPassword"],
                properties: {
                  newPassword: { type: "string", minLength: 8, maxLength: 100, description: "신규 비밀번호 (영대문자+영소문자+숫자 조합 8자 이상)" },
                  confirmPassword: { type: "string", description: "신규 비밀번호 재입력" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "비밀번호 변경 성공 + JWT 재발급",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string", example: "保存されました。" },
                        user: { $ref: "#/components/schemas/LoginUser" },
                        requireTwoFactor: { type: "boolean", example: false },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation failed (비밀번호 정책 미충족 또는 불일치)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthValidationErrorResponse" },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("初回ログイン時のみ有効 (twoFactorVerified=true 시 거부)"),
          "429": errorResponse("요청 횟수 초과"),
          "500": errorResponse("비밀번호 변경 실패"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },

    "/auth/email/check": {
      post: {
        tags: ["Auth"],
        summary: "이메일 중복 체크",
        description:
          "QSP /user/detail 을 loginId / email 두 키로 병렬 조회하여 BC_QP_USER 의 user_id, e_mail 컬럼 양쪽 매칭. " +
          "한쪽이라도 hit 또는 다건(TooManyResults) 신호면 409. 양쪽 모두 미존재여야 사용 가능. PII 보호를 위해 POST 사용.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email", example: "user@example.com" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "사용 가능",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        available: { type: "boolean", example: true },
                        message: { type: "string", example: "사용 가능한 이메일입니다" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("유효한 이메일 주소를 입력해주세요"),
          "409": errorResponse("이미 사용중인 이메일입니다"),
          "429": errorResponse("요청 횟수 초과"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },

    // ─── TwoFactor ───
    "/auth/two-factor/send": {
      post: {
        tags: ["TwoFactor"],
        summary: "2차 인증번호 발송",
        description: "로그인 후 2차 인증이 필요한 경우 이메일로 6자리 인증번호 발송. JWT 쿠키 필요.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TwoFactorSendRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "발송 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string", example: "인증번호가 발송되었습니다." },
                        expiresIn: { type: "integer", example: 600, description: "만료시간 (초)" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("이메일 정보가 없어 인증번호를 발송할 수 없습니다"),
          "401": errorResponse("인증이 필요합니다"),
          "500": errorResponse("서버 오류"),
        },
      },
    },
    "/auth/two-factor/verify": {
      post: {
        tags: ["TwoFactor"],
        summary: "2차 인증번호 검증",
        description: "발송된 6자리 인증번호 검증. 성공 시 JWT 재발행 (twoFactorVerified: true) + QSP 2차인증 일시 갱신.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TwoFactorVerifyRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "검증 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        verified: { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증번호가 일치하지 않습니다 / 입력시간 초과"),
          "500": errorResponse("서버 오류"),
        },
      },
    },
    // ─── CodeHeader ───
    "/codes": {
      get: {
        tags: ["CodeHeader"],
        summary: "Header 목록 조회",
        parameters: [
          {
            name: "keyword",
            in: "query",
            description: "headerCode, headerName 검색",
            schema: { type: "string" },
          },
          {
            name: "activeOnly",
            in: "query",
            description: "활성만 조회 (기본 true, 비활성 포함시 false)",
            schema: { type: "string", default: "true" },
          },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CodeHeader" },
                    },
                  },
                },
              },
            },
          },
          "500": errorResponse("서버 에러"),
        },
      },
      post: {
        tags: ["CodeHeader"],
        summary: "Header 등록",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCodeHeader" },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/CodeHeader" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "409": errorResponse("이미 존재하는 headerCode"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/codes/{id}": {
      get: {
        tags: ["CodeHeader"],
        summary: "Header 단건 조회 (details 포함)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/CodeHeader" },
                        {
                          type: "object",
                          properties: {
                            details: {
                              type: "array",
                              items: {
                                $ref: "#/components/schemas/CodeDetail",
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("Invalid ID"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
      put: {
        tags: ["CodeHeader"],
        summary: "Header 수정 (headerCode 수정 불가)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateCodeHeader" },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/CodeHeader" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    // ─── Menu ───
    "/menus": {
      get: {
        tags: ["Menu"],
        summary: "메뉴 트리 목록 조회",
        parameters: [
          {
            name: "activeOnly",
            in: "query",
            description: "활성만 조회 (기본 true)",
            schema: { type: "string", default: "true" },
          },
        ],
        responses: {
          "200": {
            description: "조회 성공 (1-Level + children 트리)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/MenuTree" },
                    },
                  },
                },
              },
            },
          },
          "500": errorResponse("서버 에러"),
        },
      },
      post: {
        tags: ["Menu"],
        summary: "메뉴 등록",
        description:
          "parentId=null이면 1-Level, parentId 지정 시 2-Level. 3레벨 이상 불가. sortOrder 미지정 시 같은 parentId 그룹의 max(sortOrder)+1 로 자동 부여됩니다.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateMenu" },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Menu" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "404": errorResponse("상위 메뉴가 존재하지 않습니다"),
          "409": errorResponse("이미 존재하는 menuCode"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/menus/{id}": {
      put: {
        tags: ["Menu"],
        summary: "메뉴 수정 (menuCode 수정 불가)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateMenu" },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Menu" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
      delete: {
        tags: ["Menu"],
        summary: "메뉴 삭제 (SUPER_ADMIN 전용, 하위 메뉴는 cascade 삭제)",
        description:
          "ADM_MENU.delete 권한 필요. 하위 메뉴(children)가 있으면 함께 삭제(cascade). 손자(grandchildren) 가 발견되면 409 반환 (schema 우회/직접 DB 입력으로 2-level 제한 깨진 경우 운영자 인지 후 수동 정리 유도). 권한 매트릭스(QpRoleMenuPermission) 행은 대상 + 자식 menuCode 모두 동일 interactive transaction 에서 선삭제. 같은 parentId 그룹 형제 행의 sortOrder 는 삭제 직후 1..N 으로 자동 재번호. 조회 + 변경이 모두 트랜잭션 내부에서 일어나 TOCTOU race 차단. 응답 deletedChildren 은 cascade 된 자식 수, resequenced 는 실제 sortOrder 가 변경된 형제 수.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": {
            description: "삭제 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "integer", example: 12 },
                        deletedChildren: { type: "integer", example: 3 },
                        resequenced: { type: "integer", example: 2 },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("ID 형식 오류"),
          "403": errorResponse("권한 없음"),
          "404": errorResponse("Not found"),
          "409": errorResponse("손자 메뉴 존재 (depth violation)"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/menus/sort": {
      put: {
        tags: ["Menu"],
        summary: "정렬순서 일괄 저장",
        description:
          "요청 items 의 parentId 그룹(들)에 속한 모든 형제 row 를 대상으로 sortOrder 오름차순 정렬 후 1..N 으로 재번호하여 저장합니다. 요청에 포함되지 않은 형제 row 는 현재 sortOrder 를 유지한 채 정렬에만 참여하여 부분 전송에서도 중복/공백이 발생하지 않습니다. 동일 sortOrder 충돌 시 이동 방향(위로 이동 앞, 아래로 이동 뒤) + 요청 row 우선 + 요청 배열 순서(stable) 로 결정합니다. 요청 parentId 그룹 밖의 row 는 건드리지 않습니다. 응답 updated 는 실제 sortOrder 가 변경된 row 수입니다.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SortMenu" },
            },
          },
        },
        responses: {
          "200": {
            description: "일괄 저장 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        updated: { type: "integer", example: 3 },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "500": errorResponse("서버 에러"),
        },
      },
    },

    // ─── Role & Permission ───
    "/roles": {
      get: {
        tags: ["Role"],
        summary: "역할 목록 조회",
        parameters: [
          {
            name: "activeOnly",
            in: "query",
            description: "활성만 조회 (기본 true)",
            schema: { type: "string", default: "true" },
          },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Role" },
                    },
                  },
                },
              },
            },
          },
          "500": errorResponse("서버 에러"),
        },
      },
      post: {
        tags: ["Role"],
        summary: "역할 추가",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateRole" },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Role" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "409": errorResponse("이미 존재하는 roleCode"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/roles/{roleCode}": {
      put: {
        tags: ["Role"],
        summary: "역할 수정 (roleCode 수정 불가)",
        parameters: [
          {
            name: "roleCode",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: ["SUPER_ADMIN", "ADMIN", "1ST_STORE", "2ND_STORE", "SEKO", "GENERAL"],
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateRole" },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Role" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/roles/{roleCode}/permissions": {
      get: {
        tags: ["Permission"],
        summary: "메뉴별 권한 조회",
        description: "전체 메뉴(2레벨) 목록 + 해당 roleCode의 CRUD 권한 매핑",
        parameters: [
          {
            name: "roleCode",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: ["SUPER_ADMIN", "ADMIN", "1ST_STORE", "2ND_STORE", "SEKO", "GENERAL"],
            },
          },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/RolePermissions" },
                  },
                },
              },
            },
          },
          "400": errorResponse("無効な権限コードです"),
          "401": errorResponse("認証が必要です"),
          "403": errorResponse("2段階認証が必要です"),
          "404": errorResponse("指定された権限が見つかりません"),
          "500": errorResponse("権限の取得に失敗しました"),
        },
      },
      put: {
        tags: ["Permission"],
        summary: "메뉴별 권한 일괄 저장 (SUPER_ADMIN 전용)",
        description: `payload 에 포함된 menuCode 만 upsert (replace 아님). 나머지 menuCode 는 기존 값 유지.
트랜잭션으로 묶여 부분 실패 시 전체 롤백. \`created_at\` / \`created_by\` 는 기존 행에서 보존.

**권한**: SUPER_ADMIN 전용. ADMIN 은 GET 만 가능.

**menuCode 검증 (2단)**:
- Zod 형식 검증: \`^[A-Z][A-Z0-9_]{0,49}$\` (+ max 50). 메뉴관리 UI 에서 신규 등록한 menuCode(예: TEST2) 도 통과.
- DB 존재성 검증: \`qp_menus\` 일괄 findMany. 미존재 코드 포함 시 400 + \`{ error, unknownMenuCodes: string[] }\`.
- FK 경합: 사전 검증과 upsert 사이에 메뉴가 삭제되면 P2003 → 400 + 재시도 안내.

**Lockout 방어 (3중화)**:
1. target = \`SUPER_ADMIN\` + payload 에 \`{ menuCode: "ADM_PERMISSION", canUpdate: false }\` 포함 → 400 (self-demotion 차단)
2. target = \`SUPER_ADMIN\` + payload 에 \`ADM_PERMISSION\` / \`ADM_MENU\` / \`ADM_CODE\` 중 \`canRead: false\` 포함 → 400 (관리 페이지 접근 불가 → 복구 불가 차단)
3. target ≠ \`SUPER_ADMIN\` + payload 에 \`ADM_PERMISSION\` / \`ADM_MENU\` / \`ADM_CODE\` 의 canCreate|canUpdate|canDelete 중 하나라도 true 포함 → 400

세 lockout 거부 모두 응답 바디에 \`{ error, menuCode, action }\` 구조 (action ∈ {read, create, update, delete}).`,
        parameters: [
          {
            name: "roleCode",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: ["SUPER_ADMIN", "ADMIN", "1ST_STORE", "2ND_STORE", "SEKO", "GENERAL"],
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdatePermissions" },
            },
          },
        },
        responses: {
          "200": {
            description: "일괄 저장 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        roleCode: { type: "string", example: "ADMIN" },
                        updated: { type: "integer", example: 5 },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "バリデーションエラー / 未存在 menuCode / FK 경합 / Lockout 가드 거부",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/ValidationErrorResponse" },
                    {
                      type: "object",
                      required: ["error", "unknownMenuCodes"],
                      description: "DB 에 존재하지 않는 menuCode 가 payload 에 포함",
                      properties: {
                        error: {
                          type: "string",
                          example: "存在しないメニューコードが含まれています",
                        },
                        unknownMenuCodes: {
                          type: "array",
                          items: { type: "string" },
                          example: ["TEST_GHOST"],
                        },
                      },
                    },
                    {
                      type: "object",
                      required: ["error"],
                      description: "P2003 FK 경합 — 사전 검증과 upsert 사이에 메뉴가 삭제됨",
                      properties: {
                        error: {
                          type: "string",
                          example: "対象のメニューが削除されました。メニュー管理を更新して再試行してください",
                        },
                      },
                    },
                    {
                      type: "object",
                      required: ["error", "menuCode", "action"],
                      description: "Lockout 가드 3단 중 하나에 의해 거부",
                      properties: {
                        error: {
                          type: "string",
                          example: "「ADM_PERMISSION」のupdate権限はスーパー管理者にのみ付与できます",
                        },
                        menuCode: {
                          type: "string",
                          enum: ["ADM_PERMISSION", "ADM_MENU", "ADM_CODE"],
                          example: "ADM_PERMISSION",
                        },
                        action: {
                          type: "string",
                          enum: ["read", "create", "update", "delete"],
                          example: "update",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": errorResponse("認証が必要です"),
          "403": errorResponse("スーパー管理者権限が必要です"),
          "404": errorResponse("指定された権限が見つかりません"),
          "500": errorResponse("権限の更新に失敗しました"),
        },
      },
    },

    // ─── HomeNotice ───
    "/home-notices": {
      get: {
        tags: ["HomeNotice"],
        summary: "홈화면 공지 목록 (관리자용)",
        parameters: [
          { name: "keyword", in: "query", description: "공지내용(content) Like 검색", schema: { type: "string" } },
          { name: "status", in: "query", description: "scheduled/active/ended (콤마 구분)", schema: { type: "string" } },
          { name: "targetType", in: "query", description: "게시대상 필터 — 단일 또는 콤마 구분 멀티 선택 (super_admin/admin/first_store/second_store/seko/general). 멀티는 OR 매칭", schema: { type: "string" } },
          { name: "createdBy", in: "query", description: "등록자 Like 검색 (createdBy 부분 일치)", schema: { type: "string" } },
          { name: "startDate", in: "query", description: "등록일 시작 (YYYY-MM-DD)", schema: { type: "string" } },
          { name: "endDate", in: "query", description: "등록일 종료 (YYYY-MM-DD)", schema: { type: "string" } },
          { name: "page", in: "query", description: "페이지 번호 (1부터)", schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "pageSize", in: "query", description: "페이지 크기 (최대 100)", schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/HomeNoticeListItem" },
                    },
                    meta: { $ref: "#/components/schemas/PaginationMeta" },
                  },
                },
              },
            },
          },
          "500": errorResponse("서버 에러"),
        },
      },
      post: {
        tags: ["HomeNotice"],
        summary: "홈화면 공지 등록",
        description: "게시대상 최소 1개 필수. 활성(예정 포함) 공지 5개 초과 시 등록 불가.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateHomeNotice" },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/HomeNotice" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/home-notices/{id}": {
      get: {
        tags: ["HomeNotice"],
        summary: "홈화면 공지 단건 조회",
        description: "관리자 전용 — 공지 상세 정보 조회",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/HomeNoticeDetail" },
                  },
                },
              },
            },
          },
          "400": errorResponse("Invalid ID"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
      put: {
        tags: ["HomeNotice"],
        summary: "홈화면 공지 수정",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateHomeNotice" },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/HomeNotice" },
                  },
                },
              },
            },
          },
          "400": errorResponse("검증 실패 또는 동일기간 5건 초과"),
          "404": errorResponse("공지 없음"),
          "500": errorResponse("서버 에러"),
        },
      },
      delete: {
        tags: ["HomeNotice"],
        summary: "홈화면 공지 삭제 (물리 삭제)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": {
            description: "삭제 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { id: { type: "integer", example: 1 } },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("Invalid ID"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/home-notices/bulk-delete": {
      post: {
        tags: ["HomeNotice"],
        summary: "홈화면 공지 일괄 삭제 (물리 삭제, all-or-nothing)",
        description:
          "선택한 공지들을 한 번에 삭제. 요청한 ID 중 하나라도 미존재 또는 권한 부족 시 전체 거부 (어느 것도 삭제하지 않음). 권한 모델은 단건 DELETE 와 동일.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["ids"],
                properties: {
                  ids: {
                    type: "array",
                    items: { type: "integer", minimum: 1 },
                    minItems: 1,
                    maxItems: 100,
                    description: "삭제 대상 공지 ID 배열 (최대 100건)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "일괄 삭제 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        deletedCount: { type: "integer", example: 3 },
                        ids: { type: "array", items: { type: "integer" } },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("입력 검증 실패 (빈 배열 / 100건 초과 등)"),
          "403": errorResponse("일부 공지에 대한 삭제 권한 없음 (deniedIds 포함)"),
          "404": errorResponse("일부 공지가 존재하지 않음 (missingIds 포함)"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/home-notices/active": {
      get: {
        tags: ["HomeNotice"],
        summary: "홈화면용 활성 공지 (비회원 접근 가능)",
        description: "현재 시각 기준 활성 공지 중 사용자 역할에 해당하는 것만 반환. 비회원은 targetGeneral만.",
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ActiveHomeNotice" },
                    },
                  },
                },
              },
            },
          },
          "500": errorResponse("서버 에러"),
        },
      },
    },

    // ─── Content ───
    "/contents": {
      get: {
        tags: ["Content"],
        summary: "콘텐츠 목록 조회",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "keyword", in: "query", schema: { type: "string" } },
          { name: "categoryIds", in: "query", description: "콤마 구분 카테고리 ID", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["draft", "published", "deleted"], default: "published" } },
          { name: "targetType", in: "query", schema: { type: "string" } },
          { name: "department", in: "query", schema: { type: "string" } },
          {
            name: "internalOnly",
            in: "query",
            description:
              "사내회원 전용 게시글만 조회 여부.\n- 사내 사용자(ADMIN): true 시 외부 게시대상이 없는(사내회원 전용) 게시글만 반환. targetType 파라미터는 무시됨.\n- 비사내 사용자: 파라미터 값과 무관하게 사내전용 카테고리는 항상 제외 (bypass 불가).",
            schema: { type: "boolean", default: false },
          },
          { name: "sort", in: "query", schema: { type: "string", enum: ["newest", "oldest", "views", "updated"], default: "newest" } },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ContentListItem" },
                    },
                    meta: {
                      type: "object",
                      properties: {
                        total: { type: "integer" },
                        page: { type: "integer" },
                        pageSize: { type: "integer" },
                        totalPages: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "500": errorResponse("서버 에러"),
        },
      },
      post: {
        tags: ["Content"],
        summary: "콘텐츠 등록 (관리자)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string", maxLength: 500 },
                  body: { type: "string" },
                  status: { type: "string", enum: ["draft", "published"], default: "draft" },
                  publishedAt: { type: "string", format: "date-time" },
                  authorDepartment: { type: "string", maxLength: 100 },
                  approverLevel: { type: "integer", minimum: 0, maximum: 127 },
                  targets: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["targetType"],
                      properties: {
                        targetType: { type: "string", enum: ["first_store", "second_store", "seko", "general", "non_member"] },
                        startAt: { type: "string", format: "date-time" },
                        endAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                  categoryIds: { type: "array", items: { type: "integer" } },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/ContentDetailItem" } },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "403": errorResponse("メニュー権限がありません (RBAC: CONTENT.create)"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/contents/{id}": {
      get: {
        tags: ["Content"],
        summary: "콘텐츠 상세 조회 (조회수 자동 증가)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/ContentDetailItem" } },
                },
              },
            },
          },
          "403": errorResponse("접근 권한 없음"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
      put: {
        tags: ["Content"],
        summary: "콘텐츠 수정 (관리자, 권한 세분화)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "200": {
            description: "수정 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { $ref: "#/components/schemas/ContentDetailItem" } },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "403": errorResponse("メニュー権限 または 編集権限がありません (RBAC: CONTENT.update)"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
      delete: {
        tags: ["Content"],
        summary: "콘텐츠 삭제 (soft delete, 관리자)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": { description: "삭제 성공", content: { "application/json": { schema: { type: "object", properties: { data: { type: "object" } } } } } },
          "403": errorResponse("メニュー権限 または 削除権限がありません (RBAC: CONTENT.delete)"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/contents/{id}/files": {
      post: {
        tags: ["Content"],
        summary: "첨부파일 업로드 (관리자, multipart/form-data)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  files: { type: "array", items: { type: "string", format: "binary" } },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "업로드 성공", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { type: "object" } } } } } } },
          "400": errorResponse("파일 검증 실패"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限がありません (RBAC: CONTENT.create)"),
          "404": errorResponse("Not found"),
          "411": errorResponse("Content-Length 헤더 누락"),
          "413": errorResponse("Content-Length 초과"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/contents/{id}/files/{fileId}/download": {
      get: {
        tags: ["Content"],
        summary: "첨부파일 다운로드 (게시대상 접근제어)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
          { name: "fileId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": { description: "파일 바이너리", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("접근 권한 없음"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/contents/{id}/files/download-all": {
      get: {
        tags: ["Content"],
        summary: "전체 첨부파일 ZIP 다운로드 (게시대상 접근제어)",
        description: "콘텐츠에 첨부된 모든 파일을 ZIP으로 묶어 스트리밍 다운로드. 동일 파일명은 자동으로 (1), (2) 번호 부여.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": { description: "ZIP 바이너리", content: { "application/zip": { schema: { type: "string", format: "binary" } } } },
          "403": errorResponse("접근 권한 없음"),
          "404": errorResponse("Not found 또는 첨부파일 없음"),
          "413": errorResponse("ZIP 총 용량 상한 초과"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/contents/{id}/files/{fileId}": {
      delete: {
        tags: ["Content"],
        summary: "첨부파일 삭제 (관리자)",
        description: "DB 레코드 삭제 + 디스크 파일 삭제. DownloadLog의 attachmentId는 SetNull로 처리되어 이력은 보존됨.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
          { name: "fileId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": {
            description: "삭제 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { message: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限 または 削除権限がありません (RBAC: CONTENT.delete)"),
          "404": errorResponse("Not found (동시 삭제 race 포함)"),
          "500": errorResponse("서버 에러"),
        },
      },
      put: {
        tags: ["Content"],
        summary: "첨부파일 교체 (관리자, multipart/form-data)",
        description: "기존 첨부파일을 새 파일로 교체. 디스크 파일 + DB 레코드 모두 갱신.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
          { name: "fileId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary", description: "교체할 새 파일 1개" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "교체 성공 (기존 리소스 교체이므로 200)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        fileName: { type: "string" },
                        fileSize: { type: "integer", nullable: true },
                        mimeType: { type: "string", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("파일 검증 실패"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限 または 編集権限がありません (RBAC: CONTENT.update)"),
          "404": errorResponse("Not found"),
          "409": errorResponse("동시성 충돌 — 다른 요청에 의해 첨부파일이 변경됨"),
          "411": errorResponse("Content-Length 헤더 누락"),
          "413": errorResponse("Content-Length 초과"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/inline-images": {
      post: {
        tags: ["Content"],
        summary: "本文埋め込み画像アップロード (BlockNote uploadFile)",
        description:
          "BlockNote 에디터의 `uploadFile` 훅에서 호출. 폼 저장 전 `contentId=null` 상태로 디스크/DB에 선존재. 폼 저장(`POST/PUT /contents`) 시 본문이 참조한 ID만 stamp 되고 나머지는 즉시 정리.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "5MB 이하 jpg/jpeg/png/gif/webp 이미지",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "업로드 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        url: {
                          type: "string",
                          example: "/api/inline-images/42",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("파일 검증 실패 (확장자/MIME/빈 파일)"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("메뉴 권한 없음 (CONTENT.create / .update 모두 거부)"),
          "411": errorResponse("Content-Length 헤더 누락"),
          "413": errorResponse("Content-Length 초과 (5MB)"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/inline-images/{id}": {
      get: {
        tags: ["Content"],
        summary: "本文埋め込み画像取得 (인증 사용자)",
        description:
          "BlockNote 본문 렌더 시 `<img>` 호출용. 인증 사용자 누구나 가능 (게시대상/published 검증 미적용 — 본문 렌더 폭주 방지). 다운로드 로그 미기록.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": {
            description: "이미지 바이너리",
            content: {
              "image/*": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("경로 검증 실패"),
          "404": errorResponse("Not found / 디스크 부재"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/mypage/download-logs": {
      get: {
        tags: ["DownloadLog"],
        summary: "다운로드 기록 목록 조회",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20 } },
          { name: "keyword", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      required: ["totalCount", "page", "pageSize", "keyword", "list"],
                      properties: {
                        totalCount: { type: "integer" },
                        page: { type: "integer" },
                        pageSize: { type: "integer" },
                        keyword: { type: "string", nullable: true },
                        list: {
                          type: "array",
                          items: {
                            type: "object",
                            required: ["id", "downloadedAt", "contentId", "contentTitle", "fileName", "isExpired"],
                            properties: {
                              id: { type: "integer" },
                              downloadedAt: { type: "string", format: "date-time" },
                              contentId: { type: "integer" },
                              contentTitle: { type: "string" },
                              attachmentId: { type: "integer", nullable: true, description: "첨부파일 ID — 파일이 삭제된 경우 null (DownloadLog 이력 보존)" },
                              fileName: { type: "string", description: "파일명 — 삭제된 경우 \"(削除されたファイル)\" 폴백 반환 (download-logs/route.ts:84)" },
                              isExpired: { type: "boolean" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("入力内容に不備があります"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("2단계 인증 필요"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    // ─── Inquiry (문의) ───
    "/inquiry": {
      post: {
        tags: ["Inquiry"],
        summary: "문의 등록 (비로그인 가능)",
        description:
          "문의를 등록한다. 등록 성공 후 공통코드 INQUIRY_TYPE.relCode1~3 에 등록된 수신 담당자 메일과 작성자 접수 확인 메일을 발송한다. 메일 발송 실패는 응답을 막지 않으며 ERROR 로그로 기록된다 (DB 저장은 완료된 상태). 비로그인 사용자도 호출 가능하며 IP/이메일 기반 rate limit 이 적용된다.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateInquiry" },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      required: ["id"],
                      properties: {
                        id: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("入力内容に不備があります / 無効なリクエスト"),
          "429": errorResponse("リクエストが多すぎます"),
          "500": errorResponse("お問い合わせの登録に失敗しました"),
        },
      },
    },

    // ─── Code Lookup (공개) ───
    "/codes/lookup": {
      get: {
        tags: ["Code"],
        summary: "공통코드 공개 조회 (headerCode 기반)",
        parameters: [
          { name: "headerCode", in: "query", required: true, description: "코드 헤더 코드 (공개 허용: INQUIRY_TYPE, PAGE_SIZE)", schema: { type: "string", pattern: "^[A-Z0-9_]{1,50}$", maxLength: 50 } },
        ],
        responses: {
          "200": {
            description: "코드 상세 목록",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          code: { type: "string" },
                          displayCode: { type: "string" },
                          codeName: { type: "string" },
                          codeNameEtc: { type: "string", nullable: true },
                          sortOrder: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("headerCode 파라미터 누락 또는 형식 불일치"),
          "404": errorResponse("해당 코드 없음"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    // ─── CodeDetail ───
    "/codes/{id}/details": {
      get: {
        tags: ["CodeDetail"],
        summary: "Detail 목록 조회",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Header ID",
            schema: { type: "integer", minimum: 1 },
          },
          {
            name: "activeOnly",
            in: "query",
            description: "활성만 조회 (기본 true, 비활성 포함시 false)",
            schema: { type: "string", default: "true" },
          },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CodeDetail" },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("Invalid ID"),
          "404": errorResponse("Header not found"),
          "500": errorResponse("서버 에러"),
        },
      },
      post: {
        tags: ["CodeDetail"],
        summary: "Detail 등록",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Header ID",
            schema: { type: "integer", minimum: 1 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCodeDetail" },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/CodeDetail" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "404": errorResponse("Header not found"),
          "409": errorResponse("Duplicate code in this header"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    // ─── Category ───
    "/categories": {
      get: {
        tags: ["Category"],
        summary: "카테고리 트리 목록 조회",
        parameters: [
          {
            name: "internalOnly",
            in: "query",
            description: "사내전용만 조회 (기본 false)",
            schema: { type: "string", default: "false" },
          },
          {
            name: "activeOnly",
            in: "query",
            description: "활성만 조회 (기본 true)",
            schema: { type: "string", default: "true" },
          },
        ],
        responses: {
          "200": {
            description: "조회 성공 (1Depth + children 트리)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CategoryTree" },
                    },
                  },
                },
              },
            },
          },
          "500": errorResponse("서버 에러"),
        },
      },
      post: {
        tags: ["Category"],
        summary: "카테고리 등록",
        description: "parentId=null이면 1Depth, parentId 지정 시 2Depth. 3Depth 이상 불가. sortOrder 위치에 삽입하며 같은 parentId 형제의 순서를 자동 재정렬합니다(미지정 시 기본값 1).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCategory" },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Category" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "404": errorResponse("상위 카테고리가 존재하지 않습니다"),
          "409": errorResponse("이미 존재하는 categoryCode"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/categories/{id}": {
      put: {
        tags: ["Category"],
        summary: "카테고리 수정 (categoryCode, parentId 수정 불가)",
        description:
          "sortOrder 변경 시 같은 parentId 형제 카테고리의 순서를 자동 재정렬합니다.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateCategory" },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/Category" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
      delete: {
        tags: ["Category"],
        summary: "카테고리 삭제 (물리 삭제, 자손 cascade)",
        description:
          "하위 카테고리가 있어도 자손 트리 전체가 cascade 로 함께 삭제됩니다(Prisma self-relation onDelete: Cascade). 연결된 ContentCategory 링크는 자동 정리되며 콘텐츠 본체는 보존됩니다. 삭제 영향 범위가 매우 큰 경우(MAX_DESCENDANTS=10000 초과) 422 로 거부됩니다.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": {
            description: "삭제 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "integer", example: 1 },
                        cascadedCategoryCount: {
                          type: "integer",
                          description: "함께 삭제된 자손 카테고리 수",
                          example: 0,
                        },
                        cascadedContentCount: {
                          type: "integer",
                          description: "자동 해제된 ContentCategory 링크 수",
                          example: 0,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("Invalid ID"),
          "404": errorResponse("Not found"),
          "422": errorResponse("Too many descendants to delete in a single request"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/categories/{id}/cascade-preview": {
      get: {
        tags: ["Category"],
        summary: "카테고리 삭제 영향 범위 미리보기",
        description:
          "삭제 전 운영자에게 영향 범위를 안내하기 위한 read-only API. 자손 카테고리 수와 영향받을 ContentCategory 링크 수를 사전 집계합니다. ADM_CATEGORY.delete 권한 필요.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": {
            description: "조회 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "integer", example: 1 },
                        descendantCount: { type: "integer", example: 0 },
                        contentLinkCount: { type: "integer", example: 0 },
                        previewedAt: {
                          type: "string",
                          format: "date-time",
                          example: "2026-04-28T00:00:00.000Z",
                          description:
                            "preview 응답 생성 시각 (ISO 8601). DELETE 시점과의 TOCTOU 갭을 운영자에게 가시화하기 위한 메타.",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("Invalid ID"),
          "404": errorResponse("Not found"),
          "422": errorResponse("Too many descendants to preview"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    "/codes/{id}/details/{detailId}": {
      put: {
        tags: ["CodeDetail"],
        summary: "Detail 수정",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Header ID",
            schema: { type: "integer", minimum: 1 },
          },
          {
            name: "detailId",
            in: "path",
            required: true,
            description: "Detail ID",
            schema: { type: "integer", minimum: 1 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateCodeDetail" },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/CodeDetail" },
                  },
                },
              },
            },
          },
          "400": validationErrorResponse,
          "404": errorResponse("Not found"),
          "409": errorResponse("Duplicate code in this header"),
          "500": errorResponse("서버 에러"),
        },
      },
      delete: {
        tags: ["CodeDetail"],
        summary: "Detail 삭제",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Header ID",
            schema: { type: "integer", minimum: 1 },
          },
          {
            name: "detailId",
            in: "path",
            required: true,
            description: "Detail ID",
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "204": { description: "삭제 성공 (body 없음)" },
          "400": errorResponse("Invalid ID"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    // ─── MyPage ───
    "/mypage/profile": {
      get: {
        tags: ["MyPage"],
        summary: "프로필 조회",
        description: "JWT에서 사용자 정보 추출 후 회원유형별 QSP API 조회",
        responses: {
          "200": {
            description: "프로필 정보",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        userType: { type: "string", enum: [...userTpValues] },
                        userName: { type: "string", nullable: true, description: "원본 성명 (QSP userNm). Q.Order 매핑: 성명 단일 필드" },
                        userNameKana: { type: "string", nullable: true, description: "원본 성명 히라가나 (QSP userNmKana). Q.Order 매핑: 담당자명 후리가나 단일 필드" },
                        sei: { type: "string", nullable: true },
                        mei: { type: "string", nullable: true },
                        seiKana: { type: "string", nullable: true },
                        meiKana: { type: "string", nullable: true },
                        email: { type: "string" },
                        compNm: { type: "string" },
                        compNmKana: { type: "string" },
                        zipcode: { type: "string" },
                        address1: { type: "string" },
                        address2: { type: "string" },
                        telNo: { type: "string" },
                        fax: { type: "string" },
                        department: { type: "string", nullable: true },
                        jobTitle: { type: "string", nullable: true },
                        corporateNo: { type: "string", nullable: true },
                        newsRcptYn: { type: "string", enum: ["Y", "N"] },
                        newsRcptDate: {
                          type: "string",
                          nullable: true,
                          description:
                            "뉴스알림 변경일시. QSP `newsRcptChgDt` (신규) 우선, 미존재 시 기존 `newsRcptDate` 폴백.",
                        },
                        withdrawAvailable: { type: "boolean", nullable: true, description: "GENERAL 사용자에게만 포함 (그 외 회원유형은 미포함)" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("施工店会員は別途API使用"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("2단계 인증 필요"),
          "404": errorResponse("ユーザー情報なし"),
          "500": errorResponse("내부 에러 / JWT email 누락 등 사용자 정보 불완전 (재로그인 유도)"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
      put: {
        tags: ["MyPage"],
        summary: "프로필 수정",
        description:
          "회원유형별 수정 가능 항목 차별화. GENERAL: 전체 수정, ADMIN/STORE: 뉴스레터만 수정 가능. " +
          "QSP 수정 성공 후 변경 직전 `attrChgYn === \"Y\"` 인 회원에게 속성 변경 알림 메일 발송 (fire-and-forget). " +
          "메일 발송 결과는 응답에 영향 없음 (실패 시 warn 로깅만).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["newsRcptYn"],
                properties: {
                  sei: { type: "string", maxLength: 50 },
                  mei: { type: "string", maxLength: 50 },
                  seiKana: { type: "string", maxLength: 50 },
                  meiKana: { type: "string", maxLength: 50 },
                  compNm: { type: "string", maxLength: 100 },
                  compNmKana: { type: "string", maxLength: 100 },
                  zipcode: { type: "string", maxLength: 10 },
                  address1: { type: "string", maxLength: 255 },
                  address2: { type: "string", maxLength: 255 },
                  telNo: { type: "string", maxLength: 100 },
                  fax: { type: "string", maxLength: 100 },
                  department: { type: "string", maxLength: 50 },
                  jobTitle: { type: "string", maxLength: 50 },
                  corporateNo: { type: "string", maxLength: 50 },
                  newsRcptYn: { type: "string", enum: ["Y", "N"] },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 완료",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { message: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("Validation 실패 / 施工店会員は別途API使用"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("2단계 인증 필요"),
          "500": errorResponse("내부 에러 / JWT email 누락 등 사용자 정보 불완전 (재로그인 유도)"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },
    "/mypage/password-change": {
      post: {
        tags: ["MyPage"],
        summary: "비밀번호 변경",
        description: "QSP userPwdChg API 호출 (chgType=C)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPwd", "newPwd", "confirmPwd"],
                properties: {
                  currentPwd: { type: "string" },
                  newPwd: { type: "string", minLength: 8 },
                  confirmPwd: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "변경 완료",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { message: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("현재 비밀번호 불일치 또는 정책 위반"),
          "401": errorResponse("인증 필요"),
          "429": errorResponse("요청 횟수 초과 (5분간 5회 제한)"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },
    "/mypage/withdraw": {
      post: {
        tags: ["MyPage"],
        summary: "회원탈퇴 (일반회원만)",
        description:
          "QSP saveResignReq (사양서 No.8) 호출 + JWT 쿠키 삭제. 2FA 완료 + GENERAL 만 허용. " +
          "이미 탈퇴한 회원은 409. QSP 연동 실패 시 502. " +
          "※ 과거 updateUserDtl+statCd:\"R\" 방식은 QSP 가 수용하지 않아 500 반환되므로 복귀 금지.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reason"],
                properties: {
                  reason: {
                    type: "string",
                    minLength: 1,
                    maxLength: 500,
                    description: "退会理由 (QSP resignRemark 에 매핑, 1~500자). 공백만 입력은 BE trim 후 min(1) 검증에서 400.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "탈퇴 완료 (JWT 쿠키 삭제)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { message: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("입력 검증 실패 / 리퀘스트 형식 오류"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("2FA 미완 또는 일반회원 아님"),
          "409": errorResponse("이미 탈퇴 처리된 회원"),
          "429": {
            description:
              "요청이 너무 많음 (rate limit 초과). `Retry-After` 응답 헤더로 재시도까지 대기 권장 초를 제공 (RFC 6585).",
            headers: {
              "Retry-After": {
                description: "재시도까지 대기해야 할 초. rate limit 윈도우(3600s) 전체.",
                schema: { type: "integer", example: 3600 },
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
          "500": errorResponse("서버 에러 / JWT 누락"),
          "502": errorResponse(
            "QSP 연동 실패 또는 QSP userDetail 조회 실패. 세션 쿠키는 유지됨(재시도 가능). " +
              "error 필드로 세부 사유 구분: 접속 불가 / 응답 파싱 실패 / 탈퇴 실패 확정 / 결과 불명. " +
              "※ QSP 원본 status(404 등)는 User Enumeration 방어를 위해 502 로 고정되며 로그에만 보존. " +
              "※ 쿠키 삭제는 200·409 시에만 발생.",
          ),
        },
      },
    },
    "/mypage/seko-info": {
      get: {
        tags: ["MyPage"],
        summary: "시공점 시공ID 정보 조회",
        description: "AS-IS Seko User Info API 프록시. 시공점 전용.",
        responses: {
          "200": {
            description: "시공점 정보",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("시공점 회원 전용"),
          "501": errorResponse("미구현"),
        },
      },
    },
    "/mypage/seko-file": {
      get: {
        tags: ["MyPage"],
        summary: "시공점 첨부파일 다운로드",
        description: "AS-IS Seko File Download API 프록시.",
        parameters: [
          {
            name: "fileType",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["RECEIPT", "CERT1", "CERT2"] },
          },
        ],
        responses: {
          "200": { description: "파일 다운로드" },
          "400": errorResponse("잘못된 fileType"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("시공점 회원 전용"),
          "501": errorResponse("미구현"),
        },
      },
    },

    // ─── Member (회원관리) ───
    "/admin/members": {
      get: {
        tags: ["Member"],
        summary: "회원 목록 조회",
        description: "관리자 전용 — 시공점 제외 전체 회원 목록 (검색/필터/페이징)",
        parameters: [
          { name: "userId", in: "query", schema: { type: "string", maxLength: 200 }, description: "ID Like 검색 (QSP userId 파라미터로 매핑)" },
          { name: "userName", in: "query", schema: { type: "string", maxLength: 200 }, description: "성명 Like 검색 (QSP userNm 파라미터로 매핑)" },
          { name: "email", in: "query", schema: { type: "string", maxLength: 200 }, description: "이메일 Like 검색 (QSP email 파라미터로 매핑)" },
          { name: "companyName", in: "query", schema: { type: "string", maxLength: 200 }, description: "회사명 Like 검색 (QSP compNm 파라미터로 매핑)" },
          { name: "userType", in: "query", schema: { type: "string" }, description: "회원유형 필터 (ADMIN/STORE/GENERAL)" },
          { name: "status", in: "query", schema: { type: "string" }, description: "상태 필터 (active/deleted/withdrawn)" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "페이지 번호" },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20 }, description: "페이지 크기 (max 100)" },
        ],
        responses: {
          "200": {
            description: "회원 목록",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        totalCount: { type: "integer" },
                        page: { type: "integer" },
                        pageSize: { type: "integer" },
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/MemberListItem" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限がありません (RBAC: ADM_MEMBER.read)"),
          "500": errorResponse("서버 에러"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },
    "/admin/members/{id}": {
      get: {
        tags: ["Member"],
        summary: "회원 상세정보 조회",
        description: "관리자 전용 — 회원 상세정보 (QSP 연동)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "회원 userId" },
          { name: "userTp", in: "query", required: true, schema: { type: "string", enum: ["ADMIN", "STORE", "SEKO", "GENERAL"] }, description: "회원유형 (조회 키 결정용)" },
        ],
        responses: {
          "200": {
            description: "회원 상세정보",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/MemberDetail" },
                  },
                },
              },
            },
          },
          "400": errorResponse("userTp 누락"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限がありません (RBAC: ADM_MEMBER.read)"),
          "500": errorResponse("서버 에러"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
      put: {
        tags: ["Member"],
        summary: "회원 상세정보 수정",
        description:
          "관리자 전용 — 권한별 수정 제한 정책 (2026-04-28 갱신): GENERAL 은 전체 필드 수정 가능. " +
          "STORE/SEKO/ADMIN 은 newsRcptYn / twoFactorEnabled / attributeChangeNotification / loginNotification 변경 가능 (비밀번호는 별도 /reset-password API). " +
          "삭제(D) STORE 회원은 storeLvl 확보 불가로 수정 차단(400). " +
          "preDetail null (삭제 회원) 경로: 비복구 시 userRole/twoFactorEnabled 변경 불가(400). " +
          "status='active' 복구 시 userRole + twoFactorEnabled 명시 필수 (400 if missing) — QSP 잔존 값(authCd/secAuthYn)의 silent 부활 차단. " +
          "QSP updateUserDtlMng 는 전송한 필드만 갱신하고 누락 필드는 기존 값을 보존하므로 " +
          "preDetail null 경로에서는 request 로 명시된 mutable 필드만 전송한다 (2026-04-21 실측 확인). " +
          "또한 preDetail 존재 경로에서도 null 필드는 payload 에서 omit (과거 `?? 'N'` 강제 주입 버그 방지). " +
          "QSP 가 full-replace 로 회귀했을 때 즉시 탐지하기 위해 확률적 shadow-check (QSP_SHADOW_CHECK_RATIO) 동작.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "회원 userId" },
          { name: "userTp", in: "query", required: true, schema: { type: "string", enum: ["ADMIN", "STORE", "SEKO", "GENERAL"] }, description: "회원유형 (조회 키 결정용)" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MemberUpdateRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 완료",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string" },
                        member: {
                          allOf: [{ $ref: "#/components/schemas/MemberDetail" }],
                          description:
                            "업데이트 직후 회원 스냅샷. preDetail 존재 시에만 포함 (postDetail 또는 preDetail+변경필드 overlay). " +
                            "프론트는 이 값으로 queryClient.setQueryData 캐시 갱신 가능 — QSP F_NOT_USER 경로의 재조회 공백 방지.",
                        },
                        warning: {
                          type: "string",
                          description:
                            "운영자 안내 메시지 (단수). 다음 두 경로 중 하나에서 설정:" +
                            " (1) userRole 변경 경로의 TOCTOU 사후 검증 실패/불일치 시," +
                            " (2) preDetail null(삭제/탈퇴 회원) 복구 경로에서 사전 상태 미확보 안내." +
                            " 두 경로는 상호배타적이므로 단수로 충분히 표현 가능.",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse(
            "검증 실패 / 권한별 수정 제한 위반 / 탈퇴·삭제 STORE 회원 차단 / 본인 계정 critical 변경 차단 / preDetail null 비복구 경로 + userRole·twoFactorEnabled 변경 차단 / preDetail null + status='active' 복구 시 userRole·twoFactorEnabled 미명시 차단",
          ),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限がありません (RBAC: ADM_MEMBER.update)"),
          "500": errorResponse("서버 에러"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },
    "/admin/members/{id}/reset-password": {
      post: {
        tags: ["Member"],
        summary: "비밀번호 초기화",
        description: "관리자 전용 — 대상 회원 이메일로 비밀번호 변경 링크 발송",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "회원 userId" },
          { name: "userTp", in: "query", required: true, schema: { type: "string", enum: ["ADMIN", "STORE", "SEKO", "GENERAL"] }, description: "회원유형 (조회 키 결정용)" },
        ],
        responses: {
          "200": {
            description: "메일 발송 완료",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        message: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("이메일 미등록"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限がありません (RBAC: ADM_MEMBER.update)"),
          "404": errorResponse("회원 없음"),
          "429": errorResponse("リクエスト制限超過"),
          "500": errorResponse("서버 에러"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },

    // ─── MassMail (대량메일) ───
    "/admin/mass-mails": {
      get: {
        tags: ["MassMail"],
        summary: "대량메일 목록 조회",
        description: "관리자 전용 — 대량메일 목록 (검색/필터/페이징)",
        parameters: [
          { name: "keyword", in: "query", schema: { type: "string" }, description: "제목 Like 검색" },
          { name: "target", in: "query", schema: { type: "string", enum: ["super_admin", "admin", "first_store", "second_store", "seko", "general"] }, description: "발송대상 필터" },
          { name: "draftOnly", in: "query", schema: { type: "boolean", default: false }, description: "임시저장만 보기" },
          { name: "authorSearchType", in: "query", schema: { type: "string", enum: ["name", "id"] }, description: "登録者 검색 대상 (이름/ID)" },
          { name: "authorQuery", in: "query", schema: { type: "string", minLength: 2 }, description: "登録者 검색어 (부분일치, 2文字以上)" },
          { name: "startDate", in: "query", schema: { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, description: "登録日 범위 시작 (YYYY-MM-DD, JST 기준)" },
          { name: "endDate", in: "query", schema: { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, description: "登録日 범위 끝 (YYYY-MM-DD, JST 기준)" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": {
            description: "대량메일 목록",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        totalCount: { type: "integer" },
                        page: { type: "integer" },
                        pageSize: { type: "integer" },
                        list: {
                          type: "array",
                          items: { $ref: "#/components/schemas/MassMailListItem" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限がありません (RBAC: ADM_BULK_MAIL.read)"),
        },
      },
      post: {
        tags: ["MassMail"],
        summary: "대량메일 등록",
        description: "관리자 전용 — multipart/form-data (draft 또는 pending)",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { $ref: "#/components/schemas/MassMailCreateRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "등록 완료",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        status: { type: "string", enum: ["draft", "pending"] },
                        message: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "검증 실패",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                    details: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          field: { type: "string" },
                          message: { type: "string" },
                        },
                      },
                    },
                  },
                  required: ["error"],
                },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限がありません (RBAC: ADM_BULK_MAIL.create)"),
          "411": errorResponse("Content-Length 필요"),
          "413": errorResponse("요청 크기 초과"),
        },
      },
    },
    "/admin/mass-mails/{id}": {
      get: {
        tags: ["MassMail"],
        summary: "대량메일 상세 조회",
        description: "관리자 전용 — 대량메일 상세 + 첨부파일 목록",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "대량메일 ID" },
        ],
        responses: {
          "200": {
            description: "대량메일 상세",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/MassMailDetail" },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限がありません (RBAC: ADM_BULK_MAIL.read)"),
          "404": errorResponse("메일 없음"),
        },
      },
      put: {
        tags: ["MassMail"],
        summary: "대량메일 수정",
        description: "관리자 전용 — 임시저장(draft) 상태의 메일만 수정 가능. multipart/form-data",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "대량메일 ID" },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/MassMailCreateRequest" },
                  {
                    type: "object",
                    properties: {
                      deleteAttachmentIds: { type: "string", description: "삭제할 기존 첨부파일 ID 배열 (JSON 문자열, 예: [1,2,3])" },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "수정 완료",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        status: { type: "string", enum: ["draft", "pending"] },
                        message: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("검증 실패 또는 draft 이외 수정 시도"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限 または 他人作成メール (RBAC: ADM_BULK_MAIL.update)"),
          "404": errorResponse("메일 없음"),
          "409": errorResponse("동시 수정으로 draft 상태 변경됨"),
          "500": errorResponse("수정 실패"),
        },
      },
      delete: {
        tags: ["MassMail"],
        summary: "대량메일 단건 삭제",
        description: "관리자 전용 — 대량메일 삭제 (첨부파일 포함)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "대량메일 ID" },
        ],
        responses: {
          "200": {
            description: "삭제 성공",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { id: { type: "integer", example: 1 } },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("draft 이외 상태는 삭제 불가"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限 または 他人作成メール (RBAC: ADM_BULK_MAIL.delete)"),
          "404": errorResponse("메일 없음"),
          "500": errorResponse("삭제 실패"),
        },
      },
    },
    "/admin/mass-mails/{id}/retry": {
      post: {
        tags: ["MassMail"],
        summary: "대량메일 재발송",
        description: "관리자 전용 — send_failed 상태의 대량메일을 재발송한다. pending 수신자만 이어서 발송되며, 이미 sent 처리된 건은 건너뛴다. Fire-and-Forget 방식으로 즉시 응답.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "대량메일 ID" },
        ],
        responses: {
          "200": {
            description: "재발송 수락",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        message: { type: "string", example: "メール再送信を受け付けました。" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("send_failed 이외 상태에서 재발송 시도"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("メニュー権限 または 他人作成メール (RBAC: ADM_BULK_MAIL.update)"),
          "404": errorResponse("메일 없음"),
          "409": errorResponse("동시 재발송으로 상태 전이 실패"),
          "500": errorResponse("재발송 실패"),
        },
      },
    },

    // ─── Master (QSP 마스터 데이터) ───
    "/master/deptList": {
      get: {
        tags: ["Master"],
        summary: "부서(担当部門) 목록 조회",
        description:
          "관리자 전용 — QSP 부서 마스터 조회. 콘텐츠 검색 화면의 担当部門 셀렉트 옵션용. " +
          "loginId 는 인증 세션의 userId 를 그대로 사용 (클라이언트 페이로드 아님). " +
          "QSP 의 result envelope 은 노출하지 않고 `{ data: [{ deptCd, deptNm }] }` 형태로 정규화.",
        responses: {
          "200": {
            description: "부서 목록",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          deptCd: { type: "string", maxLength: 50, description: "部署コード" },
                          deptNm: { type: "string", maxLength: 100, description: "部署名" },
                        },
                        required: ["deptCd", "deptNm"],
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("管理者権限が必要です (SUPER_ADMIN || ADMIN)"),
          "500": errorResponse("서버 에러"),
          "502": errorResponse("외부 서버 오류 (QSP 응답 비정상/스키마 불일치/resultCode≠S)"),
        },
      },
    },

    // ─── Interface Log ───
    "/admin/interface-logs": {
      get: {
        tags: ["InterfaceLog"],
        summary: "인터페이스 로그 목록 조회",
        description: "관리자 전용 — QSP/시공점 등 외부 시스템 API 호출 이력 조회. requestBody/responseBody는 목록에서 제외.",
        parameters: [
          { name: "system", in: "query", schema: { type: "string" }, description: "시스템 필터 (QSP, SEKO 등)" },
          { name: "apiName", in: "query", schema: { type: "string" }, description: "API명 필터 (login, userDetail 등)" },
          { name: "resultCode", in: "query", schema: { type: "string" }, description: "결과코드 필터 (S, F)" },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" }, description: "시작일시" },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" }, description: "종료일시" },
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "페이지 번호" },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 }, description: "페이지 크기" },
        ],
        responses: {
          "200": {
            description: "인터페이스 로그 목록",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/InterfaceLogSummary" },
                    },
                    pagination: {
                      type: "object",
                      properties: {
                        page: { type: "integer" },
                        limit: { type: "integer" },
                        total: { type: "integer" },
                        totalPages: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("관리자 권한 필요"),
        },
      },
    },
    "/admin/interface-logs/{id}": {
      get: {
        tags: ["InterfaceLog"],
        summary: "인터페이스 로그 상세 조회",
        description: "관리자 전용 — requestBody/responseBody 포함 전체 필드 조회",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "로그 ID" },
        ],
        responses: {
          "200": {
            description: "인터페이스 로그 상세",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/InterfaceLogDetail" },
                  },
                },
              },
            },
          },
          "401": errorResponse("인증 필요"),
          "403": errorResponse("관리자 권한 필요"),
          "404": errorResponse("로그 없음"),
        },
      },
    },
  },

  components: {
    schemas: {
      PaginationMeta: {
        type: "object",
        properties: {
          total: { type: "integer" },
          page: { type: "integer" },
          pageSize: { type: "integer" },
          totalPages: { type: "integer" },
        },
        required: ["total", "page", "pageSize", "totalPages"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "Not found" },
        },
        required: ["error"],
      },
      ValidationErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "Validation failed" },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                path: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
        required: ["error", "issues"],
      },
      AuthValidationErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "Validation failed" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", example: "loginId" },
                message: { type: "string", example: "로그인 ID는 필수입니다" },
              },
            },
          },
        },
        required: ["error", "fields"],
      },
      TwoFactorSendRequest: {
        type: "object",
        required: ["userTp", "userId"],
        properties: {
          userTp: {
            type: "string",
            enum: [...userTpValues],
            example: "GENERAL",
            description: "사용자 유형",
          },
          userId: { type: "string", example: "test1", description: "로그인 ID" },
        },
      },
      TwoFactorVerifyRequest: {
        type: "object",
        required: ["userTp", "userId", "code"],
        properties: {
          userTp: {
            type: "string",
            enum: [...userTpValues],
            example: "GENERAL",
            description: "사용자 유형",
          },
          userId: { type: "string", example: "test1", description: "로그인 ID" },
          code: { type: "string", minLength: 6, maxLength: 6, example: "123456", description: "6자리 인증번호" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["loginId", "pwd"],
        properties: {
          loginId: { type: "string", example: "test1", description: "로그인 ID" },
          pwd: { type: "string", example: "1234", description: "비밀번호" },
          userTp: {
            type: "string",
            enum: [...userTpValues],
            default: "GENERAL",
            description: "사용자 유형",
          },
        },
      },
      LoginUser: {
        type: "object",
        properties: {
          userId: { type: "string", example: "test1" },
          userNm: { type: "string", nullable: true, example: "テスト太郎" },
          userTp: { type: "string", example: "GENERAL" },
          compCd: { type: "string", nullable: true, example: "5200" },
          compNm: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          deptNm: { type: "string", nullable: true },
          authCd: { type: "string", nullable: true, example: "NORMAL" },
          storeLvl: { type: "string", nullable: true, description: "판매점 레벨 (1=1차, 2=2차)" },
          statCd: { type: "string", nullable: true, description: "상태코드 (A=활성)" },
          authRole: { type: "string", enum: ["SUPER_ADMIN", "ADMIN", "1ST_STORE", "2ND_STORE", "SEKO", "GENERAL"], description: "세부 권한코드 — 프론트 접근 제어 기준" },
          twoFactorVerified: { type: "boolean", description: "2FA 검증 상태 (true=완료/불필요, false=미완료)" },
          telNo: { type: "string", nullable: true, description: "회사 전화번호 (QSP compTelNo 매핑) — 문의하기 자동입력용. optional: 기존 JWT 호환" },
        },
      },
      SignupRequest: {
        type: "object",
        required: [
          "email", "pwd", "confirmPwd",
          "user1stNm", "user2ndNm", "user1stNmKana", "user2ndNmKana",
          "compNm", "compNmKana", "compPostCd", "compAddr", "compAddr2",
          "compTelNo", "newsRcptYn",
        ],
        properties: {
          email: { type: "string", format: "email", maxLength: 100, example: "user@example.com", description: "이메일 (= 로그인 ID)" },
          pwd: { type: "string", minLength: 8, maxLength: 100, example: "1q2w3e4R!", description: "비밀번호 (Uppercase + Lowercase + Number, min 8 characters)" },
          confirmPwd: { type: "string", example: "1q2w3e4R!", description: "비밀번호 확인" },
          user1stNm: { type: "string", maxLength: 50, example: "太郎", description: "이름 (名)" },
          user2ndNm: { type: "string", maxLength: 50, example: "山田", description: "성 (姓)" },
          user1stNmKana: { type: "string", maxLength: 50, example: "タロウ", description: "이름 카나" },
          user2ndNmKana: { type: "string", maxLength: 50, example: "ヤマダ", description: "성 카나" },
          compNm: { type: "string", maxLength: 100, example: "テスト株式会社", description: "회사명" },
          compNmKana: { type: "string", maxLength: 100, example: "テストカブシキガイシャ", description: "회사명 카나" },
          compPostCd: { type: "string", maxLength: 10, example: "160-0022", description: "회사 우편번호" },
          compAddr: { type: "string", maxLength: 255, example: "東京都新宿区新宿", description: "회사 주소 1" },
          compAddr2: { type: "string", maxLength: 255, example: "1-1-1", description: "회사 주소 2" },
          compTelNo: { type: "string", maxLength: 100, example: "03-1234-5678", description: "회사 전화번호" },
          compFaxNo: { type: "string", maxLength: 100, example: "03-1234-5679", description: "회사 Fax번호 (선택)" },
          deptNm: { type: "string", maxLength: 50, example: "営業部", description: "부서명 (선택)" },
          pstnNm: { type: "string", maxLength: 50, example: "課長", description: "직책 (선택)" },
          newsRcptYn: { type: "string", enum: ["Y", "N"], example: "Y", description: "뉴스레터 수신 여부" },
        },
      },
      PasswordResetRequest: {
        type: "object",
        required: ["userTp", "email"],
        properties: {
          userTp: {
            type: "string",
            enum: [...userTpValues],
            example: "GENERAL",
            description: "사용자 유형",
          },
          loginId: { type: "string", description: "로그인 ID (STORE 필수, 그 외 선택)" },
          email: { type: "string", format: "email", maxLength: 100, example: "user@example.com", description: "비밀번호 변경 링크를 받을 이메일" },
          sekoId: { type: "string", description: "시공점 ID (SEKO 선택 — QSP는 이메일만으로도 시공점 조회 가능)" },
        },
      },
      PasswordResetVerify: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000", description: "메일로 발송된 초기화 토큰 (UUID)" },
        },
      },
      PasswordResetConfirm: {
        type: "object",
        required: ["token", "newPassword", "confirmPassword"],
        properties: {
          token: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000", description: "초기화 토큰" },
          newPassword: { type: "string", minLength: 8, maxLength: 100, example: "1q2w3e4R!", description: "새 비밀번호 (Uppercase + Lowercase + Number, min 8)" },
          confirmPassword: { type: "string", example: "1q2w3e4R!", description: "새 비밀번호 확인" },
        },
      },
      CodeHeader: {
        type: "object",
        required: [
          "id",
          "headerCode",
          "headerAlias",
          "headerName",
          "isActive",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "integer", example: 1 },
          headerCode: { type: "string", example: "STATUS" },
          headerAlias: { type: "string", example: "STAT_CD" },
          headerName: { type: "string", example: "상태코드" },
          relCode1: { type: "string", nullable: true },
          relCode2: { type: "string", nullable: true },
          relCode3: { type: "string", nullable: true },
          relNum1: { type: "string", nullable: true, example: "100.50" },
          relNum2: { type: "string", nullable: true },
          relNum3: { type: "string", nullable: true },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string", nullable: true },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string", nullable: true },
        },
      },
      CodeDetail: {
        type: "object",
        required: [
          "id",
          "headerId",
          "code",
          "displayCode",
          "codeName",
          "isActive",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "integer", example: 1 },
          headerId: { type: "integer", example: 1 },
          code: { type: "string", example: "ACTIVE" },
          displayCode: { type: "string", example: "01" },
          codeName: { type: "string", example: "활성" },
          codeNameEtc: { type: "string", nullable: true },
          relCode1: { type: "string", nullable: true },
          relCode2: { type: "string", nullable: true },
          relCode3: { type: "string", nullable: true },
          relNum1: { type: "string", nullable: true },
          sortOrder: { type: "integer", example: 1 },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string", nullable: true },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string", nullable: true },
        },
      },
      CreateCodeHeader: {
        type: "object",
        required: ["headerCode", "headerAlias", "headerName"],
        properties: {
          headerCode: { type: "string", maxLength: 20, example: "STATUS" },
          headerAlias: {
            type: "string",
            maxLength: 50,
            example: "STAT_CD",
          },
          headerName: {
            type: "string",
            maxLength: 255,
            example: "상태코드",
          },
          relCode1: { type: "string", maxLength: 50, nullable: true },
          relCode2: { type: "string", maxLength: 50, nullable: true },
          relCode3: { type: "string", maxLength: 50, nullable: true },
          relNum1: {
            oneOf: [{ type: "number" }, { type: "string" }],
            nullable: true,
            description: "Decimal(15,2) — number 또는 string 입력 가능",
          },
          relNum2: {
            oneOf: [{ type: "number" }, { type: "string" }],
            nullable: true,
          },
          relNum3: {
            oneOf: [{ type: "number" }, { type: "string" }],
            nullable: true,
          },
          isActive: { type: "boolean", default: true },
        },
      },
      UpdateCodeHeader: {
        type: "object",
        description: "변경할 필드만 전송 (headerCode 수정 불가)",
        properties: {
          headerAlias: { type: "string", maxLength: 50 },
          headerName: { type: "string", maxLength: 255 },
          relCode1: { type: "string", maxLength: 50, nullable: true },
          relCode2: { type: "string", maxLength: 50, nullable: true },
          relCode3: { type: "string", maxLength: 50, nullable: true },
          relNum1: {
            oneOf: [{ type: "number" }, { type: "string" }],
            nullable: true,
          },
          relNum2: {
            oneOf: [{ type: "number" }, { type: "string" }],
            nullable: true,
          },
          relNum3: {
            oneOf: [{ type: "number" }, { type: "string" }],
            nullable: true,
          },
          isActive: { type: "boolean" },
        },
      },
      CreateCodeDetail: {
        type: "object",
        required: ["code", "displayCode", "codeName"],
        properties: {
          code: { type: "string", maxLength: 20, example: "ACTIVE" },
          displayCode: { type: "string", maxLength: 20, example: "01" },
          codeName: { type: "string", maxLength: 255, example: "활성" },
          codeNameEtc: { type: "string", maxLength: 255, nullable: true },
          relCode1: { type: "string", maxLength: 50, nullable: true },
          relCode2: { type: "string", maxLength: 50, nullable: true },
          relCode3: { type: "string", maxLength: 50, nullable: true },
          relNum1: {
            oneOf: [{ type: "number" }, { type: "string" }],
            nullable: true,
          },
          sortOrder: { type: "integer", default: 0 },
          isActive: { type: "boolean", default: true },
        },
      },
      Category: {
        type: "object",
        required: ["id", "categoryCode", "name", "isInternalOnly", "sortOrder", "isActive", "createdAt", "updatedAt"],
        properties: {
          id: { type: "integer", example: 1 },
          parentId: { type: "integer", nullable: true, example: null },
          categoryCode: { type: "string", example: "PROD" },
          name: { type: "string", example: "상품분류" },
          isInternalOnly: { type: "boolean", example: false },
          sortOrder: { type: "integer", example: 1 },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string", nullable: true },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string", nullable: true },
        },
      },
      // 카테고리 트리 응답에 사용되는 경량 노드 — DB 메타 필드(createdAt 등) 제외.
      // CATEGORY_TREE_INCLUDE.select(`category-tree.ts`)와 일치해야 함.
      CategoryNodeMinimal: {
        type: "object",
        required: ["id", "categoryCode", "name", "isInternalOnly", "sortOrder", "isActive"],
        properties: {
          id: { type: "integer", example: 1 },
          parentId: { type: "integer", nullable: true, example: null },
          categoryCode: { type: "string", example: "PROD" },
          name: { type: "string", example: "상품분류" },
          isInternalOnly: { type: "boolean", example: false },
          sortOrder: { type: "integer", example: 1 },
          isActive: { type: "boolean", example: true },
        },
      },
      CategoryTree: {
        allOf: [
          { $ref: "#/components/schemas/CategoryNodeMinimal" },
          {
            type: "object",
            required: ["children"],
            properties: {
              children: {
                type: "array",
                items: { $ref: "#/components/schemas/CategoryNodeMinimal" },
              },
            },
          },
        ],
      },
      ContentListItem: {
        type: "object",
        required: [
          "id", "title", "status", "viewCount", "createdAt", "updatedAt",
          "hasBeenUpdated", "isNew", "isUpdated", "categories", "targets", "attachmentCount",
        ],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          status: { type: "string", enum: ["draft", "published", "deleted"] },
          authorDepartment: { type: "string", nullable: true },
          viewCount: { type: "integer" },
          publishedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          hasBeenUpdated: {
            type: "boolean",
            description: "갱신 이력 — updatedAt !== createdAt 시 true. UPDATE 뱃지/갱신일 표시 결정 단일 기준",
          },
          isNew: { type: "boolean", description: "생성 후 5일 이내" },
          isUpdated: { type: "boolean", description: "수정 후 5일 이내" },
          categories: {
            type: "array",
            description: "부모-자식 트리 구조. 콘텐츠에 연결된 자식 카테고리들을 부모 기준으로 그룹화",
            items: { $ref: "#/components/schemas/CategoryTree" },
          },
          targets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                targetType: { type: "string", enum: ["first_store", "second_store", "seko", "general", "non_member"] },
                startAt: { type: "string", format: "date-time", nullable: true },
                endAt: { type: "string", format: "date-time", nullable: true },
              },
            },
          },
          attachmentCount: { type: "integer" },
        },
      },
      ContentDetailItem: {
        type: "object",
        required: [
          "id", "title", "status", "viewCount", "createdAt", "updatedAt",
          "hasBeenUpdated", "isNew", "isUpdated", "categories", "targets", "attachments",
        ],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          body: { type: "string", nullable: true },
          status: { type: "string", enum: ["draft", "published", "deleted"] },
          authorDepartment: { type: "string", nullable: true },
          authorIsSuperAdmin: {
            type: "boolean",
            description: "작성자가 SUPER_ADMIN 여부 — 사내 사용자(ADMIN)에게만 노출, 일반 사용자는 필드 자체 누락",
          },
          userType: { type: "string", nullable: true },
          userId: { type: "string", nullable: true },
          viewCount: { type: "integer" },
          publishedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          hasBeenUpdated: {
            type: "boolean",
            description: "갱신 이력 — updatedAt !== createdAt 시 true. UPDATE 뱃지/갱신일 표시 결정 단일 기준",
          },
          isNew: { type: "boolean", description: "생성 후 5일 이내" },
          isUpdated: { type: "boolean", description: "수정 후 5일 이내" },
          categories: {
            type: "array",
            description: "부모-자식 트리 구조 (NEW-2 적용)",
            items: { $ref: "#/components/schemas/CategoryTree" },
          },
          targets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                targetType: { type: "string", enum: ["first_store", "second_store", "seko", "general", "non_member"] },
                startAt: { type: "string", format: "date-time", nullable: true },
                endAt: { type: "string", format: "date-time", nullable: true },
              },
            },
          },
          attachments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                fileName: { type: "string" },
                fileSize: { type: "integer", nullable: true },
                mimeType: { type: "string", nullable: true },
                sortOrder: { type: "integer" },
              },
            },
          },
        },
      },
      CreateCategory: {
        type: "object",
        required: ["categoryCode", "name"],
        properties: {
          parentId: { type: "integer", nullable: true, default: null, description: "null=1Depth, 값=2Depth" },
          categoryCode: { type: "string", maxLength: 50, example: "PROD" },
          name: { type: "string", maxLength: 100, example: "상품분류" },
          isInternalOnly: { type: "boolean", default: false },
          sortOrder: { type: "integer", default: 1 },
          isActive: { type: "boolean", default: true },
        },
      },
      Menu: {
        type: "object",
        required: ["id", "menuCode", "menuName", "isActive", "showInTopNav", "showInMobile", "sortOrder", "createdAt", "updatedAt"],
        properties: {
          id: { type: "integer", example: 1 },
          parentId: { type: "integer", nullable: true, example: null },
          menuCode: { type: "string", example: "CONTENT" },
          menuName: { type: "string", example: "콘텐츠" },
          pageUrl: { type: "string", nullable: true, example: "/contents" },
          isActive: { type: "boolean", example: true },
          showInTopNav: { type: "boolean", example: true },
          showInMobile: { type: "boolean", example: true },
          sortOrder: { type: "integer", example: 1 },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string", nullable: true },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string", nullable: true },
        },
      },
      MenuTree: {
        allOf: [
          { $ref: "#/components/schemas/Menu" },
          {
            type: "object",
            properties: {
              children: {
                type: "array",
                items: { $ref: "#/components/schemas/Menu" },
              },
            },
          },
        ],
      },
      CreateMenu: {
        type: "object",
        required: ["menuCode", "menuName"],
        properties: {
          parentId: { type: "integer", nullable: true, default: null, description: "null=1-Level, 값=2-Level" },
          menuCode: { type: "string", maxLength: 50, example: "CONTENT" },
          menuName: { type: "string", maxLength: 100, example: "콘텐츠" },
          pageUrl: { type: "string", maxLength: 500, nullable: true, example: "/contents" },
          isActive: { type: "boolean", default: true },
          showInTopNav: { type: "boolean", default: true },
          showInMobile: { type: "boolean", default: true },
          sortOrder: {
            type: "integer",
            minimum: 1,
            description: "미지정 시 같은 parentId 그룹의 max(sortOrder)+1 로 자동 부여",
          },
        },
      },
      UpdateMenu: {
        type: "object",
        description: "변경할 필드만 전송 (menuCode 수정 불가)",
        properties: {
          menuName: { type: "string", maxLength: 100 },
          pageUrl: { type: "string", maxLength: 500, nullable: true },
          isActive: { type: "boolean" },
          showInTopNav: { type: "boolean" },
          showInMobile: { type: "boolean" },
          sortOrder: { type: "integer" },
        },
      },
      Role: {
        type: "object",
        required: ["id", "roleCode", "roleName", "isActive", "createdAt", "updatedAt"],
        properties: {
          id: { type: "integer", example: 1 },
          roleCode: { type: "string", example: "ADMIN" },
          roleName: { type: "string", example: "관리자" },
          description: { type: "string", nullable: true, example: "사내직원, 전체 메뉴 CRUD 권한 부여" },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string", nullable: true },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string", nullable: true },
        },
      },
      CreateRole: {
        type: "object",
        required: ["roleCode", "roleName"],
        properties: {
          roleCode: {
            type: "string",
            enum: ["SUPER_ADMIN", "ADMIN", "1ST_STORE", "2ND_STORE", "SEKO", "GENERAL"],
            description: "authRole ↔ roleCode 1:1. enum 외 생성 불가 (후속 GET/PUT 경로가 path param enum 에서 400 이 되어 좀비 row 가 되는 것을 방지).",
            example: "ADMIN",
          },
          roleName: { type: "string", maxLength: 100, example: "特殊会員" },
          description: { type: "string", maxLength: 500, nullable: true, example: "特殊パートナー" },
          isActive: { type: "boolean", default: true },
        },
      },
      UpdateRole: {
        type: "object",
        description: "변경할 필드만 전송 (roleCode 수정 불가)",
        properties: {
          roleName: { type: "string", maxLength: 100 },
          description: { type: "string", maxLength: 500, nullable: true },
          isActive: { type: "boolean" },
        },
      },
      MenuPermissionItem: {
        type: "object",
        properties: {
          menuCode: { type: "string", example: "SEARCH" },
          menuName: { type: "string", example: "통합검색" },
          level: { type: "integer", example: 1 },
          hasUrl: { type: "boolean", example: true },
          canRead: { type: "boolean", example: true },
          canCreate: { type: "boolean", example: true },
          canUpdate: { type: "boolean", example: true },
          canDelete: { type: "boolean", example: true },
          children: {
            type: "array",
            items: { $ref: "#/components/schemas/MenuPermissionItem" },
          },
        },
      },
      RolePermissions: {
        type: "object",
        properties: {
          roleCode: { type: "string", example: "ADMIN" },
          roleName: { type: "string", example: "관리자" },
          menus: {
            type: "array",
            items: { $ref: "#/components/schemas/MenuPermissionItem" },
          },
        },
      },
      HomeNotice: {
        type: "object",
        required: ["id", "startAt", "endAt", "title", "content", "userType", "userId", "createdAt", "updatedAt"],
        properties: {
          id: { type: "integer", example: 1 },
          targetSuperAdmin: { type: "boolean" },
          targetAdmin: { type: "boolean" },
          targetFirstStore: { type: "boolean" },
          targetSecondStore: { type: "boolean" },
          targetConstructor: { type: "boolean" },
          targetGeneral: { type: "boolean" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          title: { type: "string", maxLength: 100 },
          content: { type: "string" },
          url: { type: "string", nullable: true },
          userType: { type: "string", enum: [...userTpValues] },
          userId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string", nullable: true },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string", nullable: true },
        },
      },
      HomeNoticeListItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          targets: { type: "array", items: { type: "string" }, example: ["first_store", "seko"] },
          title: { type: "string", maxLength: 100 },
          content: { type: "string" },
          url: { type: "string", nullable: true },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["scheduled", "active", "ended"] },
          userType: { type: "string" },
          userId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string", nullable: true },
          createdByName: {
            type: "string",
            nullable: true,
            description: "등록자 표시명 — QSP userDetail 조회 결과. 미해결/실패 시 null",
          },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string", nullable: true },
          updatedByName: {
            type: "string",
            nullable: true,
            description: "갱신자 표시명 — QSP userDetail 조회 결과. 미해결/실패 시 null",
          },
        },
      },
      HomeNoticeDetail: {
        description: "GET /home-notices/{id} 전용 — 목록 항목 + 작성자 권한 플래그",
        allOf: [
          { $ref: "#/components/schemas/HomeNoticeListItem" },
          {
            type: "object",
            properties: {
              authorIsSuperAdmin: {
                type: "boolean",
                description: "작성자가 SUPER_ADMIN 여부 — 사내 사용자(ADMIN)에게만 노출, 일반 사용자는 필드 자체 누락 (Contents API와 동일 패턴)",
              },
            },
          },
        ],
      },
      ActiveHomeNotice: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string", maxLength: 100 },
          content: { type: "string" },
          url: { type: "string", nullable: true },
          startAt: { type: "string", format: "date-time" },
        },
      },
      CreateHomeNotice: {
        type: "object",
        required: ["startAt", "endAt", "title", "content"],
        description: "게시대상(target*) 중 최소 1개 true 필수",
        properties: {
          targetSuperAdmin: { type: "boolean", default: false },
          targetAdmin: { type: "boolean", default: false },
          targetFirstStore: { type: "boolean", default: false },
          targetSecondStore: { type: "boolean", default: false },
          targetConstructor: { type: "boolean", default: false },
          targetGeneral: { type: "boolean", default: false },
          startAt: { type: "string", format: "date-time", example: "2026-03-20T00:00:00Z" },
          endAt: { type: "string", format: "date-time", example: "2026-03-30T23:59:59Z" },
          title: { type: "string", maxLength: 100, example: "システムメンテナンスのお知らせ" },
          content: { type: "string", maxLength: 200, example: "공지 내용 텍스트" },
          url: { type: "string", maxLength: 500, nullable: true, example: "https://example.com" },
        },
      },
      UpdateHomeNotice: {
        type: "object",
        description: "변경할 필드만 전송. 게시대상 최소 1개 true 필수.",
        properties: {
          targetSuperAdmin: { type: "boolean" },
          targetAdmin: { type: "boolean" },
          targetFirstStore: { type: "boolean" },
          targetSecondStore: { type: "boolean" },
          targetConstructor: { type: "boolean" },
          targetGeneral: { type: "boolean" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          title: { type: "string", maxLength: 100 },
          content: { type: "string", maxLength: 200 },
          url: { type: "string", maxLength: 500, nullable: true },
        },
      },
      UpdatePermissions: {
        type: "object",
        required: ["permissions"],
        description:
          "payload 에 포함된 menuCode 만 upsert. 포함되지 않은 menuCode 는 기존 값 그대로 유지된다 (replace 아님).",
        properties: {
          permissions: {
            type: "array",
            items: {
              type: "object",
              required: ["menuCode"],
              properties: {
                menuCode: {
                  type: "string",
                  enum: [
                    "HOME", "CONTENT", "INQUIRY", "MYPAGE", "ADMIN",
                    "CONT_LIST", "CONT_CREATE",
                    "INQ_FORM",
                    "MY_PROFILE", "MY_DOWNLOAD", "MY_INQUIRY",
                    "ADM_MEMBER", "ADM_BULK_MAIL", "ADM_NOTICE", "ADM_CATEGORY",
                    "ADM_PERMISSION", "ADM_MENU", "ADM_CODE",
                  ],
                  example: "ADM_MEMBER",
                },
                canRead: { type: "boolean", default: false },
                canCreate: { type: "boolean", default: false },
                canUpdate: { type: "boolean", default: false },
                canDelete: { type: "boolean", default: false },
              },
            },
            minItems: 1,
          },
        },
      },
      SortMenu: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "sortOrder"],
              properties: {
                id: { type: "integer", minimum: 1 },
                sortOrder: { type: "integer", minimum: 1 },
              },
            },
            minItems: 1,
          },
        },
      },
      UpdateCategory: {
        type: "object",
        description: "변경할 필드만 전송 (categoryCode, parentId 수정 불가)",
        properties: {
          name: { type: "string", maxLength: 100 },
          isInternalOnly: { type: "boolean" },
          sortOrder: { type: "integer" },
          isActive: { type: "boolean" },
        },
      },
      UpdateCodeDetail: {
        type: "object",
        description: "변경할 필드만 전송",
        properties: {
          code: { type: "string", maxLength: 20 },
          displayCode: { type: "string", maxLength: 20 },
          codeName: { type: "string", maxLength: 255 },
          codeNameEtc: { type: "string", maxLength: 255, nullable: true },
          relCode1: { type: "string", maxLength: 50, nullable: true },
          relCode2: { type: "string", maxLength: 50, nullable: true },
          relCode3: { type: "string", maxLength: 50, nullable: true },
          relNum1: {
            oneOf: [{ type: "number" }, { type: "string" }],
            nullable: true,
          },
          sortOrder: { type: "integer" },
          isActive: { type: "boolean" },
        },
      },
      CreateInquiry: {
        type: "object",
        required: ["companyName", "userName", "email", "inquiryType", "title", "content"],
        properties: {
          companyName: { type: "string", maxLength: 255, example: "株式会社テスト" },
          userName: { type: "string", maxLength: 200, example: "田中太郎" },
          tel: { type: "string", minLength: 1, maxLength: 20, nullable: true, example: "03-1234-5678" },
          email: { type: "string", format: "email", maxLength: 255, example: "test@example.com" },
          inquiryType: { type: "string", maxLength: 100, pattern: "^[A-Za-z0-9_-]+$", example: "01" },
          title: { type: "string", maxLength: 500, example: "サービスについて" },
          content: { type: "string", maxLength: 10000, example: "お問い合わせ内容" },
        },
      },
      MemberListItem: {
        type: "object",
        properties: {
          id: { type: "string", description: "userId" },
          userId: { type: "string" },
          userName: { type: "string" },
          userNameKana: { type: "string" },
          email: { type: "string" },
          userType: { type: "string", enum: ["管理者", "販売店", "施工店", "一般", "unknown"] },
          companyName: { type: "string" },
          status: { type: "string", enum: ["active", "deleted", "withdrawn", "unknown"] },
          lastLoginAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "최종 로그인 시각 (ISO 8601 +09:00 JST). QSP loginDt 정규화 결과. null 은 미로그인/미반환.",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "등록일 (ISO 8601 +09:00 JST). QSP regDt(YYYY.MM.DD) 정규화 — 시각 미보유로 자정. null 은 미반환.",
          },
        },
      },
      MemberDetail: {
        type: "object",
        properties: {
          id: { type: "string", description: "userId (이메일 또는 로그인 ID)" },
          userId: { type: "string" },
          userName: { type: "string" },
          userNameKana: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          firstNameKana: { type: "string" },
          lastNameKana: { type: "string" },
          email: { type: "string" },
          userType: { type: "string", enum: ["管理者", "販売店", "施工店", "一般", "unknown"] },
          userRole: {
            type: "string",
            description:
              "현재 권한 코드. 응답에는 SEKO 포함 가능(레거시 데이터). 요청(MemberUpdateRequest.userRole)에는 SEKO 부여 불가 — 2026-04-23 정책.",
          },
          companyName: { type: "string" },
          companyNameKana: { type: "string" },
          zipcode: { type: "string" },
          address: { type: "string" },
          address2: { type: "string" },
          telNo: { type: "string" },
          faxNo: { type: "string" },
          department: { type: "string" },
          jobTitle: { type: "string" },
          twoFactorEnabled: { type: "boolean", nullable: true },
          loginNotification: { type: "boolean" },
          attributeChangeNotification: { type: "boolean" },
          status: { type: "string", enum: ["active", "deleted", "withdrawn", "unknown"] },
          newsRcptYn: { type: "string", enum: ["Y", "N"] },
          createdAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "등록일 (ISO 8601 +09:00 JST). QSP regDt(YYYY.MM.DD) 정규화 결과 — 시각 정보가 없어 자정으로 채움. null 은 미조회/미반환.",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "갱신일 (ISO 8601 +09:00 JST). QSP uptDt(YYYY.MM.DD HH:mm:ss) 정규화 결과. null 은 미조회/미반환.",
          },
          updatedBy: {
            type: "string",
            nullable: true,
            description: "갱신자 성명 (QSP uptNm 원문 — userId 가 아닌 userNm 형태). 키 네이밍은 프론트 호환성 우선 (members-types.ts 의 updatedBy 와 일치). null 가능.",
          },
          lastLoginAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description:
              "최종 로그인일시 (ISO 8601 +09:00 JST). QSP loginDt(YYYY.MM.DD HH:mm:ss) 정규화 결과. 로그인 이력이 없거나 QSP 미반환 시 null.",
          },
          withdrawnAt: {
            type: "string",
            format: "date-time",
            nullable: true,
            description:
              "탈퇴일시 (ISO 8601 +09:00 JST). QSP resignDt(YYYY.MM.DD HH:mm:ss) 정규화 결과. 탈퇴(statCd=R) 회원에 한해 값이 있고, 그 외는 null.",
          },
          withdrawReason: {
            type: "string",
            nullable: true,
            description:
              "탈퇴사유 (QSP resignRemark 원문, 최대 500자). 탈퇴 회원에 한해 값이 있고, 그 외는 null.",
          },
          notFoundInQsp: { type: "boolean", description: "QSP에서 조회 불가(삭제/탈퇴 등)일 때 true" },
        },
      },
      MemberUpdateRequest: {
        type: "object",
        properties: {
          userRole: {
            type: "string",
            enum: ["1ST_STORE", "2ND_STORE", "GENERAL"],
            description: "일반회원만 변경 가능. SEKO(施工店) 부여 불가 (2026-04-23 정책)",
          },
          twoFactorEnabled: { type: "boolean" },
          loginNotification: { type: "boolean" },
          attributeChangeNotification: { type: "boolean" },
          status: { type: "string", enum: ["active", "deleted"] },
          newsRcptYn: { type: "string", enum: ["Y", "N"] },
        },
      },
      // ─── MassMail Schemas (대량메일) ───
      MassMailListItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          status: { type: "string", enum: ["draft", "pending", "sending", "sent", "send_failed"] },
          targets: {
            type: "object",
            properties: {
              super_admin: { type: "boolean" },
              admin: { type: "boolean" },
              first_store: { type: "boolean" },
              second_store: { type: "boolean" },
              seko: { type: "boolean" },
              general: { type: "boolean" },
            },
          },
          targetsLabel: { type: "string", description: "발송대상 콤마 구분 표시용" },
          subject: { type: "string" },
          hasAttachment: { type: "boolean" },
          senderName: { type: "string" },
          senderId: { type: "string" },
          createdByName: { type: "string", nullable: true, description: "등록자명 (DB 미존재 시 null)" },
          sentAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MassMailDetail: {
        type: "object",
        required: [
          "id",
          "senderName",
          "targets",
          "targetsLabel",
          "optOut",
          "subject",
          "body",
          "status",
          "sentTotal",
          "sentSuccess",
          "sentFailed",
          "userType",
          "userId",
          "authorIsSuperAdmin",
          "attachments",
          "failedRecipients",
          "failedRecipientsTotal",
          "failedRecipientsTruncated",
          "createdBy",
          "createdAt",
        ],
        properties: {
          id: { type: "integer" },
          senderName: { type: "string" },
          userType: { type: "string", description: "작성자 userType" },
          userId: { type: "string", description: "작성자 userId" },
          authorIsSuperAdmin: { type: "boolean", description: "작성자가 SUPER_ADMIN 여부 (프론트 수정/삭제 버튼 노출 판단용)" },
          targets: {
            type: "object",
            required: ["super_admin", "admin", "first_store", "second_store", "seko", "general"],
            properties: {
              super_admin: { type: "boolean" },
              admin: { type: "boolean" },
              first_store: { type: "boolean" },
              second_store: { type: "boolean" },
              seko: { type: "boolean" },
              general: { type: "boolean" },
            },
          },
          targetsLabel: { type: "string", description: "발송대상 콤마 구분 표시용" },
          optOut: { type: "boolean" },
          subject: { type: "string" },
          body: { type: "string" },
          status: { type: "string", enum: ["draft", "pending", "sending", "sent", "send_failed"] },
          sentAt: { type: "string", format: "date-time", nullable: true },
          sentTotal: { type: "integer", description: "발송 대상 총 건수 (수집 완료 후 확정)" },
          sentSuccess: { type: "integer", description: "발송 성공 건수" },
          sentFailed: { type: "integer", description: "발송 실패 건수" },
          attachments: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "fileName"],
              properties: {
                id: { type: "integer" },
                fileName: { type: "string" },
                fileSize: { type: "integer", nullable: true },
              },
            },
          },
          failedRecipients: {
            type: "array",
            description: "영구 실패 수신자 명단 (status='failed' 인 recipients). 失敗確認 모달 팝업용. PII 보호를 위해 email 마스킹 + errorMessage 는 카테고리 코드로 치환. sent_failed=0 이면 빈 배열, 상한(500건) 초과 시 truncated=true.",
            items: {
              type: "object",
              required: ["email", "userName", "authRole", "errorCategory", "lastAttemptAt"],
              properties: {
                email: { type: "string", description: "마스킹된 이메일 (local-part 첫 1자만 노출)" },
                userName: { type: "string", nullable: true },
                authRole: { type: "string", enum: ["SUPER_ADMIN", "ADMIN", "FIRST_STORE", "SECOND_STORE", "SEKO", "GENERAL"] },
                errorCategory: {
                  type: "string",
                  enum: ["ORPHAN_SEND", "SMTP_TIMEOUT", "SMTP_REJECT", "UNKNOWN"],
                  description: "분류된 실패 사유 — SMTP 원문 노출 금지 (인프라 지문/사용자 enumeration 방어)",
                },
                lastAttemptAt: { type: "string", format: "date-time", nullable: true, description: "마지막 시도 시각" },
              },
            },
          },
          failedRecipientsTotal: {
            type: "integer",
            description: "전체 영구 실패 건수 (응답 배열은 상한이 있으므로 별도 노출).",
          },
          failedRecipientsTruncated: {
            type: "boolean",
            description: "true 면 실패 명단이 상한(500건) 초과로 잘림.",
          },
          createdBy: { type: "string" },
          createdByName: { type: "string", nullable: true, description: "등록자명 (DB 미존재 시 null)" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      InterfaceLogSummary: {
        type: "object",
        properties: {
          id: { type: "integer" },
          traceId: { type: "string" },
          system: { type: "string" },
          direction: { type: "string" },
          apiName: { type: "string" },
          method: { type: "string" },
          requestUrl: { type: "string" },
          responseStatus: { type: "integer" },
          resultCode: { type: "string", nullable: true },
          durationMs: { type: "integer" },
          callerRoute: { type: "string" },
          userId: { type: "string", nullable: true },
          userType: { type: "string", nullable: true },
          errorMessage: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      InterfaceLogDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          traceId: { type: "string" },
          system: { type: "string" },
          direction: { type: "string" },
          apiName: { type: "string" },
          method: { type: "string" },
          requestUrl: { type: "string" },
          requestBody: { type: "string", nullable: true },
          responseStatus: { type: "integer" },
          responseBody: { type: "string", nullable: true },
          resultCode: { type: "string", nullable: true },
          durationMs: { type: "integer" },
          callerRoute: { type: "string" },
          userId: { type: "string", nullable: true },
          userType: { type: "string", nullable: true },
          errorMessage: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string" },
        },
      },
      MassMailCreateRequest: {
        type: "object",
        required: ["senderName", "subject", "body", "status"],
        properties: {
          senderName: { type: "string" },
          targetSuperAdmin: { type: "boolean" },
          targetAdmin: { type: "boolean" },
          targetFirstStore: { type: "boolean" },
          targetSecondStore: { type: "boolean" },
          targetConstructor: { type: "boolean" },
          targetGeneral: { type: "boolean" },
          optOut: { type: "boolean", description: "뉴스레터 수신거부 제외 여부" },
          subject: { type: "string" },
          body: { type: "string" },
          status: { type: "string", enum: ["draft", "pending"], description: "draft=임시저장, pending=발송대기" },
          files: { type: "array", items: { type: "string", format: "binary" } },
        },
      },
    },
  },
};
