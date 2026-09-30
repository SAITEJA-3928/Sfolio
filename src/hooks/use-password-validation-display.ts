import * as React from "react";

import { isPasswordValid } from "@/lib/password-validation";

export function usePasswordValidationDisplay() {
  const [passwordTouched, setPasswordTouched] = React.useState(false);
  const [confirmTouched, setConfirmTouched] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const markSubmitAttempted = React.useCallback(() => {
    setSubmitAttempted(true);
  }, []);

  const showPasswordErrors = React.useCallback(
    (password: string) =>
      (passwordTouched || submitAttempted) && password.length > 0 && !isPasswordValid(password),
    [passwordTouched, submitAttempted],
  );

  const showConfirmMismatch = React.useCallback(
    (password: string, confirmPassword: string) =>
      (confirmTouched || submitAttempted) &&
      confirmPassword.length > 0 &&
      password.trim() !== confirmPassword.trim(),
    [confirmTouched, submitAttempted],
  );

  return {
    setPasswordTouched,
    setConfirmTouched,
    markSubmitAttempted,
    showPasswordErrors,
    showConfirmMismatch,
  };
}
