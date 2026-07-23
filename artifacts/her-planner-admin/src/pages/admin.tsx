import { useEffect, useMemo, useState } from "react";
import {
  useGetAgentConfig,
  useUpdateAgentConfig,
  useListAgentMemories,
  useDeleteAgentMemory,
  getListAgentMemoriesQueryKey,
  getGetAgentConfigQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Sparkles, FileText, BookText, Settings2, Brain, Save, Trash2, RotateCcw } from "lucide-react";

const MODEL_OPTIONS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4.1",
  "gpt-4.1-mini",
];

function tokenEstimate(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading: cfgLoading, isError: cfgError } = useGetAgentConfig();
  const { data: memories, isLoading: memLoading, refetch: refetchMemories } = useListAgentMemories({ limit: 20 });

  const updateMut = useUpdateAgentConfig({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentConfigQueryKey() });
        toast({ title: "Saved", description: "Luna will use the new settings on her next message." });
      },
      onError: (err) => {
        toast({ title: "Save failed", description: String(err), variant: "destructive" });
      },
    },
  });

  const deleteMut = useDeleteAgentMemory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAgentMemoriesQueryKey({ limit: 20 }) });
        toast({ title: "Forgotten", description: "Luna no longer remembers that." });
      },
      onError: (err) => {
        toast({ title: "Delete failed", description: String(err), variant: "destructive" });
      },
    },
  });

  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [rules, setRules] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [temperature, setTemperature] = useState<number>(0.8);
  const [maxTokens, setMaxTokens] = useState<number>(1024);

  const [originalSnapshot, setOriginalSnapshot] = useState<{
    name: string;
    persona: string;
    rules: string;
    model: string;
    temperature: number;
    maxTokens: number;
  } | null>(null);

  useEffect(() => {
    if (!config) return;
    setName(config.name);
    setPersona(config.persona);
    setRules(config.rules ?? "");
    setModel(config.model);
    setTemperature(config.temperature);
    setMaxTokens(config.maxTokens);
    setOriginalSnapshot({
      name: config.name,
      persona: config.persona,
      rules: config.rules ?? "",
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }, [config]);

  const personaTokens = useMemo(() => tokenEstimate(persona), [persona]);
  const rulesTokens = useMemo(() => tokenEstimate(rules), [rules]);
  const totalTokens = personaTokens + rulesTokens;

  const dirty = useMemo(() => {
    if (!originalSnapshot) return false;
    return (
      name !== originalSnapshot.name ||
      persona !== originalSnapshot.persona ||
      rules !== originalSnapshot.rules ||
      model !== originalSnapshot.model ||
      temperature !== originalSnapshot.temperature ||
      maxTokens !== originalSnapshot.maxTokens
    );
  }, [name, persona, rules, model, temperature, maxTokens, originalSnapshot]);

  const handleSave = () => {
    updateMut.mutate({
      data: {
        name,
        persona,
        rules,
        model,
        temperature,
        maxTokens,
      },
    });
  };

  const handleReset = () => {
    if (!originalSnapshot) return;
    setName(originalSnapshot.name);
    setPersona(originalSnapshot.persona);
    setRules(originalSnapshot.rules);
    setModel(originalSnapshot.model);
    setTemperature(originalSnapshot.temperature);
    setMaxTokens(originalSnapshot.maxTokens);
  };

  if (cfgError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Couldn't load Luna</CardTitle>
            <CardDescription>The admin API didn't respond. Make sure the API server is running.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl tracking-tight">Luna Admin</h1>
            <p className="text-sm text-muted-foreground">Edit her identity, voice, and behavior — no redeploy.</p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={updateMut.isPending}>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Discard
              </Button>
            )}
            <Button onClick={handleSave} disabled={!dirty || updateMut.isPending} size="sm">
              <Save className="h-4 w-4 mr-1.5" />
              {updateMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Identity */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Identity</CardTitle>
            </div>
            <CardDescription>What Luna calls herself and the core feeling of her presence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              {cfgLoading ? (
                <Skeleton className="h-10 w-64" />
              ) : (
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Luna"
                  className="max-w-sm"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="persona">Persona</Label>
                <span className="text-xs text-muted-foreground">~{personaTokens.toLocaleString()} tokens</span>
              </div>
              {cfgLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <Textarea
                  id="persona"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  rows={10}
                  className="font-mono text-sm leading-relaxed"
                  placeholder="Describe Luna's tone, warmth, vocabulary..."
                />
              )}
              <p className="text-xs text-muted-foreground">
                This is the first half of Luna's system prompt — her voice and personality.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Prompt (combined view) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>System Prompt Preview</CardTitle>
            </div>
            <CardDescription>
              The full prompt Luna sees, assembled from persona + rules + live context she fetches at runtime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/40 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-72 overflow-auto">
              {cfgLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <>
                  {persona.trim()}
                  {rules.trim() ? `\n\n${rules.trim()}` : ""}
                  {"\n\n[+ live profile, cycle phase, today's tasks, recent memories injected here at runtime]"}
                </>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="secondary">~{totalTokens.toLocaleString()} static tokens</Badge>
              <span>Live context adds more on every request.</span>
            </div>
          </CardContent>
        </Card>

        {/* Behavior Rules */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookText className="h-5 w-5 text-primary" />
              <CardTitle>Behavior Rules</CardTitle>
            </div>
            <CardDescription>
              Step-by-step rules Luna follows for tools (tasks, symptoms, memory, cycle). Numbered lists work best.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="rules">Rules</Label>
              <span className="text-xs text-muted-foreground">~{rulesTokens.toLocaleString()} tokens</span>
            </div>
            {cfgLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <Textarea
                id="rules"
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                rows={16}
                className="font-mono text-sm leading-relaxed"
                placeholder="TASK ADDING RULES — follow these exactly:&#10;1. ..."
              />
            )}
          </CardContent>
        </Card>

        {/* Model */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <CardTitle>Model</CardTitle>
            </div>
            <CardDescription>Which OpenAI model Luna uses, and how creative she's allowed to be.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                {cfgLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <select
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {!MODEL_OPTIONS.includes(model) && <option value={model}>{model} (custom)</option>}
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature">
                  Temperature <span className="text-muted-foreground font-normal">{temperature.toFixed(2)}</span>
                </Label>
                {cfgLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <input
                    id="temperature"
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full accent-[hsl(var(--primary))] h-10"
                  />
                )}
                <p className="text-xs text-muted-foreground">0 = focused, 2 = wild</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxTokens">Max tokens</Label>
                {cfgLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Input
                    id="maxTokens"
                    type="number"
                    min={64}
                    max={8192}
                    step={64}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                  />
                )}
                <p className="text-xs text-muted-foreground">Cap per response</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Memory Inspector */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <CardTitle>Memory Inspector</CardTitle>
                </div>
                <CardDescription className="mt-1">
                  Recent things Luna decided to remember. Hit "Forget this" to remove one.
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchMemories()}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {memLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !memories || memories.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-12">
                No memories yet. Luna saves things as you chat.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {memories.map((m) => {
                  const isDeleting = deleteMut.isPending && deleteMut.variables?.id === m.id;
                  return (
                    <li key={m.id} className="py-3 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-relaxed">{m.content}</p>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">{m.source}</Badge>
                          <span>{formatRelative(new Date(m.createdAt))}</span>
                          {m.conversationId != null && <span>· chat #{m.conversationId}</span>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMut.mutate({ id: m.id })}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4 mr-1.5" />
                        {isDeleting ? "Forgetting…" : "Forget this"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Separator />
        <p className="text-center text-xs text-muted-foreground pb-4">
          Changes apply on Luna's next message. No redeploy needed.
        </p>
      </main>

      <Toaster />
    </div>
  );
}
