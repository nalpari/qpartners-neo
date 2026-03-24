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

const jsonContent = (
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
): OpenAPIV3.MediaTypeObject => ({ schema });

export const openApiSpec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Q.PARTNERS API",
    version: "1.0.0",
    description: "Q.PARTNERS 공통코드 관리 API",
  },
  servers: [{ url: "/api", description: "Local API" }],

  tags: [
    { name: "CodeHeader", description: "공통코드 헤더 관리" },
    { name: "CodeDetail", description: "공통코드 상세 관리" },
  ],

  paths: {
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
      CodeHeader: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          headerCode: { type: "string", example: "STATUS" },
          headerId: { type: "string", example: "STATUS" },
          headerName: { type: "string", example: "상태코드" },
          relCode1: { type: "string", nullable: true },
          relCode2: { type: "string", nullable: true },
          relCode3: { type: "string", nullable: true },
          relNum1: { type: "string", nullable: true, example: "100.50" },
          relNum2: { type: "string", nullable: true },
          relNum3: { type: "string", nullable: true },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CodeDetail: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          headerId: { type: "integer", example: 1 },
          code: { type: "string", example: "ACTIVE" },
          displayCode: { type: "string", example: "01" },
          codeName: { type: "string", example: "활성" },
          codeNameEtc: { type: "string", nullable: true },
          relCode1: { type: "string", nullable: true },
          relCode2: { type: "string", nullable: true },
          relNum1: { type: "string", nullable: true },
          sortOrder: { type: "integer", example: 1 },
          isActive: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateCodeHeader: {
        type: "object",
        required: ["headerCode", "headerId", "headerName"],
        properties: {
          headerCode: { type: "string", maxLength: 20, example: "STATUS" },
          headerId: { type: "string", maxLength: 50, example: "STATUS" },
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
          headerId: { type: "string", maxLength: 50 },
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
