import React from 'react'

/**
 * Vector icons extracted verbatim from design-spec.svg (frame translate(7024)).
 * Each path keeps its original design-space coordinates and is framed by a
 * viewBox that matches the designed glyph bounds, so the icons render as crisp
 * vectors at any display scale.
 */

const STROKE_WIDTH = 1.7

export interface DesignIconProps {
  className?: string
  width?: number
  height?: number
}

export function BookIcon({
  className,
  width = 24,
  height = 24
}: DesignIconProps): JSX.Element {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="7156 157.5 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7168 165.333V177M7168 165.333C7168 164.449 7167.65 163.601 7167.02 162.976C7166.4 162.351 7165.55 162 7164.67 162H7160.5C7160.28 162 7160.07 162.088 7159.91 162.244C7159.75 162.4 7159.67 162.612 7159.67 162.833V173.667C7159.67 173.888 7159.75 174.1 7159.91 174.256C7160.07 174.412 7160.28 174.5 7160.5 174.5H7165.5C7166.16 174.5 7166.8 174.763 7167.27 175.232C7167.74 175.701 7168 176.337 7168 177M7168 165.333C7168 164.449 7168.35 163.601 7168.98 162.976C7169.6 162.351 7170.45 162 7171.33 162H7175.5C7175.72 162 7175.93 162.088 7176.09 162.244C7176.25 162.4 7176.33 162.612 7176.33 162.833V173.667C7176.33 173.888 7176.25 174.1 7176.09 174.256C7175.93 174.412 7175.72 174.5 7175.5 174.5H7170.5C7169.84 174.5 7169.2 174.763 7168.73 175.232C7168.26 175.701 7168 176.337 7168 177"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function WaveformLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="7056 18 30 30" fill="none" aria-hidden="true">
      <rect x="7056" y="18" width="30" height="30" rx="8" fill="var(--accent)" />
      <path
        d="M7061.5 31V34M7065.3 27V38M7069.1 24V42M7072.9 29V36M7076.7 26V39M7080.5 31V34"
        stroke="var(--ink-on-accent)"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SearchGlassIcon({
  className,
  width = 16,
  height = 16
}: DesignIconProps): JSX.Element {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="7162.5 250.5 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7176.88 264.875L7173.8 261.801M7175.46 257.792C7175.46 260.921 7172.92 263.458 7169.79 263.458C7166.66 263.458 7164.12 260.921 7164.12 257.792C7164.12 254.662 7166.66 252.125 7169.79 252.125C7172.92 252.125 7175.46 254.662 7175.46 257.792Z"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MonitorIcon({
  className,
  width = 16,
  height = 16
}: DesignIconProps): JSX.Element {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="7544 702.5 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7549.33 716.5H7552M7552 716.5H7554.67M7552 716.5V713.833M7552 713.833H7557.33C7558.07 713.833 7558.67 713.236 7558.67 712.5V705.833C7558.67 705.097 7558.07 704.5 7557.33 704.5H7546.67C7545.93 704.5 7545.33 705.097 7545.33 705.833V712.5C7545.33 713.236 7545.93 713.833 7546.67 713.833H7552Z"
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
    </svg>
  )
}
