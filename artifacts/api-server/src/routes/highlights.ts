import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger";

const router = Router();

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

let cachedAnalysis: VideoAnalysis | null = null;

export interface AthleteResult {
  rank: number;
  name: string;
  result: string;
  notes?: string;
}

export interface TrackEvent {
  id: string;
  eventName: string;
  category: "sprint" | "middle_distance" | "long_distance" | "hurdles" | "relay" | "jump" | "throw" | "walk" | "combined";
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
  type: "race_start" | "finish_line" | "field_attempt" | "winner_reaction" | "crowd_reaction" | "record_broken" | "photo_finish";
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

function buildPrompt(videoUrl: string, videoTitle?: string): string {
  return `You are an expert sports video analyst specializing in track and field athletics.

Analyze the following YouTube live stream of the Indian Athletic Series 3 and produce a comprehensive highlights breakdown.

Video URL: ${videoUrl}
${videoTitle ? `Video Title: ${videoTitle}` : ""}

This is approximately a 12-hour athletics competition livestream covering many events. Your task is to extract ALL events from the video and produce a structured analysis.

Return ONLY a valid JSON object (no markdown, no explanation outside JSON) with exactly this structure:

{
  "videoTitle": "string — actual title of this event series",
  "totalDurationHours": number,
  "totalEvents": number,
  "totalAthletes": number,
  "totalRaces": number,
  "events": [
    {
      "id": "evt_1",
      "eventName": "100m Men Final",
      "category": "sprint",
      "gender": "men",
      "startTimestamp": "00:15:30",
      "endTimestamp": "00:18:45",
      "athletes": [
        { "rank": 1, "name": "Athlete Name", "result": "10.45s", "notes": "Personal Best" },
        { "rank": 2, "name": "Athlete Name", "result": "10.52s" }
      ],
      "highlightMoment": "Short energetic caption describing the most exciting moment",
      "intensityScore": 9,
      "winningResult": "10.45s",
      "notes": "Any notable information"
    }
  ],
  "highlights": [
    {
      "timestamp": "00:15:30",
      "caption": "Explosive 100m start — athletes launch off the blocks",
      "eventName": "100m Men Final",
      "type": "race_start",
      "reelPosition": 1
    }
  ],
  "reelStructure": [
    {
      "order": 1,
      "label": "hook",
      "description": "Attention-grabbing opening",
      "timestamps": ["00:15:30", "02:30:45"],
      "durationSeconds": 5
    },
    {
      "order": 2,
      "label": "track_events",
      "description": "Sprint and race highlights",
      "timestamps": ["00:15:30", "01:20:00", "03:45:00"],
      "durationSeconds": 8
    },
    {
      "order": 3,
      "label": "field_events",
      "description": "Jumps and throws highlights",
      "timestamps": ["00:45:00", "02:10:00"],
      "durationSeconds": 6
    },
    {
      "order": 4,
      "label": "climax",
      "description": "Most intense competitive moments",
      "timestamps": ["05:30:00", "08:45:00"],
      "durationSeconds": 5
    },
    {
      "order": 5,
      "label": "ending",
      "description": "Winner celebrations and closing",
      "timestamps": ["11:30:00"],
      "durationSeconds": 4
    }
  ],
  "analysisSummary": "One vivid paragraph describing the overall meet — the atmosphere, standout performances, and what made it special.",
  "selectionRationale": "Explanation of why specific moments were chosen for the reel — based on motion intensity, competitive drama, crowd reaction, and athletic achievement."
}

Rules:
- category must be one of: sprint, middle_distance, long_distance, hurdles, relay, jump, throw, walk, combined
- gender must be one of: men, women, mixed
- type must be one of: race_start, finish_line, field_attempt, winner_reaction, crowd_reaction, record_broken, photo_finish
- label must be one of: hook, track_events, field_events, climax, ending
- intensityScore must be an integer 1-10
- timestamps must be in HH:MM:SS format
- Include ALL events you can identify in the video — sprint races (100m, 200m, 400m, 800m etc.), field events (long jump, high jump, triple jump, shot put, javelin, discus), hurdles, relays, and walking races
- For each event include at least 1-3 top athletes with their results if visible
- Provide 8-15 highlight moments total
- The reelStructure must have exactly 5 segments covering all 5 labels
- Aim to identify at least 8-15 distinct events from this 12-hour livestream`;
}

router.post("/highlights/analyze", async (req, res) => {
  const { videoUrl, videoTitle } = req.body as { videoUrl: string; videoTitle?: string };

  if (!videoUrl || typeof videoUrl !== "string") {
    res.status(400).json({ error: "videoUrl is required" });
    return;
  }

  try {
    req.log.info({ videoUrl }, "Starting video analysis with Gemini");

    const prompt = buildPrompt(videoUrl, videoTitle);

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: videoUrl,
                mimeType: "video/*",
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    });

    const rawText = response.text ?? "";
    req.log.info({ rawTextLength: rawText.length }, "Gemini response received");

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ rawText: rawText.slice(0, 500) }, "No JSON found in Gemini response");
      res.status(500).json({ error: "AI response did not contain valid JSON" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Omit<VideoAnalysis, "id" | "videoUrl" | "analyzedAt">;

    const analysis: VideoAnalysis = {
      id: `analysis_${Date.now()}`,
      videoUrl,
      videoTitle: parsed.videoTitle || videoTitle || "Indian Athletic Series 3",
      analyzedAt: new Date().toISOString(),
      totalDurationHours: parsed.totalDurationHours,
      totalEvents: parsed.totalEvents || parsed.events?.length || 0,
      totalAthletes: parsed.totalAthletes,
      totalRaces: parsed.totalRaces,
      events: (parsed.events || []).map((e, i) => ({
        ...e,
        id: e.id || `evt_${i + 1}`,
        intensityScore: Math.min(10, Math.max(1, Math.round(Number(e.intensityScore) || 5))),
      })),
      highlights: parsed.highlights || [],
      reelStructure: parsed.reelStructure || [],
      analysisSummary: parsed.analysisSummary || "",
      selectionRationale: parsed.selectionRationale || "",
    };

    cachedAnalysis = analysis;

    req.log.info({ totalEvents: analysis.totalEvents }, "Video analysis complete");
    res.json(analysis);
  } catch (err) {
    req.log.error({ err }, "Video analysis failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Analysis failed: ${message}` });
  }
});

router.get("/highlights/cached", (_req, res) => {
  res.json({ analysis: cachedAnalysis });
});

router.get("/highlights/stats", (_req, res) => {
  if (!cachedAnalysis) {
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

  const { events, highlights, totalAthletes, totalRaces, videoTitle } = cachedAnalysis;

  const trackCategories = new Set(["sprint", "middle_distance", "long_distance", "hurdles", "relay", "walk"]);
  const fieldCategories = new Set(["jump", "throw", "combined"]);

  const totalFieldEvents = events.filter((e) => fieldCategories.has(e.category)).length;
  const calculatedRaces = events.filter((e) => trackCategories.has(e.category)).length;

  const breakdownMap = new Map<string, { count: number; totalIntensity: number }>();
  for (const event of events) {
    const existing = breakdownMap.get(event.category) ?? { count: 0, totalIntensity: 0 };
    breakdownMap.set(event.category, {
      count: existing.count + 1,
      totalIntensity: existing.totalIntensity + event.intensityScore,
    });
  }

  const eventBreakdown = Array.from(breakdownMap.entries()).map(([category, data]) => ({
    category,
    count: data.count,
    avgIntensity: Math.round((data.totalIntensity / data.count) * 10) / 10,
  }));

  const topMoments = [...highlights]
    .sort((a, b) => a.reelPosition - b.reelPosition)
    .slice(0, 5);

  res.json({
    totalEvents: events.length,
    totalRaces: totalRaces ?? calculatedRaces,
    totalFieldEvents,
    totalAthletes: totalAthletes ?? 0,
    eventBreakdown,
    topMoments,
    videoTitle,
  });
});

export default router;
