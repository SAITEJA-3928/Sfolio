export type PasswordRuleKey = "lowercase" | "uppercase" | "special" | "minLength";

export type PasswordRule = {
  key: PasswordRuleKey;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: "lowercase",
    label: "At least 1 small letter",
    test: (password) => /[a-z]/.test(password),
  },
  {
    key: "uppercase",
    label: "At least 1 capital letter",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    key: "special",
    label: "At least 1 special character",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
  {
    key: "minLength",
    label: "At least 8 characters",
    test: (password) => password.length >= 8,
  },
];

export type PasswordRuleResult = PasswordRule & {
  met: boolean;
};

export function getPasswordRuleResults(password: string): PasswordRuleResult[] {
  return PASSWORD_RULES.map((rule) => ({
    ...rule,
    met: rule.test(password),
  }));
}

export function isPasswordValid(password: string): boolean {
  return getPasswordRuleResults(password).every((rule) => rule.met);
}

export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return password === confirmPassword;
}
