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
    // 1. Đồng bộ cấu hình và câu chuyện lên Google Drive
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

    // 2. Tải cấu hình và câu chuyện từ Google Drive
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

    // Gộp mạch truyện cũ thành một dòng thời gian để AI bắt mạch
    const historyContext = blocks && Array.isArray(blocks)
      ? blocks.map((b: any) => `${b.type === "user" ? "Ý tưởng/Thoại của tôi" : "Đoạn văn chi tiết"}: ${b.text}`).join("\n\n")
      : "Bắt đầu chương truyện mới.";

    // 3. Quy trình gọi mô hình GEMINI 3.5 FLASH độc nhất để phóng tác bám sát bối cảnh
    if (action === "generate") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường GEMINI_API_KEY.");
      }

      const fullPrompt = mood ? `Sáng tác theo văn văn phong: [${mood}]. Diễn biến tiếp theo: ${userPrompt}` : userPrompt;

      // System Prompt chuyên biệt được thiết kế tỉ mỉ bám sát phong cách Google AI Studio của bạn gái bạn
      const systemPrompt = `Bạn là "Muse ♥", nhà biên kịch và bạn đồng hành sáng tác văn học bậc thầy, vận hành chính xác như một phiên làm việc Google AI Studio chuyên viết truyện.

      Nhiệm vụ của bạn là lấy ý tưởng thô hoặc lời thoại ngắn gọn do người dùng nhập, kết hợp với "Chỉ dẫn hệ thống" (bối cảnh, nhân vật) và lịch sử truyện để phóng tác, viết tiếp thành một khối truyện hoàn chỉnh, giàu sức gợi, nhiều chi tiết mô tả và thoại tự nhiên (khoảng 200-350 từ).

      CHỈ DẪN HỆ THỐNG (Bối cảnh nền, nhân vật, ngoại hình, tính cách do người dùng tự cấu hình - TUÂN THỦ TUYỆT ĐỐI):
      "${systemInstructions || "Chưa có chỉ dẫn bối cảnh."}"

      MẠCH TRUYỆN ĐÃ XẢY RA (Đọc để giữ mạch truyện liền mạch, tránh lặp lại tình tiết cũ):
      ${historyContext}

      Ý TƯỞNG MỚI BẠN CẦN PHÓNG TÁC:
      "${fullPrompt}"

      QUY TẮC SÁNG TÁC BẮT BUỘC:
      1. ĐỊNH DẠNG MỞ ĐẦU: Nếu đây là khối truyện đầu tiên, hoặc diễn biến mới có sự thay đổi rõ rệt về địa điểm/thời gian, bạn BẮT BUỘC phải mở đầu khối truyện bằng dòng định dạng bối cảnh sau ở ngay dòng đầu tiên (suy luận logic từ bối cảnh nhân vật để tự điền thông tin cụ thể, không bịa vô lý):
         📌Địa điểm: [Tên cụ thể] ⏰Thời gian: [Giờ cụ thể] ⭐Ngày: [Ngày/Tháng] 🌄Thời tiết: [Mô tả ngắn thời tiết/không khí]
         (Nếu bối cảnh không đổi so với khối trước, không cần lặp lại dòng này).

      2. VĂN PHONG VÀ CHI TIẾT SỐNG ĐỘNG:
         - Văn phong đời thường, tự nhiên, mang đậm hơi thở cuộc sống hiện đại hoặc văn hóa vùng miền Nam Bộ một cách sắc nét và chân thực (Sử dụng từ ngữ biểu cảm cao, vd: "dẩu mỏ", "chà bá lửa", "ươn xụi lơ", "boa thêm tờ năm xị", "nhìn rớt con mắt", "bần bật", "cái RẦM rung chuyển").
         - Tả thực hành động nhỏ và tinh tế (vd: vén lọn tóc ra sau tai nhẹ hều, gõ gõ ngón tay lên bàn, lót khăn giấy dưới muỗng đũa) để bộc lộ rõ nét tính cách nhân vật.
         - Tả sâu các chi tiết giác quan: mùi mỡ hành thơm nức mũi, khói than bay mù mịt, gió đêm sông thổi lồng lộng, ánh đèn huỳnh quang sáng choang... làm nổi bật không khí của phân cảnh.

      3. HỘI THOẠI VÀ CHUYỂN CẢNH:
         - Đặt toàn bộ lời thoại trực tiếp của nhân vật trong dấu nháy kép tiếng Việt chuẩn: “...” (Ví dụ: “Cậu An, đừng rung đùi.”).
         - Đảm bảo lời thoại sắc sảo, tự nhiên, bộc lộ rõ vị thế và tính cách nhân vật (đại ca vựa tôm trọc phú, cô gái dịu dàng nghiêm nghị).

      4. HOÀN THIỆN:
         - Trả về duy nhất đoạn văn phóng tác hoàn chỉnh (bao gồm cả dòng bối cảnh nếu có).
         - Tuyệt đối không thêm bất kỳ lời chào, lời dẫn giải thích, ghi chú nào của AI.
         - Câu cuối cùng phải kết thúc trọn vẹn, không được cắt cụt giữa chừng.`;

      // Gọi chính xác gemini-3.5-flash
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

    // 4. Tạo gợi ý động bám sát ngữ cảnh thực tế của câu chuyện
    if (action === "suggest") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường.");
      }

      const historyContext = blocks && Array.isArray(blocks)
        ? blocks.map((b: any) => b.text).join("\n\n")
        : "";

      const suggestPrompt = `Dựa trên diễn biến truyện hiện tại dưới đây, hãy đưa ra đúng 3 gợi ý ngắn (dưới 7 từ mỗi gợi ý) về hướng đi tiếp theo của cốt truyện. Gợi ý cần khơi gợi cảm xúc, kịch tính, lãng mạn hoặc bất ngờ.
      Ngữ cảnh truyện: "${historyContext || "Bắt đầu câu chuyện mới"}"
      
      Trả về kết quả dưới dạng mảng JSON thuần túy như sau, tuyệt đối không viết thêm lời bình:
      ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"]`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
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
