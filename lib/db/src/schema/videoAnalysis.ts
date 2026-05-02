import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const videoAnalysisTable = pgTable("video_analysis", {
  id: text("id").primaryKey(),
  videoUrl: text("video_url").notNull(),
  videoTitle: text("video_title").notNull(),
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(),
  totalDurationHours: integer("total_duration_hours"),
  totalEvents: integer("total_events").notNull().default(0),
  totalAthletes: integer("total_athletes"),
  totalRaces: integer("total_races"),
  events: jsonb("events").notNull().default([]),
  highlights: jsonb("highlights").notNull().default([]),
  reelStructure: jsonb("reel_structure").notNull().default([]),
  analysisSummary: text("analysis_summary").notNull().default(""),
  selectionRationale: text("selection_rationale").notNull().default(""),
});

export type VideoAnalysisRow = typeof videoAnalysisTable.$inferSelect;
export type InsertVideoAnalysis = typeof videoAnalysisTable.$inferInsert;
