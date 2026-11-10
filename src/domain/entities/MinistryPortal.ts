export interface MinistryProfile {
  id: number
  ministry_id: number
  summary: string
  official_label: string
  organization_type: string
  address: string
  phone: string
  email: string
  website_url: string
  working_hours: string
  lunch_hours: string
  avatar_url: string
  banner_url: string
  is_verified: boolean
  created_at: string
  updated_at: string
}

export interface MinistryStats {
  employees_count: number
  departments_count: number
  leadership_count: number
  documents_count: number
  publications_count: number
}

export interface MinistryLeader {
  user_id: number
  full_name: string
  position: string
  avatar_url?: string
  availability_status?: string | null
  role: string
}

export interface MinistryStructureItem {
  id: number
  name: string
  type: 'state_body' | 'department'
  parent_id?: number | null
  leader_id?: number | null
  leader_name?: string | null
  children_count: number
}

export interface MinistryDirectoryUser {
  id: number
  first_name: string
  last_name: string
  full_name: string
  avatar_url?: string
  position: string
  role: string
  availability_status?: string | null
  state_body_id?: number | null
  department_id?: number | null
  division_id?: number | null
}

export interface MinistryPortal {
  ministry: {
    id: number
    name: string
    leader_id?: number | null
    head_of_staff_id?: number | null
    deputy_prime_minister_id?: number | null
    created_at: string
  }
  profile?: MinistryProfile | null
  stats: MinistryStats
  leaders: MinistryLeader[]
  structure: MinistryStructureItem[]
  latest_publications: any[]
  latest_documents: any[]
  can_edit: boolean
}
