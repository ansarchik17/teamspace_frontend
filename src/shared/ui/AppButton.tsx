import React from 'react'

interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'default' | 'compact' | 'icon'
  isLoading?: boolean
}

export default function AppButton({ 
  children, 
  variant = 'primary', 
  size = 'default',
  isLoading, 
  disabled,
  type = 'button',
  className = '', 
  ...props 
}: AppButtonProps) {
  return (
    <button 
      {...props}
      type={type}
      className={`ts-button ts-button--${variant}${size === 'default' ? '' : ` ts-button--${size}`} ${className}`}
      disabled={isLoading || disabled}
      aria-busy={isLoading || undefined}
    >
      {isLoading && (
        <span className="ts-button__spinner" aria-hidden="true" />
      )}
      {children}
    </button>
  )
}
