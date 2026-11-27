const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

function videoId(value: string) {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

export function youtubeId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return videoId(id) ? id : null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "watch") {
    const id = url.searchParams.get("v") ?? "";
    return videoId(id) ? id : null;
  }
  if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") && parts[1]) {
    const id = parts[1];
    return videoId(id) ? id : null;
  }
  return null;
}

export function cleanYoutube(value: string): string | null {
  const id = youtubeId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function cleanWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || (!url.hostname.includes(".") && url.hostname !== "localhost")) return null;
  return url.toString();
}

export function readLinks(
  website: string,
  video: string,
): { ok: true; websiteUrl?: string; videoUrl?: string } | { ok: false; message: string } {
  const siteRaw = website.trim();
  const videoRaw = video.trim();
  if (siteRaw && !cleanWebsite(siteRaw)) {
    return { ok: false, message: "Use a full website link, starting with http:// or https://." };
  }
  if (videoRaw && !cleanYoutube(videoRaw)) {
    return { ok: false, message: "Use a YouTube link. Other video sites aren’t played here." };
  }
  const websiteUrl = siteRaw ? cleanWebsite(siteRaw) ?? undefined : undefined;
  const videoUrl = videoRaw ? cleanYoutube(videoRaw) ?? undefined : undefined;
  return { ok: true, websiteUrl, videoUrl };
}
