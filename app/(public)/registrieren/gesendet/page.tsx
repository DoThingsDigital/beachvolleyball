export default function RegistrierungGesendetPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Fast geschafft</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Wenn die Adresse noch nicht registriert war, haben wir dir eine E-Mail
        mit einem Bestätigungslink geschickt. Der Link ist 15 Minuten gültig.
      </p>
    </main>
  );
}
