import { useEffect, useState } from 'react'
import type { ChatThemeConfigInput } from '../../../domain/entities/ChatTheme'
import { getDefaultChatCanvasStyle } from './chatWallpaper'
import {
  isMessageNotificationSoundEnabled,
  playMessageNotificationSound,
  setMessageNotificationSoundEnabled,
} from '../../../shared/audio/messageNotificationSound'
import MS from '../../../shared/ui/MaterialSymbol'
import { mt } from './messengerText'

const MESSAGE_COLOR_PRESETS = ['#DBEAFF', '#2458D3', '#10B981', '#8B5CF6', '#F97316', '#EF4444', '#0EA5E9', '#14B8A6', '#111827']
const BACKGROUND_COLOR_PRESETS = ['#FFFFFF', '#EEF2FF', '#EEF7F2', '#F7F1FF', '#FFF4EA', '#FFF0F0', '#EEF7FF', '#F7F9FC', '#FFFBEA']

const normalizeHex = (value: string | null | undefined): string | null => {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }

  return null
}

const hexToRgb = (value: string): [number, number, number] | null => {
  const normalized = normalizeHex(value)
  if (!normalized) {
    return null
  }

  const parsed = Number.parseInt(normalized.slice(1), 16)
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255]
}

const rgba = (value: string, alpha: number): string => {
  const rgb = hexToRgb(value)
  if (!rgb) {
    return `rgba(47,75,226,${alpha})`
  }

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

const isDark = (value: string): boolean => {
  const rgb = hexToRgb(value)
  if (!rgb) {
    return true
  }

  const [r, g, b] = rgb
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance < 0.58
}

const DEFAULT_MESSAGE_COLOR = '#DBEAFF'
const BRAND_MESSAGE_GRADIENT = 'linear-gradient(135deg, rgb(47, 75, 226) 0%, rgb(13, 71, 161) 100%)'

const darken = (value: string, ratio: number): string => {
  const hex = normalizeHex(value) ?? '#000000'
  const channel = (offset: number) => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * (1 - ratio)).toString(16).padStart(2, '0')
  return `#${channel(1)}${channel(3)}${channel(5)}`
}

const messageGradient = (color: string): string =>
  [DEFAULT_MESSAGE_COLOR, '#0161FF', '#1554F6', '#2481CC', '#2458D3'].includes(color.toUpperCase()) ? BRAND_MESSAGE_GRADIENT : `linear-gradient(135deg, ${color} 0%, ${darken(color, 0.22)} 100%)`

const mixWithWhite = (value: string, ratio: number): string => {
  const rgb = hexToRgb(value)
  if (!rgb) {
    return value
  }

  const mix = rgb.map((channel) => Math.round(channel + (255 - channel) * ratio))
  return `#${mix.map((item) => item.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

interface MessengerThemePanelProps {
  open: boolean
  isMobile: boolean
  draft: ChatThemeConfigInput
  hasSavedTheme: boolean
  isSaving: boolean
  isResetting: boolean
  isUploadingImage: boolean
  error: string | undefined
  onClose: () => void
  onChange: (patch: Partial<ChatThemeConfigInput>) => void
  onUploadImage: (file: File) => void
  onSave: () => void
  onReset: () => void
}

export default function MessengerThemePanel({
  open,
  isMobile,
  draft,
  hasSavedTheme,
  isSaving,
  isResetting,
  isUploadingImage,
  error,
  onClose,
  onChange,
  onUploadImage,
  onSave,
  onReset,
}: MessengerThemePanelProps) {
  const [messageSoundOn, setMessageSoundOn] = useState(() => isMessageNotificationSoundEnabled())

  useEffect(() => {
    const enabled = isMessageNotificationSoundEnabled()
    const t = setTimeout(() => {
      setMessageSoundOn(prev => prev === enabled ? prev : enabled)
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  if (!open) {
    return null
  }

  const outgoingColor = normalizeHex(draft.messageColorHex) ?? '#DBEAFF'
  const previewBubbleText = outgoingColor === DEFAULT_MESSAGE_COLOR || isDark(outgoingColor) ? '#FFFFFF' : '#102033'
  const previewBackgroundColor = normalizeHex(draft.backgroundColorHex) ?? '#FFFFFF'
  const previewBackground =
    draft.backgroundType === 'image' && draft.backgroundImageUrl?.trim()
      ? {
          backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.68) 100%), url(${draft.backgroundImageUrl.trim()})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : draft.backgroundType === 'color'
        ? {
            backgroundColor: previewBackgroundColor,
            backgroundImage: `linear-gradient(180deg, ${mixWithWhite(previewBackgroundColor, 0.14)} 0%, ${previewBackgroundColor} 100%)`,
          }
        : getDefaultChatCanvasStyle()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: isMobile ? 'rgba(10,22,40,0.26)' : 'transparent',
        display: 'flex',
        justifyContent: isMobile ? 'center' : 'flex-end',
        alignItems: isMobile ? 'flex-end' : 'center',
        padding: isMobile ? 0 : 12,
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 'clamp(300px, 32vw, 380px)',
          maxWidth: '100%',
          flexShrink: 0,
          height: isMobile ? 'min(88vh, 760px)' : 'auto',
          maxHeight: isMobile ? undefined : 'min(720px, calc(100vh - 24px))',
          background: '#FFFFFF',
          border: isMobile ? 'none' : '1px solid #E1E7F0',
          borderRadius: isMobile ? '24px 24px 0 0' : 20,
          boxShadow: isMobile ? '0 -18px 40px rgba(10,22,40,0.18)' : '0 18px 48px rgba(10,22,40,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 18px 16px',
            borderBottom: '1px solid #E6EDF7',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1F3450', letterSpacing: '-0.018em' }}>{mt('messengerThemePanel.t00')}</div>
            <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4, color: '#6F84A3' }}>
              {mt('messengerThemePanel.t01')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: '1px solid #E3EAF5',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title={mt('messengerThemePanel.t02')}
          >
            <MS name="close" size={18} color="#6F84A3" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <button
            type="button"
            onClick={() => onChange({ messageColorHex: '#DBEAFF', backgroundType: 'default', backgroundColorHex: '#FFFFFF', backgroundImageUrl: null })}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, border: '1px solid #D8E6FA', borderRadius: 14, background: '#FFFFFF', textAlign: 'left', cursor: 'pointer', flexShrink: 0 }}
          >
            <span aria-hidden="true" style={{ display: 'block', width: 44, height: 34, background: BRAND_MESSAGE_GRADIENT, borderRadius: 10, flexShrink: 0 }} />
            <span><strong style={{ display: 'block', fontSize: 14, color: '#14213D' }}>{mt('messengerThemePanel.t03')}</strong><span style={{ fontSize: 12, color: '#64748B' }}>{mt('messengerThemePanel.t04')}</span></span>
          </button>
          <section style={{ border: '1px solid #E6EDF7', borderRadius: 18, background: '#FAFCFF', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#28415F', marginBottom: 10 }}>{mt('messengerThemePanel.t05')}</div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                fontSize: 13,
                color: '#3D5677',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={messageSoundOn}
                onChange={(event) => {
                  const next = event.target.checked
                  setMessageNotificationSoundEnabled(next)
                  setMessageSoundOn(next)
                  if (next) {
                    playMessageNotificationSound()
                  }
                }}
                style={{ width: 18, height: 18, accentColor: '#2458D3', cursor: 'pointer' }}
              />
              <span>{mt('messengerThemePanel.t06')}</span>
            </label>
            <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.45, color: '#8B9DB8' }}>
              {mt('messengerThemePanel.t07')}
            </div>
          </section>

          <section style={{ border: '1px solid #E6EDF7', borderRadius: 18, background: '#FAFCFF', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#28415F', marginBottom: 12 }}>{mt('messengerThemePanel.t08')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              {MESSAGE_COLOR_PRESETS.map((color) => {
                const selected = normalizeHex(draft.messageColorHex) === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => onChange({ messageColorHex: color })}
                    style={{
                      height: 42,
                      borderRadius: 14,
                      border: 'none',
                      background: messageGradient(color),
                      cursor: 'pointer',
                      outline: selected ? '2px solid #0161FF' : 'none',
                      outlineOffset: 2,
                      boxShadow: selected ? '0 8px 18px rgba(1,97,255,0.22)' : 'none',
                    }}
                    title={color}
                  />
                )
              })}
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="color"
                value={outgoingColor}
                onChange={(event) => onChange({ messageColorHex: event.target.value })}
                style={{ width: 42, height: 42, border: 'none', background: 'transparent', cursor: 'pointer' }}
              />
              <input
                value={normalizeHex(draft.messageColorHex) ?? outgoingColor}
                onChange={(event) => onChange({ messageColorHex: event.target.value })}
                placeholder="#2458D3"
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 12,
                  border: '1px solid #D7E2F3',
                  background: '#FFFFFF',
                  padding: '0 12px',
                  fontSize: 13,
                  color: '#1F3450',
                  outline: 'none',
                }}
              />
            </div>
          </section>

          <section style={{ border: '1px solid #E6EDF7', borderRadius: 18, background: '#FAFCFF', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#28415F', marginBottom: 12 }}>{mt('messengerThemePanel.t09')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { key: 'default', label: mt('messengerThemePanel.t10') },
                { key: 'color', label: mt('messengerThemePanel.t11') },
                { key: 'image', label: mt('messengerThemePanel.t12') },
              ].map((option) => {
                const selected = draft.backgroundType === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onChange({ backgroundType: option.key as ChatThemeConfigInput['backgroundType'] })}
                    style={{
                      height: 34,
                      borderRadius: 999,
                      border: `1px solid ${selected ? '#7FB5FF' : '#D7E2F3'}`,
                      background: selected ? '#EAF4FF' : '#FFFFFF',
                      color: selected ? '#1A73E8' : '#5F7698',
                      padding: '0 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            {draft.backgroundType === 'color' ? (
              <>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                  {BACKGROUND_COLOR_PRESETS.map((color) => {
                    const selected = normalizeHex(draft.backgroundColorHex) === color
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => onChange({ backgroundType: 'color', backgroundColorHex: color })}
                        style={{
                          height: 42,
                          borderRadius: 14,
                          border: selected ? `2px solid ${rgba(outgoingColor, 0.55)}` : '1px solid #DDE6F2',
                          background: `linear-gradient(180deg, ${mixWithWhite(color, 0.12)} 0%, ${color} 100%)`,
                          cursor: 'pointer',
                        }}
                        title={color}
                      />
                    )
                  })}
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="color"
                    value={previewBackgroundColor}
                    onChange={(event) => onChange({ backgroundType: 'color', backgroundColorHex: event.target.value })}
                    style={{ width: 42, height: 42, border: 'none', background: 'transparent', cursor: 'pointer' }}
                  />
                  <input
                    value={normalizeHex(draft.backgroundColorHex) ?? previewBackgroundColor}
                    onChange={(event) => onChange({ backgroundType: 'color', backgroundColorHex: event.target.value })}
                    placeholder="#EEF2FF"
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 12,
                      border: '1px solid #D7E2F3',
                      background: '#FFFFFF',
                      padding: '0 12px',
                      fontSize: 13,
                      color: '#1F3450',
                      outline: 'none',
                    }}
                  />
                </div>
              </>
            ) : null}

            {draft.backgroundType === 'image' ? (
              <>
                <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label
                    style={{
                      minWidth: 0,
                      flex: '1 1 180px',
                      height: 42,
                      borderRadius: 12,
                      border: '1px solid #D7E2F3',
                      background: '#FFFFFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '0 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#1A73E8',
                      cursor: isUploadingImage ? 'default' : 'pointer',
                      opacity: isUploadingImage ? 0.7 : 1,
                    }}
                  >
                    <MS name="upload" size={16} color="#1A73E8" />
                    <span>{isUploadingImage ? mt('messengerThemePanel.t13') : mt('messengerThemePanel.t14')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingImage}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) {
                          onUploadImage(file)
                        }
                        event.currentTarget.value = ''
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onChange({ backgroundImageUrl: null })}
                    disabled={isUploadingImage || !draft.backgroundImageUrl}
                    style={{
                      height: 42,
                      borderRadius: 12,
                      border: '1px solid #D7E2F3',
                      background: '#FFFFFF',
                      padding: '0 14px',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#5F7698',
                      cursor: isUploadingImage || !draft.backgroundImageUrl ? 'default' : 'pointer',
                      opacity: isUploadingImage || !draft.backgroundImageUrl ? 0.5 : 1,
                    }}
                  >
                    {mt('messengerThemePanel.t15')}
                  </button>
                </div>
                <input
                  value={draft.backgroundImageUrl ?? ''}
                  onChange={(event) => onChange({ backgroundImageUrl: event.target.value })}
                  placeholder="https://..."
                  style={{
                    marginTop: 12,
                    width: '100%',
                    height: 42,
                    borderRadius: 12,
                    border: '1px solid #D7E2F3',
                    background: '#FFFFFF',
                    padding: '0 12px',
                    fontSize: 13,
                    color: '#1F3450',
                    outline: 'none',
                  }}
                />
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: '#6F84A3' }}>
                  {mt('messengerThemePanel.t16')}
                </div>
              </>
            ) : null}
          </section>

          <section style={{ border: '1px solid #E6EDF7', borderRadius: 18, background: '#FFFFFF', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#28415F', marginBottom: 12 }}>{mt('messengerThemePanel.t17')}</div>
            <div
              style={{
                borderRadius: 18,
                border: '1px solid #E2EAF5',
                padding: 16,
                minHeight: 188,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)',
                ...previewBackground,
              }}
            >
              <div
                style={{
                  maxWidth: 230,
                  marginLeft: 'auto',
                  borderRadius: '18px 18px 8px 18px',
                  padding: '10px 12px 8px',
                  background: messageGradient(outgoingColor),
                  color: previewBubbleText,
                  boxShadow: `0 12px 24px ${rgba(outgoingColor, 0.22)}`,
                }}
              >
                <div style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 500 }}>{mt('messengerThemePanel.t18')}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: previewBubbleText === '#FFFFFF' ? 'rgba(255,255,255,0.82)' : 'rgba(16,32,51,0.72)', textAlign: 'right' }}>
                  14:32
                </div>
              </div>
            </div>
          </section>

          {error ? (
            <div
              style={{
                borderRadius: 14,
                border: '1px solid #F3C7C7',
                background: '#FFF5F5',
                color: '#C53B3B',
                fontSize: 13,
                lineHeight: 1.45,
                padding: '12px 14px',
              }}
            >
              {error}
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: '14px 18px 18px',
            borderTop: '1px solid #E6EDF7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: '#FFFFFF',
          }}
        >
          <button
            type="button"
            onClick={onReset}
            disabled={isSaving || isResetting || !hasSavedTheme}
            style={{
              height: 42,
              borderRadius: 12,
              border: '1px solid #D7E2F3',
              background: '#FFFFFF',
              color: '#5F7698',
              padding: '0 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: isSaving || isResetting || !hasSavedTheme ? 'default' : 'pointer',
              opacity: isSaving || isResetting || !hasSavedTheme ? 0.5 : 1,
            }}
          >
            {isResetting ? mt('messengerThemePanel.t19') : mt('messengerThemePanel.t20')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || isResetting}
            style={{
              height: 44,
              borderRadius: 12,
              border: 'none',
              background: BRAND_MESSAGE_GRADIENT,
              color: '#FFFFFF',
              padding: '0 18px',
              fontSize: 14,
              fontWeight: 800,
              cursor: isSaving || isResetting ? 'default' : 'pointer',
              boxShadow: '0 12px 24px rgba(47,75,226,0.24)',
              opacity: isSaving || isResetting ? 0.72 : 1,
            }}
          >
            {isSaving ? mt('messengerThemePanel.t21') : mt('messengerThemePanel.t22')}
          </button>
        </div>
      </div>
    </div>
  )
}
