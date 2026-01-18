import React from "react";

interface CanvasButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  variant?: "default" | "danger";
}

export const CanvasButton: React.FC<CanvasButtonProps> = ({
  isActive = false,
  variant = "default",
  className = "",
  style,
  children,
  ...props
}) => {
  const baseClasses = "text-xs px-2 py-1 rounded border transition-colors font-medium";
  
  // Normal state styles (when not active)
  const normalClasses = variant === "danger" 
    ? "bg-neutral-800 text-white border-neutral-700 hover:bg-red-900/50 hover:border-red-800"
    : "bg-neutral-800 text-white border-neutral-700 hover:bg-neutral-700";

  // When active, we use utility classes instead of inline styles to allow hover overrides
  const activeClasses = isActive 
    ? "bg-primary border-primary text-white hover:border-primary"
    : "";

  return (
    <button
      className={`
        ${baseClasses} 
        ${!isActive ? normalClasses : activeClasses} 
        ${className}
      `}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
};
