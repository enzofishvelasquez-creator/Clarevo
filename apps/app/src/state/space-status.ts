import { createContext, use } from 'react';

export type SpaceStatus = 'sem-sessao' | 'pendente' | 'erro' | 'sem-conta' | 'pronto';

export const SpaceStatusContext = createContext<{ status: SpaceStatus; retry: () => void }>({ status: 'pendente', retry: () => {} });

export const useSpaceStatus = () => use(SpaceStatusContext);
