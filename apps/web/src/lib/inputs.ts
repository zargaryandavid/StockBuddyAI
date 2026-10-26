/** "03" → "3", "007.5" → "7.5", "-03" → "-3"; "0", "0.5", and "" are left alone. */
export function stripLeadingZeros(value: string) {
  return value.replace(/^(-?)0+(?=\d)/, "$1");
}

/**
 * Cleans a number field as it is typed. React does not rewrite an input whose number is
 * unchanged ("03" and 3 are equal), so the cleaned text is written back to the field.
 */
export function cleanNumberInput(input: HTMLInputElement) {
  const cleaned = stripLeadingZeros(input.value);
  if (cleaned !== input.value) input.value = cleaned;
  return cleaned;
}
