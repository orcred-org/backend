import { SESSION_DURATION_MINUTES } from "@/lib/session/audit";

const DAILY_API = "https://api.daily.co/v1";

interface DailyRoom {
  id: string;
  name: string;
  url: string;
}

interface DailyToken {
  token: string;
}

/** Room/token expiry — never sooner than 2h from now (handles past test sessions). */
export function getDailyExpirationEpoch(sessionDate: string): number {
  const sessionEnd = new Date(sessionDate);
  sessionEnd.setMinutes(sessionEnd.getMinutes() + SESSION_DURATION_MINUTES);
  const floor = Date.now() + 2 * 60 * 60 * 1000;
  return Math.floor(Math.max(sessionEnd.getTime(), floor) / 1000);
}

export async function isDailyRoomValid(roomName: string): Promise<boolean> {
  if (!process.env.DAILY_API_KEY) return false;

  const res = await fetch(`${DAILY_API}/rooms/${encodeURIComponent(roomName)}`, {
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
  });

  if (!res.ok) return false;

  const room = (await res.json()) as { config?: { exp?: number } };
  const exp = room.config?.exp;
  if (exp && exp * 1000 <= Date.now()) return false;

  return true;
}

export async function createRoom(sessionDate: string): Promise<DailyRoom> {
  const exp = getDailyExpirationEpoch(sessionDate);

  const properties: Record<string, unknown> = {
    exp,
    max_participants:   2,
    enable_chat:        false,
    enable_screenshare: true,
    start_video_off:    true,
    start_audio_off:    false,
    enable_prejoin_ui:  false,
    lang:               "en",
  };

  // Cloud recording requires a paid Daily plan — opt in via DAILY_ENABLE_RECORDING=true
  if (process.env.DAILY_ENABLE_RECORDING === "true") {
    properties.enable_recording = "cloud";
  }

  const res = await fetch(`${DAILY_API}/rooms`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      privacy: "private",
      properties,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Daily.co room creation failed: ${err}`);
  }

  return res.json();
}

export async function createToken(
  roomName: string,
  isHost: boolean,
  sessionDate: string,
  userName?: string,
): Promise<DailyToken> {
  const exp = getDailyExpirationEpoch(sessionDate);

  const properties: Record<string, unknown> = {
    room_name:          roomName,
    is_owner:           isHost,
    exp,
    enable_screenshare: true,
    start_video_off:    true,
    start_audio_off:    false,
  };

  if (!isHost) {
    properties.enable_screenshare = false;
  }

  if (userName?.trim()) {
    properties.user_name = userName.trim();
  }

  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ properties }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Daily.co token creation failed: ${err}`);
  }

  return res.json();
}

// Verify Daily.co webhook signature
export function verifyDailyWebhook(body: string, signature: string): boolean {
  const expected = require("crypto")
    .createHmac("sha256", process.env.DAILY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  return require("crypto").timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}
