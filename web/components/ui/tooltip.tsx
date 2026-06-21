"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-[#23272F] px-3 py-1.5 text-xs font-medium text-white shadow-lg has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-[#23272F] fill-[#23272F] data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

/**
 * Drop-in replacement for the native `title=""` tooltip.
 * Renders the SAME child element (Base UI `render` merges props/ref — no extra
 * DOM, no layout shift), adds a polished portaled tooltip. Hover/focus managed
 * by Base UI with proper cleanup, so it can never get stuck on screen.
 */
function Tip({
  label,
  side = "top",
  children,
}: {
  label: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  children: React.ReactElement
}) {
  if (label === null || label === undefined || label === "") return children
  // A tooltip only sets aria-describedby, not an accessible NAME. So for icon-only
  // triggers, borrow the (string) label as aria-label unless one already exists.
  // This gives every Tip-wrapped icon button a name for free (WCAG 4.1.2).
  let trigger = children
  const tag = typeof children.type === "string" ? children.type : ""
  const childProps = (children.props ?? {}) as Record<string, unknown>
  // Only name INTERACTIVE triggers (button/link/role). Adding aria-label to a plain
  // decorative <span> (e.g. a status dot) is aria-prohibited.
  // Note: Next.js <Link> has a non-string type, so also detect href/onClick/role
  // (a collapsed sidebar <Link> only renders an icon and otherwise has no name).
  const interactive = tag === "button" || tag === "a" || !!childProps.href || !!childProps.onClick || !!childProps.role || childProps.tabIndex !== undefined
  if (typeof label === "string" && interactive && !childProps["aria-label"]) {
    trigger = React.cloneElement(children, { "aria-label": label } as React.Attributes)
  }
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger render={trigger} />
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Tip }
