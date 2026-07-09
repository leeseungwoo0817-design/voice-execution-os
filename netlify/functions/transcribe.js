const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: JSON_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST 요청만 지원합니다." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: "OPENAI_API_KEY가 Netlify 환경변수에 설정되어 있지 않습니다.",
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "요청 내용을 읽을 수 없습니다." });
  }

  const audioDataUrl = String(body.audioDataUrl || "");
  const match = audioDataUrl.match(/^data:([^,]+);base64,(.+)$/);
  if (!match) {
    return json(400, { error: "음성 파일 형식이 올바르지 않습니다." });
  }

  const mimeType = match[1].split(";")[0] || "audio/webm";
  const audioBuffer = Buffer.from(match[2], "base64");
  if (!audioBuffer.length) {
    return json(400, { error: "음성 파일이 비어 있습니다." });
  }

  if (audioBuffer.length > 8 * 1024 * 1024) {
    return json(413, {
      error: "음성 파일이 너무 큽니다. 짧게 나누어 녹음해 주세요.",
    });
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([audioBuffer], { type: mimeType }),
    `voice-note.${extensionFor(mimeType)}`,
  );
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  form.append("language", "ko");

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(response.status, {
        error: payload.error?.message || "OpenAI 음성변환 요청에 실패했습니다.",
      });
    }

    return json(200, { text: String(payload.text || "").trim() });
  } catch {
    return json(502, { error: "음성변환 서버에 연결하지 못했습니다." });
  }
};

function extensionFor(mimeType) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}
