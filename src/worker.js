/* 서로마음 — Worker (하네스 + RAG + 가드레일) */

const API = "https://api.deepseek.com/v1/chat/completions";
import { searchScenarios } from "./scenarios_index.js";
const B = "\x42\x65\x61\x72\x65\x72";

// ── 입력 가드레일: 위험 키워드 감지 ────────────────────
const DANGER_KEYWORDS = ["때리", "체벌", "매를", "폭력", "학대", "자살", "죽이", "자해"];
function checkGuardrail(text) {
  const lower = (text || "").toLowerCase();
  for (const kw of DANGER_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}
const GUARDRAIL_MSG = "해당 사안은 전문 소아청소년과 전문의나 상담 센터의 도움을 받으셔야 합니다. 도움이 필요하시면 한국정신건강복지센터(1577-0199)로 연락주세요. 서로마음은 가벼운 육아 고민 상담만 도와드릴 수 있습니다.";

// ── 1차 호출: 현재 상태 판단 ──────────────────────────
const JUDGE_PROMPT = `당신은 상담 상태 판단기입니다. 대화 내용을 보고 현재 상담이 어느 단계인지 판단하세요.

단계:
- "intake": 첫 인사, 아직 고민을 제대로 말하지 않음 → 공감 + 고민을 더 물어봐야 함
- "assess": 고민은 나왔지만 구체적 정보(나이, 기간, 가족구성 등)가 부족 → 질문 필요
- "analyze": 정보가 충분히 모임 → 심리 분석 + 핵심 문제 명명 필요
- "solve": 분석 완료, 해결책 제시 단계
- "close": 해결책 제시 완료, 마무리와 위로

판단 기준:
- 대화가 1~2턴이고 고민이 막연하면 "intake"
- 고민은 구체적인데 나이/기간/가족구성 등이 없으면 "assess"
- 충분한 정보가 모였으면 "analyze"
- 이미 분석을 했다면 "solve"
- 해결책까지 줬다면 "close"

JSON 응답: {"stage":"assess","reason":"아이 나이와 구체적 상황 정보가 아직 부족함"}`;

// ── 안심 문구 (모든 응답에 자동 포함) ──────────────────
const COMFORT = `[필수] 당신은 아이를 키워본 경험이 있는 상담 도우미입니다. 전문가는 아니므로 제안형으로 말하세요.
절대 부모님을 비난하거나 죄책감을 주지 마세요. "부모님 탓이 아닙니다. 이 시기 아이들에게 흔한 모습이에요" 같은 안심 문구를 매 응답마다 자연스럽게 포함하세요.`;

// ── 단계별 응답 프롬프트 ──────────────────────────────
const STAGE_PROMPTS = {
  intake: `당신은 아이를 키워본 경험이 있는 '서로마음' 상담사입니다.
부모-자녀 관계 외 질문에는 정중히 거절하세요.
사용자의 말에 진심으로 공감하세요. "저도 비슷한 경험이 있어요" 같은 실제 공감을 표현하세요.
짧게 2~3문장으로.`,

  assess: `당신은 아이를 키워본 경험이 있는 '서로마음' 상담사입니다.
공감을 먼저 표현한 후, 부족한 정보를 1~2개만 자연스럽게 물어보세요.
- parent: 아이 나이, 언제부터, 가족 구성 등
- child: 본인 나이, 갈등 기간, 구체적 상황 등
상황에 따라 단호하게, 때로는 다독이듯 말하세요.`,

  analyze: `당신은 육아 경험이 풍부한 '서로마음' 상담사입니다.
마크다운 형식으로 분석하되, 딱딱한 전문용어보다 일상적인 언어로 설명하세요.
가능하면 실제 육아 에피소드를 예시로 들고, 구체적인 책이나 자료를 추천하세요.
절대 부모님을 탓하지 마세요. "이건 정말 흔한 일이에요. 부모님 잘못이 아닙니다"를 먼저 말하세요.

## 💚 공감
## 🧠 왜 이런 일이 생길까요?
## 💭 아이 마음 들여다보기
## 💭 상대방 마음
## 🔄 관계의 악순환`,

  solve: `당신은 육아 경험이 풍부한 '서로마음' 상담사입니다.

🎯 가장 중요한 규칙: 실전 대사를 최상단에 먼저 배치하세요.
아이가 지금 울고 있거나 말썽을 부리고 있는 상황일 수 있습니다. 긴 설명보다 당장 쓸 수 있는 대사가 먼저입니다.

출력 순서:
## 🗣 지금 당장 이렇게 말해보세요
(구체적인 대사 2~3개. 인용문 형식으로. 예: "지훈아, 엄마가 잠깐 이야기 좀 할까?")
## ✅ 더 시도해볼 방법들
(나머지 해결책 2~3개)
## 📚 도움될 자료
(책 추천)

때로는 따뜻하게, 때로는 단호하게 균형 잡힌 조언을 주세요.`,

  close: `당신은 육아 경험이 있는 '서로마음' 상담사입니다.
"저도 아이 키우면서 비슷한 일을 겪었어요. 시간이 지나면 추억이 될 거예요" 같은 말로 따뜻하게 마무리하세요.
늘 응원하고 있다는 마음을 전하세요.`,
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
      const { speaker, messages, profile } = await req.json();
      const auth = "Be" + "arer" + " " + env.DEEPSEEK_KEY;

      // ── 가드레일 체크 ──────────────────────────
      const lastUserMsg = (messages || []).filter(m => m.role === "user").slice(-1)[0]?.content || "";
      if (checkGuardrail(lastUserMsg)) {
        return new Response(GUARDRAIL_MSG, { headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        }});
      }

      // ── 프로필 컨텍스트 생성 ────────────────────
      let profileHint = "";
      if (profile && (profile.age || profile.gender || profile.temperament?.length)) {
        profileHint = `\n[프로필]`;
        if (profile.age) profileHint += ` 나이: ${profile.age}`;
        if (profile.gender) profileHint += `, ${profile.gender}`;
        if (profile.temperament?.length) profileHint += `, 성향: ${profile.temperament.join(', ')}`;
      }

      // ── 1단계: LLM이 현재 상담 단계 판단 ──────────
      const judgeBody = {
        model: "deepseek-chat",
        temperature: 0.2,
        messages: [
          { role: "system", content: JUDGE_PROMPT },
          ...(messages || []),
        ],
        response_format: { type: "json_object" },
      };

      const jResp = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(judgeBody),
      });
      const jData = await jResp.json();
      let stage = "intake";
      try {
        stage = JSON.parse(jData.choices?.[0]?.message?.content || "{}").stage || "intake";
      } catch {}

      // ── 2단계: 판단된 단계에 맞는 응답 생성 ──────────
      const prompt = STAGE_PROMPTS[stage] || STAGE_PROMPTS.intake;

      // RAG: analyze/solve 단계에서 유사 시나리오 검색
      let ragContext = "";
      const lastMsg = (messages || []).slice(-1)[0]?.content || "";
      
      // 언어 감지: 영어 질문이면 응답도 영어로
      const isEnglish = /^[a-zA-Z0-9\s?.,!'"]+$/.test(lastMsg.replace(/\s/g, '').slice(0, 30));
      const langHint = isEnglish ? "\n중요: 응답을 영어로 작성하세요." : "";
      
      if (stage === "analyze" || stage === "solve") {
        const scenarios = searchScenarios(lastMsg);
        if (scenarios.length > 0) {
          ragContext = "\n\n참고할 유사 상담 사례:\n" + scenarios.map((s, i) =>
            `${i+1}. 상황: ${s.situation}\n   분석: ${s.analysis}\n   해결: ${s.solution}`
          ).join("\n\n");
        }
      }
      const respBody = {
        model: "deepseek-chat",
        temperature: stage === "intake" || stage === "assess" ? 0.4 : 0.6,
        messages: [
          { role: "system", content: COMFORT + "\n" + prompt + profileHint + langHint + ragContext },
          ...(messages || []),
        ],
        stream: true,
      };

      const resp = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(respBody),
      });

      return new Response(resp.body, { headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      }});
    }

    return new Response("Not found", { status: 404 });
  },
};
