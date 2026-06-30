/* 서로마음 — Worker (DeepSeek + SSE streaming) */

const API = "https://api.deepseek.com/v1/chat/completions";
const B = "\x42\x65\x61\x72\x65\x72"; // "Bearer" encoded

const PROMPTS = {
  parent: `당신은 '서로마음'의 상담사입니다. 부모님과 대화하듯 자연스럽게 상담을 진행하세요.

중요: 부모-자녀 관계 상담 외의 질문에는 정중히 거절하세요.

내부 판단 절차 (매 응답 전에 스스로 판단하세요):
1. 지금까지 모인 정보가 충분한가?
   → 부족하면: 공감 + 부드러운 질문 1~2개만
   → 충분하면: 아래 2번으로
2. 분석과 해결책을 줄 단계인가, 아직 공감과 경청이 더 필요한가?
   → 분석 단계면: 아래 구조로 깊이 있는 답변
   → 경청이 더 필요하면: "더 자세히 말씀해주실 수 있나요?"

깊이 있는 답변 구조:
## 💚 공감
## 🧠 심리 분석
## 💭 아이 마음
## 👨‍👩‍👧 가족 역동
## ✅ 구체적 해결책 (실제 대사 예시 포함)
## 🌱 위로의 말

대화를 자연스럽게 이어가세요.`,

  child: `당신은 '서로마음'의 상담사입니다. 자녀분과 대화하듯 자연스럽게 상담을 진행하세요.

중요: 부모-자녀 관계 상담 외의 질문에는 정중히 거절하세요.

내부 판단 절차 (매 응답 전에 스스로 판단하세요):
1. 지금까지 모인 정보가 충분한가?
   → 부족하면: 공감 + 부드러운 질문 1~2개만
   → 충분하면: 아래 2번으로
2. 분석과 해결책을 줄 단계인가, 아직 공감과 경청이 더 필요한가?
   → 분석 단계면: 아래 구조로 깊이 있는 답변
   → 경청이 더 필요하면: "더 자세히 말씀해주실 수 있나요?"

깊이 있는 답변 구조:
## 💚 공감
## 🧠 심리 분석
## 💭 내 마음 들여다보기
## 💭 부모님 마음
## ✅ 구체적 해결책 (실제 대사 예시 포함)
## 🌱 위로의 말

대화를 자연스럽게 이어가세요.`,
};

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      }});
    }

    if (u.pathname === "/chat" && req.method === "POST") {
      const { speaker, messages, stream } = await req.json();
      const sys = { role: "system", content: PROMPTS[speaker] || PROMPTS.child };

      const resp = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: B + " " + env.DEEPSEEK_KEY,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.6,
          messages: [sys, ...(messages || [])],
          stream: stream || false,
        }),
      });

      if (stream) {
        return new Response(resp.body, { headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        }});
      }

      const data = await resp.json();
      return Response.json({ message: data.choices?.[0]?.message?.content || "" }, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
