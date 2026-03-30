import type { OpenAPIV3 } from "openapi-types";

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
    description: "Q.PARTNERS REST API — 인증, 공통코드 관리",
  },
  servers: [{ url: "/api", description: "Local API" }],

  tags: [
    { name: "Auth", description: "인증 (로그인/로그아웃/사용자 정보)" },
    { name: "TwoFactor", description: "2차 인증 (이메일 인증번호)" },
    { name: "CodeHeader", description: "공통코드 헤더 관리" },
    { name: "CodeDetail", description: "공통코드 상세 관리" },
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
| 1차 판매점 | T01 | 1234 | DEALER |
| 2차 판매점 | 201T01 | 1234 | DEALER |
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
                    data: { $ref: "#/components/schemas/LoginUser" },
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
        description: "이메일로 비밀번호 변경 링크를 발송. 이메일 존재 여부와 관계없이 동일한 응답을 반환 (보안).",
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
                        message: { type: "string", example: "비밀번호 변경 링크가 이메일로 발송되었습니다." },
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
          "500": errorResponse("서버 오류"),
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
  },

  components: {
    schemas: {
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
            enum: ["ADMIN", "DEALER", "SEKO", "GENERAL"],
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
            enum: ["ADMIN", "DEALER", "SEKO", "GENERAL"],
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
            enum: ["ADMIN", "DEALER", "SEKO", "GENERAL"],
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
          requireTwoFactor: { type: "boolean", description: "2차 인증 필요 여부 (로그인 응답에만 포함)" },
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
            enum: ["ADMIN", "DEALER", "SEKO", "GENERAL"],
            example: "GENERAL",
            description: "사용자 유형",
          },
          loginId: { type: "string", description: "로그인 ID (선택)" },
          email: { type: "string", format: "email", example: "user@example.com", description: "비밀번호 변경 링크를 받을 이메일" },
          sekoId: { type: "string", description: "시공점 ID (선택)" },
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
          newPassword: { type: "string", minLength: 8, example: "1q2w3e4R!", description: "새 비밀번호 (Uppercase + Lowercase + Number, min 8)" },
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
