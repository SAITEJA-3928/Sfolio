export const formatAmount = (value: string | number): string => {
  if (value === null || value === undefined) return "";

  const sanitized = String(value).replace(/[^0-9.]/g, "");

  if (!sanitized) return "";

  const hasDecimal = sanitized.includes(".");
  const [integer = "", decimal = ""] = sanitized.split(".");

  const formattedInteger = integer
    ? Number(integer).toLocaleString("en-IN")
    : "";

  return hasDecimal
    ? `${formattedInteger}.${decimal}`
    : formattedInteger;
};