export function validationError(
  message: string,
  issues: { path: PropertyKey[]; message: string }[],
) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message,
      fields: issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    },
  };
}
