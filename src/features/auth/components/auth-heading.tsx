/** Heading block used by every sign-in and sign-up page. */
export function AuthHeading({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className="auth-heading">
      <h1 className="page-title">{title}</h1>
      {lede ? <p className="page-lede">{lede}</p> : null}
    </header>
  );
}
