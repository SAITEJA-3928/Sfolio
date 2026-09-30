import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DownloadCloud, FileText, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SelectionFeedbackProps {
  transferAnimation: boolean;
  downloadBounce: boolean;
  showDownloadHint: boolean;
  selectedCount: number;
  disabled: boolean;
  onExport: () => void;
  onAnimationComplete: () => void;
  onUploadExcel?: (file: File) => void | Promise<void>;
  uploadDisabled?: boolean;
  isUploadingExcel?: boolean;
  uploadTooltip?: string;
}

export default function SelectionFeedback({
  transferAnimation,
  downloadBounce,
  showDownloadHint,
  selectedCount,
  disabled,
  onExport,
  onAnimationComplete,
  onUploadExcel,
  uploadDisabled = false,
  isUploadingExcel = false,
  uploadTooltip = "Upload Excel",
}: SelectionFeedbackProps) {
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const showUploadExcel = Boolean(onUploadExcel);
  const isUploadDisabled = uploadDisabled || isUploadingExcel;

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadExcel) return;
    void onUploadExcel(file);
  };

  return (
    <div className="relative inline-flex items-center gap-2">

      <AnimatePresence>
        {transferAnimation && (
          <motion.div
            initial={{
              x: -165,
              y: 58,
              opacity: 0,
              scale: 0.65,
              rotate: -10,
            }}

            animate={{
              x: -5,
              y: 2,
              opacity: 1,
              scale: 1,
              rotate: 2,
            }} exit={{
              opacity: 0,
              scale: 0.2,
            }}
            transition={{
              duration: 0.45,
              ease: [0.25, 1, 0.5, 1],
            }}
            onAnimationComplete={() => {
              onAnimationComplete();
            }} className="absolute right-4 top-2 z-50 pointer-events-none"
          >
            <FileText className="h-4 w-4 text-primary drop-shadow-md" />
          </motion.div>
        )}
      </AnimatePresence>

      <TooltipProvider>
        {showUploadExcel ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 cursor-pointer"
                  disabled={isUploadDisabled}
                  onClick={() => uploadInputRef.current?.click()}
                  aria-label={uploadTooltip}
                >
                  {isUploadingExcel ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="end"
              sideOffset={8}
              className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg"
            >
              {isUploadingExcel ? "Uploading..." : uploadTooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {showUploadExcel ? (
          <input
            ref={uploadInputRef}
            type="file"
            accept=".xls,.xlsx"
            className="sr-only"
            onChange={handleUploadChange}
            disabled={isUploadDisabled}
          />
        ) : null}
        <Tooltip
          open={showDownloadHint ? true : undefined}
        >
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
              <motion.div

                animate={
                  downloadBounce
                    ? {
                      scale: [1, 1.08, 1],
                      y: [0, -3, 0],
                    }
                    : { scale: 1, y: 0 }
                } transition={{
                  duration: 0.22,
                  ease: "easeOut",
                }}
              >
                <Button
                  variant="outline"
                  className="gap-2 cursor-pointer relative"
                  onClick={onExport}
                  disabled={disabled}
                >
                  <DownloadCloud className="h-4 w-4" />

                  {selectedCount > 0 && (
                    <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                      {selectedCount}
                    </span>
                  )}
                </Button>
              </motion.div>
            </span>
          </TooltipTrigger>

          <TooltipContent
            side="bottom"
            align="end"
            sideOffset={8}
            avoidCollisions={true}
            collisionPadding={{ right: 32, left: 16 }}
            className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200"
          >
            {selectedCount > 0
              ? "Click to Download"
              : "Export All"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

    </div>
  );
}