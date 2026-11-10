import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { bt } from './boardText'

export type CreateBoardBackground =
  | { type: 'preset'; presetId: string }
  | { type: 'image'; file: File }

export interface CreateBoardPayload {
  name: string
  background: CreateBoardBackground
}

interface CreateBoardModalProps {
  open: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (payload: CreateBoardPayload) => void
}

const PRESETS = [
  { id: 'preset_default', get name() { return bt('advanced.presets.default') }, swatch: 'linear-gradient(135deg,#F8F9FB 0%,#E4E8EF 100%)', hex: '#E9EDF3' },
  { id: 'preset_sky', get name() { return bt('advanced.presets.sky') }, swatch: 'linear-gradient(135deg,#EEF2FF 0%,#C9DAFF 100%)', hex: '#D6E4FF' },
  { id: 'preset_mint', get name() { return bt('advanced.presets.mint') }, swatch: 'linear-gradient(135deg,#F2FBF6 0%,#C8EBD8 100%)', hex: '#D3F0E0' },
  { id: 'preset_sand', get name() { return bt('advanced.presets.sand') }, swatch: 'linear-gradient(135deg,#FFF7EE 0%,#F9D9B4 100%)', hex: '#FBE3C8' },
] as const

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const PREVIEW_COLUMNS = [[1, 1, 2], [1, 2], [3, 1, 1]] as const

function BoardPreview({ style }: { style: CSSProperties }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#E2E5EA] bg-cover bg-center" style={style}>
      <div className="flex gap-2 p-3 pt-4">
        {PREVIEW_COLUMNS.map((cards, columnIndex) => (
          <div key={columnIndex} className="flex flex-1 flex-col gap-1.5 self-start rounded-lg bg-white/85 p-1.5 shadow-sm backdrop-blur-[2px]">
            <div className="h-1.5 w-1/2 rounded-full bg-[#CBD3DF]" />
            {cards.map((size, cardIndex) => (
              <div
                key={cardIndex}
                className="rounded-md bg-white p-1.5 shadow-[0_1px_0_rgba(23,32,46,0.08)]"
                style={{ height: size === 3 ? 44 : size === 2 ? 26 : 16 }}
              >
                <div className="h-1 w-3/4 rounded-full bg-[#E4E8EF]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateBoardDialog({ isSubmitting, onClose, onSubmit }: Omit<CreateBoardModalProps, 'open'>) {
  const nameId = useId()
  const errorId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [presetId, setPresetId] = useState<string>(PRESETS[1].id)
  const [image, setImage] = useState<{ file: File; url: string } | null>(null)
  const [useImage, setUseImage] = useState(false)
  const [imageError, setImageError] = useState('')

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url)
  }, [image])

  const trimmed = name.trim()
  const showNameError = touched && !trimmed
  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0]
  const previewStyle: CSSProperties = useImage && image
    ? { backgroundImage: `url(${image.url})` }
    : { backgroundImage: `linear-gradient(160deg, ${preset.hex} 0%, #F3F6FB 100%)` }

  const handleClose = () => {
    if (!isSubmitting) onClose()
  }

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault()
    setTouched(true)
    if (!trimmed || isSubmitting) return
    onSubmit({
      name: trimmed,
      background: useImage && image ? { type: 'image', file: image.file } : { type: 'preset', presetId },
    })
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setImageError(bt('createBoard.badFormat'))
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(bt('createBoard.tooBig'))
      return
    }
    setImageError('')
    setImage({ file, url: URL.createObjectURL(file) })
    setUseImage(true)
  }

  const tileBase = 'relative h-12 overflow-hidden rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2458D3]/40 disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <AppModal
      title={bt('hub.createBoard')}
      onClose={handleClose}
      maxWidth={440}
      footer={
        <AppButton className="w-full" isLoading={isSubmitting} disabled={!trimmed} onClick={() => handleSubmit()}>
          {isSubmitting ? bt('createTask.creating') : bt('create')}
        </AppButton>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <BoardPreview style={previewStyle} />

        <fieldset className="flex flex-col gap-2" disabled={isSubmitting}>
          <legend className="mb-2 text-[13px] font-semibold text-[#17202E]">{bt('createBoard.background')}</legend>
          <div className="grid grid-cols-5 gap-2">
            {PRESETS.map((item) => {
              const selected = !useImage && presetId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.name}
                  aria-label={item.name}
                  aria-pressed={selected}
                  onClick={() => {
                    setPresetId(item.id)
                    setUseImage(false)
                  }}
                  className={`${tileBase} ${selected ? 'border-[#2458D3] ring-2 ring-[#2458D3]/25' : 'border-[#E2E5EA] hover:border-[#B8C2D2]'}`}
                  style={{ backgroundImage: item.swatch }}
                >
                  {selected ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2458D3] text-white">
                        <MaterialSymbol name="check" size={14} color="currentColor" />
                      </span>
                    </span>
                  ) : null}
                </button>
              )
            })}
            <button
              type="button"
              aria-label={image ? bt('createBoard.ownImage') : bt('background.upload')}
              title={image ? bt('createBoard.ownImage') : bt('background.upload')}
              aria-pressed={useImage}
              onClick={() => {
                if (image && !useImage) setUseImage(true)
                else fileInputRef.current?.click()
              }}
              className={`${tileBase} bg-cover bg-center ${useImage ? 'border-[#2458D3] ring-2 ring-[#2458D3]/25' : 'border-dashed border-[#C4C9D2] bg-[#F6F7F9] text-[#586174] hover:border-[#2458D3] hover:text-[#2458D3]'}`}
              style={image ? { backgroundImage: `url(${image.url})` } : undefined}
            >
              {image ? (
                useImage ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/15">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2458D3] text-white">
                      <MaterialSymbol name="check" size={14} color="currentColor" />
                    </span>
                  </span>
                ) : null
              ) : (
                <span className="flex h-full items-center justify-center">
                  <MaterialSymbol name="image" size={20} color="currentColor" />
                </span>
              )}
            </button>
          </div>
          {image ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="self-start text-[12px] font-medium text-[#2458D3] hover:underline"
            >
              {bt('createBoard.pickOther')}
            </button>
          ) : null}
          {imageError ? <p className="text-[12px] text-[#C2410C]">{imageError}</p> : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              handleFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-[13px] font-semibold text-[#17202E]">
            {bt('boards.name')} <span className="text-[#DC2626]">*</span>
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={bt('createBoard.namePlaceholder')}
            maxLength={120}
            disabled={isSubmitting}
            aria-invalid={showNameError}
            aria-describedby={showNameError ? errorId : undefined}
            className={`ts-input ${showNameError ? '!border-[#DC2626] focus:!ring-[#DC2626]/15' : ''}`}
          />
          {showNameError ? (
            <p id={errorId} className="flex items-center gap-1.5 text-[12px] font-medium text-[#DC2626]">
              <MaterialSymbol name="error" size={14} color="currentColor" />
              {bt('createBoard.nameRequired')}
            </p>
          ) : null}
        </div>
      </form>
    </AppModal>
  )
}

export default function CreateBoardModal({ open, ...props }: CreateBoardModalProps) {
  if (!open) return null
  return <CreateBoardDialog {...props} />
}
