/**
 * The API's error message as readable text. FastAPI validation errors arrive as a list of
 * `{loc, msg}` objects, which would otherwise show as "[object Object]".
 */
export function errorDetail(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((item) => {
        const message = typeof item?.msg === "string" ? item.msg.replace(/^Value error, /, "") : String(item);
        const field = Array.isArray(item?.loc) ? item.loc.filter((part: unknown) => part !== "body").at(-1) : null;
        return field && typeof field === "string" ? `${field}: ${message}` : message;
      })
      .join("; ");
  }
  return `Request failed (${status})`;
}
