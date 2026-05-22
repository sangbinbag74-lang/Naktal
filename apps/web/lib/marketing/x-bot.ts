/**
 * X(트위터) 자동 포스팅 — OAuth 1.0a 직접 구현 (의존성 0).
 *
 * 박상빈님 데이터 일체 사용 X — content-queue.ts(랜딩 페이지 정보만)만 사용.
 *
 * 필요 환경변수 (박상빈님 X 개발자 계정 발급 후 등록):
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 *
 * 4개 모두 없으면 즉시 noop (배포 사고 방지).
 */

import { createHmac, randomBytes } from "crypto";

const X_TWEET_ENDPOINT = "https://api.twitter.com/2/tweets";

export type XPostResult = {
  ok: boolean;
  status: number;
  message: string;
  tweetId?: string;
};

type OAuth1Credentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuth1Header(
  method: string,
  url: string,
  creds: OAuth1Credentials,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(oauthParams[k])}`)
    .join("&");

  const signatureBaseString = `${method.toUpperCase()}&${rfc3986(url)}&${rfc3986(paramString)}`;
  const signingKey = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(signatureBaseString).digest("base64");

  const authParams = { ...oauthParams, oauth_signature: signature };
  const header =
    "OAuth " +
    Object.keys(authParams)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(authParams[k])}"`)
      .join(", ");

  return header;
}

function readCredentials(): OAuth1Credentials | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) return null;
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

export async function postTweet(text: string): Promise<XPostResult> {
  const creds = readCredentials();
  if (!creds) {
    return { ok: false, status: 0, message: "X credentials not set (X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET)" };
  }
  if (!text || text.length === 0) {
    return { ok: false, status: 0, message: "empty text" };
  }
  if (text.length > 280) {
    return { ok: false, status: 0, message: `text too long (${text.length} > 280)` };
  }

  try {
    const authHeader = buildOAuth1Header("POST", X_TWEET_ENDPOINT, creds);
    const res = await fetch(X_TWEET_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (res.status === 201) {
      const json = (await res.json().catch(() => ({}))) as { data?: { id?: string } };
      return { ok: true, status: 201, message: "posted", tweetId: json.data?.id };
    }

    const errText = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: `X API returned ${res.status}: ${errText.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, status: 0, message: `X fetch failed: ${String(e)}` };
  }
}
