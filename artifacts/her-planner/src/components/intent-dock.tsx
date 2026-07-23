import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import { STEMS, type IntentId } from "@/components/intent-legend";
import type { PromptChip } from "@/components/intent-swimlane";

/** Short curated row — never duplicated infinite lane */
const SUGGESTIONS: PromptChip[] = [
  {
    intentId: "find_ways",
    label: {
      es: "Encuentra formas de entretener a los niños 20 min",
      en: "Find ways to entertain the kids for 20 min",
      pt: "Encontre formas de entreter as crianças por 20 min",
    },
  },
  {
    intentId: "solve",
    label: {
      es: "Resuelve mi estrés de dinero esta semana",
      en: "Solve my money stress this week",
      pt: "Resolva meu estresse com dinheiro esta semana",
    },
  },
  {
    intentId: "make",
    label: {
      es: "Hazme un plan de cena con lo que tengo",
      en: "Make me a dinner plan from what I have",
      pt: "Faça um plano de jantar com o que tenho",
    },
  },
  {
    intentId: "listen",
    label: {
      es: "Escúchame: hoy fue mucho",
      en: "Hear me — today was a lot",
      pt: "Me escuta: hoje foi demais",
    },
  },
  {
    intentId: "feel",
    label: {
      es: "Quiero sentirme calmada en 5 minutos",
      en: "I want to feel calm in 5 minutes",
      pt: "Quero me sentir calma em 5 minutos",
    },
  },
];

const ORDER: IntentId[] = ["find_ways", "solve", "make", "listen", "feel"];

type Props = {
  activeIntent: IntentId | null;
  showSuggestions: boolean;
  onPickMode: (intentId: IntentId, draftStem: string) => void;
  onPickSuggestion: (intentId: IntentId, fullPrompt: string) => void;
};

export function IntentDock({
  activeIntent,
  showSuggestions,
  onPickMode,
  onPickSuggestion,
}: Props) {
  const { lang } = useLanguage();
  const [hint, setHint] = useState(false);

  const chips = useMemo(() => SUGGESTIONS, []);

  return (
    <div className="space-y-1.5 pb-1.5">
      <div className="flex items-center justify-between gap-1">
        {ORDER.map((id) => {
          const stem = STEMS[id];
          const label = stem.short[lang] ?? stem.short.es;
          const draft = stem[lang] ?? stem.es;
          const active = activeIntent === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setHint(true);
                onPickMode(id, draft);
              }}
              className={cn(
                "min-w-0 flex-1 rounded-xl px-1 py-1.5 text-[11px] font-medium transition-colors duration-150",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/70 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="truncate block">{label}</span>
            </button>
          );
        })}
      </div>

      {showSuggestions && (
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
          {chips.map((chip, i) => {
            const label = chip.label[lang] ?? chip.label.es;
            return (
              <button
                key={`${chip.intentId}-${i}`}
                type="button"
                onClick={() => {
                  setHint(true);
                  onPickSuggestion(chip.intentId, label);
                }}
                className={cn(
                  "flex-shrink-0 max-w-[70vw] rounded-full border border-border bg-card px-3 py-1.5",
                  "text-left text-[11px] font-medium leading-snug text-foreground",
                  "transition-colors duration-150 hover:border-primary/40",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {hint && (
        <p className="px-0.5 text-[10px] text-muted-foreground animate-in fade-in duration-150">
          {lang === "es"
            ? "Toca enviar — o edita antes."
            : lang === "pt"
              ? "Toque enviar — ou edite antes."
              : "Tap send — or edit first."}
        </p>
      )}
    </div>
  );
}
