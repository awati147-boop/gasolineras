// Iconos SVG propios (trazo de 2px, heredan el color del texto)
type P = { tam?: number; className?: string };
const base = (tam = 22) => ({
  width: tam, height: tam, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IconoSurtidor = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}>
    <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" /><path d="M3 21h12" /><path d="M7 8h4" />
    <path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8.5L18 5.5" />
  </svg>
);
export const IconoParking = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M10 17V7h3.5a3 3 0 0 1 0 6H10" />
  </svg>
);
export const IconoCoche = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}>
    <path d="M5 17h14v-5l-2-5H7l-2 5v5Z" /><path d="M5 12h14" />
    <circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" />
  </svg>
);
export const IconoBuscar = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconoUbicacion = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}>
    <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" />
  </svg>
);
export const IconoPin = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
export const IconoReloj = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconoCheck = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}><path d="m5 12 5 5L20 7" /></svg>
);
export const IconoInfo = ({ tam, className }: P) => (
  <svg {...base(tam)} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);

/** Logotipo: chincheta blanca sobre cuadrado verde */
export const Logo = ({ tam = 32 }: { tam?: number }) => (
  <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="9" fill="var(--marca)" />
    <path d="M16 25s-6-5.3-6-9.8a6 6 0 0 1 12 0C22 19.7 16 25 16 25Z" fill="#fff" />
    <circle cx="16" cy="15.2" r="2.3" fill="var(--marca)" />
  </svg>
);
