import { z } from "zod";

// ─── Inquiry (문의등록) ───

export const createInquirySchema = z.object({
  companyName: z.string().min(1, "会社名は必須です").max(255),
  userName: z.string().min(1, "氏名は必須です").max(200),
  tel: z.string().max(20).optional(),
  email: z.string().email("有効なメールアドレスを入力してください").max(255),
  inquiryType: z.string().min(1, "お問い合わせタイプは必須です").max(100),
  title: z.string().min(1, "タイトルは必須です").max(500),
  content: z.string().min(1, "内容は必須です"),
});

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
