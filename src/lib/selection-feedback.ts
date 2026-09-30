export const triggerSelectionFeedback = ({
  setTransferAnimation,
  setShowDownloadHint,
}: {
  setTransferAnimation: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDownloadHint: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  setTransferAnimation(true);

  setShowDownloadHint(true);

  setTimeout(() => {
    setShowDownloadHint(false);
  }, 2500);
};

export const getSelectionRowClass = (selected: boolean) =>
  selected
    ? "bg-primary/5 ring-1 ring-primary/20"
    : "hover:bg-white/5";