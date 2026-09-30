import * as React from "react";
import { Layout } from "@/components/layout";
import { Button, Card, Input } from "@/components/ui";
import { Textarea } from "@/components/ui/textarea";
import { SingleDatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "@/hooks/use-toast";
import { buildAuthApiUrl } from "@/lib/api-config";
import { customFetch } from "@/lib/custom-fetch";
import { parseDateInputValue } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import {
  type Contest,
  type ContestInput,
  type ContestRankingCriteria,
  type ContestStatus,
  createContest,
  getContestById,
  isCountBasedRankingCriteria,
  mapContestFromApi,
  updateContest,
} from "@/lib/contest-store";

const CREATE_CONTEST_ENDPOINT = buildAuthApiUrl("/contest/create");
const EDIT_CONTEST_STORAGE_KEY = "gfolio-admin:edit-contest";

type CreateContestApiResponse = {
  status?: number;
  message?: string;
  data?: {
    _id?: string;
  };
};

function toContestApiDate(date: string, isEndDate = false) {
  if (!date) return "";
  if (date.includes("T")) return date;
  return `${date}T${isEndDate ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function toFormDate(value?: string) {
  if (!value) return "";
  return value.includes("T") ? value.slice(0, 10) : value;
}

function buildContestApiPayload(formData: ContestInput) {
  const rankingCriteria = formData.rankingCriteria;
  const isCount = isCountBasedRankingCriteria(rankingCriteria);
  return {
    name: formData.name?.trim?.() ?? "",
    description: formData.description?.trim?.() ?? "",
    rankingCriteria,
    isCount,
    startDate: toContestApiDate(formData.startDate),
    endDate: toContestApiDate(formData.endDate, true),
    bannerKey: formData.bannerKey ?? true,
    pointsPerUnit: formData.pointsPerUnit ?? 100,
    maxWinners: Number.isFinite(formData.maxWinners) ? formData.maxWinners : 0,
  };
}

async function createContestRequest(
  formData: ContestInput,
  status: ContestStatus,
  saveAsDraft = false,
) {
  return customFetch<CreateContestApiResponse>(CREATE_CONTEST_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...buildContestApiPayload(formData),
      status: status.toUpperCase(),
      draft: saveAsDraft,
    }),
  });
}

async function updateContestRequest(
  contestId: string,
  formData: ContestInput,
  status: ContestStatus,
) {
  return customFetch<CreateContestApiResponse>(
    buildAuthApiUrl(`/contest/update/${encodeURIComponent(contestId)}`),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildContestApiPayload(formData),
        status: status.toUpperCase(),
      }),
    },
  );
}

const STATUS_OPTIONS: { value: ContestStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "upcoming", label: "Upcoming" },
];

const RANKING_CRITERIA_OPTIONS: { value: ContestRankingCriteria; label: string }[] = [
  { value: "MAXIMUM_TRANSACTION_AMOUNT", label: "Maximum Transaction Amount" },
  { value: "MAXIMUM_SIP_AMOUNT", label: "Maximum SIP Amount" },
  { value: "MAXIMUM_GOAL_AMOUNT", label: "Maximum Goal Amount" },
  { value: "MAXIMUM_BUY_AMOUNT", label: "Maximum Buy Amount" },
  { value: "MAXIMUM_TRANSACTION_COUNT", label: "Maximum Transaction Count" },
  { value: "MAXIMUM_SIP_COUNT", label: "Maximum SIP Count" },
  { value: "MAXIMUM_GOAL_COUNT", label: "Maximum Goal Count" },
  { value: "MAXIMUM_BUY_COUNT", label: "Maximum Buy Count" },
  { value: "MAXIMUM_REFERRAL_COUNT", label: "Maximum Referral Count" },
];

type ContestFormField = "name" | "description" | "rankingCriteria" | "startDate" | "endDate" | "maxWinners";

type ContestFormErrors = Partial<Record<ContestFormField, string>>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getMinDateForEnd(startDate?: string) {
  const today = getStartOfToday();
  const start = parseDateInputValue(startDate ?? "");
  if (!start) return today;
  start.setHours(0, 0, 0, 0);
  return start.getTime() > today.getTime() ? start : today;
}

function validateContestForm(formData: ContestInput): ContestFormErrors {
  const errors: ContestFormErrors = {};

  if (!formData.name?.trim()) {
    errors.name = "Contest name is required";
  }
  if (!formData.rankingCriteria) {
    errors.rankingCriteria = "Ranking criteria is required";
  }
  if (!formData.startDate.trim()) {
    errors.startDate = "Start date is required";
  }
  if (!formData.endDate.trim()) {
    errors.endDate = "End date is required";
  } else if (formData.startDate && formData.endDate < formData.startDate) {
    errors.endDate = "End date must be on or after the start date";
  }
  if (!Number.isFinite(formData.maxWinners) || formData.maxWinners < 1) {
    errors.maxWinners = "Max winners must be at least 1";
  }

  return errors;
}

function contestToFormData(contest: Contest): ContestInput {
  const status = (contest.status?.toLowerCase?.() ?? "") as ContestStatus;
  return {
    name: contest.name ?? "",
    description: contest.description ?? "",
    rankingCriteria: contest.rankingCriteria ?? "MAXIMUM_TRANSACTION_AMOUNT",
    startDate: toFormDate(contest.startDate),
    endDate: toFormDate(contest.endDate),
    maxWinners: Number.isFinite(contest.maxWinners) ? contest.maxWinners : 0,
    bannerKey: contest.bannerKey ?? true,
    pointsPerUnit: contest.pointsPerUnit ?? 100,
    status:
      status === "active" || status === "upcoming" || status === "draft"
        ? status
        : "draft",
  };
}

function unwrapAdminContests(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.contests)) return record.contests;
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (Array.isArray(data.contests)) return data.contests;
  }
  return [];
}

async function fetchContestForEdit(contestId: string): Promise<Contest | undefined> {
  if (typeof window !== "undefined") {
    const raw = window.sessionStorage.getItem(EDIT_CONTEST_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        const mapped = mapContestFromApi(parsed);
        if (mapped?.id === contestId) {
          window.sessionStorage.removeItem(EDIT_CONTEST_STORAGE_KEY);
          return mapped;
        }
      } catch {
        // Fall through to API lookup.
      }
    }
  }

  const local = getContestById(contestId);
  if (local) return local;

  const response = await customFetch(
    buildAuthApiUrl("/contest/adminContestList?page=1&limit=1000"),
    { method: "GET" },
  );
  return unwrapAdminContests(response)
    .map(mapContestFromApi)
    .find((contest): contest is Contest => contest?.id === contestId);
}

export default function CreateContest() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const editParams = React.useMemo(() => new URLSearchParams(search), [search]);
  const isEdit = editParams.get("edit") === "true";
  const contestId = editParams.get("id");

  const [formData, setFormData] = React.useState<ContestInput>({
    name: "",
    description: "",
    rankingCriteria: "MAXIMUM_TRANSACTION_AMOUNT",
    startDate: "",
    endDate: "",
    maxWinners: 0,
    bannerKey: true,
    pointsPerUnit: 100,
    status: "active",
  });
  const [fieldErrors, setFieldErrors] = React.useState<ContestFormErrors>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isEdit || !contestId) return;

    let cancelled = false;
    setIsLoading(true);

    void fetchContestForEdit(contestId)
      .then((contest) => {
        if (cancelled) return;
        if (!contest) {
          toast({
            title: "Error",
            description: "Contest not found",
            variant: "destructive",
          });
          navigate("/contests", { replace: true });
          return;
        }
        setFormData(contestToFormData(contest));
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load contest", error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load contest",
          variant: "destructive",
        });
        navigate("/contests", { replace: true });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isEdit, contestId, navigate]);

  const clearFieldError = (field: ContestFormField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleFieldChange = <K extends keyof ContestInput>(field: K, value: ContestInput[K]) => {
    if (field === "name" || field === "startDate" || field === "endDate" || field === "rankingCriteria") {
      clearFieldError(field as ContestFormField);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (saveAsDraft = false) => {
    const status: ContestStatus = saveAsDraft ? "draft" : formData.status;

    if (saveAsDraft) {
      if (!formData.name?.trim()) {
        setFieldErrors({ name: "Contest name is required" });
        return;
      }
      setFieldErrors({});
    } else {
      const nextFieldErrors = validateContestForm(formData);
      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        return;
      }
      setFieldErrors({});
    }

    const payload: ContestInput = {
      ...formData,
      name: formData.name?.trim?.() ?? "",
      description: formData.description?.trim?.() ?? "",
      status,
    };

    setIsSaving(true);
    try {
      if (isEdit && contestId) {
        const response = await updateContestRequest(contestId, payload, status);
        updateContest(contestId, payload);
        toast({
          title: "Success",
          description:
            response.message ||
            (saveAsDraft ? "Draft saved successfully" : "Contest updated successfully"),
        });
        navigate("/contests");
        return;
      }

      // The dashboard currently reads its contest list from local storage. Keep it in sync
      // regardless of the server call so the contest/draft always persists in the UI.
      let serverId: string | undefined;
      let serverMessage: string | undefined;
      try {
        const response = await createContestRequest(payload, status, saveAsDraft);
        serverId = response.data?._id;
        serverMessage = response.message;
      } catch (err) {
        console.error("Failed to create contest on server", err);
      }
      createContest({ ...payload, status }, status, serverId);
      toast({
        title: "Success",
        description:
          serverMessage ||
          (saveAsDraft ? "Contest saved as draft" : "Contest created successfully"),
      });
      navigate("/contests");
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout title={isEdit ? "Edit Contest" : "Create Contest"}>
      <div className="mb-6 space-y-1.5">
        <Link
          href="/contests"
          className="mb-1 inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Contest Dashboard
        </Link>
        <h1 className="text-xl font-bold text-foreground">
          {isEdit ? "Edit Contest" : "Create Contest"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit
            ? "Update the contest details and rules."
            : "Set up a new contest and define its rules."}
        </p>
      </div>

      <Card className="flex w-full flex-col overflow-hidden">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-foreground">Contest Details</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Name, ranking rules, schedule, and winner limits.
          </p>
        </div>

        {isLoading ? (
          <p className="px-4 py-16 text-center text-sm text-muted-foreground sm:px-6">
            Loading contest...
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
            className="flex flex-col"
          >
            <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-2 lg:gap-6">
              <div className="space-y-2 lg:col-span-2">
                <label className="block text-sm font-medium text-foreground">
                  Contest Name
                </label>
                <Input
                  name="name"
                  value={formData.name}
                  placeholder="Enter contest name"
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={cn(
                    "h-11 rounded-xl",
                    fieldErrors.name && "border-destructive",
                  )}
                  onChange={(event) => handleFieldChange("name", event.target.value)}
                />
                <FieldError message={fieldErrors.name} />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="block text-sm font-medium text-foreground">
                  Description
                </label>
                <Textarea
                  name="description"
                  value={formData.description}
                  placeholder="Describe the contest, eligibility, and rules..."
                  className="min-h-[140px] rounded-xl border-border bg-background"
                  onChange={(event) => handleFieldChange("description", event.target.value)}
                />
                <FieldError message={fieldErrors.description} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Ranking Criteria
                </label>
                <Select
                  value={formData.rankingCriteria || undefined}
                  onValueChange={(value) =>
                    handleFieldChange("rankingCriteria", value as ContestRankingCriteria)
                  }
                >
                  <SelectTrigger
                    className={cn(
                      "h-11 w-full rounded-xl border-border bg-background",
                      fieldErrors.rankingCriteria && "border-destructive",
                    )}
                  >
                    <SelectValue placeholder="Select ranking criteria" />
                  </SelectTrigger>
                  <SelectContent>
                    {RANKING_CRITERIA_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.rankingCriteria} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Max Winners
                </label>
                <Input
                  name="maxWinners"
                  type="number"
                  min={1}
                  value={formData.maxWinners === 0 ? "" : String(formData.maxWinners)}
                  placeholder="Enter max winners"
                  aria-invalid={Boolean(fieldErrors.maxWinners)}
                  className={cn(
                    "h-11 rounded-xl",
                    fieldErrors.maxWinners && "border-destructive",
                  )}
                  onChange={(event) => {
                    clearFieldError("maxWinners");
                    const value = event.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      maxWinners: value.trim() === "" ? 0 : Number(value),
                    }));
                  }}
                />
                <FieldError message={fieldErrors.maxWinners} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Start Date
                </label>
                <SingleDatePicker
                  value={formData.startDate}
                  onChange={(value) => {
                    clearFieldError("startDate");
                    clearFieldError("endDate");
                    const end = parseDateInputValue(formData.endDate);
                    const nextStart = parseDateInputValue(value);
                    const shouldClearEnd = Boolean(
                      end && nextStart && end.getTime() < nextStart.getTime(),
                    );
                    setFormData((prev) => ({
                      ...prev,
                      startDate: value,
                      endDate: shouldClearEnd ? "" : prev.endDate,
                    }));
                  }}
                  className={cn(
                    "w-full",
                    fieldErrors.startDate && "border-destructive",
                  )}
                  disabled={{ before: getStartOfToday() }}
                />
                <FieldError message={fieldErrors.startDate} />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">End Date</label>
                <SingleDatePicker
                  value={formData.endDate}
                  onChange={(value) => handleFieldChange("endDate", value)}
                  className={cn(
                    "w-full",
                    fieldErrors.endDate && "border-destructive",
                  )}
                  disabled={{ before: getMinDateForEnd(formData.startDate) }}
                />
                <FieldError message={fieldErrors.endDate} />
              </div>

              {isEdit ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Status</label>
                  <Select
                    value={formData.status || undefined}
                    onValueChange={(value) =>
                      handleFieldChange("status", value as ContestStatus)
                    }
                  >
                    <SelectTrigger className="h-11 w-full rounded-xl border-border bg-background">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer sm:min-w-[8.5rem]"
                disabled={isSaving}
                onClick={() => void handleSubmit(true)}
              >
                {isSaving ? "Saving Draft..." : "Save Draft"}
              </Button>
              <Button
                type="submit"
                variant="default"
                className="cursor-pointer gap-2 !text-white sm:min-w-[9.5rem] [&_svg]:!stroke-white [&_svg]:!text-white"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : isEdit ? "Save Changes" : "Create Contest"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </Layout>
  );
}
