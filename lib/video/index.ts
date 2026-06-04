const DAILY_API = "https://api.daily.co/v1";

interface DailyRoom {
  id: string;
  name: string;
  url: string;
}

interface DailyToken {
  token: string;
}

export async function createRoom(sessionDate: string): Promise<DailyRoom> {
  const sessionEnd = new Date(sessionDate);
  sessionEnd.setMinutes(sessionEnd.getMinutes() + 90); // room expires 30 min after 60-min session

  const res = await fetch(`${DAILY_API}/rooms`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      privacy: "private",
      properties: {
        exp:                     Math.floor(sessionEnd.getTime() / 1000),
        max_participants:        2,
        enable_chat:             false,       // prevents sharing answers
        enable_screenshare:      true,
        start_video_off:         false,
        start_audio_off:         false,
        enable_recording:        "cloud",
        recording_type:          "cloud",
        enable_prejoin_ui:       true,        // waiting room
        lang:                    "en",
      },
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
  sessionDate: string
): Promise<DailyToken> {
  const sessionEnd = new Date(sessionDate);
  sessionEnd.setMinutes(sessionEnd.getMinutes() + 90);

  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      properties: {
        room_name:   roomName,
        is_owner:    isHost,
        exp:         Math.floor(sessionEnd.getTime() / 1000),
        enable_screenshare: true,
        start_video_off:    false,
        start_audio_off:    false,
      },
    }),
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
