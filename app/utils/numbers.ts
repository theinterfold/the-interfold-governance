/** Exact token amounts use a decimal point and never round through a JS number. */
export function exactNumber(input: string): string {
  if (!/^\d*\.?\d+$/.test(input) && !/^\d+\.$/.test(input)) return "-";
  const [whole, fraction = ""] = input.split(".");
  const normalizedWhole = (whole || "0").replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${normalizedWhole}.${normalizedFraction}`;
}

export function compactNumber(input: number | string, decimalPlaces: number = 2): string {
  const num = typeof input === "string" ? parseFloat(input) : input;

  if (isNaN(num)) return "-";
  else if (num === 0) return "0";

  if (num >= 1.0e12) {
    return `${(num / 1.0e12).toFixed(decimalPlaces)}T`;
  } else if (num >= 1.0e9) {
    return `${(num / 1.0e9).toFixed(decimalPlaces)}B`;
  } else if (num >= 1.0e6) {
    return `${(num / 1.0e6).toFixed(decimalPlaces)}M`;
  } else if (num >= 1.0e3) {
    return `${(num / 1.0e3).toFixed(decimalPlaces)}K`;
  } else if (num >= 1) {
    return num.toFixed(decimalPlaces);
  } else if (num >= 1e-1) {
    return num.toFixed(Math.max(3, decimalPlaces));
  } else if (num >= 1e-2) {
    return num.toFixed(Math.max(4, decimalPlaces));
  } else if (num >= 1e-3) {
    return num.toFixed(Math.max(5, decimalPlaces));
  } else if (num >= 1e-4) {
    return num.toFixed(Math.max(6, decimalPlaces));
  } else if (num >= 1e-5) {
    return num.toFixed(Math.max(7, decimalPlaces));
  }
  return "~0.0";
}
