export function groupFieldErrors(issues: { field: string; message: string }[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    if (!issue.field) {
      continue;
    }
    (errors[issue.field] ??= []).push(issue.message);
  }
  return errors;
}

export function zodIssuesToFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string[]> {
  return groupFieldErrors(
    issues.map((issue) => ({ field: String(issue.path[0] ?? ""), message: issue.message })),
  );
}
