export default function PublicHomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">jaw-finance</h1>
      <p className="text-muted-foreground">Personal finance dashboard</p>
      <a
        href="/api/auth/login"
        className="rounded-md bg-primary px-6 py-2 text-primary-foreground hover:bg-primary/90"
      >
        Login
      </a>
    </div>
  );
}
