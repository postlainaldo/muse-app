import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "../../../lib/auth";

// Định cấu hình danh sách mô hình miễn phí hoạt động ổn định nhất năm 2026 trên OpenRouter
const WORKERS: Record<string, { name: string; url: string; model: string }> = {
  WorkerA: { name: "Llama 3.1 8B (Meta)", url: "https://openrouter.ai/api/v1/chat/completions", model: "meta-llama/llama-3.1-8b-instruct:free" },
  WorkerB: { name: "Qwen 2.5 7B (Alibaba)", url: "https://openrouter.ai/api/v1/chat/completions", model: "qwen/qwen-2.5-7b-instruct:free" },
  WorkerC: { name: "Mistral 7B (Pháp)", url: "https://openrouter.ai/api/v1/chat/completions", model: "mistralai/mistral-7b-instruct:free" },
  WorkerD: { name: "Mô hình Tự động (Free Router)", url: "https://openrouter.ai/api/v1/chat/completions", model: "openrouter/free" },
};

async function callLLM(apiUrl: string, apiKey: string, model: string, messages: any[]) {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${apiKey}`, 
      "Content-Type": "application/json",
      "HTTP-Referer": "https://muse-app-nine.vercel.app", 
      "X-Title": "Muse App"
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 })
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter Error: ${res.status} - ${errText}`);
  }
  
  const data = await res.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error("OpenRouter không trả về kết quả.");
  }
  return data.choices[0].message.content;
}

export async function POST(req: Request) {
  const session: any = await getServerSession(authOptions);
  const { action, currentStory, userPrompt, mood, stories } = await req.json();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Chưa ủy quyền Google Drive." }, { status: 401 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: session.accessToken });
  const drive = google.drive({ version: "v3", auth });

  try {
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

    if (action === "load") {
      const resList = await drive.files.list({ q: "name='muse_data.json' and trashed=false", fields: "files(id)" });
      const files = resList.data.files || [];
      if (files.length === 0) return NextResponse.json({ stories: [] });
      const resContent = await drive.files.get({ fileId: files[0].id!, alt: "media" });
      return NextResponse.json({ stories: resContent.data });
    }

    if (action === "generate") {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường GEMINI_API_KEY trên Vercel.");
      }
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("Thiếu cấu hình biến môi trường OPENROUTER_API_KEY trên Vercel.");
      }

      const fullPrompt = mood ? `Viết tiếp với văn phong phong cách: [${mood}]. Ý tưởng bổ sung: ${userPrompt || "Viết tiếp một cách tự nhiên."}` : userPrompt;

      const routerPrompt = `You are the Master AI coordinator. Analyze this story context: "${currentStory}" and the prompt: "${fullPrompt}".
      Select EXACTLY 2 workers best suited for this section from:
      - WorkerA: Intense drama, emotional tension, character dialogues.
      - WorkerB: Beautiful scenery descriptions, deep romantic/emotional imagery, slow atmosphere.
      - WorkerC: Suspenseful moments, sudden twists, logical actions, mystery.
      - WorkerD: Rich world-building details, inner thoughts, philosophical depth.
      Return ONLY a JSON array, e.g., ["WorkerA", "WorkerB"]`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: routerPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!geminiRes.ok) {
        const geminiErr = await geminiRes.text();
        throw new Error(`Gemini Master AI Error: ${geminiRes.status} - ${geminiErr}`);
      }

      const geminiData = await geminiRes.json();
      let decisionText = geminiData.candidates[0].content.parts[0].text;
      decisionText = decisionText.replace(/```json|```/g, "").trim();
      
      let w1 = "WorkerA";
      let w2 = "WorkerB";
      try {
        const decision = JSON.parse(decisionText);
        if (Array.isArray(decision) && decision.length >= 2) {
          w1 = decision[0];
          w2 = decision[1];
        } else {
          const matches = decisionText.match(/Worker[A-D]/g);
          if (matches && matches.length >= 2) {
            w1 = matches[0];
            w2 = matches[1];
          }
        }
      } catch (e) {
        const matches = decisionText.match(/Worker[A-D]/g);
        if (matches && matches.length >= 2) {
          w1 = matches[0];
          w2 = matches[1];
        }
      }

      if (!WORKERS[w1]) w1 = "WorkerA";
      if (!WORKERS[w2]) w2 = "WorkerB";

      // Cập nhật hệ thống prompt để ép AI viết nối chữ mượt mà đúng chuẩn Google AI Studio
      const workerPrompt = `You are a creative co-author continuing a story context. 
      Story context: "${currentStory}"
      Prompt/Mood requirement: "${fullPrompt}"
      
      CRITICAL INSTRUCTION: Continue writing the story seamlessly from the very last word of the context. 
      Do NOT write any introductory notes, greetings, or explanations. 
      Do NOT repeat the prompt or previous sentences. 
      Write ONLY the continuation text (about 80-120 words) as if you are the same author writing the very next sentence.`;
      
      const p1 = callLLM(WORKERS[w1].url, process.env.OPENROUTER_API_KEY, WORKERS[w1].model, [{ role: "user", content: workerPrompt }]);
      const p2 = callLLM(WORKERS[w2].url, process.env.OPENROUTER_API_KEY, WORKERS[w2].model, [{ role: "user", content: workerPrompt }]);
      const [res1, res2] = await Promise.all([p1, p2]);

      // Ép Master Editor tối ưu mượt mà điểm tiếp nối câu chữ
      const evalPrompt = `Current story context: "${currentStory}"\n\nPrompt/mood instruction: "${fullPrompt}"\n\nSelect and combine the best, most emotional parts of these two continuations into a single, perfectly flowing paragraph that seamlessly continues the context:
      Continuation 1 (from ${WORKERS[w1].name}): "${res1}"\nContinuation 2 (from ${WORKERS[w2].name}): "${res2}"\n\nCRITICAL: Your output must IMMEDIATELY follow the last word of the story context without any jump, greeting, introductory notes, or formatting. Output ONLY the finalized story continuation text.`;

      const evalRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: evalPrompt }] }] })
      });

      if (!evalRes.ok) {
        const evalErr = await evalRes.text();
        throw new Error(`Gemini Editor Error: ${evalRes.status} - ${evalErr}`);
      }

      const evalData = await evalRes.json();
      return NextResponse.json({
        text: evalData.candidates[0].content.parts[0].text,
        selectedWorkers: [WORKERS[w1].name, WORKERS[w2].name]
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Lỗi xử lý nội bộ" }, { status: 500 });
  }
}
