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
                        { type: "object", properties: { requireTwoFactor: { type: "boolean", description: "2차 인증 필요 여부" } } },
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
        description: "이메일로 비밀번호 변경 링크를 발송. 시간당 3건 초과 시 429 반환. 회원 미존재 시에도 동일 200 응답 (이메일 열거 공격 방지).",
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
          "400": {
            description: "Validation failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthValidationErrorResponse" },
              },
            },
          },
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
                        userType: { type: "string", example: "GENERAL" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("유효하지 않거나 만료된 링크입니다."),
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
        description: "JWT 인증 상태에서 비밀번호 변경. pwdInitYn=Y인 판매점 최초 로그인 시 회원정보 설정 팝업(p.12)에서 호출. 성공 시 JWT 재발급 (pwdInitYn=N, twoFactorVerified=true).",
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
        description: "QSP /user/detail I/F를 활용하여 이메일 사용 가능 여부 확인. PII 보호를 위해 POST 사용.",
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
        description: "parentId=null이면 1-Level, parentId 지정 시 2-Level. 3레벨 이상 불가.",
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
    },

    "/menus/sort": {
      put: {
        tags: ["Menu"],
        summary: "정렬순서 일괄 저장",
        description: "트랜잭션으로 여러 메뉴의 sortOrder를 일괄 업데이트.",
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
            schema: { type: "string", maxLength: 50 },
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
            schema: { type: "string", maxLength: 50 },
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
          "400": errorResponse("Invalid roleCode"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
      put: {
        tags: ["Permission"],
        summary: "메뉴별 권한 일괄 저장",
        description: "기존 권한 전부 삭제 후 새로 생성 (replace). 트랜잭션 처리.",
        parameters: [
          {
            name: "roleCode",
            in: "path",
            required: true,
            schema: { type: "string", maxLength: 50 },
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
          "400": validationErrorResponse,
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
    },

    // ─── HomeNotice ───
    "/home-notices": {
      get: {
        tags: ["HomeNotice"],
        summary: "홈화면 공지 목록 (관리자용)",
        parameters: [
          { name: "keyword", in: "query", description: "공지내용 Like 검색", schema: { type: "string" } },
          { name: "status", in: "query", description: "scheduled/active/ended (콤마 구분)", schema: { type: "string" } },
          { name: "targetType", in: "query", description: "게시대상 필터 (super_admin/admin/first_store/second_store/seko/general)", schema: { type: "string" } },
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
                    data: { $ref: "#/components/schemas/HomeNoticeListItem" },
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
          { name: "pageSize", in: "query", schema: { type: "integer", enum: [20, 50, 100], default: 20 } },
          { name: "keyword", in: "query", schema: { type: "string" } },
          { name: "categoryIds", in: "query", description: "콤마 구분 카테고리 ID", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["draft", "published", "deleted"], default: "published" } },
          { name: "targetType", in: "query", schema: { type: "string" } },
          { name: "department", in: "query", schema: { type: "string" } },
          { name: "internalOnly", in: "query", schema: { type: "boolean", default: false } },
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
          "403": errorResponse("관리자 권한 필요"),
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
          "403": errorResponse("수정 권한 없음"),
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
          "403": errorResponse("삭제 권한 없음"),
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
          "403": errorResponse("관리자 권한 필요"),
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
          "403": errorResponse("수정 권한 없음"),
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
          "403": errorResponse("수정 권한 없음"),
          "404": errorResponse("Not found"),
          "409": errorResponse("동시성 충돌 — 다른 요청에 의해 첨부파일이 변경됨"),
          "411": errorResponse("Content-Length 헤더 누락"),
          "413": errorResponse("Content-Length 초과"),
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
          { name: "headerCode", in: "query", required: true, description: "코드 헤더 코드 (예: INQUIRY_TYPE)", schema: { type: "string", pattern: "^[A-Z0-9_]{1,50}$", maxLength: 50 } },
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
        summary: "카테고리 삭제 (물리 삭제)",
        description: "하위 카테고리 또는 연결된 콘텐츠가 있으면 삭제 불가.",
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
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("하위 카테고리 또는 연결된 콘텐츠 존재"),
          "404": errorResponse("Not found"),
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
                        newsRcptDate: { type: "string", nullable: true },
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
        description: "회원유형별 수정 가능 항목 차별화. GENERAL: 전체 수정, ADMIN/STORE: 뉴스레터만 수정 가능",
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
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reason"],
                properties: {
                  reason: { type: "string", maxLength: 1000 },
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
          "401": errorResponse("인증 필요"),
          "403": errorResponse("일반회원만 탈퇴 가능"),
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
          { name: "keyword", in: "query", schema: { type: "string" }, description: "ID/성명/이메일/회사명 Like 검색" },
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
          "403": errorResponse("관리자 권한 필요"),
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
          "403": errorResponse("관리자 권한 필요"),
          "500": errorResponse("서버 에러"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
      put: {
        tags: ["Member"],
        summary: "회원 상세정보 수정",
        description:
          "관리자 전용 — 권한별 수정 제한 정책: GENERAL 은 전체 필드 수정 가능. " +
          "STORE/SEKO/ADMIN 은 newsRcptYn 만 변경 가능 (비밀번호는 별도 /reset-password API). " +
          "탈퇴/삭제된 STORE 회원은 storeLvl 확보 불가로 수정 차단(400).",
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
                        warning: { type: "string", description: "TOCTOU 사후 검증 실패/불일치 시 경고 메시지" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("검증 실패 / 권한별 수정 제한 위반 / 탈퇴·삭제 STORE 회원 차단 / 본인 계정 critical 변경 차단"),
          "401": errorResponse("인증 필요"),
          "403": errorResponse("관리자 권한 필요"),
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
          "403": errorResponse("관리자 권한 필요"),
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
          "403": errorResponse("관리자 권한 필요"),
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
          "403": errorResponse("관리자 권한 필요"),
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
          "403": errorResponse("관리자 권한 필요"),
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
          "403": errorResponse("관리자 권한 필요 또는 타인 작성 메일"),
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
          "401": errorResponse("인증 필요"),
          "403": errorResponse("관리자 권한 필요"),
          "404": errorResponse("메일 없음"),
          "500": errorResponse("삭제 실패"),
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
          pwdInitYn: { type: "string", enum: ["Y", "N"], nullable: true, description: "비밀번호 초기화 여부 — Y면 회원정보 설정 팝업 표시 (p.12)" },
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
          "isNew", "isUpdated", "categories", "targets", "attachmentCount",
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
          "isNew", "isUpdated", "categories", "targets", "attachments",
        ],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          body: { type: "string", nullable: true },
          status: { type: "string", enum: ["draft", "published", "deleted"] },
          authorDepartment: { type: "string", nullable: true },
          userType: { type: "string", nullable: true },
          userId: { type: "string", nullable: true },
          viewCount: { type: "integer" },
          publishedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
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
          sortOrder: { type: "integer", default: 1 },
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
          roleCode: { type: "string", maxLength: 50, example: "Cus6" },
          roleName: { type: "string", maxLength: 100, example: "특수회원" },
          description: { type: "string", maxLength: 500, nullable: true, example: "특수 파트너사" },
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
        required: ["id", "startAt", "endAt", "content", "userType", "userId", "createdAt", "updatedAt"],
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
          content: { type: "string" },
          url: { type: "string", nullable: true },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["scheduled", "active", "ended"] },
          userType: { type: "string" },
          userId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          createdBy: { type: "string", nullable: true },
          updatedAt: { type: "string", format: "date-time" },
          updatedBy: { type: "string", nullable: true },
        },
      },
      ActiveHomeNotice: {
        type: "object",
        properties: {
          id: { type: "integer" },
          content: { type: "string" },
          url: { type: "string", nullable: true },
          startAt: { type: "string", format: "date-time" },
        },
      },
      CreateHomeNotice: {
        type: "object",
        required: ["startAt", "endAt", "content"],
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
          content: { type: "string", example: "공지 내용 텍스트" },
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
          content: { type: "string" },
          url: { type: "string", maxLength: 500, nullable: true },
        },
      },
      UpdatePermissions: {
        type: "object",
        required: ["permissions"],
        properties: {
          permissions: {
            type: "array",
            items: {
              type: "object",
              required: ["menuCode"],
              properties: {
                menuCode: { type: "string", maxLength: 50, example: "SEARCH" },
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
          lastLoginAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time", nullable: true },
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
          userRole: { type: "string" },
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
          notFoundInQsp: { type: "boolean", description: "QSP에서 조회 불가(삭제/탈퇴 등)일 때 true" },
        },
      },
      MemberUpdateRequest: {
        type: "object",
        properties: {
          userRole: { type: "string", description: "일반회원만 변경 가능" },
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
          status: { type: "string", enum: ["draft", "pending", "sent"] },
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
          sentAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MassMailDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          senderName: { type: "string" },
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
          optOut: { type: "boolean" },
          subject: { type: "string" },
          body: { type: "string" },
          status: { type: "string", enum: ["draft", "pending", "sent"] },
          sentAt: { type: "string", format: "date-time", nullable: true },
          attachments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                fileName: { type: "string" },
                fileSize: { type: "integer", nullable: true },
              },
            },
          },
          createdBy: { type: "string" },
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
