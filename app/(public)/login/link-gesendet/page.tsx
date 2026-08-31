export default function LinkGesendetPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Anmeldelink verschickt</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Wenn die E-Mail-Adresse bei uns registriert ist, findest du in wenigen
        Minuten einen Anmeldelink in deinem Postfach. Der Link ist 15 Minuten
        gültig.
      </p>
    </main>
  );
}
