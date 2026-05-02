import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAnalyzeVideo,
  useGetCachedAnalysis,
  useGetEventStats,
  getGetCachedAnalysisQueryKey,
  getGetEventStatsQueryKey,
} from "@workspace/api-client-react";
import type { TrackEvent, HighlightMoment, ReelSegment, VideoAnalysis } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Activity, Play, Trophy, Users, Timer, Zap, Target,
  Film, Clock, ChevronLeft, ChevronRight, Clapperboard,
  SkipForward, SkipBack, ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_YOUTUBE_URL = "https://www.youtube.com/live/PRem1_S56W8";

const SEGMENT_COLORS: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  hook:         { bg: "bg-yellow-500/10",  border: "border-yellow-500/40",  text: "text-yellow-400",  bar: "bg-yellow-500" },
  track_events: { bg: "bg-orange-500/10",  border: "border-orange-500/40",  text: "text-orange-400",  bar: "bg-orange-500" },
  field_events: { bg: "bg-blue-500/10",    border: "border-blue-500/40",    text: "text-blue-400",    bar: "bg-blue-500"   },
  climax:       { bg: "bg-red-500/10",     border: "border-red-500/40",     text: "text-red-400",     bar: "bg-red-500"    },
  ending:       { bg: "bg-green-500/10",   border: "border-green-500/40",   text: "text-green-400",   bar: "bg-green-500"  },
};

const MOMENT_TYPE_LABELS: Record<string, string> = {
  race_start:      "Race Start",
  finish_line:     "Finish Line",
  field_attempt:   "Field Attempt",
  winner_reaction: "Winner Reaction",
  crowd_reaction:  "Crowd Reaction",
  record_broken:   "Record Broken",
  photo_finish:    "Photo Finish",
};

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [videoUrl, setVideoUrl] = useState(DEFAULT_YOUTUBE_URL);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"events" | "reel">("events");

  const { data: cachedRes, isLoading: loadingAnalysis } = useGetCachedAnalysis();
  const { data: stats, isLoading: loadingStats } = useGetEventStats();
  const analyzeMutation = useAnalyzeVideo();

  const handleAnalyze = () => {
    if (!videoUrl) return;
    analyzeMutation.mutate({ data: { videoUrl } }, {
      onSuccess: () => {
        toast({ title: "Analysis Complete", description: "Successfully extracted highlights." });
        queryClient.invalidateQueries({ queryKey: getGetCachedAnalysisQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetEventStatsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Analysis Failed", description: err?.error?.error || "Could not analyze video.", variant: "destructive" });
      },
    });
  };

  const analysis = cachedRes?.analysis ?? null;
  const categories = ["all", "sprint", "middle_distance", "long_distance", "hurdles", "relay", "jump", "throw", "walk"];
  const filteredEvents = useMemo(
    () => analysis?.events?.filter(e => activeCategory === "all" || e.category === activeCategory) ?? [],
    [analysis, activeCategory]
  );

  const formatCategoryName = (c: string) => c.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 selection:bg-primary/30">
      <div className="bg-noise" />
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="font-bold text-lg tracking-tight uppercase">
              T&F Analyzer<span className="text-primary">.pro</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
            {stats?.videoTitle && (
              <span className="truncate max-w-[300px] hidden md:inline-block">
                LIVE: {stats.videoTitle}
              </span>
            )}
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8 relative z-10">

        {/* Input */}
        <section className="bg-card border border-border rounded-xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Zap className="w-64 h-64" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Feed Source</label>
              <Input
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                placeholder="Enter YouTube URL..."
                className="bg-background border-border font-mono text-sm h-12"
                disabled={analyzeMutation.isPending}
                data-testid="input-video-url"
              />
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending || !videoUrl}
              className="h-12 px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
              data-testid="button-extract"
            >
              {analyzeMutation.isPending ? (
                <span className="animate-pulse flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Analyzing Feed...
                </span>
              ) : (
                <><Play className="mr-2 h-4 w-4" /> Extract Highlights</>
              )}
            </Button>
          </div>
          {analyzeMutation.isPending && (
            <div className="mt-6 space-y-2">
              <div className="h-1 w-full bg-secondary rounded overflow-hidden">
                <div className="h-full bg-primary animate-pulse w-1/2" />
              </div>
              <p className="text-xs font-mono text-muted-foreground text-right uppercase">
                Fetching transcript and processing with AI...
              </p>
            </div>
          )}
        </section>

        {loadingAnalysis || loadingStats ? (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        ) : !analysis ? (
          <div className="py-24 text-center border border-dashed border-border rounded-xl bg-card/30">
            <Trophy className="h-16 w-16 text-muted mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">No Analysis Data</h3>
            <p className="text-muted-foreground">Enter a video URL above and click Extract Highlights to begin.</p>
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Events"     value={stats?.totalEvents ?? 0}   icon={<Activity />} />
              <StatCard title="Track Races"      value={stats?.totalRaces ?? 0}    icon={<Timer />} />
              <StatCard title="Field Events"     value={stats?.totalFieldEvents ?? 0} icon={<Target />} />
              <StatCard title="Athletes Detected" value={stats?.totalAthletes ?? 0} icon={<Users />} />
            </section>

            {/* Main Tabs: Events / Reel */}
            <div className="border-b border-border">
              <div className="flex gap-6">
                <TabButton active={activeTab === "events"} onClick={() => setActiveTab("events")}>
                  <Target className="h-4 w-4 mr-2" /> Event Database
                </TabButton>
                <TabButton active={activeTab === "reel"} onClick={() => setActiveTab("reel")}>
                  <Clapperboard className="h-4 w-4 mr-2" /> Highlight Reel
                </TabButton>
              </div>
            </div>

            {activeTab === "events" && (
              <EventsTab
                analysis={analysis}
                filteredEvents={filteredEvents}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                categories={categories}
                formatCategoryName={formatCategoryName}
              />
            )}

            {activeTab === "reel" && (
              <ReelTab analysis={analysis} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center py-3 px-1 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EventsTab({
  analysis, filteredEvents, activeCategory, setActiveCategory, categories, formatCategoryName
}: {
  analysis: VideoAnalysis;
  filteredEvents: TrackEvent[];
  activeCategory: string;
  setActiveCategory: (c: string) => void;
  categories: string[];
  formatCategoryName: (c: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <section className="lg:col-span-2 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold uppercase tracking-tight">Event Database</h2>
          <div className="text-sm font-mono text-muted-foreground">{filteredEvents.length} Records</div>
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="bg-card border border-border w-full flex flex-wrap h-auto p-1 justify-start gap-1">
            {categories.map(cat => (
              <TabsTrigger
                key={cat}
                value={cat}
                className="text-xs uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded px-3 py-1.5"
              >
                {cat === "all" ? "All" : formatCategoryName(cat)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={activeCategory} className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            {filteredEvents.length === 0 && (
              <div className="py-12 text-center text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg">
                No events in this category.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      <section className="space-y-8">
        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-mono uppercase text-primary flex items-center gap-2">
              <Zap className="h-4 w-4" /> AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-foreground leading-relaxed">{analysis.analysisSummary}</p>
            <div className="pt-4 border-t border-border">
              <h4 className="text-xs font-mono uppercase text-muted-foreground mb-2">Selection Rationale</h4>
              <p className="text-muted-foreground italic">{analysis.selectionRationale}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-mono uppercase tracking-wider">Top Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...analysis.highlights]
                .sort((a, b) => a.reelPosition - b.reelPosition)
                .map((hl, i) => (
                  <div key={i} className="flex gap-4 items-start group" data-testid={`highlight-item-${i}`}>
                    <div className="font-mono text-primary font-bold text-sm bg-primary/10 px-2 py-1 rounded border border-primary/20 mt-0.5 whitespace-nowrap">
                      {hl.timestamp}
                    </div>
                    <div>
                      <p className="text-sm font-bold group-hover:text-primary transition-colors">{hl.caption}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{hl.eventName}</span>
                        <Badge variant="outline" className="text-[10px] uppercase h-4 px-1">
                          {MOMENT_TYPE_LABELS[hl.type] ?? hl.type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/** Convert HH:MM:SS or MM:SS to total seconds */
function tsToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/** Extract YouTube video ID from any standard URL format */
function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|live\/|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

/** Clip window in seconds shown in the short reel player */
const CLIP_WINDOW_SECS = 12;

function ReelTab({ analysis }: { analysis: VideoAnalysis }) {
  const clipsInOrder = useMemo(
    () => [...analysis.highlights].sort((a, b) => a.reelPosition - b.reelPosition),
    [analysis.highlights]
  );

  const sortedSegments = useMemo(
    () => [...analysis.reelStructure].sort((a, b) => a.order - b.order),
    [analysis.reelStructure]
  );

  const totalReelSeconds = useMemo(
    () => sortedSegments.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0),
    [sortedSegments]
  );

  const eventByName = useMemo(() => {
    const map = new Map<string, TrackEvent>();
    for (const ev of analysis.events) map.set(ev.eventName, ev);
    return map;
  }, [analysis.events]);

  const videoId = useMemo(() => extractVideoId(analysis.videoUrl), [analysis.videoUrl]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);        // seconds elapsed in current clip
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueRef = useRef<HTMLDivElement>(null);

  const clip = clipsInOrder[activeIdx];
  const linkedEvent = clip ? eventByName.get(clip.eventName) : undefined;
  const segForClip = clip
    ? sortedSegments.find(s => s.timestamps.includes(clip.timestamp))
    : undefined;
  const clipColors = segForClip
    ? (SEGMENT_COLORS[segForClip.label] ?? SEGMENT_COLORS.hook)
    : SEGMENT_COLORS.hook;

  const startSecs = clip ? tsToSeconds(clip.timestamp) : 0;
  const endSecs = startSecs + CLIP_WINDOW_SECS;
  const embedKey = `${videoId}-${activeIdx}`;
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?start=${startSecs}&end=${endSecs}&autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&color=white&enablejsapi=1`
    : null;

  const goTo = useCallback((idx: number) => {
    setActiveIdx(idx);
    setElapsed(0);
  }, []);

  const goPrev = useCallback(() => goTo(Math.max(0, activeIdx - 1)), [activeIdx, goTo]);
  const goNext = useCallback(() => {
    if (activeIdx < clipsInOrder.length - 1) goTo(activeIdx + 1);
    else { setIsPlaying(false); setElapsed(0); }
  }, [activeIdx, clipsInOrder.length, goTo]);

  // 1-second countdown ticker
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isPlaying) return;
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= CLIP_WINDOW_SECS) {
          // advance to next clip
          setActiveIdx(cur => {
            const next = cur + 1;
            if (next >= clipsInOrder.length) {
              setIsPlaying(false);
              return cur;
            }
            return next;
          });
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, clipsInOrder.length]);

  // Reset elapsed when clip changes
  useEffect(() => { setElapsed(0); }, [activeIdx]);

  // Scroll active item into view
  useEffect(() => {
    const el = queueRef.current?.querySelector(`[data-clipidx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  const progressPct = (elapsed / CLIP_WINDOW_SECS) * 100;
  const remaining = CLIP_WINDOW_SECS - elapsed;

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-primary" /> Short Reel Player
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {clipsInOrder.length} clips · {CLIP_WINDOW_SECS}s per clip · {clipsInOrder.length * CLIP_WINDOW_SECS}s total preview
            &nbsp;·&nbsp;
            <span className="text-muted-foreground/60">({totalReelSeconds}s final edited reel)</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Play Reel / Pause button */}
          <Button
            onClick={() => setIsPlaying(p => !p)}
            className={`h-9 px-5 font-bold uppercase text-xs tracking-wider ${
              isPlaying
                ? "bg-destructive/80 hover:bg-destructive text-white"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            }`}
          >
            {isPlaying
              ? <><span className="mr-1.5">⏸</span> Pause Reel</>
              : <><Play className="h-3.5 w-3.5 mr-1.5" /> Play Reel</>
            }
          </Button>
        </div>
      </div>

      {/* ── Main layout: Player + Queue ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT: Player */}
        <div className="lg:col-span-2 space-y-3">

          {/* iframe */}
          <div
            className="relative w-full rounded-xl overflow-hidden border border-border shadow-2xl bg-black"
            style={{ aspectRatio: "16/9" }}
          >
            {embedUrl ? (
              <iframe
                key={embedKey}
                src={embedUrl}
                title={clip?.caption ?? "Highlight"}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Film className="h-12 w-12 opacity-30" />
                <p className="text-sm">No video ID found</p>
              </div>
            )}

            {/* Segment label top-left */}
            {segForClip && (
              <div className={`absolute top-3 left-3 ${clipColors.bar} text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded shadow-lg tracking-widest pointer-events-none`}>
                {segForClip.label.replace("_"," ")}
              </div>
            )}

            {/* Clip counter top-right */}
            <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-mono px-2 py-1 rounded pointer-events-none">
              {activeIdx + 1} / {clipsInOrder.length}
            </div>

            {/* Countdown bottom-right */}
            {isPlaying && (
              <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs font-mono px-2 py-1 rounded pointer-events-none">
                {remaining}s left
              </div>
            )}
          </div>

          {/* Clip progress bar */}
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full ${clipColors.bar} transition-all duration-1000 ease-linear rounded-full`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>{clip?.timestamp}</span>
              <span className="text-primary font-bold">
                {isPlaying ? `Auto-advancing in ${remaining}s` : `${CLIP_WINDOW_SECS}s clip`}
              </span>
              <span>+{CLIP_WINDOW_SECS}s → {secondsToTs(endSecs)}</span>
            </div>
          </div>

          {/* Clip info card */}
          {clip && (
            <div className={`rounded-xl border ${clipColors.border} ${clipColors.bg} p-4 space-y-3`}>
              <p className="font-bold text-base leading-snug text-foreground">{clip.caption}</p>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-mono text-sm font-bold ${clipColors.text} bg-background/50 px-2 py-0.5 rounded border ${clipColors.border}`}>
                  {clip.timestamp} – {secondsToTs(endSecs)}
                </span>
                <Badge variant="outline" className="text-[10px] uppercase h-5 px-2">
                  {MOMENT_TYPE_LABELS[clip.type] ?? clip.type}
                </Badge>
                <span className="text-sm text-muted-foreground">{clip.eventName}</span>
                {linkedEvent?.winningResult && (
                  <span className="font-mono font-bold text-foreground text-sm">{linkedEvent.winningResult}</span>
                )}
              </div>

              {linkedEvent && (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Intensity</span>
                  <div className="flex gap-0.5 h-1.5 max-w-[100px] w-full">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className={`flex-1 rounded-sm ${
                        i < linkedEvent.intensityScore
                          ? i > 7 ? "bg-red-500" : i > 4 ? "bg-primary" : "bg-accent"
                          : "bg-secondary"
                      }`} />
                    ))}
                  </div>
                  <span className="text-xs font-mono font-bold">{linkedEvent.intensityScore}/10</span>
                </div>
              )}

              {linkedEvent?.athletes && linkedEvent.athletes.length > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 pt-2 border-t border-border/40">
                  {linkedEvent.athletes.slice(0, 3).map(a => (
                    <div key={a.rank} className="flex items-center gap-1.5 text-xs">
                      <span className={`font-mono font-bold ${a.rank === 1 ? "text-yellow-400" : "text-muted-foreground"}`}>#{a.rank}</span>
                      <span className="text-muted-foreground">{a.name}</span>
                      <span className="font-mono font-bold">{a.result}</span>
                      {a.notes && <Badge variant="outline" className="text-[9px] h-4 px-1 text-primary border-primary/30">{a.notes}</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Prev / dot nav / Next */}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={goPrev} disabled={activeIdx === 0} className="gap-2 border-border">
              <SkipBack className="h-4 w-4" /> Prev
            </Button>

            <div className="flex items-center gap-1.5">
              {clipsInOrder.map((_, i) => {
                const s = sortedSegments.find(sg => sg.timestamps.includes(clipsInOrder[i].timestamp));
                const c = s ? (SEGMENT_COLORS[s.label] ?? SEGMENT_COLORS.hook) : SEGMENT_COLORS.hook;
                return (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`rounded-full transition-all ${
                      i === activeIdx ? `w-5 h-2 ${c.bar}` : "w-2 h-2 bg-secondary hover:bg-muted-foreground"
                    }`}
                    title={clipsInOrder[i].eventName}
                  />
                );
              })}
            </div>

            <Button
              variant="outline"
              onClick={goNext}
              disabled={activeIdx === clipsInOrder.length - 1}
              className="gap-2 border-border"
            >
              Next <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* YouTube direct link */}
          {videoId && clip && (
            <a
              href={`https://www.youtube.com/watch?v=${videoId}&t=${startSecs}s`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open full video at {clip.timestamp}
            </a>
          )}
        </div>

        {/* RIGHT: Clip queue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              Clip Queue
            </p>
            <span className="text-[10px] font-mono text-muted-foreground">{clipsInOrder.length} cuts</span>
          </div>

          {/* Segment legend */}
          <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
            {sortedSegments.map(seg => {
              const c = SEGMENT_COLORS[seg.label] ?? SEGMENT_COLORS.hook;
              return (
                <div key={seg.label} className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${c.bar}`} />
                  <span className={`text-[9px] font-mono uppercase ${c.text}`}>{seg.label.replace("_"," ")}</span>
                </div>
              );
            })}
          </div>

          <div ref={queueRef} className="space-y-1.5 max-h-[580px] overflow-y-auto pr-1">
            {clipsInOrder.map((c, i) => {
              const seg = sortedSegments.find(s => s.timestamps.includes(c.timestamp));
              const col = seg ? (SEGMENT_COLORS[seg.label] ?? SEGMENT_COLORS.hook) : SEGMENT_COLORS.hook;
              const isActive = i === activeIdx;
              const cs = tsToSeconds(c.timestamp);
              return (
                <button
                  key={c.timestamp}
                  data-clipidx={i}
                  onClick={() => { goTo(i); setIsPlaying(false); }}
                  className={`w-full text-left rounded-lg border p-2.5 flex gap-2.5 items-start transition-all ${
                    isActive
                      ? `${col.border} ${col.bg} shadow-sm`
                      : "border-border bg-card hover:bg-card/80"
                  }`}
                >
                  {/* Clip number badge */}
                  <div className={`shrink-0 h-5 w-5 rounded text-white text-[9px] font-bold flex items-center justify-center ${col.bar} mt-0.5`}>
                    {c.reelPosition}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-bold leading-snug line-clamp-2 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {c.caption}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`font-mono text-[9px] font-bold ${col.text}`}>{c.timestamp}</span>
                      <span className="text-[9px] text-muted-foreground/60">→ {secondsToTs(cs + CLIP_WINDOW_SECS)}</span>
                      {isActive && isPlaying && (
                        <span className="flex items-center gap-0.5 text-[8px] text-primary font-mono uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse inline-block" />
                          {remaining}s
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Reel timeline bar ──────────────────────── */}
      <div className="space-y-2 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Reel Structure — {totalReelSeconds}s final cut</p>
        </div>
        <div className="flex h-7 rounded-lg overflow-hidden border border-border">
          {sortedSegments.map(seg => {
            const pct = totalReelSeconds > 0 ? (seg.durationSeconds / totalReelSeconds) * 100 : 20;
            const c = SEGMENT_COLORS[seg.label] ?? SEGMENT_COLORS.hook;
            const isActiveSeg = segForClip?.label === seg.label;
            return (
              <div
                key={seg.label}
                style={{ width: `${pct}%` }}
                className={`${c.bar} flex items-center justify-center overflow-hidden transition-opacity ${isActiveSeg ? "opacity-100 ring-2 ring-inset ring-white/40" : "opacity-50"}`}
                title={`${seg.label.replace("_"," ")} — ${seg.durationSeconds}s`}
              >
                <span className="text-[9px] font-bold uppercase text-white/90 truncate px-1">{seg.durationSeconds}s</span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {sortedSegments.map(seg => {
            const c = SEGMENT_COLORS[seg.label] ?? SEGMENT_COLORS.hook;
            const segClips = clipsInOrder.filter(hl => seg.timestamps.includes(hl.timestamp));
            return (
              <div key={seg.label} className={`rounded-lg border ${c.border} ${c.bg} p-2 text-center`}>
                <div className={`text-[9px] font-bold uppercase ${c.text} truncate`}>{seg.label.replace("_"," ")}</div>
                <div className="text-[10px] font-mono font-bold text-foreground mt-0.5">{seg.durationSeconds}s</div>
                <div className="text-[9px] text-muted-foreground">{segClips.length} clip{segClips.length !== 1 ? "s" : ""}</div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

/** Convert total seconds back to HH:MM:SS */
function secondsToTs(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function ClipRow({
  clipIndex, clip, event, colors
}: {
  clipIndex: number;
  clip: HighlightMoment;
  event?: TrackEvent;
  colors: { bg: string; border: string; text: string; bar: string };
}) {
  return (
    <div className="flex gap-3 items-start rounded-lg bg-background/40 border border-border/40 p-3 hover:border-border transition-colors">
      <div className={`shrink-0 h-6 w-6 rounded text-white text-[10px] font-bold flex items-center justify-center ${colors.bar} mt-0.5`}>
        {clip.reelPosition}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <p className="text-sm font-bold text-foreground leading-snug">{clip.caption}</p>
          <span className={`font-mono text-xs font-bold ${colors.text} bg-background/60 px-2 py-0.5 rounded border ${colors.border} whitespace-nowrap shrink-0`}>
            {clip.timestamp}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] uppercase h-4 px-1">
            {MOMENT_TYPE_LABELS[clip.type] ?? clip.type}
          </Badge>
          {event && (
            <>
              <span className="text-[10px] text-muted-foreground">{event.eventName}</span>
              {event.winningResult && (
                <span className="text-[10px] font-mono font-bold text-foreground">{event.winningResult}</span>
              )}
            </>
          )}
        </div>
        {event && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">Intensity</span>
            <div className="flex gap-0.5 h-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 rounded-sm ${
                    i < event.intensityScore
                      ? i > 7 ? "bg-red-500" : i > 4 ? "bg-primary" : "bg-accent"
                      : "bg-secondary"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] font-mono font-bold">{event.intensityScore}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="bg-card border-border overflow-hidden hover:border-primary/50 transition-colors" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4 sm:p-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <div className="text-primary opacity-80">{icon}</div>
          <span className="text-xs font-mono uppercase tracking-wider">{title}</span>
        </div>
        <div className="text-4xl font-bold text-foreground tracking-tighter">{value}</div>
      </CardContent>
    </Card>
  );
}

function EventCard({ event }: { event: TrackEvent }) {
  const CATEGORY_STYLES: Record<string, string> = {
    sprint:          "bg-orange-500/20 text-orange-300 border-orange-500/30",
    middle_distance: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    long_distance:   "bg-lime-500/20 text-lime-300 border-lime-500/30",
    hurdles:         "bg-red-500/20 text-red-300 border-red-500/30",
    relay:           "bg-pink-500/20 text-pink-300 border-pink-500/30",
    jump:            "bg-blue-500/20 text-blue-300 border-blue-500/30",
    throw:           "bg-violet-500/20 text-violet-300 border-violet-500/30",
    walk:            "bg-teal-500/20 text-teal-300 border-teal-500/30",
    combined:        "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  };

  const badgeStyle = CATEGORY_STYLES[event.category] ?? "bg-secondary text-secondary-foreground";

  return (
    <Card
      className="bg-card border-border hover:border-primary/40 transition-all hover:-translate-y-1 shadow-md hover:shadow-xl hover:shadow-primary/5 group relative overflow-hidden"
      data-testid={`event-card-${event.id}`}
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-base leading-tight group-hover:text-primary transition-colors">{event.eventName}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm border ${badgeStyle}`}>
                {event.category.replace("_", " ")}
              </span>
              <span className="text-[10px] uppercase font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded-sm">
                {event.gender}
              </span>
            </div>
          </div>
          <div className="bg-background border border-border px-2 py-1 rounded text-primary font-mono text-sm font-bold shadow-inner shrink-0 ml-2">
            {event.startTimestamp}
          </div>
        </div>

        {event.winningResult && (
          <div className="flex justify-between items-center text-sm border-b border-border/50 pb-2 mb-3">
            <span className="text-muted-foreground">Winning Result</span>
            <span className="font-mono font-bold text-foreground">{event.winningResult}</span>
          </div>
        )}

        <div className="bg-secondary/50 rounded p-2 border border-border/50 mb-3">
          <p className="text-xs text-foreground font-medium italic">"{event.highlightMoment}"</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase font-mono text-muted-foreground w-16">Intensity</span>
          <div className="flex-1 flex gap-0.5 h-1.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm ${
                  i < event.intensityScore
                    ? i > 7 ? "bg-destructive" : i > 4 ? "bg-primary" : "bg-accent"
                    : "bg-secondary"
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-mono font-bold w-4 text-right">{event.intensityScore}</span>
        </div>

        {event.athletes && event.athletes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
            {event.athletes.slice(0, 3).map(a => (
              <div key={a.rank} className="flex items-center gap-2 text-xs">
                <span className={`font-mono font-bold w-4 ${a.rank === 1 ? "text-yellow-400" : "text-muted-foreground"}`}>
                  #{a.rank}
                </span>
                <span className="flex-1 text-muted-foreground truncate">{a.name}</span>
                <span className="font-mono font-bold text-foreground">{a.result}</span>
                {a.notes && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/30 text-primary">{a.notes}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
