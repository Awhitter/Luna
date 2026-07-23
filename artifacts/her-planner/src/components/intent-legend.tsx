import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";

export type IntentId = "find_ways" | "solve" | "make" | "listen" | "feel";

const STEMS: Record<IntentId, { es: string; en: string; pt: string; short: { es: string; en: string; pt: string } }> = {
  find_ways: {
    es: "Encuentra formas de ",
    en: "Find ways to ",
    pt: "Encontre formas de ",
    short: { es: "Formas", en: "Find ways", pt: "Formas" },
  },
  solve: {
    es: "Resuelve esto por mí: ",
    en: "Solve this for me: ",
    pt: "Resolva isto por mim: ",
    short: { es: "Resuelve", en: "Solve", pt: "Resolva" },
  },
  make: {
    es: "Ayúdame a crear ",
    en: "Help me make ",
    pt: "Me ajude a criar ",
    short: { es: "Crear", en: "Make", pt: "Criar" },
  },
  listen: {
    es: "¿Me escuchas sobre…? ",
    en: "Will you hear me about…? ",
    pt: "Você me escuta sobre…? ",
    short: { es: "Escúchame", en: "Hear me", pt: "Me escuta" },
  },
  feel: {
    es: "Quiero sentirme ",
    en: "I want to feel ",
    pt: "Quero me sentir ",
    short: { es: "Sentirme", en: "Feel", pt: "Sentir" },
  },
};

const ORDER: IntentId[] = ["find_ways", "solve", "make", "listen", "feel"];

type Props = {
  activeIntent: IntentId | null;
  onSelect: (intentId: IntentId, draftStem: string) => void;
};

export function IntentLegend({ activeIntent, onSelect }: Props) {
  const { lang } = useLanguage();

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 hide-scrollbar">
      {ORDER.map((id) => {
        const stem = STEMS[id];
        const label = stem.short[lang] ?? stem.short.es;
        const draft = stem[lang] ?? stem.es;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id, draft)}
            className={cn(
              "flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              activeIntent === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export { STEMS };
