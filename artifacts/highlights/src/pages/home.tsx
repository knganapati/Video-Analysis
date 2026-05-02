import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useAnalyzeVideo, 
  useGetCachedAnalysis, 
  useGetEventStats,
  getGetCachedAnalysisQueryKey,
  getGetEventStatsQueryKey,
} from "@workspace/api-client-react";
import { TrackEvent, HighlightMoment, ReelSegment } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Activity, Play, Trophy, Clock, Users, Timer, ChevronRight, Zap, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_YOUTUBE_URL = "https://www.youtube.com/live/PRem1_S56W8";

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [videoUrl, setVideoUrl] = useState(DEFAULT_YOUTUBE_URL);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: cachedRes, isLoading: loadingAnalysis } = useGetCachedAnalysis();
  const { data: stats, isLoading: loadingStats } = useGetEventStats();
  
  const analyzeMutation = useAnalyzeVideo();

  const handleAnalyze = () => {
    if (!videoUrl) return;
    analyzeMutation.mutate({ data: { videoUrl } }, {
      onSuccess: () => {
        toast({
          title: "Analysis Complete",
          description: "Successfully analyzed video highlights.",
        });
        queryClient.invalidateQueries({ queryKey: getGetCachedAnalysisQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetEventStatsQueryKey() });
      },
      onError: (err) => {
        toast({
          title: "Analysis Failed",
          description: err.error?.error || "Could not analyze video.",
          variant: "destructive"
        });
      }
    });
  };

  const analysis = cachedRes?.analysis;

  const categories = ["all", "sprint", "middle_distance", "long_distance", "hurdles", "relay", "jump", "throw", "walk"];

  const filteredEvents = analysis?.events.filter(e => activeCategory === "all" || e.category === activeCategory) || [];

  const getCategoryBadgeClass = (category: string) => {
    return `cat-badge-${category}`;
  };

  const formatCategoryName = (category: string) => {
    return category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 selection:bg-primary/30">
      <div className="bg-noise" />
      
      {/* Top Navbar / Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="font-bold text-lg tracking-tight uppercase">T&F Analyzer<span className="text-primary">.pro</span></h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
            {stats?.videoTitle && <span className="truncate max-w-[300px] hidden md:inline-block">LIVE: {stats.videoTitle}</span>}
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8 relative z-10">
        
        {/* Analyzer Input Section */}
        <section className="bg-card border border-border rounded-xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Zap className="w-64 h-64" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:flex-1 space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Feed Source</label>
              <Input 
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Enter YouTube URL..."
                className="bg-background border-border font-mono text-sm h-12"
                disabled={analyzeMutation.isPending}
              />
            </div>
            <Button 
              onClick={handleAnalyze} 
              disabled={analyzeMutation.isPending || !videoUrl}
              className="h-12 px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
            >
              {analyzeMutation.isPending ? (
                <>
                  <span className="animate-pulse flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Analyzing Feed...
                  </span>
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" /> Extract Highlights
                </>
              )}
            </Button>
          </div>
          {analyzeMutation.isPending && (
            <div className="mt-6 space-y-2">
              <div className="h-1 w-full bg-secondary rounded overflow-hidden">
                <div className="h-full bg-primary animate-[pulse_1.5s_ease-in-out_infinite]" style={{ width: '45%' }} />
              </div>
              <p className="text-xs font-mono text-muted-foreground text-right uppercase">Processing frames...</p>
            </div>
          )}
        </section>

        {loadingAnalysis || loadingStats ? (
          <div className="space-y-8">
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Skeleton className="h-[600px] col-span-2 rounded-xl" />
              <Skeleton className="h-[600px] rounded-xl" />
            </div>
          </div>
        ) : !analysis ? (
          <div className="py-24 text-center border border-dashed border-border rounded-xl bg-card/30">
            <Trophy className="h-16 w-16 text-muted mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">No Analysis Data</h3>
            <p className="text-muted-foreground">Enter a video URL above and click Extract Highlights to begin.</p>
          </div>
        ) : (
          <>
            {/* Scoreboard Stats */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total Events" value={stats?.totalEvents ?? 0} icon={<Activity />} />
              <StatCard title="Track Races" value={stats?.totalRaces ?? 0} icon={<Timer />} />
              <StatCard title="Field Events" value={stats?.totalFieldEvents ?? 0} icon={<Target />} />
              <StatCard title="Athletes Detected" value={stats?.totalAthletes ?? 0} icon={<Users />} />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Events Grid */}
              <section className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold uppercase tracking-tight">Event Database</h2>
                  <div className="text-sm font-mono text-muted-foreground scoreboard-font">{filteredEvents.length} Records</div>
                </div>
                
                <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
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
                        <EventCard key={event.id} event={event} badgeClass={getCategoryBadgeClass(event.category)} />
                      ))}
                    </div>
                    {filteredEvents.length === 0 && (
                      <div className="py-12 text-center text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg">
                        No events found for this category.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </section>

              {/* Right Column: Highlights & Structure */}
              <section className="space-y-8">
                {/* AI Summary */}
                <Card className="bg-card border-border shadow-md">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-mono uppercase text-primary flex items-center gap-2">
                      <Zap className="h-4 w-4" /> AI Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div>
                      <p className="text-foreground leading-relaxed">{analysis.analysisSummary}</p>
                    </div>
                    <div className="pt-4 border-t border-border">
                      <h4 className="text-xs font-mono uppercase text-muted-foreground mb-2">Selection Rationale</h4>
                      <p className="text-muted-foreground italic">{analysis.selectionRationale}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Key Timestamps Timeline */}
                <Card className="bg-card border-border shadow-md">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-mono uppercase tracking-wider">Top Highlights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {analysis.highlights.slice().sort((a,b) => a.reelPosition - b.reelPosition).map((hl, i) => (
                        <div key={i} className="flex gap-4 items-start group">
                          <div className="font-mono text-primary font-bold text-sm bg-primary/10 px-2 py-1 rounded border border-primary/20 scoreboard-font mt-0.5 whitespace-nowrap">
                            {hl.timestamp}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{hl.caption}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">{hl.eventName}</span>
                              <Badge variant="outline" className="text-[10px] uppercase h-4 px-1 border-border bg-background">
                                {hl.type.replace('_', ' ')}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Reel Structure */}
                <Card className="bg-card border-border shadow-md">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-mono uppercase tracking-wider">Reel Structure</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative border-l border-border ml-2 space-y-6">
                      {analysis.reelStructure.sort((a,b) => a.order - b.order).map((segment, i) => (
                        <div key={i} className="relative pl-6">
                          <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-background border-2 border-accent" />
                          <h4 className="text-sm font-bold uppercase tracking-wider text-accent mb-1">{segment.label.replace('_', ' ')}</h4>
                          <p className="text-xs text-muted-foreground mb-2">{segment.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {segment.timestamps.map((ts, idx) => (
                              <span key={idx} className="text-[10px] font-mono bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded scoreboard-font">
                                {ts}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="bg-card border-border overflow-hidden group hover:border-primary/50 transition-colors">
      <CardContent className="p-4 sm:p-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <div className="text-primary opacity-80">{icon}</div>
          <span className="text-xs font-mono uppercase tracking-wider">{title}</span>
        </div>
        <div className="text-4xl font-bold text-foreground scoreboard-font tracking-tighter">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function EventCard({ event, badgeClass }: { event: TrackEvent, badgeClass: string }) {
  return (
    <Card className="bg-card border-border hover:border-border/80 transition-all hover:-translate-y-1 shadow-md hover:shadow-xl hover:shadow-primary/5 group relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-4 sm:p-5">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{event.eventName}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm ${badgeClass}`}>
                {event.category.replace('_', ' ')}
              </span>
              <span className="text-[10px] uppercase font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded-sm">
                {event.gender}
              </span>
            </div>
          </div>
          <div className="bg-background border border-border px-2 py-1 rounded text-primary font-mono text-sm font-bold scoreboard-font shadow-inner">
            {event.startTimestamp}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {event.winningResult && (
            <div className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
              <span className="text-muted-foreground">Winning Result</span>
              <span className="font-mono font-bold text-foreground scoreboard-font">{event.winningResult}</span>
            </div>
          )}
          
          <div className="bg-secondary/50 rounded p-2 border border-border/50">
            <p className="text-xs text-foreground font-medium italic">"{event.highlightMoment}"</p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] uppercase font-mono text-muted-foreground w-16">Intensity</span>
            <div className="flex-1 flex gap-0.5 h-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div 
                  key={i} 
                  className={`flex-1 rounded-sm ${i < event.intensityScore ? (i > 7 ? 'bg-destructive' : i > 4 ? 'bg-primary' : 'bg-accent') : 'bg-secondary'}`}
                />
              ))}
            </div>
            <span className="text-xs font-mono font-bold scoreboard-font w-4 text-right">{event.intensityScore}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
