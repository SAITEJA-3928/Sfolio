import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Users } from "lucide-react";
import { Button } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SingleDatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { customFetch } from "@/lib/custom-fetch";
import { buildNotificationApiUrl } from "@/lib/api-config";
import { toast } from "@/hooks/use-toast";
import { MOBILE_NOTIFICATION_ROUTES } from "@/constants/mobile-notification-routes";
import { getTodayDateInputValue } from "@/lib/date-range";

export type NotificationPopupUser = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  state?: string;
  city?: string;
  gender?: string;
};

type NotificationPopupMode = "individual" | "all";

type NotificationPopupProps = {
  open: boolean;
  mode: NotificationPopupMode;
  recipients: NotificationPopupUser[];
  initialSelectedRecipientIds?: string[];
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
};

type LocationOption = {
  id: string;
  name: string;
  stateId?: string;
};

const SEND_NOTIFICATION_ENDPOINT = buildNotificationApiUrl("/notifications/send");
const NONE_ROUTE_VALUE = "__none__";

function readCurrentUserId() {
  if (typeof window === "undefined") return null;

  try {
    const directId = window.localStorage.getItem("id");
    if (directId?.trim()) return directId.trim();

    const rawUser = window.localStorage.getItem("user");
    if (!rawUser) return null;
    const parsed = JSON.parse(rawUser) as Record<string, unknown>;
    const nested =
      parsed.user && typeof parsed.user === "object"
        ? (parsed.user as Record<string, unknown>)
        : parsed.data && typeof parsed.data === "object"
          ? (parsed.data as Record<string, unknown>)
          : null;
    const id =
      parsed.id ??
      parsed._id ??
      parsed.userId ??
      nested?.id ??
      nested?._id ??
      nested?.userId;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function NotificationPopup({
  open,
  mode,
  recipients,
  initialSelectedRecipientIds,
  onOpenChange,
  onSent,
}: NotificationPopupProps) {
  const [selectedNotificationType, setSelectedNotificationType] = useState("");
  const [selectedDeliveryChannel, setSelectedDeliveryChannel] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [scheduledDate, setScheduledDate] = useState(getTodayDateInputValue);
  const [content, setContent] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedState, setSelectedState] = useState<LocationOption | null>(null);
  const [selectedCity, setSelectedCity] = useState<LocationOption | null>(null);
  const [stateSearch, setStateSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [statesList, setStatesList] = useState<LocationOption[]>([]);
  const [citiesList, setCitiesList] = useState<LocationOption[]>([]);
  const [isStateOpen, setIsStateOpen] = useState(false);
  const [isCityOpen, setIsCityOpen] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [outsideClickPulse, setOutsideClickPulse] = useState(false);
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const outsideClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedRecipients(
      mode === "all" && initialSelectedRecipientIds
        ? initialSelectedRecipientIds
        : recipients.map((recipient) => recipient.id),
    );
    setRecipientSearch("");
  }, [initialSelectedRecipientIds, mode, open, recipients]);

  useEffect(() => {
    if (!open || mode !== "all" || statesList.length > 0) return;

    const fetchStates = async () => {
      try {
        const response: any = await customFetch("/classification/getValues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "STATE" }),
        });

        const states = response?.data?.[0]?.metadata?.states;
        setStatesList(Array.isArray(states) ? states : []);
      } catch (error) {
        console.error("Failed to fetch states", error);
      }
    };

    void fetchStates();
  }, [mode, open, statesList.length]);

  useEffect(() => {
    if (!selectedState) {
      setCitiesList([]);
      setSelectedCity(null);
      setCitySearch("");
      return;
    }

    const fetchCities = async () => {
      try {
        const response: any = await customFetch("/classification/getValues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "CITY", stateId: selectedState.id }),
        });

        const cities = response?.data?.[0]?.metadata?.cities;
        setCitiesList(Array.isArray(cities) ? cities : []);
      } catch (error) {
        console.error("Failed to fetch cities", error);
      }
    };

    void fetchCities();
  }, [selectedState]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (stateDropdownRef.current && !stateDropdownRef.current.contains(target)) {
        setIsStateOpen(false);
      }

      if (cityDropdownRef.current && !cityDropdownRef.current.contains(target)) {
        setIsCityOpen(false);
      }

    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (outsideClickTimerRef.current) {
        window.clearTimeout(outsideClickTimerRef.current);
      }
    };
  }, []);

  const filteredRecipients = useMemo(() => {
    const term = normalizeSearchValue(recipientSearch);
    if (!term) return recipients;
    return recipients.filter((recipient) => {
      const name = normalizeSearchValue(recipient.name);
      const email = normalizeSearchValue(recipient.email);
      const phone = normalizeSearchValue(recipient.phone);
      return name.includes(term) || email.includes(term) || phone.includes(term);
    });
  }, [recipients, recipientSearch]);

  const filteredBulkRecipients = useMemo(() => {
    const gender = normalizeSearchValue(selectedGender);
    const state = normalizeSearchValue(selectedState?.name);
    const city = normalizeSearchValue(selectedCity?.name);

    return filteredRecipients.filter((recipient) => {
      const matchesGender = !gender || normalizeSearchValue(recipient.gender) === gender;
      const matchesState = !state || normalizeSearchValue(recipient.state) === state;
      const matchesCity = !city || normalizeSearchValue(recipient.city) === city;
      return matchesGender && matchesState && matchesCity;
    });
  }, [filteredRecipients, selectedCity, selectedGender, selectedState]);

  const filteredStates = useMemo(() => {
    const term = normalizeSearchValue(stateSearch);
    if (!term) return statesList;
    return statesList.filter((state) => normalizeSearchValue(state.name).includes(term));
  }, [stateSearch, statesList]);

  const filteredCities = useMemo(() => {
    const term = normalizeSearchValue(citySearch);
    const stateCities = selectedState
      ? citiesList.filter((city) => !city.stateId || String(city.stateId) === String(selectedState.id))
      : [];
    if (!term) return stateCities;
    return stateCities.filter((city) => normalizeSearchValue(city.name).includes(term));
  }, [citiesList, citySearch, selectedState]);

  const resetForm = useCallback(() => {
    setSelectedNotificationType("");
    setSelectedDeliveryChannel("");
    setSelectedRoute("");
    setScheduledDate(getTodayDateInputValue());
    setContent("");
    setRecipientSearch("");
    setSelectedGender("");
    setSelectedState(null);
    setSelectedCity(null);
    setStateSearch("");
    setCitySearch("");
    setIsStateOpen(false);
    setIsCityOpen(false);
    setSelectedRecipients(
      mode === "all" && initialSelectedRecipientIds
        ? initialSelectedRecipientIds
        : recipients.map((recipient) => recipient.id),
    );
  }, [initialSelectedRecipientIds, mode, recipients]);

  const toggleRecipient = useCallback((id: string) => {
    setSelectedRecipients((current) =>
      current.includes(id) ? current.filter((recipientId) => recipientId !== id) : [...current, id],
    );
  }, []);

  const toggleFilteredRecipients = useCallback((checked: boolean) => {
    const filteredIds = filteredBulkRecipients.map((recipient) => recipient.id);
    setSelectedRecipients((current) => {
      if (checked) return [...new Set([...current, ...filteredIds])];
      return current.filter((id) => !filteredIds.includes(id));
    });
  }, [filteredBulkRecipients]);

  const handleSend = async () => {
    const senderId = readCurrentUserId();
    const route = selectedRoute.trim();

    if (!selectedNotificationType) {
      toast({ title: "Select notification type" });
      return;
    }

    if (!selectedDeliveryChannel) {
      toast({ title: "Select delivery channel" });
      return;
    }

    if (selectedRecipients.length === 0) {
      toast({ title: "Select at least one recipient" });
      return;
    }

    if (!scheduledDate) {
      toast({ title: "Select scheduled date" });
      return;
    }

    if (!content.trim()) {
      toast({ title: "Enter message content" });
      return;
    }

    if (!senderId) {
      toast({
        title: "Missing sender",
        description: "Could not find sender id in localStorage.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await customFetch<{ message?: string }>(SEND_NOTIFICATION_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notificationType: selectedNotificationType,
          deliveryChannel: selectedDeliveryChannel,
          senderId,
          recipientId: selectedRecipients,
          content: content.trim(),
          route: route || undefined,
          scheduledAt: scheduledDate,
          scheduledBy: senderId,
        }),
      });

      toast({
        title: "Notification queued",
        description: response?.message || "Notification has been scheduled successfully.",
      });
      resetForm();
      onOpenChange(false);
      onSent?.();
    } catch (error) {
      toast({
        title: "Send failed",
        description: error instanceof Error ? error.message : "Failed to send notification.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const isBulk = mode === "all";
  const allFilteredSelected =
    filteredBulkRecipients.length > 0 &&
    filteredBulkRecipients.every((recipient) => selectedRecipients.includes(recipient.id));

  const handleOutsideClick = (event: Event) => {
    event.preventDefault();
    setOutsideClickPulse(false);

    if (outsideClickTimerRef.current) {
      window.clearTimeout(outsideClickTimerRef.current);
    }

    window.requestAnimationFrame(() => {
      setOutsideClickPulse(true);
      outsideClickTimerRef.current = window.setTimeout(() => {
        setOutsideClickPulse(false);
      }, 180);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onInteractOutside={handleOutsideClick}
        className={`${isBulk ? "max-w-5xl" : "max-w-[420px]"} flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 transition-transform duration-150 ease-out ${
          outsideClickPulse ? "scale-[1.015]" : "scale-100"
        }`}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3.5 text-left">
          <DialogTitle>{isBulk ? "Notify All" : "Send Notification"}</DialogTitle>
        </DialogHeader>

        <div className={isBulk ? "grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4 md:grid-cols-[1fr_1.2fr]" : "min-h-0 flex-1 overflow-y-auto px-5 py-3.5"}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Notification Type</label>
              <Select value={selectedNotificationType} onValueChange={setSelectedNotificationType}>
                <SelectTrigger className="h-10 rounded-xl border-border bg-background">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="System generated">System generated</SelectItem>
                  <SelectItem value="Reminder">Reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Delivery Channel</label>
              <Select value={selectedDeliveryChannel} onValueChange={setSelectedDeliveryChannel}>
                <SelectTrigger className="h-10 rounded-xl border-border bg-background">
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="push">Push</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Route</label>
              <Select
                value={selectedRoute || NONE_ROUTE_VALUE}
                onValueChange={(value) =>
                  setSelectedRoute(value === NONE_ROUTE_VALUE ? "" : value)
                }
              >
                <SelectTrigger className="h-10 rounded-xl border-border bg-background">
                  <SelectValue placeholder="Route" />
                </SelectTrigger>
                <SelectContent className="max-h-72 w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]">
                  <SelectItem value={NONE_ROUTE_VALUE}>None</SelectItem>
                  {MOBILE_NOTIFICATION_ROUTES.map((route) => (
                    <SelectItem key={route} value={route} className="max-w-full">
                      {route}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Scheduled Date</label>
              <SingleDatePicker
                value={scheduledDate}
                onChange={setScheduledDate}
                className="h-10 sm:w-full"
                calendarClassName="[--cell-size:1.55rem]"
                contentSide="top"
                avoidCollisions={false}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Content</label>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Enter message..."
                className="min-h-[120px] resize-none rounded-2xl border-border bg-background"
              />
            </div>
          </div>

          {isBulk && (
            <div className="flex min-h-[360px] flex-col rounded-3xl border border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Recipients</p>
                  <p className="text-xs text-muted-foreground">{selectedRecipients.length} selected</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={(checked) => toggleFilteredRecipients(Boolean(checked))}
                    />
                    Select All
                  </label>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background text-primary">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-3 overflow-visible sm:grid-cols-2">
                <Select value={selectedGender} onValueChange={setSelectedGender}>
                  <SelectTrigger className="h-10 rounded-xl border-border bg-background">
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative z-40" ref={stateDropdownRef}>
                  <Input
                    value={stateSearch || selectedState?.name || ""}
                    onChange={(event) => {
                      setSelectedState(null);
                      setSelectedCity(null);
                      setCitySearch("");
                      setStateSearch(event.target.value);
                      setIsStateOpen(true);
                    }}
                    onFocus={() => setIsStateOpen(true)}
                    placeholder="Search State"
                    className="h-10 rounded-xl border-border bg-background"
                  />
                  {isStateOpen && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
                      {filteredStates.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No states found.</div>
                      ) : (
                        filteredStates.map((state) => (
                          <button
                            key={state.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                            onClick={() => {
                              setSelectedState(state);
                              setStateSearch("");
                              setSelectedCity(null);
                              setCitySearch("");
                              setIsStateOpen(false);
                            }}
                          >
                            {state.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="relative z-30" ref={cityDropdownRef}>
                  <Input
                    value={citySearch || selectedCity?.name || ""}
                    onChange={(event) => {
                      setSelectedCity(null);
                      setCitySearch(event.target.value);
                      setIsCityOpen(true);
                    }}
                    onFocus={() => {
                      if (selectedState) setIsCityOpen(true);
                    }}
                    placeholder="Search City"
                    className="h-10 rounded-xl border-border bg-background"
                  />
                  {isCityOpen && selectedState && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-background shadow-lg">
                      {filteredCities.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No cities found.</div>
                      ) : (
                        filteredCities.map((city) => (
                          <button
                            key={city.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                            onClick={() => {
                              setSelectedCity(city);
                              setCitySearch("");
                              setIsCityOpen(false);
                            }}
                          >
                            {city.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

              </div>

              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={recipientSearch}
                  onChange={(event) => setRecipientSearch(event.target.value)}
                  placeholder="Search users by name, email, or phone"
                  className="h-11 rounded-xl border-border bg-background pl-10"
                />
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {filteredBulkRecipients.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-6 text-center text-sm text-muted-foreground">
                    No users match this search.
                  </div>
                ) : (
                  filteredBulkRecipients.map((recipient) => (
                    <label
                      key={recipient.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3 transition-colors hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={selectedRecipients.includes(recipient.id)}
                        onCheckedChange={() => toggleRecipient(recipient.id)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{recipient.name ?? "Unnamed user"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {recipient.email ?? recipient.phone ?? recipient.id}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center gap-2  border-border px-5 py-3 sm:space-x-0">
          <Button variant="outline" className="cursor-pointer px-2 " onClick={resetForm} disabled={isSending}>
            Reset
          </Button>
         <div className="flex w-full gap-2 justify-end">
            <Button
              variant="outline"
              className="cursor-pointer px-2"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button className="min-w-0 cursor-pointer gap-2 px-4 " onClick={() => void handleSend()} disabled={isSending}>
              <Send className="h-4 w-4 stroke-white" />
              {isSending ? "Sending..." : "Send"} 
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
