import fs from "fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && line.slice(0, i).trim() === "DAILY_API_KEY") {
    process.env.DAILY_API_KEY = line.slice(i + 1).trim();
  }
}

const sessionDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const sessionEnd = new Date(sessionDate);
sessionEnd.setMinutes(sessionEnd.getMinutes() + 90);

const res = await fetch("https://api.daily.co/v1/rooms", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    privacy: "private",
    properties: {
      exp: Math.floor(sessionEnd.getTime() / 1000),
      max_participants: 2,
      enable_recording: "cloud",
      recording_type: "cloud",
    },
  }),
});

const text = await res.text();
console.log("HTTP", res.status);
console.log(text.slice(0, 500));
