# Media Extraction — yt-dlp

> yt-dlp is not a YouTube-only tool — it is a general-purpose media extractor supporting **1,858 sites**.
> Video, audio, podcasts, live streaming — if it is a media URL, try yt-dlp first.

## Installation Check

```bash
which yt-dlp || python3 -m yt_dlp --version
```

- If the `yt-dlp` command is in your PATH, use it as-is
- Otherwise, substitute `python3 -m yt_dlp` (apply this substitution in all commands below)
- If neither is available, abandon this path and request pre-installation from the operator. The skill does not install it itself.

## Core Commands (common across all supported sites)

### Metadata Extraction (most general)

```bash
yt-dlp --dump-json "URL"
```

Returns structured JSON including title, uploader, duration, view_count, description, tags, etc.
~95% success rate on sites with a dedicated extractor.

### Subtitle Extraction

```bash
yt-dlp --write-sub --write-auto-sub --sub-lang "en,ko" --skip-download -o "/tmp/%(id)s" "URL"
cat /tmp/VIDEO_ID.*.vtt
```

YouTube supports auto-generated subtitles in 100 languages. Other sites only work when they provide their own subtitles.

### Search

```bash
# YouTube
yt-dlp --dump-json "ytsearch5:{search_term}"

# SoundCloud
yt-dlp --dump-json "scsearch5:{search_term}"

# Dailymotion
yt-dlp --dump-json "dailymotionsearch5:{search_term}"

# Yahoo
yt-dlp --dump-json "yahoosearch5:{search_term}"
```

### Channel/Playlist Listing (without downloading)

```bash
yt-dlp --flat-playlist --dump-json "CHANNEL_URL"
```

Returns title, id, url, duration. Collects the entire channel video list at high speed.

### Comment Extraction (YouTube)

```bash
yt-dlp --write-comments --skip-download --write-info-json \
  --extractor-args "youtube:max_comments=20" \
  -o "/tmp/%(id)s" "URL"
```

## Supported Platform Categories

### Video

| Site | Metadata | Subtitles | Search | Notes |
|--------|----------|------|------|------|
| YouTube | O | O (including auto-generated) | `ytsearch` | Best support |
| Vimeo | O | O (if site-provided) | X | Rich academic/documentary content |
| Twitch | O (VOD/clips) | X | X | Tech streaming |
| TikTok | O | X | X | Public accounts only |
| Dailymotion | O | O | `dailymotionsearch` | |
| Rumble | O | X | X | |
| PeerTube | O | X | X | Decentralized |

### Audio/Podcast

| Site | Metadata | Search | Notes |
|--------|----------|------|------|
| SoundCloud | O | `scsearch` | Search supported — best |
| Apple Podcasts | O | X | RSS-based |
| TuneIn | O | X | |
| acast | O | X | Channel-level support |
| Spreaker | O | X | |
| Audius | O | X | Blockchain-based |

### Korean Platforms

| Site | Extractor | Notes |
|--------|-----------|------|
| Naver TV | `Naver`, `Naver:live` | |
| Kakao | `Kakao` | |
| SBS | `SBS`, `sbs.co.kr` | |
| JTBC | `JTBC`, `JTBC:program` | |
| Chzzk | `chzzk:video`, `chzzk:live` | Naver streaming |
| Soop (formerly AfreecaTV) | `soop`, `soop:live` | |
| Daum | `daum.net`, `daum.net:clip` | |
| Weverse | `Weverse`, `WeverseLive` | K-pop fandom |

### News VOD

| Site | Notes |
|--------|------|
| BBC | Public VOD |
| ABC (Australia) | iview |
| CBS News | |
| NBC News | Frequent blocking |

> For news sites, going through **official YouTube channels** is more reliable than direct URLs.
> Example: `ytsearch:BBC News {keyword}`

## Caveats

- Auto-generated subtitles have line overlaps → post-processing required
- The generic extractor has ~30% success rate — prioritize sites with dedicated extractors
- Paywall/login sites mostly fail
- `--dump-json` is the safest general-purpose command (no download, metadata only)
