// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AmountInput, cleanAmount } from "./amount-input";

afterEach(cleanup);

function Field() {
  const [value, setValue] = useState(0);
  return (
    <>
      <AmountInput aria-label="Cash" value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  );
}

describe("AmountInput", () => {
  it("drops leading zeros and stray characters", () => {
    expect(cleanAmount("030000")).toBe("30000");
    expect(cleanAmount("0333")).toBe("333");
    expect(cleanAmount("$1,234.567")).toBe("1234.56");
    expect(cleanAmount(".5")).toBe("0.5");
    expect(cleanAmount("0")).toBe("0");
  });

  it("types a plain number and shows it with separators afterwards", () => {
    render(<Field />);
    const input = screen.getByLabelText("Cash") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "030000" } });
    expect(input.value).toBe("30000");
    expect(screen.getByRole("status").textContent).toBe("30000");
    fireEvent.blur(input);
    expect(input.value).toBe("30,000");
  });
});
