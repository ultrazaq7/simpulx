import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { cn } from "@/lib/utils"

export interface Option {
  label: string;
  value: string;
}

export interface MultiSelectProps {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
}

export function MultiSelect({ options, value, onChange, placeholder = "Select...", className }: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))

  const handleSelect = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val))
    } else {
      onChange([...value, val])
    }
  }

  const selectedLabels = value.map(v => options.find(o => o.value === v)?.label || v)
  const display = selectedLabels.length > 0 ? (selectedLabels.length > 2 ? `${selectedLabels.length} selected` : selectedLabels.join(", ")) : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn("flex h-8 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50", className)}
      >
        <span className="truncate">{display}</span>
        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0 shadow-lg border border-slate-200" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          <input
            className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none border-none focus:outline-none focus:ring-0 placeholder:text-slate-400"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[220px] overflow-y-auto p-1">
          {options.length > 0 && (
            <div
              className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-slate-100 text-xs text-slate-500 cursor-pointer hover:bg-slate-50"
              onClick={() => {
                if (value.length === options.length) {
                  onChange([])
                } else {
                  onChange(options.map(o => o.value))
                }
              }}
            >
              <span className="font-medium text-amber-700">{value.length === options.length ? "Clear All" : "Select All"}</span>
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="p-2 text-center text-sm text-slate-500">No results found.</p>
          ) : (
            filtered.map((option) => {
              const isSelected = value.includes(option.value)
              return (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100",
                    isSelected ? "bg-slate-50 text-amber-700 font-medium" : "text-slate-700"
                  )}
                  onClick={() => handleSelect(option.value)}
                >
                  <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                  {option.label}
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
