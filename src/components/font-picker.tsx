"use client";
import type { ComponentProps } from "react";
import { OTHER_FONTS, fontFamily, fontLabel, fontSelection, fontValue, type CompanyFont, type FontSelection } from "@/lib/font-catalog";

export function FontPicker({ fonts, value, onChange, defaultLabel = "Original font", className, ...props }: Omit<ComponentProps<"select">, "value" | "onChange"> & { fonts: CompanyFont[]; value: FontSelection; onChange: (selection: FontSelection) => void; defaultLabel?: string }) {
  return <select aria-label="Text font" className={className ?? "h-9 w-full rounded-md border border-input bg-card px-3 text-sm"} {...props} value={fontValue(value)} onChange={e => onChange(fontSelection(e.target.value))}>
    <optgroup label="Company fonts">
      <option value="">{defaultLabel}</option>
      <option value="brand-heading">Brand heading</option><option value="brand-body">Brand body</option>
      {fonts.map(font => <option key={font.id} value={`asset:${font.id}`}>{fontLabel(font.name)}</option>)}
    </optgroup>
    <optgroup label="Other fonts">{OTHER_FONTS.map(font => <option key={font.id} value={font.id} style={{ fontFamily: fontFamily({ font: font.id }) }}>{font.label}</option>)}</optgroup>
  </select>;
}
