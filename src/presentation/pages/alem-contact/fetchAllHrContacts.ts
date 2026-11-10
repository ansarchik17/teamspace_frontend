import type { AlemContact } from '../../../domain/entities/AlemContact'
import type { ProfileRepository } from '../../../domain/repositories/ProfileRepository'

const PAGE_SIZE = 100

type FetchAllHrContactsOptions = {
  signal?: AbortSignal
  onBatch?: (contacts: AlemContact[], done: boolean) => void
}

export async function fetchAllHrContacts(
  repository: ProfileRepository,
  options?: FetchAllHrContactsOptions,
): Promise<AlemContact[]> {
  const all: AlemContact[] = []
  let cursor: string | undefined
  let offset = 0

  for (;;) {
    if (options?.signal?.aborted) {
      break
    }

    const page = await repository.listHrUsers({ limit: PAGE_SIZE, cursor })
    const batch = page.contacts
    if (batch.length === 0) break

    all.push(...batch)
    offset += batch.length

    const done = batch.length < PAGE_SIZE || offset > 20_000 || !page.meta.next_cursor
    options?.onBatch?.(all.slice(), done)

    if (done) break

    if (page.meta.next_cursor) {
      cursor = page.meta.next_cursor
    } else {
      break
    }
  }

  return all
}
