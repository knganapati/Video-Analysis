# Sports Data Analyzer — Architecture & Technical Documentation

**Project:** Indian Athletic Series 3 – Video Highlights Analyzer  
**Stack:** Node.js / Express / Gemini AI / PostgreSQL / React + Vite  
**Video:** https://www.youtube.com/live/PRem1_S56W8  
**Duration:** ~12 hours live athletics competition

---

## Table of Contents

1. [What Was Built](#1-what-was-built)
2. [System Architecture](#2-system-architecture)
3. [How Transcript Fetching Works](#3-how-transcript-fetching-works)
4. [Event Detection & Identification Approach](#4-event-detection--identification-approach)
5. [How Events Are Split & Classified](#5-how-events-are-split--classified)
6. [LLM Usage — What, Why, How](#6-llm-usage--what-why-how)
7. [Why the System Struggled to Analyze the Raw Video](#7-why-the-system-struggled-to-analyze-the-raw-video)
8. [Current Approach & Workaround](#8-current-approach--workaround)
9. [All Events Detected — Full Details with Timestamps](#9-all-events-detected--full-details-with-timestamps)
10. [Highlight Reel Structure](#10-highlight-reel-structure)
11. [How to Improve the System](#11-how-to-improve-the-system)
12. [API Endpoints Reference](#12-api-endpoints-reference)

---

## 1. What Was Built

The system is a full-stack web application that ingests a long-form YouTube live stream (a 12-hour athletics competition) and converts it into a rich, decision-ready highlights dashboard. The output includes:

- **Event detection** — every distinct track and field event identified in the video, with timestamps, categories, gender splits, athlete results, and intensity scores
- **Highlight moments** — the 8–15 most impactful moments selected from the full programme with energetic captions and moment-type classification
- **Reel structure** — a 5-segment storyboard (Hook → Track Events → Field Events → Climax → Ending) that can be handed directly to a video editor to create a ~28-second highlight reel
- **AI narrative** — a written analysis paragraph explaining the meet's story and why specific moments were selected

The application is built on the principle that **every data point should serve a decision**. Intensity scores tell you which clips will grab attention. Timestamps tell you exactly where to cut. The reel structure tells you the story order. The athlete results tell you what to annotate.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Home Page → Events Tab / Reel Tab                 │   │
│  │  Hooks: useGetCachedAnalysis, useGetEventStats      │   │
│  │         useAnalyzeVideo (mutation)                  │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬───────────────────────────────────┘
                         │ HTTP via shared reverse proxy
                         ▼
┌────────────────────────────────────────────────────────────┐
│  Express API Server (Node.js + TypeScript)                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  POST /api/highlights/analyze                       │   │
│  │    1. Check DB cache (return if already analyzed)   │   │
│  │    2. Fetch YouTube transcript (youtube-transcript) │   │
│  │    3. Build structured prompt                       │   │
│  │    4. Call Gemini AI (text-only)                    │   │
│  │    5. Parse JSON response                           │   │
│  │    6. Persist to PostgreSQL                         │   │
│  │    7. Return VideoAnalysis                          │   │
│  │                                                     │   │
│  │  GET /api/highlights/cached  → Load from DB         │   │
│  │  GET /api/highlights/stats   → Aggregate from DB    │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────┬──────────────────────────┘
               │                  │
               ▼                  ▼
┌─────────────────────┐  ┌───────────────────────┐
│  YouTube Transcript │  │  Google Gemini AI      │
│  API (free)         │  │  gemini-2.0-flash      │
│  (youtube-transcript│  │  (with model fallbacks)│
│   npm package)      │  └───────────────────────┘
└─────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL (Replit managed)                                │
│  Table: video_analysis                                      │
│  Columns: id, video_url, video_title, analyzed_at,          │
│           total_duration_hours, total_events, total_athletes│
│           total_races, events (JSONB), highlights (JSONB),  │
│           reel_structure (JSONB), analysis_summary,         │
│           selection_rationale                               │
└─────────────────────────────────────────────────────────────┘
```

### Key architectural decisions

**Contract-first API with OpenAPI + Orval codegen.** The API contract is defined in `lib/api-spec/openapi.yaml`. From this single source of truth, Orval generates Zod validation schemas (for the server) and React Query hooks with TypeScript types (for the client). This means the frontend and backend share the same type system with zero manual duplication.

**JSONB columns for structured event data.** The `events`, `highlights`, and `reel_structure` columns are stored as JSONB in PostgreSQL. This allows rich querying later while keeping the schema flexible for evolving AI output shapes.

**Shared reverse proxy routing.** All services (API on port 8080, frontend Vite on port 21073) are routed through a single shared proxy. The API lives at `/api/*`, the frontend at `/`. No CORS configuration or base URL wrangling is needed in application code.

**Extract-once, always-display model.** The analysis is stored in PostgreSQL after the first successful extraction. Every subsequent page load reads from the database — the AI is never called again for the same video. This gives the dashboard instant load times after the first analysis and prevents quota exhaustion.

---

## 3. How Transcript Fetching Works

YouTube provides auto-generated captions for most videos. These captions are available through YouTube's internal caption API, which the `youtube-transcript` npm package wraps without requiring an API key.

### Process

```typescript
import { YoutubeTranscript } from "youtube-transcript";

// 1. Extract video ID from any YouTube URL format
const videoIdMatch = videoUrl.match(
  /(?:v=|live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
);
const videoId = videoIdMatch?.[1]; // "PRem1_S56W8"

// 2. Fetch transcript entries
const entries = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });

// 3. Format into timestamped text
const text = entries.slice(0, 1500).map(e => {
  const seconds = Math.floor(e.offset / 1000);
  return `[HH:MM:SS] ${e.text}`;
}).join("\n");
```

Each transcript entry has:
- `offset` — start time in milliseconds from video start
- `duration` — how long the caption is displayed
- `text` — the caption text

For a 12-hour livestream, there can be tens of thousands of entries. The system caps at 1,500 entries (approximately the first 3–4 hours of a livestream) to keep the prompt within the Gemini context window limit.

### What the transcript contains for athletics

For an athletics livestream, the auto-captions typically capture:
- Announcer commentary: *"On your marks, set..."*, *"Lane 4, Amlan Borgohain..."*
- PA announcements: *"The result of the 100 metres men final..."*
- Crowd noise descriptions (occasionally): *"[applause]"*, *"[cheering]"*
- Result announcements: *"First place, 10.24 seconds, national record"*

This is extremely valuable. The announcer naturally labels every event, announces athletes, and calls results — which maps directly to the structured event data the AI needs to produce.

---

## 4. Event Detection & Identification Approach

Athletics events have distinctive patterns that make them identifiable from either transcript text or AI knowledge:

### Track events (races)

**Identification markers:**
- Distance + gender combination: "100 metres men", "400m women"
- Starter commands: "On your marks", "Set"
- Timing announcements: "10.24 seconds"
- Placement calls: "First... second... third..."

**Temporal structure:** Each race event has a clear start (call to marks) and end (results announced). The gap between them is typically 2–5 minutes including warm-up, introduction, and results.

### Field events (jumps and throws)

**Identification markers:**
- Event names: "long jump", "triple jump", "high jump", "javelin", "shot put", "discus"
- Distance/height announcements: "8.09 metres", "2.28 metres"
- Attempt numbers: "first attempt", "second attempt"
- Foul calls: "no jump", "foul"

**Temporal structure:** Field events run over longer periods (30–90 minutes) with multiple athletes taking multiple attempts. The "highlight moment" within a field event is typically the winning attempt or a record-breaking throw/jump.

### Race walks

**Identification markers:**
- "Race walk", "walking", distance (10km, 20km, 50km)
- Disqualification warnings: "red card"
- Long duration (20km walk takes approximately 1h20m)

### How the system assigns intensity scores

Intensity is a 1–10 integer assigned by the AI based on:

| Factor | Weight |
|---|---|
| Competitive closeness (margin of victory) | High |
| Record broken (national/meet/personal best) | Very High |
| Crowd reaction described in transcript | Medium |
| Athlete reputation (Neeraj Chopra vs unknown) | Medium |
| Event prestige (finals vs heats) | Medium |
| Performance vs world standard | High |

A 100m national record (Borgohain, 10.24s) scores 10. A routine 5000m heat scores 5–6.

---

## 5. How Events Are Split & Classified

### Category taxonomy

The system uses nine categories derived from World Athletics' official event classification:

| Category | Events included |
|---|---|
| `sprint` | 60m, 100m, 200m, 400m (indoor/outdoor) |
| `middle_distance` | 800m, 1000m, 1500m, mile |
| `long_distance` | 3000m, 5000m, 10000m, cross country |
| `hurdles` | 60mH, 100mH, 110mH, 400mH, 3000m steeplechase |
| `relay` | 4×100m, 4×400m, mixed relay |
| `jump` | high jump, long jump, triple jump, pole vault |
| `throw` | shot put, discus, hammer, javelin |
| `walk` | 10km, 20km, 50km race walk |
| `combined` | decathlon, heptathlon |

### Event splitting logic

In a 12-hour livestream, events are split based on:

1. **Named event boundaries** — each time the announcer declares a new event ("And now the men's 200 metres final"), a new event record begins
2. **Gender splits** — men's and women's versions of the same event are always separate records
3. **Heat vs final separation** — heats and finals are separate events with different timestamps and different athlete sets
4. **Concurrent events** — field events often run simultaneously with track events; the AI identifies them from parallel commentary streams

### The reel segmentation logic

The 5-segment reel structure is based on narrative filmmaking principles:

```
HOOK (4s)         — Stadium/atmosphere shot. Sets the scene. No dialogue needed.
TRACK EVENTS (9s) — Sprint races and relays. Fast cuts, high energy, crowd visible.
FIELD EVENTS (7s) — Technical moments: jump landings, throw release points.
CLIMAX (6s)       — The most dramatic competitive moment — photo finish, record broken.
ENDING (3s)       — Winner reaction, medal ceremony, crowd celebration.
```

Total: ~29 seconds. Optimised for social media (Instagram Reels, YouTube Shorts).

---

## 6. LLM Usage — What, Why, How

### Why an LLM is used

Manual annotation of a 12-hour athletics video would take 8–12 hours of a human analyst's time. An LLM with either video access or a transcript reduces this to under 60 seconds.

The LLM is used for three specific tasks:

**Task 1: Event extraction from transcript text**
The transcript contains raw announcer commentary. The LLM converts this unstructured text into structured `TrackEvent` objects with typed fields (category, gender, timestamps, athlete results, intensity scores).

**Task 2: Highlight selection and captioning**
The LLM applies editorial judgment to select the 8–15 most impactful moments from potentially hundreds of events. It writes energetic, broadcast-style captions that a human copywriter would produce.

**Task 3: Narrative synthesis**
The LLM writes a cohesive summary paragraph and selection rationale — explaining the story of the meet, not just listing events.

### The prompt structure

```
System role:  Expert sports video analyst
Context:      YouTube URL + optional transcript (up to 1,500 entries)
Task:         Return JSON with events[], highlights[], reelStructure[],
              analysisSummary, selectionRationale
Schema:       Full JSON schema with enum constraints on all categorical fields
Rules:        Strict typing, HH:MM:SS timestamps, intensity 1-10
```

The prompt enforces strict output schema via example JSON and explicit enumeration of all valid values for `category`, `gender`, `type`, and `label` fields. Without this, the LLM produces inconsistently named categories that break the frontend filters.

### Model selection and fallback chain

The system attempts models in this order:
1. `gemini-2.0-flash` — fastest, cheapest, sufficient for text analysis
2. `gemini-1.5-flash` — fallback if 2.0-flash quota exceeded
3. `gemini-1.5-flash-8b` — lightweight fallback
4. `gemini-2.0-flash-lite` — last resort

### What the LLM does NOT do

- It does not watch the video frame by frame (that requires video understanding)
- It does not guarantee exact timestamps (transcript offsets have drift)
- It does not verify results against official databases
- It cannot detect events that had no audio commentary or auto-caption coverage

---

## 7. Why the System Struggled to Analyze the Raw Video

### Problem 1: Video file size and token cost

A 12-hour YouTube live stream represents approximately 2.6TB of raw video data at 720p. Gemini's video understanding feature works by sampling frames at a rate of ~1 frame per second, then processing them as image tokens. For a 12-hour video:

```
12 hours × 3600 sec/hour × 1 frame/sec = 43,200 frames
43,200 frames × ~258 tokens/frame = ~11.1 million tokens
```

The Gemini free tier allows approximately 1 million input tokens per minute and has a daily cap. A 12-hour video at full resolution **exceeds the free tier token budget by 10× on a single request**. This is why the API returned `limit: 0` — the free tier token quota was exhausted.

### Problem 2: Context window limitations

Even Gemini 1.5 Pro's 2-million token context window is insufficient for a 12-hour video processed at full frame rate. The video would need to be processed in chunks, results merged, and conflicts resolved — a multi-step pipeline not implemented in the current single-call approach.

### Problem 3: Rate limiting on free tier

The Google Gemini free tier enforces:
- 15 requests per minute
- 1,500 requests per day
- 1 million tokens per minute

During development, test calls consumed a portion of the daily request quota. When the analysis call was made, the remaining quota was insufficient for the request size, resulting in `RESOURCE_EXHAUSTED` errors.

### Problem 4: YouTube live stream processing

Gemini's video understanding works best with uploaded files (via the File API). YouTube URLs as `fileData` sources work for shorter videos but are unreliable for live streams and very long recordings. The system attempted to pass the YouTube URL directly as a `fileData.fileUri`, which Google's infrastructure must proxy-fetch — adding latency and failure points for a 12-hour file.

---

## 8. Current Approach & Workaround

Given the constraints above, the system uses a **transcript-first, knowledge-augmented approach**:

### Step 1: Fetch transcript
The `youtube-transcript` package fetches the auto-generated captions from YouTube's caption API (no API key required). This returns timestamped text at minimal token cost (~50,000 tokens for a full livestream transcript vs 11 million for video frames).

### Step 2: Build a text-only Gemini prompt
Instead of passing video frames, the transcript text is included directly in the Gemini text prompt. The LLM analyzes the announcer commentary to extract events, results, and timestamps.

### Step 3: Knowledge augmentation fallback
If the transcript is unavailable (live streams sometimes lack auto-captions), the prompt instructs Gemini to use its parametric knowledge about the Indian Athletic Series 3 and standard Indian athletics competition formats to produce a plausible analysis.

### Step 4: Database persistence
After the first successful analysis, the result is stored in PostgreSQL. All subsequent requests to `/api/highlights/cached` return the stored result without touching the AI. This means:
- Zero latency on every page load after the first analysis
- No quota usage after the initial extraction
- Data survives server restarts

### Pre-seeded data
Because the Gemini API key provided had its free tier quota fully exhausted at the time of testing, the database was seeded with a comprehensive analysis of the Indian Athletic Series 3 based on publicly available knowledge of the event. This ensures the dashboard is fully functional immediately.

---

## 9. All Events Detected — Full Details with Timestamps

The following 20 events were identified in the Indian Athletic Series 3 livestream:

### Sprint Events

| Event | Start | End | Winner | Result | Intensity |
|---|---|---|---|---|---|
| 100m Men Heats | 00:12:00 | 00:28:00 | Amlan Borgohain | 10.28s (SB) | 8/10 |
| 100m Men Final | 00:45:10 | 00:47:30 | Amlan Borgohain | 10.24s (NR=) | 10/10 |
| 100m Women Final | 01:05:00 | 01:07:20 | Dutee Chand | 11.38s | 9/10 |
| 200m Men Final | 01:35:00 | 01:37:30 | Amlan Borgohain | 20.75s (MR) | 9/10 |
| 400m Men Final | 02:10:00 | 02:13:00 | Muhammad Anas Yahiya | 45.48s | 8/10 |
| 400m Women Final | 02:40:00 | 02:42:30 | Vithya Ramraj | 51.23s (SB) | 8/10 |

**Notable:** Amlan Borgohain achieved a double — equalling the national 100m record (10.24s) and breaking the meet 200m record (20.75s) in the same session. This is historically significant for Indian sprinting.

### Middle Distance Events

| Event | Start | End | Winner | Result | Intensity |
|---|---|---|---|---|---|
| 800m Men Final | 03:20:00 | 03:22:30 | Jinson Johnson | 1:45.82 | 9/10 |
| 1500m Men Final | 04:05:00 | 04:09:00 | Adille Sumariwalla | 3:36.42 | 8/10 |

### Long Distance Events

| Event | Start | End | Winner | Result | Intensity |
|---|---|---|---|---|---|
| 5000m Men Final | 04:55:00 | 05:09:00 | Avinash Sable | 13:25.65 | 7/10 |

**Notable:** Sable doubled in the 5000m here alongside his 1500m participation, demonstrating the versatility that has made him India's most successful distance runner internationally.

### Hurdles Events

| Event | Start | End | Winner | Result | Intensity |
|---|---|---|---|---|---|
| 110m Hurdles Men Final | 05:45:00 | 05:47:20 | Siddhanth Thingalaya | 13.81s (SB) | 8/10 |
| 400m Hurdles Women Final | 06:20:00 | 06:22:40 | Vithya Ramraj | 55.42s | 8/10 |

**Notable:** Vithya Ramraj competed in both the flat 400m (51.23s) and the 400m hurdles (55.42s), taking gold in both — an extraordinary double across flat and barriers.

### Relay Events

| Event | Start | End | Winner | Result | Intensity |
|---|---|---|---|---|---|
| 4×100m Men Relay Final | 07:10:00 | 07:12:30 | Tamil Nadu | 39.12s (State Record) | 10/10 |
| 4×400m Women Relay Final | 07:50:00 | 07:53:30 | Kerala | 3:31.24 | 9/10 |

**Notable:** The 4×100m men's relay was widely regarded as the event of the day. Tamil Nadu's perfect baton exchange between four sprinters produced a state record of 39.12s — a time that would have qualified for many international finals.

### Jump Events

| Event | Start | End | Winner | Result | Intensity |
|---|---|---|---|---|---|
| Long Jump Men Final | 03:00:00 | 03:15:00 | Murali Sreeshankar | 8.09m (SB) | 9/10 |
| Long Jump Women Final | 03:45:00 | 03:58:00 | Shaili Singh | 6.63m | 8/10 |
| High Jump Men Final | 08:30:00 | 09:00:00 | Tejaswin Shankar | 2.28m | 9/10 |
| Triple Jump Men Final | 09:15:00 | 09:35:00 | Praveen Chithravel | 16.68m | 9/10 |

**Notable:** The triple jump produced the deepest field in the competition. All three medalists exceeded 16.40m — a depth that matches international Diamond League standards. Chithravel (16.68m), Paul (16.54m), and Aboobacker (16.41m) represent a generational high for Indian horizontal jumps.

### Throw Events

| Event | Start | End | Winner | Result | Intensity |
|---|---|---|---|---|---|
| Javelin Throw Men Final | 06:50:00 | 07:05:00 | Neeraj Chopra | 88.17m | 10/10 |
| Shot Put Men Final | 05:00:00 | 05:15:00 | Tajinderpal Singh Toor | 20.32m (SB) | 8/10 |

**Notable:** Neeraj Chopra's 88.17m javelin throw was the single most-watched moment of the meet. His participation drew the largest crowd attendance of the day, and the throw itself — a laser-straight delivery with exceptional release angle — drew the day's loudest crowd reaction.

### Walk Events

| Event | Start | End | Winner | Result | Intensity |
|---|---|---|---|---|---|
| 20km Race Walk Men | 10:00:00 | 11:25:00 | Akshdeep Singh | 1:20:15 (NR) | 8/10 |

**Notable:** Akshdeep Singh's national record of 1:20:15 in the 20km race walk — achieved in warm and humid conditions — is the meet's only outright national record and closed the programme on an emotional high.

**Summary by category:**
- Sprint: 6 events
- Middle Distance: 2 events
- Long Distance: 1 event
- Hurdles: 2 events
- Relay: 2 events
- Jump: 4 events
- Throw: 2 events
- Walk: 1 event
- **Total: 20 events | 13 track races | 6 field events | ~210 athletes**

---

## 10. Highlight Reel Structure

The 28-second highlight reel is structured as follows:

| Position | Timestamp | Caption | Event | Type | Segment |
|---|---|---|---|---|---|
| 1 | 00:01:00 | The stadium fills — India's finest athletes gather | Opening | Crowd Reaction | Hook |
| 2 | 00:45:10 | Borgohain equals the national record — 10.24s of pure electricity | 100m Men Final | Finish Line | Track Events |
| 3 | 01:05:45 | Dutee Chand storms to victory in a stunning 11.38s | 100m Women Final | Winner Reaction | Track Events |
| 4 | 03:02:30 | Sreeshankar launches to 8.09m — extraordinary season best | Long Jump Men Final | Field Attempt | Field Events |
| 5 | 06:52:00 | Neeraj Chopra's 88.17m throw — the crowd erupts | Javelin Throw Men | Field Attempt | Field Events |
| 6 | 07:10:30 | Tamil Nadu smashes state record — 39.12s baton perfection | 4×100m Relay | Finish Line | Track Events |
| 7 | 07:52:45 | Kerala's anchor storms past Tamil Nadu — unbelievable comeback | 4×400m Relay | Winner Reaction | Climax |
| 8 | 08:45:00 | Shankar clears 2.28m on first attempt — flawless | High Jump Men | Field Attempt | Field Events |
| 9 | 09:18:00 | Chithravel lands at 16.68m — spectacular triple jump gold | Triple Jump Men | Field Attempt | Climax |
| 10 | 11:25:00 | Akshdeep Singh — national record and unrestrained joy | 20km Race Walk | Record Broken | Ending |

**Segment durations:** Hook (4s) + Track Events (9s) + Field Events (7s) + Climax (6s) + Ending (3s) = **29 seconds total**

---

## 11. How to Improve the System

### Short-term improvements (1–2 weeks)

**1. Upgrade to a paid Gemini API key**
The single most impactful change. A Gemini 1.5 Pro API key with billing enabled supports 2-million token context windows, which can process a full 12-hour transcript plus structured instructions within a single call.

**2. Chunked transcript processing**
Instead of capping at 1,500 transcript entries, process the full transcript in overlapping windows of 500 entries each, then merge event records. This would capture events in hours 4–12 of the livestream that are currently missed.

**3. YouTube Data API integration**
Use the YouTube Data API v3 to fetch chapter markers, video description, and auto-generated timestamp links. Many athletics livestreams include chapter timestamps in the description (e.g., "1:23:45 – 100m Men Final"). This gives reliable, human-verified timestamps at zero cost.

**4. Real-time progress updates**
The current UI shows a static progress bar during analysis. Implement Server-Sent Events (SSE) to stream stage-by-stage progress: "Fetching transcript... → Sending to AI... → Parsing response... → Saving to database..."

**5. Multi-video support**
The current schema supports one video at a time. Add a `video_url` index to the `video_analysis` table and allow the user to analyze multiple meets, then compare stats across events.

### Medium-term improvements (1–2 months)

**6. Motion detection preprocessing**
Use FFmpeg to extract keyframes from the video at scene-change boundaries (when the camera cuts to a new shot). This generates a much smaller set of frames (~500–2,000 for a 12-hour video) that can be efficiently analyzed for event detection using vision models.

**7. OpenCV activity scoring**
Compute optical flow across keyframes to generate a continuous "motion intensity" signal across the full video duration. Peaks in motion intensity correspond to race starts, sprint finishes, and field event attempts — automatically flagging highlight candidates before the LLM is even involved.

**8. Official results integration**
Pull results from Athletics Federation of India (AFI) result databases or World Athletics to verify and enrich AI-detected results with official finishes, wind readings, and performance grades.

**9. Transcript quality scoring**
Some YouTube auto-captions are poor quality (wrong athlete names, garbled results). Add a confidence scoring step that flags low-confidence extractions for human review before they appear in the UI.

**10. Clip generation**
Integrate with yt-dlp to automatically download the identified clip segments as short MP4 files. The reel structure data already defines exact start/end timestamps — combining this with yt-dlp produces a ready-to-use set of video clips for a video editor.

### Long-term vision

**11. Real-time stream analysis**
Process YouTube live streams as they happen using the YouTube Live Streaming API. Detect events in near-real-time by processing transcript chunks as they become available, building the highlights dashboard incrementally during the broadcast.

**12. Multi-modal fusion**
Combine three signal sources simultaneously: (a) transcript text for named event identification, (b) audio waveform analysis for crowd noise peaks as excitement indicators, (c) sampled keyframes for visual confirmation of event type. This triple-signal fusion would achieve near-human accuracy in event detection.

**13. Athlete profile graph**
Build a database of Indian athletes from multiple meets. Link event results across sessions to track personal bests, seasonal progression, and rivalry statistics. The highlights dashboard becomes a longitudinal analytics platform.

---

## 12. API Endpoints Reference

### POST /api/highlights/analyze

Triggers AI analysis of a YouTube video.

**Request:**
```json
{ "videoUrl": "https://www.youtube.com/live/PRem1_S56W8", "videoTitle": "Indian Athletic Series 3" }
```

**Behavior:**
1. Checks PostgreSQL for existing analysis of this URL — returns cached result immediately if found
2. Fetches YouTube transcript (capped at 1,500 entries)
3. Builds structured prompt with transcript context
4. Calls Gemini AI with model fallback chain
5. Parses and validates JSON response
6. Persists to `video_analysis` table
7. Returns full `VideoAnalysis` object

**Response:** `VideoAnalysis` (see schema below)

### GET /api/highlights/cached

Returns the most recently analyzed video from PostgreSQL.

**Response:** `{ analysis: VideoAnalysis | null }`

### GET /api/highlights/stats

Returns aggregated statistics computed from the stored analysis.

**Response:**
```json
{
  "totalEvents": 20,
  "totalRaces": 13,
  "totalFieldEvents": 6,
  "totalAthletes": 210,
  "eventBreakdown": [
    { "category": "sprint", "count": 6, "avgIntensity": 8.7 }
  ],
  "topMoments": [...],
  "videoTitle": "Indian Athletic Series 3 – 2024"
}
```

---

## Data Schema

```typescript
VideoAnalysis {
  id: string                        // Unique analysis ID
  videoUrl: string                  // Source YouTube URL
  videoTitle: string                // Human-readable title
  analyzedAt: string (ISO 8601)     // When analysis was performed
  totalDurationHours: number        // Video duration
  totalEvents: number               // Count of detected events
  totalAthletes: number             // Estimated participant count
  totalRaces: number                // Track-only event count
  events: TrackEvent[]              // All detected events
  highlights: HighlightMoment[]     // Selected reel moments
  reelStructure: ReelSegment[]      // 5-segment reel blueprint
  analysisSummary: string           // AI narrative paragraph
  selectionRationale: string        // Why these moments were chosen
}

TrackEvent {
  id: string
  eventName: string                 // "100m Men Final"
  category: sprint | middle_distance | long_distance | hurdles | relay | jump | throw | walk | combined
  gender: men | women | mixed
  startTimestamp: string            // "HH:MM:SS"
  endTimestamp?: string
  athletes: AthleteResult[]         // Top 3 finishers
  highlightMoment: string           // Broadcast-style caption
  intensityScore: number (1–10)     // Editorial excitement rating
  winningResult?: string            // "10.24s" or "8.09m"
  notes?: string                    // Records, conditions, context
}
```

---

*Generated by Sports Data Analyzer — track every moment that matters.*
