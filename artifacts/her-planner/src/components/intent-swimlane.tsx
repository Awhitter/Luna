import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import type { IntentId } from "@/components/intent-legend";

export type PromptChip = {
  intentId: IntentId;
  /** Full prompt shown on the chip + sent (or filled into input) */
  label: { es: string; en: string; pt: string };
};

/** Concrete, clickable prompts — never leave her staring at a blank stem. */
const PROMPTS: PromptChip[] = [
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
      es: "Hazme sentir deseada y presente",
      en: "Make me feel desired and present",
      pt: "Me faça sentir desejada e presente",
    },
  },
  {
    intentId: "find_ways",
    label: {
      es: "Encuentra formas de ganar $50 esta semana",
      en: "Find ways to make $50 this week",
      pt: "Encontre formas de ganhar $50 esta semana",
    },
  },
  {
    intentId: "make",
    label: {
      es: "Ayúdame a crear una idea de cerámica pequeña",
      en: "Help me make a small pottery idea",
      pt: "Me ajude a criar uma ideia pequena de cerâmica",
    },
  },
  {
    intentId: "solve",
    label: {
      es: "Resuelve la pelea de rutina de esta mañana",
      en: "Solve this morning’s routine fight",
      pt: "Resolva a briga da rotina desta manhã",
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
  {
    intentId: "find_ways",
    label: {
      es: "Investiga chisme suave de __",
      en: "Research light gossip about __",
      pt: "Pesquise fofoca leve sobre __",
    },
  },
  {
    intentId: "make",
    label: {
      es: "Dame tu opinión sobre __",
      en: "Give me an opinion on __",
      pt: "Me dá uma opinião sobre __",
    },
  },
  {
    intentId: "listen",
    label: {
      es: "Escúchame sin arreglar nada",
      en: "Hear me without fixing anything",
      pt: "Me escuta sem tentar consertar",
    },
  },
  {
    intentId: "make",
    label: {
      es: "Hazme la lista del súper para hoy",
      en: "Make today’s grocery list for me",
      pt: "Faça a lista do mercado de hoje",
    },
  },
  {
    intentId: "solve",
    label: {
      es: "Resuelve qué hago con esta noche libre",
      en: "Solve what I should do with tonight free",
      pt: "Resolva o que fazer com a noite livre",
    },
  },
];

const INTENT_TINT: Record<IntentId, string> = {
  find_ways: "from-rose-50 to-rose-100/80 border-rose-200 text-rose-800",
  solve: "from-amber-50 to-amber-100/70 border-amber-200 text-amber-900",
  make: "from-violet-50 to-violet-100/70 border-violet-200 text-violet-900",
  listen: "from-sky-50 to-sky-100/70 border-sky-200 text-sky-900",
  feel: "from-pink-50 to-pink-100/80 border-pink-200 text-pink-900",
};

type Props = {
  activeIntent: IntentId | null;
  onPick: (intentId: IntentId, fullPrompt: string) => void;
};

export function IntentSwimlane({ activeIntent, onPick }: Props) {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState<number | null>(null);

  // Duplicate list so the lane feels “infinite” when scrolling
  const lane = useMemo(() => [...PROMPTS, ...PROMPTS], []);

  return (
    <div className="pb-2">
      <div className="flex gap-2 overflow-x-auto hide-scrollbar snap-x snap-mandatory px-0.5 py-0.5">
        {lane.map((chip, i) => {
          const label = chip.label[lang] ?? chip.label.es;
          const isActive = activeIntent === chip.intentId && expanded === i;
          return (
            <button
              key={`${chip.intentId}-${i}`}
              type="button"
              onClick={() => {
                setExpanded(i);
                onPick(chip.intentId, label);
              }}
              className={cn(
                "snap-start flex-shrink-0 max-w-[78vw] rounded-full border bg-gradient-to-r px-3.5 py-2 text-left text-[12px] font-medium leading-snug shadow-sm transition-all duration-200 ease-out",
                "hover:scale-[1.02] active:scale-[0.98] motion-reduce:transform-none",
                INTENT_TINT[chip.intentId],
                isActive && "ring-2 ring-primary/40 scale-[1.02]",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {expanded !== null && (
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground animate-in fade-in duration-200">
          {lang === "es"
            ? "Toca enviar — o edita el mensaje antes."
            : lang === "pt"
              ? "Toque enviar — ou edite a mensagem antes."
              : "Tap send — or edit the message first."}
        </p>
      )}
    </div>
  );
}
