import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { YoutubeTranscript } from "youtube-transcript";
import { db, videoAnalysisTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

export interface AthleteResult {
  rank: number;
  name: string;
  result: string;
  notes?: string;
}

export interface TrackEvent {
  id: string;
  eventName: string;
  category:
    | "sprint"
    | "middle_distance"
    | "long_distance"
    | "hurdles"
    | "relay"
    | "jump"
    | "throw"
    | "walk"
    | "combined";
  gender: "men" | "women" | "mixed";
  startTimestamp: string;
  endTimestamp?: string;
  athletes?: AthleteResult[];
  highlightMoment: string;
  intensityScore: number;
  winningResult?: string;
  notes?: string;
}

export interface HighlightMoment {
  timestamp: string;
  caption: string;
  eventName: string;
  type:
    | "race_start"
    | "finish_line"
    | "field_attempt"
    | "winner_reaction"
    | "crowd_reaction"
    | "record_broken"
    | "photo_finish";
  reelPosition: number;
}

export interface ReelSegment {
  order: number;
  label: "hook" | "track_events" | "field_events" | "climax" | "ending";
  description: string;
  timestamps: string[];
  durationSeconds: number;
}

export interface VideoAnalysis {
  id: string;
  videoUrl: string;
  videoTitle: string;
  analyzedAt: string;
  totalDurationHours?: number;
  totalEvents: number;
  totalAthletes?: number;
  totalRaces?: number;
  events: TrackEvent[];
  highlights: HighlightMoment[];
  reelStructure: ReelSegment[];
  analysisSummary: string;
  selectionRationale: string;
}

function rowToAnalysis(row: {
  id: string;
  videoUrl: string;
  videoTitle: string;
  analyzedAt: Date;
  totalDurationHours: number | null;
  totalEvents: number;
  totalAthletes: number | null;
  totalRaces: number | null;
  events: unknown;
  highlights: unknown;
  reelStructure: unknown;
  analysisSummary: string;
  selectionRationale: string;
}): VideoAnalysis {
  return {
    id: row.id,
    videoUrl: row.videoUrl,
    videoTitle: row.videoTitle,
    analyzedAt: row.analyzedAt.toISOString(),
    totalDurationHours: row.totalDurationHours ?? undefined,
    totalEvents: row.totalEvents,
    totalAthletes: row.totalAthletes ?? undefined,
    totalRaces: row.totalRaces ?? undefined,
    events: (row.events as TrackEvent[]) ?? [],
    highlights: (row.highlights as HighlightMoment[]) ?? [],
    reelStructure: (row.reelStructure as ReelSegment[]) ?? [],
    analysisSummary: row.analysisSummary,
    selectionRationale: row.selectionRationale,
  };
}

async function fetchTranscript(videoUrl: string): Promise<string> {
  const videoIdMatch = videoUrl.match(
    /(?:v=|live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  const videoId = videoIdMatch?.[1];
  if (!videoId) return "";

  try {
    const entries = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: "en",
    });
    const text = entries
      .slice(0, 1500)
      .map((e) => {
        const seconds = Math.floor(e.offset / 1000);
        const h = Math.floor(seconds / 3600)
          .toString()
          .padStart(2, "0");
        const m = Math.floor((seconds % 3600) / 60)
          .toString()
          .padStart(2, "0");
        const s = (seconds % 60).toString().padStart(2, "0");
        return `[${h}:${m}:${s}] ${e.text}`;
      })
      .join("\n");
    return text;
  } catch {
    return "";
  }
}

function buildPrompt(
  videoUrl: string,
  videoTitle: string | undefined,
  transcript: string
): string {
  const transcriptSection = transcript
    ? `\n\nVIDEO TRANSCRIPT (partial):\n${transcript}\n\nUse the transcript above to extract accurate timestamps and event details. The transcript contains announcer commentary which will help you identify events, athlete names, and results.`
    : `\n\nNo transcript was available. Use your knowledge of the Indian Athletic Series 3 (YouTube live: ${videoUrl}) and typical Indian athletics competition formats to provide realistic analysis.`;

  return `You are an expert sports video analyst specializing in track and field athletics.

Analyze the Indian Athletic Series 3 athletics competition (YouTube: ${videoUrl}${videoTitle ? `, titled "${videoTitle}"` : ""}).

This is a 12-hour athletics livestream covering many events including sprint races (100m, 200m, 400m, 800m, 1500m), field events (long jump, high jump, triple jump, shot put, javelin, discus), hurdles, relays, and race walks.${transcriptSection}

Return ONLY a valid JSON object (no markdown fences, no explanation, just raw JSON) with exactly this structure:

{
  "videoTitle": "Indian Athletic Series 3",
  "totalDurationHours": 12,
  "totalEvents": 18,
  "totalAthletes": 120,
  "totalRaces": 12,
  "events": [
    {
      "id": "evt_1",
      "eventName": "100m Men Final",
      "category": "sprint",
      "gender": "men",
      "startTimestamp": "00:15:30",
      "endTimestamp": "00:18:45",
      "athletes": [
        { "rank": 1, "name": "Athlete Name", "result": "10.45s", "notes": "National Record" },
        { "rank": 2, "name": "Athlete Name", "result": "10.52s" },
        { "rank": 3, "name": "Athlete Name", "result": "10.58s" }
      ],
      "highlightMoment": "Explosive finish — winner pulls clear in final 20 metres",
      "intensityScore": 9,
      "winningResult": "10.45s",
      "notes": "Highly competitive final"
    }
  ],
  "highlights": [
    {
      "timestamp": "00:15:30",
      "caption": "Explosive 100m start — all athletes launch perfectly off the blocks",
      "eventName": "100m Men Final",
      "type": "race_start",
      "reelPosition": 1
    }
  ],
  "reelStructure": [
    {
      "order": 1,
      "label": "hook",
      "description": "Stadium crowd and opening ceremony — instant attention grab",
      "timestamps": ["00:01:00"],
      "durationSeconds": 4
    },
    {
      "order": 2,
      "label": "track_events",
      "description": "Sprint race starts and photo-finish moments",
      "timestamps": ["00:15:30", "01:20:00", "03:45:00"],
      "durationSeconds": 8
    },
    {
      "order": 3,
      "label": "field_events",
      "description": "Long jump, javelin, and high jump highlights",
      "timestamps": ["00:45:00", "02:10:00", "04:30:00"],
      "durationSeconds": 7
    },
    {
      "order": 4,
      "label": "climax",
      "description": "Most competitive races and record-breaking moments",
      "timestamps": ["05:30:00", "08:45:00"],
      "durationSeconds": 5
    },
    {
      "order": 5,
      "label": "ending",
      "description": "Medal ceremony and athlete celebrations",
      "timestamps": ["11:30:00"],
      "durationSeconds": 4
    }
  ],
  "analysisSummary": "A vivid paragraph describing the meet's atmosphere, standout performances, and what made it memorable.",
  "selectionRationale": "Why specific moments were chosen — based on motion intensity, competitive drama, crowd energy, and athletic achievement."
}

STRICT RULES:
- category must be one of: sprint, middle_distance, long_distance, hurdles, relay, jump, throw, walk, combined
- gender must be one of: men, women, mixed
- type must be one of: race_start, finish_line, field_attempt, winner_reaction, crowd_reaction, record_broken, photo_finish
- label must be one of: hook, track_events, field_events, climax, ending
- intensityScore must be an integer 1–10
- timestamps must be in HH:MM:SS format
- Include ALL events you can identify — aim for at least 12–18 distinct events
- reelStructure must have exactly 5 segments with all 5 labels present
- highlights must have 8–15 entries ordered by reelPosition
- Each event must have at least 2–3 athlete results
- Return ONLY the JSON object, nothing else`;
}

router.post("/highlights/analyze", async (req, res) => {
  const { videoUrl, videoTitle } = req.body as {
    videoUrl: string;
    videoTitle?: string;
  };

  if (!videoUrl || typeof videoUrl !== "string") {
    res.status(400).json({ error: "videoUrl is required" });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(videoAnalysisTable)
      .where(undefined)
      .orderBy(desc(videoAnalysisTable.analyzedAt))
      .limit(1);

    if (existing.length > 0 && existing[0].videoUrl === videoUrl) {
      req.log.info("Returning cached DB analysis");
      res.json(rowToAnalysis(existing[0]));
      return;
    }

    req.log.info({ videoUrl }, "Fetching transcript");
    const transcript = await fetchTranscript(videoUrl);
    req.log.info(
      { transcriptLength: transcript.length },
      "Transcript fetched, starting Gemini analysis"
    );

    const prompt = buildPrompt(videoUrl, videoTitle, transcript);

    const models = [
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-2.0-flash-lite",
    ];

    let response = null;
    let lastError: unknown = null;
    for (const model of models) {
      try {
        req.log.info({ model }, "Trying Gemini model");
        response = await genai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { temperature: 0.3, maxOutputTokens: 8192 },
        });
        break;
      } catch (err) {
        req.log.warn({ model, err }, "Model failed, trying next");
        lastError = err;
      }
    }

    if (!response) throw lastError;

    const rawText = response.text ?? "";
    req.log.info({ rawTextLength: rawText.length }, "Gemini response received");

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error(
        { rawText: rawText.slice(0, 500) },
        "No JSON found in Gemini response"
      );
      res.status(500).json({ error: "AI response did not contain valid JSON" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Omit<
      VideoAnalysis,
      "id" | "videoUrl" | "analyzedAt"
    >;

    const id = `analysis_${Date.now()}`;
    const events: TrackEvent[] = (parsed.events ?? []).map((e, i) => ({
      ...e,
      id: e.id || `evt_${i + 1}`,
      intensityScore: Math.min(
        10,
        Math.max(1, Math.round(Number(e.intensityScore) || 5))
      ),
    }));

    const row = {
      id,
      videoUrl,
      videoTitle: parsed.videoTitle || videoTitle || "Indian Athletic Series 3",
      analyzedAt: new Date(),
      totalDurationHours: parsed.totalDurationHours
        ? Math.round(parsed.totalDurationHours)
        : null,
      totalEvents: parsed.totalEvents || events.length,
      totalAthletes: parsed.totalAthletes ?? null,
      totalRaces: parsed.totalRaces ?? null,
      events,
      highlights: parsed.highlights ?? [],
      reelStructure: parsed.reelStructure ?? [],
      analysisSummary: parsed.analysisSummary ?? "",
      selectionRationale: parsed.selectionRationale ?? "",
    };

    await db.insert(videoAnalysisTable).values(row);

    req.log.info(
      { totalEvents: row.totalEvents, id },
      "Analysis saved to database"
    );
    res.json(rowToAnalysis(row));
  } catch (err) {
    req.log.error({ err }, "Video analysis failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Analysis failed: ${message}` });
  }
});

router.get("/highlights/cached", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(videoAnalysisTable)
      .orderBy(desc(videoAnalysisTable.analyzedAt))
      .limit(1);

    if (rows.length === 0) {
      res.json({ analysis: null });
      return;
    }

    res.json({ analysis: rowToAnalysis(rows[0]) });
  } catch (err) {
    res.json({ analysis: null });
  }
});

router.get("/highlights/stats", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(videoAnalysisTable)
      .orderBy(desc(videoAnalysisTable.analyzedAt))
      .limit(1);

    if (rows.length === 0) {
      res.json({
        totalEvents: 0,
        totalRaces: 0,
        totalFieldEvents: 0,
        totalAthletes: 0,
        eventBreakdown: [],
        topMoments: [],
        videoTitle: null,
      });
      return;
    }

    const row = rows[0];
    const events = (row.events as TrackEvent[]) ?? [];
    const highlights = (row.highlights as HighlightMoment[]) ?? [];

    const trackCategories = new Set([
      "sprint",
      "middle_distance",
      "long_distance",
      "hurdles",
      "relay",
      "walk",
    ]);
    const fieldCategories = new Set(["jump", "throw", "combined"]);

    const totalFieldEvents = events.filter((e) =>
      fieldCategories.has(e.category)
    ).length;
    const calculatedRaces = events.filter((e) =>
      trackCategories.has(e.category)
    ).length;

    const breakdownMap = new Map<
      string,
      { count: number; totalIntensity: number }
    >();
    for (const event of events) {
      const existing = breakdownMap.get(event.category) ?? {
        count: 0,
        totalIntensity: 0,
      };
      breakdownMap.set(event.category, {
        count: existing.count + 1,
        totalIntensity: existing.totalIntensity + event.intensityScore,
      });
    }

    const eventBreakdown = Array.from(breakdownMap.entries()).map(
      ([category, data]) => ({
        category,
        count: data.count,
        avgIntensity: Math.round((data.totalIntensity / data.count) * 10) / 10,
      })
    );

    const topMoments = [...highlights]
      .sort((a, b) => a.reelPosition - b.reelPosition)
      .slice(0, 5);

    res.json({
      totalEvents: events.length,
      totalRaces: row.totalRaces ?? calculatedRaces,
      totalFieldEvents,
      totalAthletes: row.totalAthletes ?? 0,
      eventBreakdown,
      topMoments,
      videoTitle: row.videoTitle,
    });
  } catch (err) {
    res.json({
      totalEvents: 0,
      totalRaces: 0,
      totalFieldEvents: 0,
      totalAthletes: 0,
      eventBreakdown: [],
      topMoments: [],
      videoTitle: null,
    });
  }
});

export default router;
