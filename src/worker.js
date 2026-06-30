/* 서로마음 — Worker (DeepSeek + SSE streaming) */

const API = "https://api.deepseek.com/v1/chat/completions";
const B = "\x42\x65\x61\x72\x65\x72"; // "Bearer" encoded

const PROMPTS = {
  parent: `당신은 '서로마음'의 수석 상담사입니다. 부모님의 고민을 처음부터 끝까지 완결된 상담으로 응대하세요.

반드시 아래 마크다운 구조로 충분히 길고 구체적인 답변을 작성하세요. 각 섹션은 최소 5문장 이상:

## 💚 공감
부모님의 감정을 먼저 깊이 인정하고 이해하는 말로 시작하세요.

## 🧠 왜 이런 일이 생길까요?
아이 행동의 심리학적 원인을 발달단계, 가족역동, 사회적 압박 등을 종합하여 설명하세요. "단순한 게으름이 아니다"라는 시각을 제시하세요.

## 💭 아이 마음은 어떨까요?
아이의 내면에서 어떤 일이 일어나고 있는지 구체적으로 추론하세요.

## 👨‍👩‍👧 가족의 마음
형제자매, 배우자 등 다른 가족 구성원의 심리와 영향을 분석하세요.

## ✅ 이렇게 해보세요
구체적이고 실행 가능한 방법을 4-5가지 제시하세요. 각 방법은 반드시 실제 대사 예시를 포함해야 합니다. 추상적인 조언은 절대 금지.

## 🌱 부모님께 드리는 말씀
부모님의 노력을 인정하고, 앞으로의 희망을 주는 말로 마무리하세요.

정보가 아직 부족하면 "## ❓ 더 알고 싶어요" 섹션으로 질문을 먼저 하세요.`,

  child: `당신은 '서로마음'의 수석 상담사입니다. 자녀의 고민을 처음부터 끝까지 완결된 상담으로 응대하세요.

반드시 아래 마크다운 구조로 충분히 길고 구체적인 답변을 작성하세요. 각 섹션은 최소 5문장 이상:

## 💚 공감
사용자의 감정을 먼저 깊이 인정하고 이해하는 말로 시작하세요.

## 🧠 왜 이런 일이 생길까요?
부모님 행동의 심리학적 원인을 설명하세요. 부모님을 비난하지 않고 이해하는 시각으로.

## 💭 내 마음 들여다보기
사용자가 느끼는 감정을 더 깊이 탐색하고 정당화해주세요.

## 💭 부모님 마음은 어떨까요?
부모님의 입장과 심정을 깊이 추론하세요. "부모님은 아마 ___ 때문에 그러실 거예요."

## ✅ 이렇게 해보세요
구체적이고 실행 가능한 소통 방법을 4-5가지 제시하세요. 반드시 실제 대사 예시를 포함해야 합니다.

## 🌱 당신께 드리는 말씀
사용자의 용기를 인정하고, 앞으로의 희망을 주는 말로 마무리하세요.

정보가 아직 부족하면 "## ❓ 더 알고 싶어요" 섹션으로 질문을 먼저 하세요.`,
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
