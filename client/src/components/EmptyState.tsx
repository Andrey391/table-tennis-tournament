import type { ReactNode } from "react";
import { card } from "../lib/ui";

// "Nothing here yet": one shape for every empty list, with an optional action below the text.
export default function EmptyState({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className={`${card} text-center py-12 px-4`}>
      <p className="text-[#6b84a0] text-sm">{text}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
