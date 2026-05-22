$ErrorActionPreference = 'Stop'
$frontend = Join-Path (Split-Path $PSScriptRoot -Parent) ''
$repo = Split-Path $frontend -Parent

# index.html root element (fix motion.div typo if present)
$idx = Join-Path $frontend 'index.html'
$ic = Get-Content $idx -Raw
if ($ic -match 'motion\.div id="root"') {
  $ic = $ic -replace '<motion\.div id="root"></motion\.motion\.div>', '<div id="root"></div>'
  $ic = $ic -replace '<motion\.motion\.div id="root"></motion\.div>', '<div id="root"></div>'
  $ic = $ic.Replace('<motion.div id="root"></motion.div>', '<motion.div id="root"></motion.div>')
  $ic = $ic.Replace('<motion.div id="root"></motion.div>', '<div id="root"></div>')
}
Set-Content $idx $ic -NoNewline

# App.tsx
$app = Join-Path $frontend 'src\App.tsx'
$ac = Get-Content $app -Raw
$ac = $ac.Replace('font-sans text-slate-200', 'font-sans text-slate-800')
$ac = $ac.Replace('text-kauvery-peach/90 font-extrabold', 'text-kauvery-purple/80 font-extrabold')
Set-Content $app $ac -NoNewline

# Dashboard.tsx
$dash = Join-Path $frontend 'src\screens\Dashboard.tsx'
$dc = Get-Content $dash -Raw
if ($dc -notmatch 'KAUVERY_MODAL_SURFACE') {
  $dc = $dc.Replace(
    "import { KAUVERY_PANEL_BG, KAUVERY_TABLE_HEAD_BG } from '../theme/kauverySurfaces';",
    "import { KAUVERY_MODAL_SURFACE, KAUVERY_PANEL_BG, KAUVERY_TABLE_HEAD_BG } from '../theme/kauverySurfaces';"
  )
}
$dc = $dc.Replace("background: 'linear-gradient(145deg, rgba(45, 24, 48, 0.96), rgba(38, 16, 36, 0.98))'", "background: 'rgba(255, 255, 255, 0.98)'")
$dc = $dc.Replace("border: '1px solid rgba(150, 32, 103, 0.45)'", "border: '1px solid rgba(150, 32, 103, 0.22)'")
$dc = $dc.Replace("color: '#f1f5f9'", "color: '#1e293b'")
if ($dc -notmatch 'boxShadow') {
  $dc = $dc.Replace('fontWeight: 700 as const,', "fontWeight: 700 as const,`n  boxShadow: '0 8px 24px -8px rgba(150, 32, 103, 0.2)',")
}
$dc = $dc.Replace(
  "'rounded-2xl border border-kauvery-purple/20 bg-gradient-to-br from-white/[0.12] via-kauvery-purple/[0.08] to-kauvery-violet/[0.14] p-5 shadow-kauvery-card backdrop-blur-md'",
  "'rounded-2xl border border-kauvery-purple/15 bg-white/90 p-5 shadow-kauvery-card'"
)
$dc = $dc.Replace(
  'border border-white/15 bg-black/30 px-2.5 py-2 text-sm font-extrabold tabular-nums text-white shadow-inner outline-none transition focus:border-kauvery-peach/55 focus:ring-2 focus:ring-kauvery-purple/35 [color-scheme:dark]',
  'border border-kauvery-purple/20 bg-white px-2.5 py-2 text-sm font-extrabold tabular-nums text-slate-800 shadow-inner outline-none transition focus:border-kauvery-purple/40 focus:ring-2 focus:ring-kauvery-purple/25'
)

$pairs = @(
  @('px-3 py-5 text-slate-100 shadow-kauvery-card', 'px-3 py-5 text-slate-800 shadow-kauvery-card'),
  @('text-base font-black text-white', 'text-base font-black text-slate-900'),
  @('text-lg font-black text-white', 'text-lg font-black text-slate-900'),
  @('mt-2 text-3xl font-black tabular-nums text-white', 'mt-2 text-3xl font-black tabular-nums text-slate-900'),
  @('text-2xl font-black tracking-tight text-white', 'text-2xl font-black tracking-tight text-slate-900'),
  @('text-lg font-black tabular-nums text-white', 'text-lg font-black tabular-nums text-slate-900'),
  @('font-black text-white tabular-nums', 'font-black text-slate-900 tabular-nums'),
  @("subClass: 'text-emerald-400/90'", "subClass: 'text-emerald-600'"),
  @("subClass: 'text-violet-300/90'", "subClass: 'text-violet-600'"),
  @("subClass: 'text-rose-300/90'", "subClass: 'text-rose-600'"),
  @('rounded-md border border-white/15 bg-white/[0.08] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-300 transition hover:bg-white/[0.14] hover:text-white', 'rounded-md border border-kauvery-purple/20 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 transition hover:border-kauvery-purple/35 hover:text-kauvery-purple'),
  @('relative rounded-xl border border-kauvery-purple/30 bg-gradient-to-br from-white/[0.1] via-kauvery-purple/[0.07] to-kauvery-pink/[0.05] px-2.5 py-2 shadow-kauvery-soft backdrop-blur-md sm:px-3 sm:py-2.5', 'relative rounded-xl border border-kauvery-purple/15 bg-white/80 px-2.5 py-2 shadow-kauvery-soft sm:px-3 sm:py-2.5'),
  @('className="relative w-full overflow-hidden rounded-2xl border border-kauvery-purple/25 bg-gradient-to-br from-white/[0.12] via-kauvery-purple/[0.14] to-kauvery-violet/[0.2] p-5 text-left shadow-kauvery-card backdrop-blur-md transition hover:border-kauvery-peach/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-kauvery-peach/70"', 'className="relative w-full overflow-hidden rounded-2xl border border-kauvery-purple/15 bg-white p-5 text-left shadow-kauvery-card transition hover:border-kauvery-purple/30 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-kauvery-purple/40"'),
  @("                        : 'border border-kauvery-purple/35 bg-kauvery-purple/15 text-slate-200 hover:border-kauvery-pink/50 hover:bg-kauvery-violet/20'", "                        : 'border border-kauvery-purple/20 bg-white text-slate-600 hover:border-kauvery-purple/35 hover:bg-kauvery-purple/5'"),
  @('stroke="#334155"', 'stroke="#e2e8f0"'),
  @("tick={{ fill: '#94a3b8'", "tick={{ fill: '#64748b'"),
  @('className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm"', 'className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"'),
  @('rounded-2xl border border-kauvery-purple/35 bg-[#352845] shadow-2xl shadow-black/40', 'rounded-2xl border border-kauvery-purple/20 bg-white shadow-2xl shadow-kauvery-soft'),
  @('border-b border-kauvery-purple/35 bg-gradient-to-r from-kauvery-purple/30 via-kauvery-violet/15 to-transparent', 'border-b border-kauvery-purple/15 bg-gradient-to-r from-kauvery-purple/8 via-kauvery-violet/5 to-transparent'),
  @('mt-1 text-lg font-black text-white sm:text-xl', 'mt-1 text-lg font-black text-slate-900 sm:text-xl'),
  @('shrink-0 rounded-xl border border-white/15 bg-white/10 p-2 text-slate-200 transition hover:bg-white/20 hover:text-white', 'shrink-0 rounded-xl border border-kauvery-purple/20 bg-slate-50 p-2 text-slate-600 transition hover:bg-kauvery-purple/10 hover:text-kauvery-purple'),
  @('overflow-x-auto rounded-xl border border-white/10 bg-black/20', 'overflow-x-auto rounded-xl border border-kauvery-purple/15 bg-slate-50/80'),
  @('divide-y divide-white/10 text-slate-100', 'divide-y divide-slate-200/80 text-slate-800'),
  @('className="bg-white/[0.02] hover:bg-white/[0.06]"', 'className="bg-white hover:bg-kauvery-purple/[0.04]"'),
  @('font-mono font-bold tabular-nums text-slate-200 sm:px-4', 'font-mono font-bold tabular-nums text-slate-700 sm:px-4'),
  @('truncate px-3 py-2.5 text-slate-200 sm:px-4', 'truncate px-3 py-2.5 text-slate-700 sm:px-4'),
  @('max-w-xs px-3 py-2.5 text-slate-200 sm:max-w-md', 'max-w-xs px-3 py-2.5 text-slate-700 sm:max-w-md'),
  @('font-semibold tabular-nums text-slate-300 sm:px-4', 'font-semibold tabular-nums text-slate-600 sm:px-4'),
  @('font-black uppercase tracking-wide text-kauvery-peach/95', 'font-black uppercase tracking-wide text-kauvery-purple'),
  @('rounded-full border border-kauvery-purple/40 bg-kauvery-purple/25 px-3 py-1.5 text-xs font-black text-pink-50 shadow-sm backdrop-blur-sm', 'rounded-full border border-kauvery-purple/25 bg-kauvery-purple/10 px-3 py-1.5 text-xs font-black text-kauvery-purple shadow-sm'),
  @('<span className="text-slate-200">{filteredSuggestions.length}</span>', '<span className="text-kauvery-purple">{filteredSuggestions.length}</span>'),
  @(": 'text-slate-400 hover:bg-white/10 hover:text-white'", ": 'text-slate-500 hover:bg-kauvery-purple/8 hover:text-kauvery-purple'")
)
foreach ($p in $pairs) { $dc = $dc.Replace($p[0], $p[1]) }
Set-Content $dash $dc -NoNewline

Write-Host 'Light theme patches applied.'
