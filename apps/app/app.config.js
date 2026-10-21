// Configuração dinâmica do app. O conteúdo vem de app.json (o `config` recebido); a única coisa que este arquivo pode acrescentar é o widget
// nativo, e só com CLAREVO_WIDGET=1 (D-063 item 3, Ciclo AA). Sem a variável, devolve exatamente o que recebeu: os builds `preview` e
// `production` não mudam. Veja widget.config.js e docs/21_WIDGET_NATIVO.md.
const { withWidget } = require('./widget.config');

module.exports = ({ config }) => withWidget(config);
