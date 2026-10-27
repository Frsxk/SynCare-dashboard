import React, { type ReactNode } from "react";

export function TableViewport({ label, children }: { label: string; children?: ReactNode }) {
  return <div className="table-viewport" role="region" aria-label={label} tabIndex={0}>
    {children}
  </div>;
}
