// Metro do app. A única mudança em relação ao padrão do Expo: `lucide-react-native` vira `src/lib/lucide.ts`, que traz só os
// ícones usados (o pacote inteiro põe 1.867 ícones no pacote web e no do aparelho). Veja docs/19_ACESSIBILIDADE_E_DESEMPENHO.md.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const icons = path.join(__dirname, 'src', 'lib', 'lucide.ts');
const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'lucide-react-native') return { type: 'sourceFile', filePath: icons };
  return resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
