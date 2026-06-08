"use client";

/**
 * TreeLoader — animasi pohon bertumbuh untuk layar loading MinBun.
 *
 * Urutan animasi (total ~2.4 detik, lalu berulang):
 *  0.0s  tanah muncul
 *  0.2s  batang tumbuh ke atas
 *  0.6s  cabang kiri & kanan muncul (stroke-dashoffset)
 *  1.0s  sub-cabang muncul
 *  1.3s  daun-daun pop (scale + opacity)
 *  1.8s  seluruh pohon berdiri sempurna
 */

export function TreeLoader({ message = "Memuat..." }: { message?: string }) {
  return (
    <>
      <style>{`
        /* ── Keyframes ── */
        @keyframes tl-ground {
          0%   { opacity: 0; transform: scaleX(0); }
          100% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes tl-trunk {
          0%   { transform: scaleY(0); }
          100% { transform: scaleY(1); }
        }
        @keyframes tl-branch {
          0%   { stroke-dashoffset: 80; opacity: 0; }
          30%  { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes tl-leaf {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @keyframes tl-leaf2 {
          0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
          60%  { transform: scale(1.1) rotate(5deg);  opacity: 1; }
          100% { transform: scale(1) rotate(0deg);    opacity: 1; }
        }
        @keyframes tl-particle {
          0%   { transform: translateY(0) scale(1); opacity: 0.8; }
          100% { transform: translateY(-18px) scale(0); opacity: 0; }
        }
        @keyframes tl-sway {
          0%, 100% { transform: rotate(-1.5deg); }
          50%       { transform: rotate(1.5deg); }
        }
        @keyframes tl-dots {
          0%, 20%  { opacity: 0; }
          40%      { opacity: 1; }
          80%,100% { opacity: 0; }
        }

        /* ── Elements ── */
        .tl-ground {
          transform-origin: center;
          animation: tl-ground 0.4s ease-out 0s both;
        }
        .tl-trunk {
          transform-origin: bottom center;
          animation: tl-trunk 0.55s cubic-bezier(.22,.68,0,1.2) 0.25s both;
        }
        .tl-branch-l {
          stroke-dasharray: 80;
          animation: tl-branch 0.45s ease-out 0.72s both;
        }
        .tl-branch-r {
          stroke-dasharray: 80;
          animation: tl-branch 0.45s ease-out 0.82s both;
        }
        .tl-branch-l2 {
          stroke-dasharray: 55;
          animation: tl-branch 0.35s ease-out 1.05s both;
        }
        .tl-branch-r2 {
          stroke-dasharray: 55;
          animation: tl-branch 0.35s ease-out 1.15s both;
        }
        .tl-branch-top {
          stroke-dasharray: 45;
          animation: tl-branch 0.3s ease-out 1.0s both;
        }

        /* Daun utama */
        .tl-leaf-tl  { transform-origin: 28px  62px; animation: tl-leaf  0.4s cubic-bezier(.34,1.56,.64,1) 1.25s both; }
        .tl-leaf-tr  { transform-origin: 92px  62px; animation: tl-leaf2 0.4s cubic-bezier(.34,1.56,.64,1) 1.32s both; }
        .tl-leaf-top { transform-origin: 60px  42px; animation: tl-leaf  0.4s cubic-bezier(.34,1.56,.64,1) 1.40s both; }
        /* Daun kecil */
        .tl-leaf-sl  { transform-origin: 22px  82px; animation: tl-leaf2 0.35s cubic-bezier(.34,1.56,.64,1) 1.50s both; }
        .tl-leaf-sr  { transform-origin: 98px  82px; animation: tl-leaf  0.35s cubic-bezier(.34,1.56,.64,1) 1.55s both; }
        .tl-leaf-sm  { transform-origin: 60px  78px; animation: tl-leaf2 0.3s  cubic-bezier(.34,1.56,.64,1) 1.48s both; }

        /* Partikel kecil */
        .tl-p1 { animation: tl-particle 1.2s ease-out 1.8s infinite; }
        .tl-p2 { animation: tl-particle 1.2s ease-out 2.0s infinite; }
        .tl-p3 { animation: tl-particle 1.2s ease-out 2.2s infinite; }

        /* Goyang setelah tumbuh */
        .tl-sway {
          transform-origin: 60px 138px;
          animation:
            tl-trunk 0.55s cubic-bezier(.22,.68,0,1.2) 0.25s both,
            tl-sway  3s ease-in-out 2.0s infinite;
        }

        /* Dot loading text */
        .tl-dot1 { animation: tl-dots 1.5s ease-in-out 0s infinite; }
        .tl-dot2 { animation: tl-dots 1.5s ease-in-out 0.25s infinite; }
        .tl-dot3 { animation: tl-dots 1.5s ease-in-out 0.5s infinite; }
      `}</style>

      <div className="flex flex-col items-center gap-6 select-none">
        <svg
          width="120"
          height="160"
          viewBox="0 0 120 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Pohon bertumbuh"
        >
          {/* ── Tanah ── */}
          <ellipse
            className="tl-ground"
            cx="60" cy="145" rx="38" ry="9"
            fill="#15803d"
            opacity="0.18"
          />
          <ellipse
            className="tl-ground"
            cx="60" cy="145" rx="26" ry="6"
            fill="#15803d"
            opacity="0.25"
          />

          {/* ── Batang (dalam grup agar sway + trunk bisa berlapis) ── */}
          <g className="tl-trunk">
            <rect x="55.5" y="82" width="9" height="63" rx="4.5" fill="#854d0e" />
            <rect x="58" y="82" width="3" height="63" rx="1.5" fill="#a16207" opacity="0.45" />
          </g>

          {/* ── Cabang utama kiri ── */}
          <path
            className="tl-branch-l"
            d="M 59 110 Q 40 100 26 88"
            stroke="#854d0e" strokeWidth="5" strokeLinecap="round"
          />
          {/* ── Cabang utama kanan ── */}
          <path
            className="tl-branch-r"
            d="M 61 110 Q 80 100 94 88"
            stroke="#854d0e" strokeWidth="5" strokeLinecap="round"
          />
          {/* ── Cabang kiri-bawah ── */}
          <path
            className="tl-branch-l2"
            d="M 57 118 Q 42 112 32 105"
            stroke="#92400e" strokeWidth="3.5" strokeLinecap="round"
          />
          {/* ── Cabang kanan-bawah ── */}
          <path
            className="tl-branch-r2"
            d="M 63 118 Q 78 112 88 105"
            stroke="#92400e" strokeWidth="3.5" strokeLinecap="round"
          />
          {/* ── Cabang atas ── */}
          <path
            className="tl-branch-top"
            d="M 60 95 Q 60 82 60 72"
            stroke="#854d0e" strokeWidth="4" strokeLinecap="round"
          />

          {/* ══ Daun-daun ══ */}

          {/* Daun kiri atas */}
          <g className="tl-leaf-tl">
            <circle cx="26" cy="80" r="16" fill="#16a34a" opacity="0.9" />
            <circle cx="18" cy="72" r="10" fill="#22c55e" opacity="0.85" />
            <circle cx="34" cy="73" r="9"  fill="#15803d" opacity="0.7" />
          </g>

          {/* Daun kanan atas */}
          <g className="tl-leaf-tr">
            <circle cx="94" cy="80" r="16" fill="#16a34a" opacity="0.9" />
            <circle cx="102" cy="72" r="10" fill="#22c55e" opacity="0.85" />
            <circle cx="86"  cy="73" r="9"  fill="#15803d" opacity="0.7" />
          </g>

          {/* Daun pucuk (tengah atas) */}
          <g className="tl-leaf-top">
            <circle cx="60" cy="46" r="20" fill="#16a34a" opacity="0.95" />
            <circle cx="52" cy="38" r="12" fill="#22c55e" opacity="0.9" />
            <circle cx="68" cy="38" r="11" fill="#22c55e" opacity="0.9" />
            <circle cx="60" cy="30" r="9"  fill="#4ade80" opacity="0.8" />
          </g>

          {/* Daun kecil kiri-bawah */}
          <g className="tl-leaf-sl">
            <circle cx="30" cy="100" r="11" fill="#16a34a" opacity="0.8" />
            <circle cx="22" cy="94"  r="7"  fill="#22c55e" opacity="0.75" />
          </g>

          {/* Daun kecil kanan-bawah */}
          <g className="tl-leaf-sr">
            <circle cx="90" cy="100" r="11" fill="#16a34a" opacity="0.8" />
            <circle cx="98" cy="94"  r="7"  fill="#22c55e" opacity="0.75" />
          </g>

          {/* Daun kecil tengah */}
          <g className="tl-leaf-sm">
            <circle cx="60" cy="76" r="10" fill="#15803d" opacity="0.7" />
          </g>

          {/* ── Partikel / kilap daun ── */}
          <circle className="tl-p1" cx="30" cy="75" r="2.5" fill="#86efac" />
          <circle className="tl-p2" cx="60" cy="40" r="2"   fill="#86efac" />
          <circle className="tl-p3" cx="90" cy="75" r="2.5" fill="#86efac" />
        </svg>

        {/* ── Label loading ── */}
        <div className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground">
          <span>{message}</span>
          <span className="tl-dot1 inline-block w-1">.</span>
          <span className="tl-dot2 inline-block w-1">.</span>
          <span className="tl-dot3 inline-block w-1">.</span>
        </div>
      </div>
    </>
  );
}
