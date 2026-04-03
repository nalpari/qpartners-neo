import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const adapter = new PrismaMariaDb({
  host: requireEnv("DB_HOST"),
  port: Number(requireEnv("DB_PORT")),
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  database: requireEnv("DB_NAME"),
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const header = await prisma.codeHeader.upsert({
    where: { headerCode: "INQUIRY_TYPE" },
    update: {},
    create: {
      headerCode: "INQUIRY_TYPE",
      headerAlias: "inquiryType",
      headerName: "문의유형",
      isActive: true,
    },
  });
  console.log("Header:", header.id, header.headerCode);

  const EMAIL = "chang9811@interplug.co.kr";
  const details = [
    { code: "01", displayCode: "01", codeName: "ログインIDおよびログインに関するお問い合わせ", codeNameEtc: "로그인ID 및 로그인에 관한 문의" },
    { code: "02", displayCode: "02", codeName: "会員登録に関するお問い合わせ", codeNameEtc: "회원등록에 관한 문의" },
    { code: "03", displayCode: "03", codeName: "施工ID/施工研修に関するお問い合わせ", codeNameEtc: "시공ID 및 시공연수에 관한 문의" },
    { code: "04", displayCode: "04", codeName: "配信メールに関するお問い合わせ（受信拒否を含む）", codeNameEtc: "뉴스레터에 관한 문의 (수신거부 포함)" },
    { code: "05", displayCode: "05", codeName: "営業・マーケティング資料に関するお問い合わせ", codeNameEtc: "영업, 마케팅 자료에 관한 문의" },
    { code: "06", displayCode: "06", codeName: "技術資料に関するお問い合わせ", codeNameEtc: "기술자료에 관한 문의" },
    { code: "07", displayCode: "07", codeName: "品質保証資料に関するお問い合わせ", codeNameEtc: "품질보증자료에 관한 문의" },
    { code: "08", displayCode: "08", codeName: "退会に関するお問い合わせ", codeNameEtc: "회원탈퇴에 관한 문의" },
  ];

  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    const detail = await prisma.codeDetail.upsert({
      where: { headerId_code: { headerId: header.id, code: d.code } },
      update: { codeName: d.codeName, codeNameEtc: d.codeNameEtc, relCode1: EMAIL, relCode2: EMAIL, relCode3: EMAIL },
      create: {
        headerId: header.id,
        code: d.code,
        displayCode: d.displayCode,
        codeName: d.codeName,
        codeNameEtc: d.codeNameEtc,
        relCode1: EMAIL,
        relCode2: EMAIL,
        relCode3: EMAIL,
        sortOrder: i + 1,
        isActive: true,
      },
    });
    console.log(`Detail [${detail.code}]:`, detail.codeName);
  }

  console.log("\n✅ INQUIRY_TYPE 공통코드 등록 완료 (8건)");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
