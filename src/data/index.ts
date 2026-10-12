import { isRemoteConfigured } from './client';
import { localRepository } from './localRepository';
import { remoteRepository } from './remoteRepository';
import type { Repository } from './repository';

export * from './repository';

/** Si hay Supabase configurado usa el backend (Opción A); si no, modo local. */
export const repository: Repository = isRemoteConfigured ? remoteRepository : localRepository;
export { isRemoteConfigured };
