import 'i18next'
import type recovery from './locales/ru/recovery.json'
import type drive from './locales/ru/drive.json'
import type common from './locales/ru/common.json'
import type shell from './locales/ru/shell.json'
import type auth from './locales/ru/auth.json'
import type profile from './locales/ru/profile.json'
import type administration from './locales/ru/administration.json'
import type assignments from './locales/ru/assignments.json'
import type calendar from './locales/ru/calendar.json'
import type home from './locales/ru/home.json'
import type ai from './locales/ru/ai.json'
import type board from './locales/ru/board.json'
import type notes from './locales/ru/notes.json'
import type contacts from './locales/ru/contacts.json'
import type invitations from './locales/ru/invitations.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: {
      drive: typeof drive
      common: typeof common
      shell: typeof shell
      auth: typeof auth
      profile: typeof profile
      administration: typeof administration
      assignments: typeof assignments
      calendar: typeof calendar
      home: typeof home
      ai: typeof ai
      board: typeof board
      notes: typeof notes
      contacts: typeof contacts
      invitations: typeof invitations
      recovery: typeof recovery
    }
    returnNull: false
  }
}
