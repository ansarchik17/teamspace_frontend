interface AppLoaderProps {
  size?: number
  label?: string
}

export default function AppLoader({ size = 56, label }: AppLoaderProps) {
  const ring = size + 22

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-4">
      <div className="relative flex items-center justify-center" style={{ width: ring, height: ring }}>
        <div
          className="absolute inset-0 rounded-full border-2 border-[#3159E8]/15 border-t-[#3159E8] animate-spin"
          style={{ animationDuration: '1s' }}
        />
        <img
          src={`${import.meta.env.BASE_URL}asg-invest-mark.png`}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="relative object-contain animate-[axis-logo-pulse_1.6s_ease-in-out_infinite]"
          style={{ width: size, height: size }}
        />
      </div>
      {label ? (
        <p className="text-[13px] font-medium text-[#6D7F9E]" role="status" aria-live="polite">
          {label}
        </p>
      ) : null}
    </div>
  )
}
