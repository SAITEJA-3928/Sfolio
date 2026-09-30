import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ConfirmActionDialogProps = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function ConfirmActionDialog({
  open,
  title = "Confirm action",
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isLoading = false,
  onOpenChange,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [outsideClickPulse, setOutsideClickPulse] = useState(false);
  const outsideClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (outsideClickTimerRef.current) {
        window.clearTimeout(outsideClickTimerRef.current);
      }
    };
  }, []);

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
        className={`max-w-md gap-0 overflow-hidden rounded-[24px] border-border bg-card p-0 shadow-2xl shadow-black/50 transition-transform duration-150 ease-out ${
          outsideClickPulse ? "scale-[1.015]" : "scale-100"
        }`}
      >
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <DialogDescription className="px-5 py-4 text-sm text-muted-foreground">
          {message}
        </DialogDescription>

        <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              className="cursor-pointer"
              disabled={isLoading}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              disabled={isLoading}
              onClick={onConfirm}
            >
              {isLoading ? "Deleting..." : confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
