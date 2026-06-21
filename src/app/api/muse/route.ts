import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "../../../lib/auth";

export async function POST(req: Request) {
  const session: any = await getServerSession(authOptions);
  const { action, title, systemInstructions, blocks, userPrompt, mood, stories } = await req.json();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Chưa ủy quyền Google Drive." }, { status: 401 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: session.accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
    // 1. Lưu đồng bộ tất cả cấu hình truyện (gồm cả System Instructions) lên Drive
    if (action === "save") {
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      const media = { mimeType: "application/json", body: JSON.stringify(stories) };
      if (files.length > 0) {
        await drive.files.update({ fileId: files[0].id!, media });
      } else {
        await drive.files.create({ requestBody: { name: "muse_data.json", mimeType: "application/json" }, media });
      }
      return NextResponse.json({ success: true });
    }

    // 2. Tải toàn bộ cấu hình truyện từ Drive về
    if (action === "load") {
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      if (files.length === 0) return NextResponse.json({ stories: [] });
      const resContent = await drive.files.get({ fileId: files[0].id!, alt: "media" });
      
      let parsedStories: any = resContent.data;
      if (typeof parsedStories === "string") {
        try {
          parsedStories = JSON.parse(parsedStories);
        } catch (e) {
          parsedStories = [];
        }
      }
      return NextResponse.json({ stories: parsedStories });
    }

    // 3. Quy trình gọi mô hình GEMINI 3.5 FLASH độc nhất để phóng tác cốt truyện
    if (action === "generate") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường GEMINI_API_KEY.");
      }

      // Gộp ngữ cảnh từ các khối truyện trước để AI giữ đúng mạch truyện
      const historyContext = blocks && Array.isArray(blocks)
        ? blocks.map((b: any) => `${b.type === "user" ? "Diễn biến cũ" : "Truyện hoàn chỉnh"}: ${b.text}`).join("\n\n")
        : "Bắt đầu chương truyện mới.";

      const fullPrompt = mood ? `Sáng tác với văn phong: [${mood}]. Ý tưởng mới: ${userPrompt}` : userPrompt;

      // System Prompt: vận hành giống Google AI Studio Playground — người dùng chỉ nhập 1 đoạn
      // diễn biến/thoại ngắn, AI viết lại thành khối truyện đầy đủ, nhiều tình tiết, đúng văn phong tham khảo
      const systemPrompt = `You are "Muse ♥", a professional Vietnamese creative co-author operating exactly like a Google AI Studio creative-writing playground session.

      SYSTEM INSTRUCTIONS (nhân vật, ngoại hình, tính cách, bối cảnh, cách họ tương tác — do người dùng tự định nghĩa, PHẢI tuân thủ tuyệt đối):
      "${systemInstructions || "Chưa có chỉ dẫn bối cảnh."}"

      PREVIOUS STORY HISTORY (để giữ mạch truyện liền mạch, không lặp lại tình tiết cũ):
      ${historyContext}

      NHIỆM VỤ: Người dùng chỉ nhập một đoạn diễn biến hoặc lời thoại ngắn gọn. Bạn PHẢI viết lại đoạn đó thành một khối truyện đầy đủ, nhiều ý hơn, thêm thắt tình tiết — nhưng vẫn bám sát đúng diễn biến gốc, không tự ý đổi hướng cốt truyện (khoảng 200-350 từ).

      ĐOẠN DIỄN BIẾN MỚI CẦN PHÓNG TÁC:
      "${fullPrompt}"

      QUY TẮC BẮT BUỘC:
      1. MỞ ĐẦU mỗi khối truyện bằng đúng 1 dòng set bối cảnh theo định dạng sau (suy luận hợp lý từ ngữ cảnh nếu người dùng không nêu rõ, không bịa vô lý, có thể giữ nguyên nếu bối cảnh chưa đổi so với khối trước):
      📌Địa điểm: [tên địa điểm cụ thể] ⏰Thời gian: [giờ] ⭐Ngày: [ngày/tháng] 🌄Thời tiết: [mô tả ngắn không khí/thời tiết]
      2. VĂN PHONG: giọng văn Nam Bộ/đời thường, giàu hình ảnh, sống động (vd: vén lọn tóc, rung đùi bần bật), chi tiết giác quan cụ thể (gió, mùi, ánh sáng), suy nghĩ nội tâm chân thực của nhân vật.
      3. THOẠI: lời thoại nhân vật đặt trong dấu ngoặc kép strictly “...” (vd: “Cậu An, đừng rung đùi.”).
      4. KHÔNG thêm lời dẫn, ghi chú, lời chào hay giải thích ngoài lề — chỉ trả về đúng đoạn truyện (gồm cả dòng bối cảnh). Câu cuối PHẢI hoàn chỉnh, tuyệt đối không cắt giữa chừng.`;

      // Sử dụng chính xác gemini-3.5-flash theo yêu cầu của bạn
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      });

      if (!geminiRes.ok) {
        const geminiErr = await geminiRes.text();
        throw new Error(`Gemini Error: ${geminiRes.status} - ${geminiErr}`);
      }

      const geminiData = await geminiRes.json();
      const outputText = geminiData.candidates[0].content.parts[0].text;
      return NextResponse.json({ text: outputText });
    }

    // 4. Phân tích bối cảnh truyện để tự động cập nhật gợi ý động
    if (action === "suggest") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường.");
      }

      const historyContext = blocks && Array.isArray(blocks)
        ? blocks.map((b: any) => b.text).join("\n\n")
        : "";

      const suggestPrompt = `Dựa trên diễn biến truyện hiện tại dưới đây, hãy đưa ra đúng 3 gợi ý ngắn gọn (dưới 7 từ mỗi gợi ý) về hướng đi tiếp theo của cốt truyện. Gợi ý cần khơi gợi cảm xúc, kịch tính, lãng mạn hoặc bất ngờ.
      Ngữ cảnh truyện: "${historyContext || "Bắt đầu câu chuyện mới"}"
      
      Trả về kết quả dưới dạng mảng JSON thuần túy như sau, tuyệt đối không viết thêm lời bình:
      ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: suggestPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!geminiRes.ok) {
        throw new Error("Không thể tạo gợi ý.");
      }

      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates[0].content.parts[0].text;
      return NextResponse.json({ suggestions: JSON.parse(rawText) });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Lỗi xử lý nội bộ" }, { status: 500 });
  }
}
