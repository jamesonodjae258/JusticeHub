/**
 * JusticeHub logo — image-based mark + wordmark.
 *
 * Assets:
 *   /logo-full.png    — JH symbol + "JusticeHub" wordmark
 *   /logo-symbol.png  — JH symbol only (collapsed sidebar / favicon)
 *
 * The component renders both images. CSS classes control which is visible:
 *   .logo-wordmark     — hidden when sidebar is collapsed
 *   .logo-symbol-only  — shown only when sidebar is collapsed
 */
export function JusticeHubLogo({
  showSymbolOnly = false,
}: {
  variant?: 'dark' | 'light'
  showSymbolOnly?: boolean
}) {
  if (showSymbolOnly) {
    return (
      <img
        src="/logo-symbol.png"
        alt="JusticeHub"
        draggable={false}
        style={{
          height: '48px',
          width: 'auto',
          objectFit: 'contain',
          userSelect: 'none',
          display: 'block',
          margin: '0 auto',
        }}
      />
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        userSelect: 'none',
      }}
    >
      {/* Full logo (symbol + wordmark) — hidden on collapsed sidebar via CSS */}
      <img
        src="/logo-full.png"
        alt="JusticeHub"
        className="logo-wordmark"
        draggable={false}
        style={{
          height: '48px',
          width: 'auto',
          objectFit: 'contain',
          display: 'block',
        }}
      />

      {/* Symbol-only — shown only when collapsed sidebar hides .logo-wordmark */}
      <img
        src="/logo-symbol.png"
        alt="JusticeHub"
        className="logo-symbol-only"
        draggable={false}
        style={{
          height: '48px',
          width: 'auto',
          objectFit: 'contain',
          display: 'none',
        }}
      />
    </span>
  )
}

