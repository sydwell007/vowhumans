// Extracted from StudioView.tsx so LanguageSelect.tsx (and any future component)
// can reuse it without a circular import back into that file.
export function StatusPill({ children, tone = "good", title }: { children: React.ReactNode; tone?: string; title?: string }) {
  return <span className={`status-pill ${tone}`} title={title}><i />{children}</span>;
}
