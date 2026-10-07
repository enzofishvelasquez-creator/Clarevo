import { Redirect } from 'expo-router';

/** Destino do link de confirmação de e-mail. A troca do código pela sessão acontece no SessionProvider. */
export default function Confirmado() {
  return <Redirect href="/carregando" />;
}
