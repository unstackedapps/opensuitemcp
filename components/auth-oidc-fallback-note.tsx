export function AuthOidcFallbackNote({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs leading-relaxed">
      {message}
    </p>
  );
}
