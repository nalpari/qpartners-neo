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
          { name: "targetType", in: "query", description: "게시대상 필터 (super_admin/admin/first_dealer/second_dealer/constructor/general)", schema: { type: "string" } },
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
          "400": validationErrorResponse,
          "404": errorResponse("Not found"),
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
                    data: { type: "array", items: { type: "object" } },
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
                        targetType: { type: "string", enum: ["first_dealer", "second_dealer", "constructor", "general", "non_member"] },
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
          "201": { description: "등록 성공", content: { "application/json": { schema: { type: "object", properties: { data: { type: "object" } } } } } },
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
          "200": { description: "조회 성공", content: { "application/json": { schema: { type: "object", properties: { data: { type: "object" } } } } } },
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
          "200": { description: "수정 성공", content: { "application/json": { schema: { type: "object", properties: { data: { type: "object" } } } } } },
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
          "403": errorResponse("관리자 권한 필요"),
          "404": errorResponse("Not found"),
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
          "403": errorResponse("접근 권한 없음"),
          "404": errorResponse("Not found"),
          "500": errorResponse("서버 에러"),
        },
      },
    },
    "/download-logs": {
      get: {
        tags: ["DownloadLog"],
        summary: "다운로드 이력 조회 (관리자)",
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
                    data: { type: "array", items: { type: "object" } },
                    meta: { type: "object" },
                  },
                },
              },
            },
          },
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
        description: "parentId=null이면 1Depth, parentId 지정 시 2Depth. 3Depth 이상 불가.",
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
                        sei: { type: "string" },
                        mei: { type: "string" },
                        seiKana: { type: "string" },
                        meiKana: { type: "string" },
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
          "400": errorResponse("施工店会員は別途API使用 / メール情報なし"),
          "401": errorResponse("인증 필요"),
          "404": errorResponse("ユーザー情報なし"),
          "500": errorResponse("内部エラー"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
      put: {
        tags: ["MyPage"],
        summary: "프로필 수정",
        description: "회원유형별 필수/수정 가능 항목 차별화, QSP API 호출",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sei", "mei", "seiKana", "meiKana", "compNm", "zipcode", "address1", "telNo", "newsRcptYn"],
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
          "400": validationErrorResponse,
          "401": errorResponse("인증 필요"),
          "500": errorResponse("内部エラー"),
          "502": errorResponse("외부 서버 오류"),
        },
      },
    },
    "/mypage/change-password": {
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
      CategoryTree: {
        allOf: [
          { $ref: "#/components/schemas/Category" },
          {
            type: "object",
            properties: {
              children: {
                type: "array",
                items: { $ref: "#/components/schemas/Category" },
              },
            },
          },
        ],
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
          targetFirstDealer: { type: "boolean" },
          targetSecondDealer: { type: "boolean" },
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
          targets: { type: "array", items: { type: "string" }, example: ["first_dealer", "constructor"] },
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
        },
      },
      CreateHomeNotice: {
        type: "object",
        required: ["startAt", "endAt", "content"],
        description: "게시대상(target*) 중 최소 1개 true 필수",
        properties: {
          targetSuperAdmin: { type: "boolean", default: false },
          targetAdmin: { type: "boolean", default: false },
          targetFirstDealer: { type: "boolean", default: false },
          targetSecondDealer: { type: "boolean", default: false },
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
          targetFirstDealer: { type: "boolean" },
          targetSecondDealer: { type: "boolean" },
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
    },
  },
};
