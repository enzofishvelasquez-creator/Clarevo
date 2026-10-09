/**
 * A tela /simular (Ciclo D) é de outra frente. Enquanto ela não existe, a aba Metas não mostra o card "Simular um plano" e o
 * detalhe da meta não mostra "Simular com rendimento": nenhum link sem destino. Quando `app/simular.tsx` estiver no app,
 * mude para true (os dois lugares já montam o link e o endereço com simulateLinkParams).
 */
export const SIMULATOR_READY = false;
