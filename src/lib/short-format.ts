export function formatCompactInr(amount: number): {
  short: string;
  full: string;
} {
  const full = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs < 1000) {
    return {
      short: `${sign}₹${abs.toFixed(2)}`,
      full,
    };
  }

  if (abs < 100000) {
    const thousand = abs / 1000;

    return {
      short: `${sign}₹${thousand.toFixed(2)}K`,
      full,
    };
  }
  if (abs < 10000000) {
    const lakh = abs / 100000;

    return {
      short: `${sign}₹${lakh.toFixed(2)}L`,
      full,
    };
  }

  const crore = abs / 10000000;

  return {
    short: `${sign}₹${crore.toFixed(2)}Cr`,
    full,
  };
}