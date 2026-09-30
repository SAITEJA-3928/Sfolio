import { getPasswordRuleResults } from "@/lib/password-validation";
import { cn } from "@/lib/utils";

type PasswordRequirementsProps = {
  password: string;
  className?: string;
};


export function PasswordRequirements({ password, className }: PasswordRequirementsProps) {
  const unmetRules = getPasswordRuleResults(password).filter((rule) => !rule.met);

  if (unmetRules.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-1 text-sm text-red-500", className)}>
      <p className="font-medium">Password must contain:</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {unmetRules.map((rule) => (
          <li key={rule.key}>{rule.label}</li>
        ))}
      </ul>
    </div>
  );
}
