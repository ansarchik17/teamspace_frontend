import { useEffect, useMemo, useRef, useState } from 'react'
import MS from '../../../shared/ui/MaterialSymbol'
import { C } from '../../pages/dashboard/model/constants'
import EmojiGlyph from './EmojiGlyph'
import { mt } from './messengerText'

type EmojiItem = {
  value: string
  keywords: string[]
}

type EmojiCategory = {
  id: string
  label: string
  icon: string
  emojis: EmojiItem[]
}

const RECENT_EMOJIS_STORAGE_KEY = 'alem-messenger-recent-emojis'
const MAX_RECENT_EMOJIS = 18

const createEmoji = (value: string, ...keywords: string[]): EmojiItem => ({
  value,
  keywords,
})

const BASE_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    get label() { return mt('emoji.t000') },
    icon: '🙂',
    emojis: [
      createEmoji('😀', 'улыбка', 'радость', 'smile', 'happy'), // i18n-ignore
      createEmoji('😄', 'смех', 'улыбка', 'grin', 'smile'), // i18n-ignore
      createEmoji('😁', 'доволен', 'happy', 'grin'), // i18n-ignore
      createEmoji('😊', 'милый', 'blush', 'smile'), // i18n-ignore
      createEmoji('😉', 'подмигивание', 'wink'), // i18n-ignore
      createEmoji('😍', 'любовь', 'влюблен', 'love'), // i18n-ignore
      createEmoji('😘', 'поцелуй', 'kiss'), // i18n-ignore
      createEmoji('🥰', 'сердца', 'любовь', 'love'), // i18n-ignore
      createEmoji('🤗', 'обнимаю', 'hug'), // i18n-ignore
      createEmoji('🤔', 'думаю', 'thinking', 'question'), // i18n-ignore
      createEmoji('😎', 'круто', 'cool', 'glasses'), // i18n-ignore
      createEmoji('🥳', 'праздник', 'party'), // i18n-ignore
      createEmoji('😴', 'сон', 'sleep', 'tired'), // i18n-ignore
      createEmoji('😭', 'плачу', 'cry', 'sad'), // i18n-ignore
      createEmoji('😡', 'злой', 'angry'), // i18n-ignore
      createEmoji('🤯', 'в шоке', 'mind blown', 'shock'), // i18n-ignore
      createEmoji('🤩', 'восторг', 'star eyes'), // i18n-ignore
      createEmoji('😇', 'ангел', 'angel'), // i18n-ignore
    ],
  },
  {
    id: 'gestures',
    get label() { return mt('emoji.t021') },
    icon: '👍',
    emojis: [
      createEmoji('👍', 'палец', 'ок', 'like', 'good'), // i18n-ignore
      createEmoji('👎', 'нет', 'dislike', 'bad'), // i18n-ignore
      createEmoji('👌', 'идеально', 'perfect', 'ok'), // i18n-ignore
      createEmoji('✌️', 'победа', 'victory', 'peace'), // i18n-ignore
      createEmoji('🤞', 'удача', 'luck'), // i18n-ignore
      createEmoji('🤝', 'согласие', 'deal', 'рукопожатие'), // i18n-ignore
      createEmoji('👏', 'аплодисменты', 'clap'), // i18n-ignore
      createEmoji('🙌', 'ура', 'celebrate'), // i18n-ignore
      createEmoji('🙏', 'спасибо', 'pray'), // i18n-ignore
      createEmoji('👋', 'привет', 'wave', 'hello'), // i18n-ignore
      createEmoji('💪', 'сила', 'strong'), // i18n-ignore
      createEmoji('🫶', 'любовь', 'heart hands'), // i18n-ignore
      createEmoji('🤟', 'люблю', 'love you'), // i18n-ignore
      createEmoji('🫡', 'уважение', 'salute'), // i18n-ignore
      createEmoji('☝️', 'один', 'up'), // i18n-ignore
      createEmoji('👀', 'смотрю', 'look', 'eyes'), // i18n-ignore
    ],
  },
  {
    id: 'hearts',
    get label() { return mt('emoji.t039') },
    icon: '❤️',
    emojis: [
      createEmoji('❤️', 'сердце', 'love', 'heart'), // i18n-ignore
      createEmoji('🧡', 'orange heart', 'сердце'), // i18n-ignore
      createEmoji('💛', 'yellow heart', 'сердце'), // i18n-ignore
      createEmoji('💚', 'green heart', 'сердце'), // i18n-ignore
      createEmoji('💙', 'blue heart', 'сердце'), // i18n-ignore
      createEmoji('💜', 'purple heart', 'сердце'), // i18n-ignore
      createEmoji('🤍', 'white heart', 'сердце'), // i18n-ignore
      createEmoji('🖤', 'black heart', 'сердце'), // i18n-ignore
      createEmoji('💔', 'broken heart', 'разбитое сердце'), // i18n-ignore
      createEmoji('🔥', 'огонь', 'fire', 'hot'), // i18n-ignore
      createEmoji('✨', 'блеск', 'sparkles'), // i18n-ignore
      createEmoji('🎉', 'праздник', 'party'), // i18n-ignore
      createEmoji('💯', 'сто', '100', 'perfect'), // i18n-ignore
      createEmoji('✅', 'готово', 'done', 'check'), // i18n-ignore
      createEmoji('❗', 'внимание', 'alert'), // i18n-ignore
      createEmoji('❓', 'вопрос', 'question'), // i18n-ignore
    ],
  },
  {
    id: 'animals',
    get label() { return mt('emoji.t048') },
    icon: '🐶',
    emojis: [
      createEmoji('🐶', 'собака', 'dog'), // i18n-ignore
      createEmoji('🐱', 'кот', 'cat'), // i18n-ignore
      createEmoji('🐭', 'мышь', 'mouse'), // i18n-ignore
      createEmoji('🐹', 'хомяк', 'hamster'), // i18n-ignore
      createEmoji('🐰', 'кролик', 'rabbit'), // i18n-ignore
      createEmoji('🦊', 'лиса', 'fox'), // i18n-ignore
      createEmoji('🐻', 'медведь', 'bear'), // i18n-ignore
      createEmoji('🐼', 'панда', 'panda'), // i18n-ignore
      createEmoji('🐨', 'коала', 'koala'), // i18n-ignore
      createEmoji('🐯', 'тигр', 'tiger'), // i18n-ignore
      createEmoji('🦁', 'лев', 'lion'), // i18n-ignore
      createEmoji('🐵', 'обезьяна', 'monkey'), // i18n-ignore
      createEmoji('🐸', 'лягушка', 'frog'), // i18n-ignore
      createEmoji('🐼', 'panda', 'панда'), // i18n-ignore
      createEmoji('🐷', 'свинья', 'pig'), // i18n-ignore
      createEmoji('🦄', 'единорог', 'unicorn'), // i18n-ignore
    ],
  },
  {
    id: 'food',
    get label() { return mt('emoji.t064') },
    icon: '🍔',
    emojis: [
      createEmoji('🍎', 'яблоко', 'apple'), // i18n-ignore
      createEmoji('🍌', 'банан', 'banana'), // i18n-ignore
      createEmoji('🍓', 'клубника', 'strawberry'), // i18n-ignore
      createEmoji('🍒', 'вишня', 'cherry'), // i18n-ignore
      createEmoji('🍕', 'пицца', 'pizza'), // i18n-ignore
      createEmoji('🍔', 'бургер', 'burger'), // i18n-ignore
      createEmoji('🍟', 'картошка', 'fries'), // i18n-ignore
      createEmoji('🌮', 'тако', 'taco'), // i18n-ignore
      createEmoji('🍣', 'суши', 'sushi'), // i18n-ignore
      createEmoji('🍩', 'пончик', 'donut'), // i18n-ignore
      createEmoji('🍪', 'печенье', 'cookie'), // i18n-ignore
      createEmoji('🍰', 'торт', 'cake'), // i18n-ignore
      createEmoji('☕', 'кофе', 'coffee'), // i18n-ignore
      createEmoji('🥤', 'напиток', 'drink'), // i18n-ignore
      createEmoji('🍿', 'попкорн', 'popcorn'), // i18n-ignore
      createEmoji('🍉', 'арбуз', 'watermelon'), // i18n-ignore
    ],
  },
  {
    id: 'activities',
    get label() { return mt('emoji.t081') },
    icon: '⚽',
    emojis: [
      createEmoji('⚽', 'футбол', 'soccer'), // i18n-ignore
      createEmoji('🏀', 'баскетбол', 'basketball'), // i18n-ignore
      createEmoji('🏆', 'кубок', 'trophy'), // i18n-ignore
      createEmoji('🎮', 'игра', 'gamepad', 'gaming'), // i18n-ignore
      createEmoji('🎵', 'музыка', 'music'), // i18n-ignore
      createEmoji('🎬', 'кино', 'movie'), // i18n-ignore
      createEmoji('📚', 'книги', 'books'), // i18n-ignore
      createEmoji('💻', 'компьютер', 'laptop', 'work'), // i18n-ignore
      createEmoji('📱', 'телефон', 'phone'), // i18n-ignore
      createEmoji('🧠', 'мозг', 'idea'), // i18n-ignore
      createEmoji('🎯', 'цель', 'target'), // i18n-ignore
      createEmoji('🎨', 'рисование', 'art'), // i18n-ignore
      createEmoji('🎧', 'наушники', 'headphones'), // i18n-ignore
      createEmoji('🎤', 'микрофон', 'mic'), // i18n-ignore
      createEmoji('📸', 'фото', 'camera'), // i18n-ignore
      createEmoji('🕹️', 'джойстик', 'joystick'), // i18n-ignore
    ],
  },
  {
    id: 'travel',
    get label() { return mt('emoji.t098') },
    icon: '✈️',
    emojis: [
      createEmoji('✈️', 'самолет', 'plane', 'flight'), // i18n-ignore
      createEmoji('🚗', 'машина', 'car'), // i18n-ignore
      createEmoji('🚕', 'такси', 'taxi'), // i18n-ignore
      createEmoji('🚆', 'поезд', 'train'), // i18n-ignore
      createEmoji('🗺️', 'карта', 'map'), // i18n-ignore
      createEmoji('🏝️', 'остров', 'island', 'vacation'), // i18n-ignore
      createEmoji('🏠', 'дом', 'home'), // i18n-ignore
      createEmoji('🏢', 'офис', 'office'), // i18n-ignore
      createEmoji('🌤️', 'погода', 'weather'), // i18n-ignore
      createEmoji('🌙', 'ночь', 'moon'), // i18n-ignore
      createEmoji('🌍', 'земля', 'earth'), // i18n-ignore
      createEmoji('⛱️', 'пляж', 'beach'), // i18n-ignore
      createEmoji('🏖️', 'отпуск', 'vacation'), // i18n-ignore
      createEmoji('🧳', 'чемодан', 'travel'), // i18n-ignore
      createEmoji('🛫', 'вылет', 'departure'), // i18n-ignore
      createEmoji('🚀', 'ракета', 'rocket'), // i18n-ignore
    ],
  },
]

const EMOJI_LOOKUP = new Map<string, EmojiItem>(
  BASE_CATEGORIES.flatMap((category) => category.emojis.map((emoji) => [emoji.value, emoji] as const)),
)

const readRecentEmojis = (): string[] => {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(RECENT_EMOJIS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT_EMOJIS)
  } catch {
    return []
  }
}

const writeRecentEmojis = (nextValue: string[]): void => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(nextValue.slice(0, MAX_RECENT_EMOJIS)))
  } catch {
    return
  }
}


interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [search, setSearch] = useState('')
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => readRecentEmojis())
  const [requestedCategoryId, setRequestedCategoryId] = useState('smileys')

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const categories = useMemo<EmojiCategory[]>(() => {
    const recentCategory: EmojiCategory | null =
      recentEmojis.length > 0
        ? {
            id: 'recent',
            label: mt('emoji.t115'),
            icon: '🕘',
            emojis: recentEmojis.map((emoji) => EMOJI_LOOKUP.get(emoji) ?? createEmoji(emoji)),
          }
        : null

    return recentCategory ? [recentCategory, ...BASE_CATEGORIES] : BASE_CATEGORIES
  }, [recentEmojis])

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return categories
    }

    return categories
      .map((category) => ({
        ...category,
        emojis: category.emojis.filter((emoji) => {
          if (category.label.toLowerCase().includes(query)) {
            return true
          }

          return emoji.keywords.some((keyword) => keyword.toLowerCase().includes(query))
        }),
      }))
      .filter((category) => category.emojis.length > 0)
  }, [categories, search])

  const activeCategoryId = useMemo(() => {
    if (filteredCategories.length === 0) {
      return requestedCategoryId
    }

    return filteredCategories.some((category) => category.id === requestedCategoryId)
      ? requestedCategoryId
      : filteredCategories[0].id
  }, [filteredCategories, requestedCategoryId])

  useEffect(() => {
    if (search.trim()) {
      return
    }

    const container = scrollRef.current
    if (!container) {
      return
    }

    const updateActiveCategory = () => {
      const threshold = 40
      let nextActive = filteredCategories[0]?.id ?? 'smileys'

      for (const category of filteredCategories) {
        const node = sectionRefs.current[category.id]
        if (!node) {
          continue
        }

        if (node.offsetTop - container.scrollTop <= threshold) {
          nextActive = category.id
        }
      }

      setRequestedCategoryId(nextActive)
    }

    updateActiveCategory()
    container.addEventListener('scroll', updateActiveCategory)

    return () => {
      container.removeEventListener('scroll', updateActiveCategory)
    }
  }, [filteredCategories, search])

  const handleEmojiSelect = (emoji: string) => {
    onSelect(emoji)

    setRecentEmojis((prev) => {
      const nextValue = [emoji, ...prev.filter((item) => item !== emoji)].slice(0, MAX_RECENT_EMOJIS)
      writeRecentEmojis(nextValue)
      return nextValue
    })
  }

  const handleCategoryClick = (categoryId: string) => {
    setRequestedCategoryId(categoryId)

    if (search.trim()) {
      return
    }

    sectionRefs.current[categoryId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <div
      ref={rootRef}
      style={{
        width: 368,
        maxWidth: 'min(368px, calc(100vw - 26px))',
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFCFF 100%)',
        border: `1px solid ${C.borderLight}`,
        borderRadius: 24,
        boxShadow: '0 20px 46px rgba(10,22,40,0.17)',
        overflow: 'hidden',
        fontFamily: '"Manrope", sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '18px 18px 12px',
          borderBottom: `1px solid ${C.borderLight}`,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F6FAFF 100%)',
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1C2740', letterSpacing: '-0.02em' }}>{mt('emoji.t116')}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            border: `1px solid ${C.borderLight}`,
            background: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(10,22,40,0.05)',
          }}
          title={mt('emoji.t117')}
        >
          <MS name="close" size={16} color="#91A4C2" />
        </button>
      </div>

      <div style={{ padding: '14px 14px 10px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 42,
            padding: '0 14px',
            borderRadius: 15,
            background: '#F4F8FE',
            border: `1px solid ${C.borderLight}`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
          }}
        >
          <MS name="search" size={16} color="#8AA0C1" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={mt('emoji.t118')}
            autoFocus
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              color: '#20314F',
              fontFamily: '"Manrope", sans-serif',
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '0 12px 12px',
          overflowX: 'auto',
          scrollbarWidth: 'thin',
        }}
      >
        {filteredCategories.map((category) => {
          const isActive = activeCategoryId === category.id

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => handleCategoryClick(category.id)}
              style={{
                minWidth: 48,
                height: 38,
                padding: '0 10px',
                borderRadius: 14,
                border: `1px solid ${isActive ? '#D0E5FF' : '#E3EBF7'}`,
                background: isActive ? 'linear-gradient(180deg, #ECF5FF 0%, #EEF2FF 100%)' : '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: isActive ? '0 8px 18px rgba(46,135,255,0.12)' : '0 2px 8px rgba(10,22,40,0.04)',
              }}
              title={category.label}
            >
              <EmojiGlyph emoji={category.icon} size={22} />
            </button>
          )
        })}
      </div>

      <div
        ref={scrollRef}
        style={{
          maxHeight: 336,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: '2px 14px 16px',
        }}
      >
        {filteredCategories.length === 0 ? (
          <div
            style={{
              padding: '28px 14px 24px',
              textAlign: 'center',
              color: '#7D93B4',
              fontSize: 13,
            }}
          >
            {mt('emoji.t119')}
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div
              key={category.id}
              ref={(node) => {
                sectionRefs.current[category.id] = node
              }}
              style={{ paddingTop: 10 }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                  paddingLeft: 4,
                  color: '#8DA1BF',
                }}
              >
                <EmojiGlyph emoji={category.icon} size={18} />
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>{category.label}</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: 6,
                }}
              >
                {category.emojis.map((emoji) => (
                  <button
                    key={`${category.id}-${emoji.value}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleEmojiSelect(emoji.value)}
                    style={{
                      width: '100%',
                      height: 44,
                      borderRadius: 16,
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,250,255,0.96) 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                      transition: 'transform 0.14s ease, background 0.14s ease, box-shadow 0.14s ease',
                    }}
                    title={emoji.keywords[0] ?? mt('emoji.t116')}
                  >
                    <EmojiGlyph emoji={emoji.value} size={30} />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
