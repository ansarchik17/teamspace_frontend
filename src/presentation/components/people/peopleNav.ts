import { createContext, useContext } from 'react'

export type PeopleSectionTab = 'employees' | 'structure' | 'access' | 'import' | 'administration'

export interface PeopleNavTab {
  id: PeopleSectionTab
  label: string
  to: string
}

export interface PeopleNavState {
  tabs: PeopleNavTab[]
  active: PeopleSectionTab
}

export const PEOPLE_SECTION_PREFIXES = ['/team-contact', '/organization', '/platform/organizations', '/platform/structure', '/platform/administration']

export const isPeopleSectionPath = (pathname: string) => PEOPLE_SECTION_PREFIXES.some((prefix) => pathname.startsWith(prefix))

export const PeopleNavContext = createContext<((state: PeopleNavState | null) => void) | null>(null)

export const usePeopleNavPublisher = () => useContext(PeopleNavContext)
