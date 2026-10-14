import {
  ArrowUpRight, ArrowRight, ArrowLeft, Pencil, Upload, Download, Undo2, Redo2,
  Plus, Trash2, ArrowUp, ArrowDown, Save, Sparkles, X, Share2, ClipboardCheck,
  Type, Image, Shapes, type LucideIcon, type LucideProps,
} from "lucide-react";

function icon(Component: LucideIcon) {
  return function Icon({ size = 18, strokeWidth = 1.75, ...props }: LucideProps) {
    return <Component size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />;
  };
}

export const ArrowUpRightIcon = icon(ArrowUpRight);
export const ArrowRightIcon = icon(ArrowRight);
export const ArrowLeftIcon = icon(ArrowLeft);
export const EditIcon = icon(Pencil);
export const ExportIcon = icon(Upload);
export const DownloadIcon = icon(Download);
export const UndoIcon = icon(Undo2);
export const RedoIcon = icon(Redo2);
export const PlusIcon = icon(Plus);
export const TrashIcon = icon(Trash2);
export const MoveUpIcon = icon(ArrowUp);
export const MoveDownIcon = icon(ArrowDown);
export const SaveIcon = icon(Save);
export const SparklesIcon = icon(Sparkles);
export const CloseIcon = icon(X);
export const ShareIcon = icon(Share2);
export const ReviewIcon = icon(ClipboardCheck);
export const TextIcon = icon(Type);
export const ImageIcon = icon(Image);
export const ComponentsIcon = icon(Shapes);
