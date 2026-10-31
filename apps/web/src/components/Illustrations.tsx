import { memo } from "react";

/** Brand illustrations as inline SVG: no image downloads, crisp at any size, and themed via currentColor/tokens. */

/** A stylised dashboard with floating KPI cards, used on the sign-in and sign-up pages. */
export const DashboardIllustration = memo(function DashboardIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 360" className={className} aria-hidden fill="none">
      <rect x="40" y="40" width="400" height="280" rx="18" fill="white" fillOpacity="0.12" stroke="white" strokeOpacity="0.25" />
      <rect x="40" y="40" width="400" height="36" rx="18" fill="white" fillOpacity="0.1" />
      <circle cx="64" cy="58" r="5" fill="white" fillOpacity="0.5" />
      <circle cx="80" cy="58" r="5" fill="white" fillOpacity="0.35" />
      <circle cx="96" cy="58" r="5" fill="white" fillOpacity="0.2" />
      <rect x="60" y="96" width="70" height="200" rx="10" fill="white" fillOpacity="0.08" />
      {[112, 136, 160, 184].map((y, i) => <rect key={y} x="72" y={y} width={i === 0 ? 46 : 36} height="8" rx="4" fill="white" fillOpacity={i === 0 ? 0.7 : 0.3} />)}
      <rect x="146" y="96" width="274" height="120" rx="12" fill="white" fillOpacity="0.95" />
      <path d="M162 190 C190 180 205 150 232 158 S272 185 300 150 S350 120 400 118" stroke="#0d7a6f" strokeWidth="3" strokeLinecap="round" />
      <path d="M162 190 C190 180 205 150 232 158 S272 185 300 150 S350 120 400 118 V204 H162 Z" fill="#0d7a6f" fillOpacity="0.12" />
      <rect x="162" y="108" width="60" height="8" rx="4" fill="#111827" fillOpacity="0.7" />
      <rect x="146" y="228" width="130" height="68" rx="12" fill="white" fillOpacity="0.95" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={160 + i * 18} y={284 - [20, 34, 26, 42, 30, 46][i]!} width="10" height={[20, 34, 26, 42, 30, 46][i]} rx="3" fill={i === 5 ? "#0d7a6f" : "#5fc4b4"} />)}
      <rect x="290" y="228" width="130" height="68" rx="12" fill="white" fillOpacity="0.95" />
      <circle cx="322" cy="262" r="20" stroke="#e5e7eb" strokeWidth="8" />
      <circle cx="322" cy="262" r="20" stroke="#0d7a6f" strokeWidth="8" strokeDasharray="88 126" strokeLinecap="round" transform="rotate(-90 322 262)" />
      <rect x="352" y="250" width="54" height="8" rx="4" fill="#111827" fillOpacity="0.6" />
      <rect x="352" y="266" width="36" height="6" rx="3" fill="#111827" fillOpacity="0.25" />
      <g transform="translate(330 20)">
        <rect width="132" height="58" rx="14" fill="white" style={{ filter: "drop-shadow(0 10px 18px rgb(0 0 0 / 0.18))" }} />
        <circle cx="26" cy="29" r="13" fill="#e6f4f1" />
        <path d="M20 31 l5 5 l9 -11" stroke="#0d7a6f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="48" y="20" width="66" height="7" rx="3.5" fill="#111827" fillOpacity="0.75" />
        <rect x="48" y="33" width="44" height="6" rx="3" fill="#10b981" />
      </g>
      <g transform="translate(10 250)">
        <rect width="118" height="54" rx="14" fill="white" style={{ filter: "drop-shadow(0 10px 18px rgb(0 0 0 / 0.18))" }} />
        {[0, 1, 2].map((i) => <circle key={i} cx={24 + i * 16} cy="27" r="11" fill={["#0d7a6f", "#f59e0b", "#6366f1"][i]} stroke="white" strokeWidth="3" />)}
        <rect x="74" y="22" width="30" height="10" rx="5" fill="#111827" fillOpacity="0.15" />
      </g>
    </svg>
  );
});

/** A friendly sunrise-over-charts scene for the dashboard welcome banner. */
export const WelcomeIllustration = memo(function WelcomeIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 140" className={className} aria-hidden fill="none">
      <circle cx="170" cy="62" r="34" fill="#fde68a" fillOpacity="0.9" />
      <rect x="40" y="88" width="22" height="40" rx="5" fill="white" fillOpacity="0.55" />
      <rect x="72" y="70" width="22" height="58" rx="5" fill="white" fillOpacity="0.7" />
      <rect x="104" y="52" width="22" height="76" rx="5" fill="white" fillOpacity="0.85" />
      <rect x="136" y="34" width="22" height="94" rx="5" fill="white" />
      <path d="M30 104 L82 78 L114 88 L196 30" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M182 28 h15 v15" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="128" width="200" height="4" rx="2" fill="white" fillOpacity="0.4" />
    </svg>
  );
});
