export type Lang = "en" | "es" | "pt";

export type Translations = {
  nav: { today: string; week: string; month: string; cycle: string; profile: string };
  greetings: { morning: string; afternoon: string; evening: string; phaseHints: Record<string, string> };
  checkin: {
    logSleep: string; logEnergy: string; logMood: string;
    wizard: {
      title: string;
      sleep: { question: string; subtitle: string };
      energy: { question: string; subtitle: string };
      mood: { question: string; subtitle: string };
      moodPlaceholder: string;
      exhausted: string; fullPower: string;
      continue: string; startDay: string; saving: string; skip: string;
    };
  };
  chat: { placeholder: string; emptyTitle: string; emptySubtitle: string; errorMessage: string };
  tasks: { title: string; noTasks: string; add: string; cancel: string; placeholder: string };
  luna: { morningCheckin: string; suggests: string; thinking: string };
  moods: Record<string, string>;
  phases: Record<string, string>;
  week: {
    title: string; subtitle: string; done: string; of: string;
    energyRhythm: string; last7: string; avgEnergy: string; avgSleep: string; topMood: string;
    weeklyRecap: string; getRecap: string; refresh: string; recapLoading: string;
    recapPrompt: string; sundayNote: string;
    categories: Record<string, string>;
  };
  month: { title: string; subtitle: string; allMonthTasks: string; noTasks: string };
  cycle: {
    title: string; subtitle: string; currentPhase: string; day: string;
    periodIn: string; energyLabel: string; moodLabel: string; tip: string;
    logButton: string; recentEntries: string; noEntries: string;
    entryTypes: Record<string, string>;
    phases: Record<string, string>;
  };
  settings: {
    title: string; profileTitle: string; subtitle: string; languageLabel: string;
    name: string; namePlaceholder: string; hasKids: string; hasKidsHint: string; howMany: string;
    workSchedule: string; selectSchedule: string;
    workOptions: Record<string, string>;
    health: string; healthHint: string; healthPlaceholder: string;
    avgSleep: string; cycleSettings: string; cycleLength: string; periodLength: string;
    save: string; saving: string; letsGo: string; welcomeTitle: string; welcomeSubtitle: string;
  };
};

const en: Translations = {
  nav: { today: "Today", week: "Week", month: "Month", cycle: "Cycle", profile: "Profile" },
  greetings: {
    morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening",
    phaseHints: {
      menstrual: "Rest is on the list too — I've got you.",
      follicular: "Your energy's building. Let's use it well!",
      ovulation: "You're in your power today. Big things ahead?",
      luteal: "Let's keep it gentle and manageable today.",
      unknown: "Let's make today count, together.",
    },
  },
  checkin: {
    logSleep: "Log sleep", logEnergy: "Log energy", logMood: "Log mood",
    wizard: {
      title: "Luna · Morning check-in",
      sleep: { question: "How did you sleep?", subtitle: "Hours last night" },
      energy: { question: "Energy level?", subtitle: "How's your body feeling?" },
      mood: { question: "What's your mood?", subtitle: "Be honest — this is just for you" },
      moodPlaceholder: "Or describe it in your own words...",
      exhausted: "Exhausted", fullPower: "Full power",
      continue: "Continue", startDay: "Start my day ✨", saving: "Saving...", skip: "Skip for today",
    },
  },
  chat: {
    placeholder: "Tell Luna what's on your mind...",
    emptyTitle: "Luna is here for you ✨",
    emptySubtitle: "Your best friend for getting things done.",
    errorMessage: "Sorry, I had a little hiccup. Try again?",
  },
  tasks: { title: "Today's Tasks", noTasks: "No tasks yet. Ask Luna to help you plan your day!", add: "Add", cancel: "Cancel", placeholder: "New task..." },
  luna: { morningCheckin: "Luna · Morning check-in", suggests: "Luna suggests for today", thinking: "Luna is thinking about your day..." },
  moods: { happy: "happy", calm: "calm", tired: "tired", anxious: "anxious", motivated: "motivated", overwhelmed: "overwhelmed", grateful: "grateful", sad: "sad" },
  phases: { menstrual: "Menstrual", follicular: "Follicular", ovulation: "Ovulation", luteal: "Luteal", unknown: "Unknown" },
  week: {
    title: "This Week", subtitle: "Your weekly rhythm at a glance", done: "done", of: "of",
    energyRhythm: "Energy Rhythm", last7: "Last 7 days · tap a bar for details",
    avgEnergy: "avg energy", avgSleep: "avg sleep", topMood: "top mood",
    weeklyRecap: "Luna's Weekly Recap", getRecap: "Get recap", refresh: "Refresh",
    recapLoading: "Luna is reflecting on your week...",
    recapPrompt: "Ask Luna to look back at your week — she'll give you a warm summary of what you accomplished, how your energy held up, and what to carry into next week.",
    sundayNote: "It's Sunday — perfect time to reflect ✨",
    categories: { work: "Work", home: "Home", health: "Health", kids: "Kids", "self-care": "Self-Care", food: "Food" },
  },
  month: { title: "This Month", subtitle: "Monthly overview", allMonthTasks: "All month tasks", noTasks: "No tasks this month yet. Tap + to add one." },
  cycle: {
    title: "Cycle Tracker", subtitle: "Your body, your rhythm",
    currentPhase: "Current Phase", day: "Day", periodIn: "Period in ~{n} days",
    energyLabel: "Energy", moodLabel: "Mood", tip: "Today's tip",
    logButton: "Log cycle entry", recentEntries: "Recent entries", noEntries: "No entries yet. Start tracking your cycle to unlock personalized insights.",
    entryTypes: { period_start: "Period started", period_end: "Period ended", ovulation: "Ovulation", symptom: "Symptom", note: "Note" },
    phases: { menstrual: "Menstrual", follicular: "Follicular", ovulation: "Ovulation", luteal: "Luteal", unknown: "Unknown" },
  },
  settings: {
    title: "Profile", profileTitle: "Profile", subtitle: "Your personal settings",
    languageLabel: "Language",
    name: "Your name", namePlaceholder: "Sofia",
    hasKids: "Do you have children?", hasKidsHint: "Helps plan around school & family", howMany: "How many?",
    workSchedule: "Work schedule", selectSchedule: "Select your schedule",
    workOptions: { "9am-5pm Mon-Fri": "9am–5pm, Mon–Fri", flexible: "Flexible / Remote", "part-time": "Part-time", shifts: "Shift work", "stay-at-home": "Stay at home", freelance: "Freelance", other: "Other" },
    health: "Health conditions", healthHint: "e.g. PCOS, endometriosis, thyroid, anxiety", healthPlaceholder: "Optional — helps personalize advice",
    avgSleep: "Average sleep hours", cycleSettings: "Cycle settings", cycleLength: "Cycle length (days)", periodLength: "Period length (days)",
    save: "Save changes", saving: "Saving...", letsGo: "Let's get started", welcomeTitle: "Welcome!", welcomeSubtitle: "Let's personalize your experience",
  },
};

const es: Translations = {
  nav: { today: "Hoy", week: "Semana", month: "Mes", cycle: "Ciclo", profile: "Perfil" },
  greetings: {
    morning: "Buenos días", afternoon: "Buenas tardes", evening: "Buenas noches",
    phaseHints: {
      menstrual: "El descanso también es productivo — aquí estoy para ti.",
      follicular: "Tu energía está creciendo. ¡Vamos a aprovecharla!",
      ovulation: "Estás en tu momento de poder. ¿Grandes cosas hoy?",
      luteal: "Vamos a mantenerlo suave y manejable hoy.",
      unknown: "Hagamos que este día cuente, juntas.",
    },
  },
  checkin: {
    logSleep: "Registrar sueño", logEnergy: "Registrar energía", logMood: "Registrar estado",
    wizard: {
      title: "Luna · Revisión matutina",
      sleep: { question: "¿Cómo dormiste?", subtitle: "Horas anoche" },
      energy: { question: "¿Nivel de energía?", subtitle: "¿Cómo se siente tu cuerpo?" },
      mood: { question: "¿Cómo está tu ánimo?", subtitle: "Sé honesta — esto es solo para ti" },
      moodPlaceholder: "O descríbelo con tus propias palabras...",
      exhausted: "Agotada", fullPower: "Plena energía",
      continue: "Continuar", startDay: "¡Empezar mi día! ✨", saving: "Guardando...", skip: "Saltar por hoy",
    },
  },
  chat: {
    placeholder: "Dile a Luna lo que tienes en mente...",
    emptyTitle: "Luna está aquí para ti ✨",
    emptySubtitle: "Tu mejor amiga para hacer las cosas.",
    errorMessage: "Ups, algo salió mal. ¿Intentamos de nuevo?",
  },
  tasks: { title: "Tareas de hoy", noTasks: "Sin tareas aún. ¡Pídele a Luna que te ayude a planear tu día!", add: "Agregar", cancel: "Cancelar", placeholder: "Nueva tarea..." },
  luna: { morningCheckin: "Luna · Revisión matutina", suggests: "Luna sugiere para hoy", thinking: "Luna está pensando en tu día..." },
  moods: { happy: "feliz", calm: "tranquila", tired: "cansada", anxious: "ansiosa", motivated: "motivada", overwhelmed: "agobiada", grateful: "agradecida", sad: "triste" },
  phases: { menstrual: "Menstrual", follicular: "Folicular", ovulation: "Ovulación", luteal: "Lútea", unknown: "Desconocida" },
  week: {
    title: "Esta semana", subtitle: "Tu ritmo semanal de un vistazo", done: "listas", of: "de",
    energyRhythm: "Ritmo de energía", last7: "Últimos 7 días · toca una barra para detalles",
    avgEnergy: "energía prom.", avgSleep: "sueño prom.", topMood: "estado frecuente",
    weeklyRecap: "Resumen semanal de Luna", getRecap: "Ver resumen", refresh: "Actualizar",
    recapLoading: "Luna está reflexionando sobre tu semana...",
    recapPrompt: "Pídele a Luna que mire atrás en tu semana — te dará un resumen cálido de lo que lograste, cómo te fue con la energía y qué llevar a la próxima semana.",
    sundayNote: "Es domingo — el momento perfecto para reflexionar ✨",
    categories: { work: "Trabajo", home: "Hogar", health: "Salud", kids: "Hijos", "self-care": "Autocuidado", food: "Comida" },
  },
  month: { title: "Este mes", subtitle: "Vista mensual", allMonthTasks: "Todas las tareas del mes", noTasks: "Sin tareas este mes. Toca + para agregar una." },
  cycle: {
    title: "Seguimiento del ciclo", subtitle: "Tu cuerpo, tu ritmo",
    currentPhase: "Fase actual", day: "Día", periodIn: "Período en ~{n} días",
    energyLabel: "Energía", moodLabel: "Ánimo", tip: "Consejo de hoy",
    logButton: "Registrar entrada del ciclo", recentEntries: "Entradas recientes", noEntries: "Sin entradas aún. Empieza a registrar tu ciclo para desbloquear información personalizada.",
    entryTypes: { period_start: "Período comenzó", period_end: "Período terminó", ovulation: "Ovulación", symptom: "Síntoma", note: "Nota" },
    phases: { menstrual: "Menstrual", follicular: "Folicular", ovulation: "Ovulación", luteal: "Lútea", unknown: "Desconocida" },
  },
  settings: {
    title: "Perfil", profileTitle: "Perfil", subtitle: "Tu configuración personal",
    languageLabel: "Idioma",
    name: "Tu nombre", namePlaceholder: "Sofía",
    hasKids: "¿Tienes hijos?", hasKidsHint: "Ayuda a planear alrededor de la escuela y la familia", howMany: "¿Cuántos?",
    workSchedule: "Horario de trabajo", selectSchedule: "Selecciona tu horario",
    workOptions: { "9am-5pm Mon-Fri": "9am–5pm, Lun–Vie", flexible: "Flexible / Remoto", "part-time": "Tiempo parcial", shifts: "Turnos", "stay-at-home": "En casa", freelance: "Freelance", other: "Otro" },
    health: "Condiciones de salud", healthHint: "ej. SOP, endometriosis, tiroides, ansiedad", healthPlaceholder: "Opcional — ayuda a personalizar los consejos",
    avgSleep: "Horas promedio de sueño", cycleSettings: "Configuración del ciclo", cycleLength: "Duración del ciclo (días)", periodLength: "Duración del período (días)",
    save: "Guardar cambios", saving: "Guardando...", letsGo: "¡Empecemos!", welcomeTitle: "¡Bienvenida!", welcomeSubtitle: "Vamos a personalizar tu experiencia",
  },
};

const pt: Translations = {
  nav: { today: "Hoje", week: "Semana", month: "Mês", cycle: "Ciclo", profile: "Perfil" },
  greetings: {
    morning: "Bom dia", afternoon: "Boa tarde", evening: "Boa noite",
    phaseHints: {
      menstrual: "Descansar também é produtivo — estou aqui com você.",
      follicular: "Sua energia está crescendo. Vamos aproveitá-la!",
      ovulation: "Você está no seu momento de poder. Grandes conquistas hoje?",
      luteal: "Vamos manter tudo suave e gerenciável hoje.",
      unknown: "Vamos fazer este dia valer a pena, juntas.",
    },
  },
  checkin: {
    logSleep: "Registrar sono", logEnergy: "Registrar energia", logMood: "Registrar humor",
    wizard: {
      title: "Luna · Check-in matinal",
      sleep: { question: "Como você dormiu?", subtitle: "Horas ontem à noite" },
      energy: { question: "Nível de energia?", subtitle: "Como seu corpo está se sentindo?" },
      mood: { question: "Qual é o seu humor?", subtitle: "Seja honesta — isso é só para você" },
      moodPlaceholder: "Ou descreva com suas próprias palavras...",
      exhausted: "Esgotada", fullPower: "Plena energia",
      continue: "Continuar", startDay: "Começar meu dia ✨", saving: "Salvando...", skip: "Pular por hoje",
    },
  },
  chat: {
    placeholder: "Conta pra Luna o que está na sua cabeça...",
    emptyTitle: "Luna está aqui por você ✨",
    emptySubtitle: "Sua melhor amiga para fazer as coisas acontecerem.",
    errorMessage: "Ops, algo deu errado. Tenta de novo?",
  },
  tasks: { title: "Tarefas de hoje", noTasks: "Sem tarefas ainda. Peça à Luna para ajudar a planejar seu dia!", add: "Adicionar", cancel: "Cancelar", placeholder: "Nova tarefa..." },
  luna: { morningCheckin: "Luna · Check-in matinal", suggests: "Luna sugere para hoje", thinking: "Luna está pensando no seu dia..." },
  moods: { happy: "feliz", calm: "calma", tired: "cansada", anxious: "ansiosa", motivated: "motivada", overwhelmed: "sobrecarregada", grateful: "grata", sad: "triste" },
  phases: { menstrual: "Menstrual", follicular: "Folicular", ovulation: "Ovulação", luteal: "Lútea", unknown: "Desconhecida" },
  week: {
    title: "Esta semana", subtitle: "Seu ritmo semanal de relance", done: "concluídas", of: "de",
    energyRhythm: "Ritmo de Energia", last7: "Últimos 7 dias · toque uma barra para detalhes",
    avgEnergy: "energia méd.", avgSleep: "sono méd.", topMood: "humor mais frequente",
    weeklyRecap: "Retrospectiva semanal da Luna", getRecap: "Ver retrospectiva", refresh: "Atualizar",
    recapLoading: "Luna está refletindo sobre sua semana...",
    recapPrompt: "Peça à Luna para olhar para trás na sua semana — ela vai te dar um resumo caloroso do que você conquistou, como foi sua energia e o que levar para a próxima semana.",
    sundayNote: "É domingo — hora perfeita para refletir ✨",
    categories: { work: "Trabalho", home: "Casa", health: "Saúde", kids: "Filhos", "self-care": "Autocuidado", food: "Comida" },
  },
  month: { title: "Este mês", subtitle: "Visão mensal", allMonthTasks: "Todas as tarefas do mês", noTasks: "Sem tarefas este mês. Toque + para adicionar uma." },
  cycle: {
    title: "Rastreador de ciclo", subtitle: "Seu corpo, seu ritmo",
    currentPhase: "Fase atual", day: "Dia", periodIn: "Menstruação em ~{n} dias",
    energyLabel: "Energia", moodLabel: "Humor", tip: "Dica de hoje",
    logButton: "Registrar entrada do ciclo", recentEntries: "Entradas recentes", noEntries: "Sem entradas ainda. Comece a rastrear seu ciclo para desbloquear insights personalizados.",
    entryTypes: { period_start: "Menstruação começou", period_end: "Menstruação terminou", ovulation: "Ovulação", symptom: "Sintoma", note: "Nota" },
    phases: { menstrual: "Menstrual", follicular: "Folicular", ovulation: "Ovulação", luteal: "Lútea", unknown: "Desconhecida" },
  },
  settings: {
    title: "Perfil", profileTitle: "Perfil", subtitle: "Suas configurações pessoais",
    languageLabel: "Idioma",
    name: "Seu nome", namePlaceholder: "Sofia",
    hasKids: "Você tem filhos?", hasKidsHint: "Ajuda a planejar em torno da escola e família", howMany: "Quantos?",
    workSchedule: "Horário de trabalho", selectSchedule: "Selecione seu horário",
    workOptions: { "9am-5pm Mon-Fri": "9h–17h, Seg–Sex", flexible: "Flexível / Remoto", "part-time": "Meio período", shifts: "Turnos", "stay-at-home": "Em casa", freelance: "Freelance", other: "Outro" },
    health: "Condições de saúde", healthHint: "ex. SOP, endometriose, tireoide, ansiedade", healthPlaceholder: "Opcional — ajuda a personalizar os conselhos",
    avgSleep: "Horas médias de sono", cycleSettings: "Configurações do ciclo", cycleLength: "Duração do ciclo (dias)", periodLength: "Duração do período (dias)",
    save: "Salvar alterações", saving: "Salvando...", letsGo: "Vamos começar!", welcomeTitle: "Bem-vinda!", welcomeSubtitle: "Vamos personalizar sua experiência",
  },
};

export const translations: Record<Lang, Translations> = { en, es, pt };

export const languageNames: Record<Lang, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};
