import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n/context";

const DISMISS_KEY = "luna-install-coach-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

const COPY = {
  es: {
    title: "Lleva Luna en tu pantalla de inicio",
    bodyIos: "En Safari: toca Compartir → Añadir a pantalla de inicio. Sin App Store.",
    bodyOther: "En el menú del navegador, elige “Instalar app” o “Añadir a pantalla de inicio”.",
    dismiss: "Ahora no",
    gotIt: "Entendido",
  },
  en: {
    title: "Add Luna to your home screen",
    bodyIos: "In Safari: tap Share → Add to Home Screen. No App Store needed.",
    bodyOther: "In your browser menu, choose “Install app” or “Add to Home Screen”.",
    dismiss: "Not now",
    gotIt: "Got it",
  },
  pt: {
    title: "Coloque a Luna na tela inicial",
    bodyIos: "No Safari: toque em Compartilhar → Adicionar à Tela de Início. Sem App Store.",
    bodyOther: "No menu do navegador, escolha “Instalar app” ou “Adicionar à tela inicial”.",
    dismiss: "Agora não",
    gotIt: "Entendi",
  },
} as const;

export function InstallCoach() {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const copy = COPY[lang] ?? COPY.es;

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    const t = window.setTimeout(() => setOpen(true), 1800);
    return () => window.clearTimeout(t);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={copy.title}
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <p className="text-sm font-semibold text-foreground">{copy.title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {isIos() ? copy.bodyIos : copy.bodyOther}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setOpen(false);
          }}
        >
          {copy.dismiss}
        </button>
        <button
          type="button"
          className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setOpen(false);
          }}
        >
          {copy.gotIt}
        </button>
      </div>
    </div>
  );
}
