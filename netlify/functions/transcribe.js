const ALLOWED_ORIGINS = new Set(["https://voice-execution-os.netlify.app"]);

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

exports.handler = async (event) => {
  const headers = headersFor(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: isAllowedOrigin(event) ? 204 : 403, headers, body: "" };
  }

  if (!isAllowedOrigin(event)) {
    return json(event, 403, { error: "허용되지 않은 요청입니다." });
  }

  if (event.httpMethod !== "POST") {
    return json(event, 405, { error: "POST 요청만 지원합니다." });
  }

  
  if (!isJsonRequest(event)) {
    return json(event, 415, { error: "JSON 요청만 처리할 수 있습니다." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(event, 500, {
      error: "OPENAI_API_KEY가 Netlify 환경변수에 설정되어 있지 않습니다.",
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(event, 400, { error: "요청 내용을 읽을 수 없습니다." });
  }

  const audioDataUrl = String(body.audioDataUrl || "");
  const match = audioDataUrl.match(/^data:([^,]+);base64,(.+)$/);
  if (!match) {
    return json(event, 400, { error: "음성 파일 형식이 올바르지 않습니다." });
  }

  const mimeType = match[1].split(";")[0] || "audio/webm";
  const audioBuffer = Buffer.from(match[2], "base64");
  if (!audioBuffer.length) {
    return json(event, 400, { error: "음성 파일이 비어 있습니다." });
  }

  if (audioBuffer.length > 8 * 1024 * 1024) {
    return json(event, 413, {
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
      return json(event, response.status, {
        error: payload.error?.message || "OpenAI 음성변환 요청에 실패했습니다.",
      });
    }

    return json(event, 200, { text: String(payload.text || "").trim() });
  } catch {
    return json(event, 502, { error: "음성변환 서버에 연결하지 못했습니다." });
  }
};

function extensionFor(mimeType) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function headersFor(event) {
  const origin = getHeader(event, "origin", false);
  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://voice-execution-os.netlify.app";
  return { ...JSON_HEADERS, "Access-Control-Allow-Origin": allowedOrigin };
}

function isAllowedOrigin(event) {
  const origin = getHeader(event, "origin", false);
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function isJsonRequest(event) {
  return getHeader(event, "content-type").includes("application/json");
}

function getHeader(event, name, lower = true) {
  const headers = event.headers || {};
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      const textValue = String(value || "");
      return lower ? textValue.toLowerCase() : textValue;
    }
  }
  return "";
}

function json(event, statusCode, body) {
  return {
    statusCode,
    headers: headersFor(event),
    body: JSON.stringify(body),
  };
}
